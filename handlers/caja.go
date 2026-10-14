package handlers

import (
	"encoding/base64"
	"errors"
	"html"
	"log"
	"net/http"
	"strconv"
	"strings"

	"avante-optics/mailer"
	"avante-optics/models"

	"github.com/gin-gonic/gin"
)

// CORTE DE CAJA (Recepción → Corte de caja). Ver models/caja.go.
//
//   GET  /receptionist/corte-de-caja                      página
//   GET  /api/receptionist/caja/estado                    lo que lleva la caja desde el último corte
//   POST /api/receptionist/caja/cortes                    {contado:{…}, retiro:{…}} guarda el corte
//   GET  /api/receptionist/caja/cortes?desde=&hasta=&pagina=
//   GET  /api/receptionist/caja/cortes/:id                corte extendido (con detalle de movimientos)
//   POST /api/receptionist/caja/cortes/:id/email          manda el reporte por correo
//   GET  /api/receptionist/caja/propinas                  propinas pendientes de corte
//   POST /api/receptionist/caja/propinas                  corte de propinas
//   GET  /api/receptionist/caja/movimientos?desde=&hasta=
//   POST /api/receptionist/caja/movimientos               entrada / salida de caja
//   POST /api/receptionist/caja/movimientos/:id/cancelar
//   GET/PUT /api/receptionist/caja/config                 (PUT solo admin)
//   POST /api/receptionist/pos/ventas/:id/cancelar        {motivo}

func cajaVeCalculado(c *gin.Context) bool {
	return currentStaff(c).Role == RoleAdmin || models.CajaRecepcionVeCalculado()
}

func cajaFail(c *gin.Context, where string, err error, msg string) {
	log.Printf("caja.%s: %v", where, err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
}

// CorteCajaPage — GET /receptionist/corte-de-caja
func CorteCajaPage(c *gin.Context) {
	c.HTML(http.StatusOK, "corte-caja-recepcion.html", WithStaff(c, gin.H{
		"ActivePage":  "receptionist-corte",
		"EsAdmin":     currentStaff(c).Role == RoleAdmin,
		"MailFrom":    mailer.From(),
		"MailEnabled": mailer.Enabled(),
		"Caja":        models.CajaDefault,
		"VeCalculado": cajaVeCalculado(c),
	}))
}

// CajaEstadoAPI — GET /api/receptionist/caja/estado
func CajaEstadoAPI(c *gin.Context) {
	rep, last, err := models.CajaEstado(models.CajaDefault)
	if err != nil {
		cajaFail(c, "estado", err, "No se pudo calcular el estado de la caja.")
		return
	}
	ve := cajaVeCalculado(c)
	out := gin.H{
		"caja":         models.CajaDefault,
		"desde":        rep.Desde,
		"hasta":        rep.Hasta,
		"ve_calculado": ve,
		"ultimo":       last,
		// Información adicional (también la ve quien no ve lo calculado).
		"info": gin.H{
			"transferencias": rep.Calculado.Transferencia,
			"anticipos":      rep.Anticipos,
			"pagos_linea":    rep.PagosLinea,
		},
	}
	if last != nil && !ve {
		l := *last
		l.Ciego()
		out["ultimo"] = l
	}
	if ve {
		out["calculado"] = rep.Calculado
		out["fondo"] = rep.Fondo
		out["entradas_fp"] = rep.Entradas
		out["salidas_fp"] = rep.Salidas
		out["total"] = rep.Calculado.Total()
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, out)
}

type cajaCorteInput struct {
	Contado models.CajaMontos `json:"contado"`
	Retiro  models.CajaMontos `json:"retiro"`
}

// CajaSaveCorte — POST /api/receptionist/caja/cortes
func CajaSaveCorte(c *gin.Context) {
	var in cajaCorteInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos del corte inválidos."})
		return
	}
	corte, err := models.SaveCajaCorte(models.CajaDefault, posStaffName(c), in.Contado, in.Retiro)
	switch {
	case errors.Is(err, models.ErrCajaRetiro):
		c.JSON(http.StatusBadRequest, gin.H{"error": "El retiro no puede ser mayor a lo contado (" + strings.TrimSuffix(strings.SplitN(err.Error(), "(", 2)[1], ")") + ")."})
		return
	case errors.Is(err, models.ErrCajaMonto):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Los importes no pueden ser negativos."})
		return
	case err != nil:
		cajaFail(c, "SaveCorte", err, "No se pudo guardar el corte.")
		return
	}
	if !cajaVeCalculado(c) {
		corte.Ciego()
	}
	c.JSON(http.StatusCreated, gin.H{"corte": corte})
}

// CajaListCortes — GET /api/receptionist/caja/cortes
func CajaListCortes(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("pagina"))
	if page < 1 {
		page = 1
	}
	const per = 25
	list, total, err := models.ListCajaCortes(c.Query("desde"), c.Query("hasta"), per, (page-1)*per)
	if err != nil {
		cajaFail(c, "ListCortes", err, "No se pudieron cargar los cortes.")
		return
	}
	if !cajaVeCalculado(c) {
		for i := range list {
			list[i].Ciego()
		}
	}
	pages := (total + per - 1) / per
	if pages < 1 {
		pages = 1
	}
	c.JSON(http.StatusOK, gin.H{"cortes": list, "total": total, "pagina": page, "paginas": pages, "ve_calculado": cajaVeCalculado(c)})
}

func cajaIDParam(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Identificador inválido."})
		return 0, false
	}
	return id, true
}

// CajaGetCorte — GET /api/receptionist/caja/cortes/:id
func CajaGetCorte(c *gin.Context) {
	id, ok := cajaIDParam(c)
	if !ok {
		return
	}
	corte, err := models.GetCajaCorte(id)
	if errors.Is(err, models.ErrCajaNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No existe ese corte."})
		return
	}
	if err != nil {
		cajaFail(c, "GetCorte", err, "No se pudo cargar el corte.")
		return
	}
	ve := cajaVeCalculado(c)
	if !ve {
		corte.Ciego()
	}
	c.JSON(http.StatusOK, gin.H{"corte": corte, "ve_calculado": ve})
}

type cajaEmailInput struct {
	Para     []string `json:"para"`
	CCO      []string `json:"cco"`
	Asunto   string   `json:"asunto"`
	Mensaje  string   `json:"mensaje"`
	Adjuntos []struct {
		Nombre string `json:"nombre"`
		Tipo   string `json:"tipo"`
		Base64 string `json:"base64"`
	} `json:"adjuntos"`
}

// CajaEmailCorte — POST /api/receptionist/caja/cortes/:id/email
func CajaEmailCorte(c *gin.Context) {
	id, ok := cajaIDParam(c)
	if !ok {
		return
	}
	if !cajaVeCalculado(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Tu usuario no tiene permiso para ver el reporte del corte."})
		return
	}
	if _, err := models.GetCajaCorte(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No existe ese corte."})
		return
	}
	if !mailer.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "El correo del sistema no está configurado (faltan SMTP_USER y SMTP_PASS en el servidor)."})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 20<<20)
	var in cajaEmailInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se pudo leer el correo (los adjuntos pesan más de 15 MB)."})
		return
	}
	if len(in.Para) == 0 || len(in.Para)+len(in.CCO) > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe al menos un correo en «Para»."})
		return
	}
	asunto := strings.TrimSpace(in.Asunto)
	if asunto == "" {
		asunto = "Corte de Caja"
	}
	var atts []mailer.Attachment
	for _, a := range in.Adjuntos {
		data, err := base64.StdEncoding.DecodeString(a.Base64)
		if err != nil || len(data) == 0 {
			continue
		}
		atts = append(atts, mailer.Attachment{Name: a.Nombre, Type: a.Tipo, Data: data})
	}
	body := `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0a0e38;line-height:1.55">` +
		strings.ReplaceAll(html.EscapeString(strings.TrimSpace(in.Mensaje)), "\n", "<br>") + `</div>`
	if err := mailer.SendWithAttachments(in.Para, in.CCO, asunto, body, atts); err != nil {
		cajaFail(c, "EmailCorte", err, "No se pudo enviar el correo: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// CajaPropinasAPI — GET /api/receptionist/caja/propinas
func CajaPropinasAPI(c *gin.Context) {
	p, last, err := models.PendingPropinas(models.CajaDefault)
	if err != nil {
		cajaFail(c, "propinas", err, "No se pudieron calcular las propinas.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"pendientes": p, "ultimo": last})
}

// CajaSavePropinas — POST /api/receptionist/caja/propinas
func CajaSavePropinas(c *gin.Context) {
	p, err := models.SavePropinaCorte(models.CajaDefault, posStaffName(c))
	if errors.Is(err, models.ErrCajaSinPropinas) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No hay propinas pendientes de corte."})
		return
	}
	if err != nil {
		cajaFail(c, "SavePropinas", err, "No se pudo guardar el corte de propinas.")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"corte": p})
}

// CajaListMovimientos — GET /api/receptionist/caja/movimientos
func CajaListMovimientos(c *gin.Context) {
	desde, hasta := c.Query("desde"), c.Query("hasta")
	if desde == "" || hasta == "" {
		hoy := models.PosToday()
		desde, hasta = hoy, hoy
	}
	list, err := models.ListCajaMovimientos(models.CajaDefault, desde, hasta)
	if err != nil {
		cajaFail(c, "ListMov", err, "No se pudieron cargar los movimientos.")
		return
	}
	conceptos := []gin.H{}
	for _, k := range []string{"gasto", "compra", "pago_credito", "nota_credito", "retiro", "otro_salida", "deposito", "dev_proveedor", "otro_entrada"} {
		cc := models.CajaConceptos[k]
		conceptos = append(conceptos, gin.H{"key": k, "tipo": cc.Tipo, "label": cc.Label, "credito": cc.Credito})
	}
	c.JSON(http.StatusOK, gin.H{"movimientos": list, "conceptos": conceptos})
}

// CajaCreateMovimiento — POST /api/receptionist/caja/movimientos
func CajaCreateMovimiento(c *gin.Context) {
	var in models.CajaMovimiento
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos del movimiento inválidos."})
		return
	}
	in.Usuario = posStaffName(c)
	in.Caja = models.CajaDefault
	m, err := models.CreateCajaMovimiento(in)
	switch {
	case errors.Is(err, models.ErrCajaConcepto):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige el concepto."})
	case errors.Is(err, models.ErrCajaForma):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige la forma de pago (a crédito solo aplica a gastos y compras)."})
	case errors.Is(err, models.ErrCajaMonto):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un monto mayor a cero."})
	case err != nil:
		cajaFail(c, "CreateMov", err, "No se pudo guardar el movimiento.")
	default:
		c.JSON(http.StatusCreated, gin.H{"movimiento": m})
	}
}

// CajaCancelMovimiento — POST /api/receptionist/caja/movimientos/:id/cancelar
func CajaCancelMovimiento(c *gin.Context) {
	id, ok := cajaIDParam(c)
	if !ok {
		return
	}
	m, err := models.CancelCajaMovimiento(id, posStaffName(c))
	switch {
	case errors.Is(err, models.ErrCajaMovNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese movimiento ya no existe."})
	case errors.Is(err, models.ErrCajaMovCancelado):
		c.JSON(http.StatusConflict, gin.H{"error": "Ese movimiento ya estaba cancelado."})
	case err != nil:
		cajaFail(c, "CancelMov", err, "No se pudo cancelar el movimiento.")
	default:
		c.JSON(http.StatusOK, gin.H{"movimiento": m})
	}
}

// CajaConfigAPI — GET /api/receptionist/caja/config
func CajaConfigAPI(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"recepcion_ve_calculado": models.CajaRecepcionVeCalculado(), "es_admin": currentStaff(c).Role == RoleAdmin})
}

// CajaSaveConfig — PUT /api/receptionist/caja/config {recepcion_ve_calculado}
func CajaSaveConfig(c *gin.Context) {
	if currentStaff(c).Role != RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "Solo el administrador puede cambiar los permisos de la caja."})
		return
	}
	var in struct {
		Ve bool `json:"recepcion_ve_calculado"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	v := "0"
	if in.Ve {
		v = "1"
	}
	if err := models.CajaConfigSet("recepcion_ve_calculado", v); err != nil {
		cajaFail(c, "SaveConfig", err, "No se pudo guardar.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"recepcion_ve_calculado": in.Ve})
}

// PosCancelSale — POST /api/receptionist/pos/ventas/:id/cancelar {motivo}
func PosCancelSale(c *gin.Context) {
	id, ok := cajaIDParam(c)
	if !ok {
		return
	}
	var in struct {
		Motivo string `json:"motivo"`
	}
	_ = c.ShouldBindJSON(&in)
	err := models.CancelPosSale(id, posStaffName(c), in.Motivo)
	switch {
	case errors.Is(err, models.ErrPosSaleNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "No existe ese ticket."})
	case errors.Is(err, models.ErrPosVentaCancelada), errors.Is(err, models.ErrPosVentaConAbonos), errors.Is(err, models.ErrPosMotivoRequerido):
		msg := err.Error()
		c.JSON(http.StatusBadRequest, gin.H{"error": strings.ToUpper(msg[:1]) + msg[1:] + "."})
	case err != nil:
		cajaFail(c, "CancelSale", err, "No se pudo cancelar la venta.")
	default:
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
