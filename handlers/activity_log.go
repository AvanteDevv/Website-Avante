package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/auth"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Bitácora del staff — lo que hace cada persona en el panel, para que el
// admin lo revise en /admin/bitacora. Se llena desde dos lados:
//
//  1. ActivityTracker() (middleware global en main.go): cada POST / PUT /
//     PATCH / DELETE que hace alguien de un rol vigilado queda guardado
//     DESPUÉS de que el handler responde, con el resultado real (si
//     falló, se guarda como fallido). Aquí se describe en español qué
//     hizo: "Canceló la cita de Juan Pérez…", "Creó una cita…", etc.
//  2. POST /api/bitacora: el JS de cada rol (bitacora-<rol>.js) manda
//     en lotes las páginas que abre, los clics y las búsquedas.
//
// Además: inicio / cierre de sesión e intentos de inicio fallidos (ver
// auth_admin.go).
//
// Se vigila recepción, optometría y empleados. Para sumar otro rol basta con
// agregarlo a TrackedActivityRoles y cargar su bitacora-<rol>.js.

// TrackedActivityRoles son los roles cuya actividad se guarda.
var TrackedActivityRoles = map[string]bool{
	RoleReceptionist: true,
	RoleOptometrist:  true,
	RoleEmployee:     true,
	RoleInventario:   true,
}

// ActivityRetentionDays: lo más viejo que esto se borra solo (una vez al
// día). 0 = nunca borrar.
const ActivityRetentionDays = 180

// LogChatText: si es true, la bitácora guarda también el TEXTO de los
// mensajes de chat. Por defecto solo guarda que envió un mensaje y a
// quién (el contenido de las pláticas entre compañeros se queda privado).
const LogChatText = false

// IsTrackedRole indica si la actividad de ese rol se guarda.
func IsTrackedRole(role string) bool { return TrackedActivityRoles[role] }

// TrackedRolesList es TrackedActivityRoles como lista ordenada.
func TrackedRolesList() []string {
	out := make([]string, 0, len(TrackedActivityRoles))
	for r, on := range TrackedActivityRoles {
		if on {
			out = append(out, r)
		}
	}
	sort.Strings(out)
	return out
}

// saveActivity guarda en segundo plano para no hacer esperar la respuesta.
func saveActivity(list ...models.ActivityEntry) {
	if len(list) == 0 {
		return
	}
	go func() {
		if err := models.InsertActivities(list); err != nil {
			log.Printf("bitacora: no se pudo guardar (%d registros): %v", len(list), err)
		}
	}()
}

func activityBaseEntry(c *gin.Context, role string, id int64, name string) models.ActivityEntry {
	return models.ActivityEntry{
		StaffRole: role,
		StaffID:   id,
		StaffName: name,
		IP:        c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
		CreatedAt: time.Now(),
	}
}

/* =========================================================
   Sesión (lo llama auth_admin.go)
   ========================================================= */

// LogStaffLogin — "Inició sesión".
func LogStaffLogin(c *gin.Context, role string, id int64, name string) {
	if !IsTrackedRole(role) {
		return
	}
	e := activityBaseEntry(c, role, id, name)
	e.Kind = models.ActivitySession
	e.Action = "sesion.inicio"
	e.Description = "Inició sesión"
	e.Method, e.Path, e.StatusCode = c.Request.Method, c.Request.URL.Path, http.StatusOK
	saveActivity(e)
}

// LogStaffLoginFailed — contraseña equivocada con un correo que sí existe.
func LogStaffLoginFailed(c *gin.Context, role string, id int64, name string) {
	if !IsTrackedRole(role) {
		return
	}
	e := activityBaseEntry(c, role, id, name)
	e.Kind = models.ActivitySession
	e.Action = "sesion.fallida"
	e.Description = "Intentó iniciar sesión con una contraseña incorrecta"
	e.Method, e.Path, e.StatusCode = c.Request.Method, c.Request.URL.Path, http.StatusUnauthorized
	saveActivity(e)
}

// LogStaffLogout — "Cerró sesión". Hay que llamarlo ANTES de borrar la
// cookie (lee quién es de la sesión).
func LogStaffLogout(c *gin.Context) {
	session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	role, _ := session.Values["staff_role"].(string)
	id, _ := session.Values["staff_id"].(int64)
	name, _ := session.Values["staff_name"].(string)
	if id == 0 || !IsTrackedRole(role) {
		return
	}
	e := activityBaseEntry(c, role, id, name)
	e.Kind = models.ActivitySession
	e.Action = "sesion.cierre"
	e.Description = "Cerró sesión"
	e.Method, e.Path, e.StatusCode = c.Request.Method, c.Request.URL.Path, http.StatusFound
	saveActivity(e)
}

/* =========================================================
   Middleware: acciones confirmadas por el servidor
   ========================================================= */

// ActivityTracker va en main.go con router.Use(...) ANTES de declarar las
// rutas. No hace nada con GET (las vistas las manda el navegador).
func ActivityTracker() gin.HandlerFunc {
	return func(c *gin.Context) {
		method := c.Request.Method
		if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		if path == "/api/bitacora" || strings.HasPrefix(path, "/ws/") {
			c.Next()
			return
		}

		// ¿Quién es? (la sesión se lee aquí porque RequireAdminAuth corre
		// después, dentro de c.Next()).
		session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
		role, _ := session.Values["staff_role"].(string)
		if !IsTrackedRole(role) {
			c.Next()
			return
		}

		// Copia del cuerpo JSON (sin consumirlo para el handler).
		var body []byte
		if c.Request.Body != nil && strings.Contains(c.GetHeader("Content-Type"), "json") {
			body, _ = io.ReadAll(io.LimitReader(c.Request.Body, 64<<10))
			c.Request.Body = io.NopCloser(io.MultiReader(bytes.NewReader(body), c.Request.Body))
		}

		route := c.FullPath() // p. ej. "/admin/citas/:id/estado"
		var before *activityCita
		if strings.HasPrefix(route, "/admin/citas/:id") || route == "/api/receptionist/citas/:id/seguimiento" {
			before = activityFindCita(c.Param("id"))
		}

		c.Next()

		// Ya pasó por RequireAdminAuth: tomamos los datos de ahí.
		idVal, _ := c.Get("staff_id")
		id, _ := idVal.(int64)
		if id == 0 {
			return // sin sesión válida: lo rechazó el login
		}
		nameVal, _ := c.Get("staff_name")
		name, _ := nameVal.(string)

		e := activityBaseEntry(c, role, id, name)
		e.Kind = models.ActivityAction
		e.Method, e.Path, e.StatusCode = method, path, c.Writer.Status()
		e.Page = actPageFromReferer(c.GetHeader("Referer"))

		var payload map[string]interface{}
		if len(body) > 0 {
			_ = json.Unmarshal(body, &payload)
		}
		intento, ok := activityDescribe(c, route, payload, before, &e)
		if !ok {
			return // acción que no vale la pena guardar
		}
		e.Details = activityDetailsJSON(payload)
		if e.StatusCode >= 400 {
			// "Intentó cancelar la cita de Juan Pérez, pero no se pudo (sin permiso)"
			e.Description = "Intentó " + intento + ", pero no se pudo (" + actHTTPStatusEs(e.StatusCode) + ")"
		}
		saveActivity(e)
	}
}

/* ---------- Descripciones en español ---------- */

var activityCitaStatus = map[string]string{
	"pendiente":  "Pendiente",
	"verificada": "Verificada",
	"cancelada":  "Cancelada",
	"asistio":    "Asistió",
	"no_asistio": "No asistió",
}

func activityCitaStatusLabel(s string) string {
	if l, ok := activityCitaStatus[s]; ok {
		return l
	}
	return s
}

var activityMonths = [...]string{
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
}

// actFechaCorta: "2026-09-30" -> "30 de septiembre de 2026".
func actFechaCorta(iso string) string {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(iso))
	if err != nil {
		return iso
	}
	return fmt.Sprintf("%d de %s de %d", t.Day(), activityMonths[t.Month()-1], t.Year())
}

type activityCita struct {
	ID, Nombre, Fecha, Hora, Status string
}

func (s *activityCita) String() string {
	if s == nil {
		return ""
	}
	parts := []string{"Cita #" + s.ID}
	if s.Nombre != "" {
		parts = append(parts, s.Nombre)
	}
	if s.Fecha != "" {
		parts = append(parts, actFechaCorta(s.Fecha))
	}
	if s.Hora != "" {
		parts = append(parts, s.Hora)
	}
	return strings.Join(parts, " · ")
}

// activityFindCita busca la cita antes de que la cambien / borren, para poder
// decir de quién era.
func activityFindCita(id string) *activityCita {
	if id == "" {
		return nil
	}
	list, err := models.GetAllAppointments()
	if err != nil {
		return &activityCita{ID: id}
	}
	for _, a := range list {
		if fmt.Sprint(a.ID) != id {
			continue
		}
		return &activityCita{
			ID:     id,
			Nombre: strings.TrimSpace(fmt.Sprint(a.Nombre) + " " + fmt.Sprint(a.Apellido)),
			Fecha:  a.Date.Format("2006-01-02"),
			Hora:   fmt.Sprint(a.Time),
			Status: fmt.Sprint(a.Status),
		}
	}
	return &activityCita{ID: id}
}

func actStr(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok && v != nil {
		return strings.TrimSpace(fmt.Sprint(v))
	}
	return ""
}

// activityDescribe llena Action / Description / Context y regresa la misma
// acción en infinitivo ("cancelar la cita de Juan Pérez") para cuando
// falla. ok = false si esa petición no se guarda (ruido, como "leí el chat").
func activityDescribe(c *gin.Context, route string, p map[string]interface{}, before *activityCita, e *models.ActivityEntry) (intento string, ok bool) {
	method := c.Request.Method
	quien := ""
	if before != nil && before.Nombre != "" {
		quien = " de " + before.Nombre
	}
	switch {
	/* ----- Citas ----- */
	case method == http.MethodPost && route == "/admin/citas":
		e.Action = "cita.crear"
		nombre := strings.TrimSpace(actStr(p, "nombre") + " " + actStr(p, "apellido"))
		e.Description = "Creó una cita para " + actOrDash(nombre)
		intento = "crear una cita para " + actOrDash(nombre)
		ctx := []string{}
		if d := actStr(p, "date"); d != "" {
			ctx = append(ctx, actFechaCorta(d))
		}
		if t := actStr(p, "time"); t != "" {
			ctx = append(ctx, t)
		}
		if s := actStr(p, "status"); s != "" {
			ctx = append(ctx, "Estado inicial: "+activityCitaStatusLabel(s))
		}
		if cel := actStr(p, "celular"); cel != "" {
			ctx = append(ctx, "Cel. "+cel)
		}
		e.Context = strings.Join(ctx, " · ")

	case method == http.MethodPatch && route == "/admin/citas/:id/estado":
		st := actStr(p, "status")
		e.Action = "cita.estado." + st
		switch st {
		case "cancelada":
			e.Description, intento = "Canceló la cita"+quien, "cancelar la cita"+quien
		case "asistio":
			e.Description, intento = "Marcó que asistió a su cita"+quien, "marcar que asistió a su cita"+quien
		case "no_asistio":
			e.Description, intento = "Marcó que no asistió a su cita"+quien, "marcar que no asistió a su cita"+quien
		default:
			e.Description = "Cambió la cita" + quien + " a " + activityCitaStatusLabel(st)
			intento = "cambiar la cita" + quien + " a " + activityCitaStatusLabel(st)
		}
		e.Context = before.String()
		if before != nil && before.Status != "" && before.Status != st {
			e.Context += " · Antes: " + activityCitaStatusLabel(before.Status) + " → Ahora: " + activityCitaStatusLabel(st)
		}
		if r := actFirstNonEmpty(actStr(p, "reason"), actStr(p, "motivo"), actStr(p, "cancel_reason")); r != "" {
			e.Context += " · Motivo: " + r
		}

	case method == http.MethodPut && route == "/admin/citas/:id":
		nombre := strings.TrimSpace(actStr(p, "nombre") + " " + actStr(p, "apellido"))
		d, t := actStr(p, "date"), actStr(p, "time")
		oldHora := ""
		if before != nil {
			oldHora = before.Hora
			if len(oldHora) > 5 {
				oldHora = oldHora[:5]
			}
		}
		moved := before != nil && before.Fecha != "" && (before.Fecha != d || oldHora != t)
		if moved {
			e.Action = "cita.reagendar"
			e.Description, intento = "Reagendó la cita"+quien, "reagendar la cita"+quien
			e.Context = "Antes: " + actFechaCorta(before.Fecha) + " " + oldHora + " → Ahora: " + actFechaCorta(d) + " " + t
			if before.Status == "cancelada" || before.Status == "no_asistio" {
				e.Context += " · Estaba: " + activityCitaStatusLabel(before.Status) + " → Verificada"
			}
		} else {
			e.Action = "cita.editar"
			e.Description, intento = "Editó los datos de la cita"+quien, "editar los datos de la cita"+quien
			e.Context = before.String()
		}
		if before != nil && before.Nombre != "" && nombre != "" && !strings.EqualFold(before.Nombre, nombre) {
			e.Context += " · Nombre: " + before.Nombre + " → " + nombre
		}

	case method == http.MethodDelete && route == "/admin/citas/:id":
		e.Action = "cita.eliminar"
		e.Description, intento = "Eliminó la cita"+quien, "eliminar la cita"+quien
		e.Context = before.String()
		if before != nil && before.Status != "" {
			e.Context += " · Estaba: " + activityCitaStatusLabel(before.Status)
		}

	/* ----- Pedidos ----- */
	case method == http.MethodPatch && route == "/api/admin/pedidos/:id/estado":
		e.Action = "pedido.estado"
		e.Description = "Cambió el estado del pedido #" + c.Param("id")
		intento = "cambiar el estado del pedido #" + c.Param("id")
		if s := actFirstNonEmpty(actStr(p, "status"), actStr(p, "estado"), actStr(p, "status_id")); s != "" {
			e.Context = "Nuevo estado: " + s
		}
	case method == http.MethodDelete && route == "/api/admin/pedidos/:id":
		e.Action = "pedido.eliminar"
		e.Description = "Eliminó el pedido #" + c.Param("id")
		intento = "eliminar el pedido #" + c.Param("id")

	/* ----- Chat ----- */
	case route == "/api/staff/chat/directo":
		e.Action = "chat.abrir"
		name := actStr(p, "key")
		if dir, err := models.StaffDirectory(); err == nil {
			if m, ok := dir[name]; ok {
				name = m.Name
			}
		}
		e.Description = "Abrió un chat con " + actOrDash(name)
		intento = "abrir un chat con " + actOrDash(name)
	case route == "/api/staff/chat/conversaciones/:id/mensajes":
		e.Action = "chat.mensaje"
		e.Description, intento = "Envió un mensaje", "enviar un mensaje"
		if t := activityConversationLabel(c); t != "" {
			e.Description += " " + t
			intento += " " + t
		}
		if LogChatText {
			e.Context = "“" + actStr(p, "body") + "”"
		} else {
			e.Context = strconv.Itoa(len([]rune(actStr(p, "body")))) + " caracteres"
		}
	case route == "/api/staff/chat/conversaciones/:id/leido":
		return "", false // ruido: pasa cada vez que abre un chat

	/* ----- Avisos ----- */
	case route == "/api/staff/avisos/:id/leido":
		e.Action = "aviso.leido"
		e.Description, intento = "Marcó un aviso como leído", "marcar un aviso como leído"
		if id, err := strconv.ParseInt(c.Param("id"), 10, 64); err == nil {
			if t := models.AnnouncementTitle(id); t != "" {
				e.Context = "“" + t + "”"
			}
		}
	case route == "/api/staff/avisos/leer-todos":
		e.Action = "aviso.leer_todos"
		e.Description, intento = "Marcó todos sus avisos como leídos", "marcar todos sus avisos como leídos"

	/* ----- Optometría: exámenes ----- */
	case method == http.MethodPost && route == "/api/optometrist/examenes":
		e.Action = "examen.crear"
		paciente := actOrDash(actStr(p, "patientName"))
		e.Description = "Registró un examen de la vista para " + paciente
		intento = "guardar el examen de la vista de " + paciente
		ctx := []string{}
		if tel := actStr(p, "patientPhone"); tel != "" {
			ctx = append(ctx, "Tel. "+tel)
		}
		if uid := actStr(p, "userId"); uid != "" && uid != "0" {
			ctx = append(ctx, "Paciente con cuenta (#"+uid+")")
		} else {
			ctx = append(ctx, "Paciente sin cuenta")
		}
		if t := actStr(p, "templateId"); t != "" {
			ctx = append(ctx, "Plantilla #"+t)
		}
		e.Context = strings.Join(ctx, " · ")
	case method == http.MethodDelete && route == "/api/optometrist/examenes/:id":
		e.Action = "examen.eliminar"
		e.Description, intento = "Eliminó el examen #"+c.Param("id"), "eliminar el examen #"+c.Param("id")

	/* ----- Optometría: plantillas de examen ----- */
	case method == http.MethodPost && route == "/api/optometrist/plantillas":
		e.Action = "plantilla.crear"
		n := actOrDash(actStr(p, "name"))
		e.Description, intento = "Creó la plantilla de examen “"+n+"”", "crear la plantilla “"+n+"”"
		e.Context = activityElementsCount(p)
	case method == http.MethodPut && route == "/api/optometrist/plantillas/:id":
		e.Action = "plantilla.guardar"
		n := actOrDash(actStr(p, "name"))
		e.Description = "Guardó cambios en la plantilla “" + n + "” (#" + c.Param("id") + ")"
		intento = "guardar la plantilla “" + n + "”"
		e.Context = activityElementsCount(p)
	case route == "/api/optometrist/plantillas/:id/activar":
		e.Action = "plantilla.activar"
		e.Description, intento = "Activó la plantilla de examen #"+c.Param("id"), "activar la plantilla #"+c.Param("id")
		e.Context = "Desde ahora los exámenes nuevos usan esta plantilla"
	case method == http.MethodDelete && route == "/api/optometrist/plantillas/:id":
		e.Action = "plantilla.eliminar"
		e.Description, intento = "Eliminó la plantilla de examen #"+c.Param("id"), "eliminar la plantilla #"+c.Param("id")

	/* ----- Administración → Clarito (Google Drive) ----- */
	case method == http.MethodPost && route == "/api/clarito/documents":
		e.Action = "clarito.guardar"
		formato := actOrDash(c.PostForm("form_name"))
		cliente := strings.TrimSpace(c.PostForm("client"))
		e.Description = "Guardó en Drive el formato “" + formato + "”"
		intento = "guardar en Drive el formato “" + formato + "”"
		if cliente != "" {
			e.Description += " de " + cliente
			intento += " de " + cliente
		}
		e.Context = c.PostForm("file_name")
	case method == http.MethodPost && route == "/api/clarito/drive/folder":
		e.Action = "clarito.carpeta"
		n := actOrDash(actStr(p, "name"))
		e.Description, intento = "Creó la carpeta “"+n+"” en Drive", "crear la carpeta “"+n+"” en Drive"
	case method == http.MethodPut && route == "/api/clarito/drive/settings":
		e.Action = "clarito.config"
		e.Description, intento = "Cambió cómo se organizan los formatos de Clarito en Drive", "cambiar la organización de Clarito en Drive"
	case method == http.MethodPost && route == "/api/clarito/drive/disconnect":
		e.Action = "clarito.desconectar"
		e.Description, intento = "Desconectó la cuenta de Google Drive", "desconectar Google Drive"

	/* ----- Recepción: etiqueta de cita ----- */
	case method == http.MethodPut && route == "/api/receptionist/citas/:id/etiqueta":
		e.Action = "cita.etiqueta"
		tag := actStr(p, "tag")
		if label, ok := models.AppointmentTagLabels[tag]; ok {
			e.Description = "Marcó la cita #" + c.Param("id") + " como “" + label + "”"
			intento = "marcar la cita #" + c.Param("id") + " como “" + label + "”"
		} else {
			e.Description = "Quitó la etiqueta de la cita #" + c.Param("id")
			intento = "quitar la etiqueta de la cita #" + c.Param("id")
		}

	/* ----- Recepción: seguimiento al asistir (¿compró?) ----- */
	case method == http.MethodPut && route == "/api/receptionist/citas/:id/seguimiento":
		e.Action = "cita.seguimiento"
		compro, _ := p["compro"].(bool)
		detalle := "No compró · sin revisión programada"
		if compro {
			meses := 12
			if m, ok := p["meses"].(float64); ok && m > 0 {
				meses = int(m)
			}
			detalle = "Compró · revisión en " + map[int]string{3: "3 meses", 6: "6 meses", 12: "1 año"}[meses]
		}
		if before != nil && before.Status != "" && before.Status != "asistio" {
			e.Description, intento = "Marcó que asistió a su cita"+quien, "marcar que asistió a su cita"+quien
		} else {
			e.Description, intento = "Actualizó si compró en la cita"+quien, "actualizar si compró en la cita"+quien
		}
		e.Context = before.String()
		if e.Context != "" {
			e.Context += " · "
		}
		e.Context += detalle

	/* ----- Recepción: punto de venta ----- */
	case method == http.MethodPost && route == "/api/receptionist/pos/clientes":
		e.Action = "pos.cliente.crear"
		e.Description = "Creó el cliente " + actOrDash(actStr(p, "nombre")) + " en el punto de venta"
		intento = "crear el cliente " + actOrDash(actStr(p, "nombre"))
		ctx := []string{"No. " + actOrDash(actStr(p, "numero"))}
		if cl := actStr(p, "clave"); cl != "" {
			ctx = append(ctx, "Clave "+cl)
		}
		if l, ok := p["limite"].(float64); ok && l > 0 {
			ctx = append(ctx, "Límite de crédito $"+strconv.FormatFloat(l, 'f', 2, 64))
		}
		if d, ok := p["dias"].(float64); ok && d > 0 {
			ctx = append(ctx, strconv.Itoa(int(d))+" días de crédito")
		}
		e.Context = strings.Join(ctx, " · ")

	case method == http.MethodPut && route == "/api/receptionist/pos/clientes/:id":
		e.Action = "pos.cliente.editar"
		e.Description = "Editó el cliente " + actOrDash(actStr(p, "nombre")) + " en el punto de venta"
		intento = "editar el cliente " + actOrDash(actStr(p, "nombre"))
		ctx := []string{"No. " + actOrDash(actStr(p, "numero"))}
		if cl := actStr(p, "clave"); cl != "" {
			ctx = append(ctx, "Clave "+cl)
		}
		if l, ok := p["limite"].(float64); ok {
			ctx = append(ctx, "Límite de crédito $"+strconv.FormatFloat(l, 'f', 2, 64))
		}
		if d, ok := p["dias"].(float64); ok {
			ctx = append(ctx, strconv.Itoa(int(d))+" días de crédito")
		}
		e.Context = strings.Join(ctx, " · ")

	case method == http.MethodPost && route == "/api/receptionist/pos/ventas":
		e.Action = "pos.venta"
		n := 0
		if items, ok := p["productos"].([]interface{}); ok {
			for _, it := range items {
				if m, ok := it.(map[string]interface{}); ok {
					if q, ok := m["cantidad"].(float64); ok {
						n += int(q)
					}
				}
			}
		}
		e.Description, intento = "Cobró una venta en el punto de venta", "cobrar una venta"
		ctx := []string{strconv.Itoa(n) + " artículo(s)"}
		if pg, ok := p["pagos"].(map[string]interface{}); ok {
			for _, k := range []string{"efectivo", "tarjeta", "transferencia", "vales", "cheque", "credito"} {
				if v, ok := pg[k].(float64); ok && v > 0 {
					label := k
					if k == "credito" {
						label = "a crédito (queda a deber)"
					}
					ctx = append(ctx, label+" $"+strconv.FormatFloat(v, 'f', 2, 64))
				}
			}
		}
		e.Context = strings.Join(ctx, " · ")

	case method == http.MethodPost && route == "/api/receptionist/pos/creditos/:id/abonos":
		e.Action = "pos.abono"
		monto, _ := p["monto"].(float64)
		e.Description = "Registró un abono de $" + strconv.FormatFloat(monto, 'f', 2, 64) + " a un crédito"
		intento = "registrar un abono a un crédito"
		e.Context = "Crédito #" + c.Param("id") + " · " + actOrDash(actStr(p, "forma_pago"))
		if r := actStr(p, "referencia"); r != "" {
			e.Context += " · Ref. " + r
		}

	case method == http.MethodDelete && route == "/api/receptionist/pos/abonos/:id":
		e.Action = "pos.abono.cancelar"
		e.Description, intento = "Canceló el abono #"+c.Param("id"), "cancelar el abono #"+c.Param("id")

	/* ----- Inventario ----- */
	case method == http.MethodPost && route == "/api/inventario/articulos":
		e.Action = "inv.articulo.crear"
		e.Description = "Agregó el artículo " + actOrDash(actStr(p, "clave")) + " · " + actOrDash(actStr(p, "descripcion"))
		intento = "agregar el artículo " + actOrDash(actStr(p, "clave"))
		if x, ok := p["existencia"].(float64); ok && x != 0 {
			e.Context = "Existencia inicial " + strconv.Itoa(int(x))
		}
	case method == http.MethodPut && route == "/api/inventario/articulos/:id":
		e.Action = "inv.articulo.editar"
		e.Description = "Editó el artículo " + actOrDash(actStr(p, "clave")) + " · " + actOrDash(actStr(p, "descripcion"))
		intento = "editar el artículo " + actOrDash(actStr(p, "clave"))
		if v, ok := p["precio_1"].(float64); ok {
			e.Context = "Precio 1 $" + strconv.FormatFloat(v, 'f', 2, 64)
		}
	case method == http.MethodDelete && route == "/api/inventario/articulos/:id":
		e.Action = "inv.articulo.eliminar"
		e.Description, intento = "Eliminó el artículo #"+c.Param("id")+" del inventario", "eliminar el artículo #"+c.Param("id")
	case method == http.MethodPost && route == "/api/inventario/articulos/:id/ajustar":
		e.Action = "inv.ajuste.articulo"
		modo := map[string]string{"entrada": "una entrada de", "salida": "una salida de", "fijar": "fijó la existencia en"}[actStr(p, "modo")]
		cant := 0
		if x, ok := p["cantidad"].(float64); ok {
			cant = int(x)
		}
		if actStr(p, "modo") == "fijar" {
			e.Description = "Ajustó el artículo #" + c.Param("id") + ": " + modo + " " + strconv.Itoa(cant)
		} else {
			e.Description = "Ajustó el artículo #" + c.Param("id") + ": " + actOrDash(modo) + " " + strconv.Itoa(cant) + " piezas"
		}
		intento = "ajustar la existencia del artículo #" + c.Param("id")
		e.Context = actStr(p, "comentario")
	case method == http.MethodPost && route == "/api/inventario/ajustes":
		e.Action = "inv.ajuste.fisico"
		n := 0
		if l, ok := p["lineas"].([]interface{}); ok {
			n = len(l)
		}
		e.Description, intento = "Aplicó un inventario físico de "+strconv.Itoa(n)+" artículos", "aplicar un inventario físico"
		e.Context = actStr(p, "comentario")
	case route == "/api/inventario/departamentos" || route == "/api/inventario/departamentos/:id":
		e.Action = "inv.departamento"
		verbo := map[string]string{http.MethodPost: "Creó", http.MethodPut: "Renombró", http.MethodDelete: "Borró"}[method]
		if verbo == "" {
			return "", false
		}
		e.Description = verbo + " el departamento " + actOrDash(actStr(p, "nombre"))
		if method == http.MethodDelete {
			e.Description = "Borró el departamento #" + c.Param("id")
		}
		intento = strings.ToLower(verbo[:1]) + verbo[1:] + " un departamento"
	case route == "/api/inventario/categorias" || route == "/api/inventario/categorias/:id":
		e.Action = "inv.categoria"
		verbo := map[string]string{http.MethodPost: "Creó", http.MethodPut: "Editó", http.MethodDelete: "Borró"}[method]
		if verbo == "" {
			return "", false
		}
		e.Description = verbo + " la categoría " + actOrDash(actStr(p, "nombre"))
		if method == http.MethodDelete {
			e.Description = "Borró la categoría #" + c.Param("id")
		}
		intento = strings.ToLower(verbo[:1]) + verbo[1:] + " una categoría"

	/* ----- Recepción: plantilla del ticket ----- */
	case method == http.MethodPut && route == "/api/receptionist/ticket-plantilla":
		e.Action = "ticket.plantilla.guardar"
		e.Description, intento = "Guardó cambios en la plantilla del ticket de venta", "guardar la plantilla del ticket"
		if d, ok := p["data"].(map[string]interface{}); ok {
			ctx := []string{}
			if papel, ok := d["papel"].(map[string]interface{}); ok {
				if w, ok := papel["ancho"].(float64); ok {
					ctx = append(ctx, "Rollo de "+strconv.Itoa(int(w))+" mm")
				}
			}
			if pg, ok := d["pagare"].(map[string]interface{}); ok {
				if on, _ := pg["activo"].(bool); on {
					ctx = append(ctx, "Con pagaré")
				} else {
					ctx = append(ctx, "Sin pagaré")
				}
			}
			e.Context = strings.Join(ctx, " · ")
		}

	/* ----- Cualquier otra ----- */
	default:
		if route == "" { // 404: no existe la ruta
			return "", false
		}
		e.Action = strings.ToLower(method)
		verbo := map[string]string{
			http.MethodPost: "Envió", http.MethodPut: "Actualizó",
			http.MethodPatch: "Modificó", http.MethodDelete: "Eliminó",
		}[method]
		e.Description = verbo + " algo en " + c.Request.URL.Path
		intento = "hacer " + method + " en " + c.Request.URL.Path
	}
	return intento, true
}

// activityConversationLabel: "a Ana López" (1 a 1) o "en el grupo Mostrador".
func activityConversationLabel(c *gin.Context) string {
	convID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return ""
	}
	me := currentStaff(c)
	s, err := models.GetConversationFor(convID, me.Role, me.ID)
	if err != nil || s == nil {
		return ""
	}
	dir, _ := models.StaffDirectory()
	v := dressConversation(dir, *s, me)
	if s.Kind == models.ConversationGroup {
		return "en el grupo " + v.Title
	}
	return "a " + v.Title
}

var activitySensitiveKey = regexp.MustCompile(`(?i)pass|contrase|token|secret|codigo|code|otp`)

// activityDetailsJSON guarda lo que se mandó (sin contraseñas ni, por defecto,
// el texto del chat) para verlo en "Detalles".
func activityDetailsJSON(p map[string]interface{}) string {
	if len(p) == 0 {
		return ""
	}
	clean := make(map[string]interface{}, len(p))
	for k, v := range p {
		switch {
		case activitySensitiveKey.MatchString(k):
			clean[k] = "••••"
		case k == "body" && !LogChatText:
			clean[k] = "(oculto)"
		case k == "data":
			// Resultados del examen: se ven completos en el examen mismo.
			clean[k] = "(resultados del examen — ábrelo para verlos)"
		case k == "elements":
			// Diseño de la plantilla (puede traer imágenes pesadas).
			if list, ok := v.([]interface{}); ok {
				clean[k] = strconv.Itoa(len(list)) + " elementos"
			} else {
				clean[k] = "(diseño de la plantilla)"
			}
		default:
			clean[k] = v
		}
	}
	b, err := json.Marshal(clean)
	if err != nil {
		return ""
	}
	return string(b)
}

func actPageFromReferer(ref string) string {
	if ref == "" {
		return ""
	}
	if i := strings.Index(ref, "://"); i != -1 {
		ref = ref[i+3:]
		if j := strings.Index(ref, "/"); j != -1 {
			return ref[j:]
		}
		return "/"
	}
	return ref
}

func actHTTPStatusEs(code int) string {
	switch code {
	case 400:
		return "datos inválidos"
	case 401, 403:
		return "sin permiso"
	case 404:
		return "no se encontró"
	case 409:
		return "hubo un conflicto, p. ej. la hora ya estaba ocupada"
	default:
		if code >= 500 {
			return "error del servidor"
		}
		return "error " + strconv.Itoa(code)
	}
}

func actOrDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "—"
	}
	return s
}

func actFirstNonEmpty(v ...string) string {
	for _, s := range v {
		if s != "" {
			return s
		}
	}
	return ""
}

/* =========================================================
   POST /api/bitacora — vistas, clics y búsquedas del navegador
   ========================================================= */

type clientActivity struct {
	Kind    string `json:"kind"`
	Label   string `json:"label"`
	Context string `json:"context"`
	Page    string `json:"page"`
	Ago     int64  `json:"ago"` // hace cuántos ms pasó (el JS manda en lotes)
}

type clientActivityBatch struct {
	Events []clientActivity `json:"events"`
}

const maxClientEventsPerBatch = 60

// PostClientActivity — POST /api/bitacora
func PostClientActivity(c *gin.Context) {
	me := currentStaff(c)
	if !IsTrackedRole(me.Role) {
		c.Status(http.StatusNoContent)
		return
	}
	var in clientActivityBatch
	// sendBeacon manda text/plain: se lee a mano en vez de ShouldBindJSON.
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 128<<10))
	if err != nil || json.Unmarshal(raw, &in) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato inválido."})
		return
	}
	if len(in.Events) > maxClientEventsPerBatch {
		in.Events = in.Events[len(in.Events)-maxClientEventsPerBatch:]
	}
	nameVal, _ := c.Get("staff_name")
	name, _ := nameVal.(string)
	now := time.Now()

	out := make([]models.ActivityEntry, 0, len(in.Events))
	for _, ev := range in.Events {
		switch ev.Kind {
		case models.ActivityView, models.ActivityClick, models.ActivitySearch:
		default:
			continue // "accion" y "sesion" solo las escribe el servidor
		}
		if strings.TrimSpace(ev.Label) == "" {
			continue
		}
		ago := time.Duration(ev.Ago) * time.Millisecond
		if ago < 0 || ago > 15*time.Minute {
			ago = 0
		}
		e := activityBaseEntry(c, me.Role, me.ID, name)
		e.Kind = ev.Kind
		e.Action = "ui." + ev.Kind
		e.Description = ev.Label
		e.Context = ev.Context
		e.Page = ev.Page
		e.CreatedAt = now.Add(-ago)
		out = append(out, e)
	}
	saveActivity(out...)
	c.Status(http.StatusNoContent)
}

/* =========================================================
   Limpieza automática
   ========================================================= */

// StartActivityJanitor borra una vez al día lo más viejo que
// ActivityRetentionDays. Llámalo una vez en main.go.
func StartActivityJanitor() {
	if ActivityRetentionDays <= 0 {
		return
	}
	go func() {
		for {
			if n, err := models.PurgeActivitiesOlderThan(ActivityRetentionDays); err != nil {
				log.Printf("bitacora: limpieza falló: %v", err)
			} else if n > 0 {
				log.Printf("bitacora: se borraron %d registros de más de %d días", n, ActivityRetentionDays)
			}
			time.Sleep(24 * time.Hour)
		}
	}()
}

// activityElementsCount: "12 elementos en el diseño".
func activityElementsCount(p map[string]interface{}) string {
	if list, ok := p["elements"].([]interface{}); ok {
		return strconv.Itoa(len(list)) + " elementos en el diseño"
	}
	return ""
}
