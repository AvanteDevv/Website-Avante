package handlers

import (
	"errors"
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Panel de Laboratorio (eleazar@avanteoptics.mx). Ve los trabajos (los
// pedidos) por estado y los va avanzando; el cambio se refleja solo en
// Admin → Pedidos y en la página pública de Rastreo porque es la misma
// tabla. También ve el inventario (sin costos) y da de alta trabajos
// tomando el producto de ahí.

// LaboratorioPage — GET /laboratorio/trabajos y /laboratorio/inventario
func LaboratorioPage(vista string) gin.HandlerFunc {
	return func(c *gin.Context) {
		active := "lab-trabajos"
		if vista == "inventario" {
			active = "lab-inventario"
		}
		c.HTML(http.StatusOK, "laboratorio.html", WithStaff(c, gin.H{
			"ActivePage": active,
			"Vista":      vista,
			"Panel":      "laboratorio",
			"Empresas":   models.ConvenioEmpresas,
		}))
	}
}

// AdminLaboratorioPage — GET /admin/laboratorio: el mismo tablero de
// trabajos con el sidebar del admin (ve todo y puede eliminar trabajos).
func AdminLaboratorioPage(c *gin.Context) {
	c.HTML(http.StatusOK, "laboratorio.html", WithStaff(c, gin.H{
		"ActivePage": "admin-laboratorio",
		"Vista":      "trabajos",
		"Panel":      "admin",
		"Empresas":   models.ConvenioEmpresas,
	}))
}

func labParamID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Pedido inválido."})
		return 0, false
	}
	return id, true
}

func labRole(c *gin.Context) string {
	v, _ := c.Get("staff_role")
	s, _ := v.(string)
	return s
}

// LabListOrders — GET /api/laboratorio/pedidos
func LabListOrders(c *gin.Context) {
	list, err := models.ListLabOrders()
	if err != nil {
		log.Println("laboratorio.ListOrders:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los trabajos."})
		return
	}
	all, _ := models.GetAllOrderStatuses()
	// "Listo para la entrega" y "Entregado" los pone recepción: el
	// laboratorio no los ve. Las ventas de recepción llegan al tablero
	// cuando el optometrista hace su orden de laboratorio (o marca que no
	// lleva).
	hidden := models.RecepcionOnlyStatuses(all)
	statuses := []models.OrderStatus{}
	for _, s := range all {
		if !hidden[s.Key] {
			statuses = append(statuses, s)
		}
	}
	// Los que el laboratorio limpió de su última columna no salen (el
	// admin los puede ver con ?limpios=1).
	verLimpios := labRole(c) == RoleAdmin && c.Query("limpios") == "1"
	pedidos := []models.LabOrder{}
	limpios := 0
	for _, o := range list {
		if hidden[o.Status] {
			continue
		}
		if o.Limpio {
			limpios++
			if !verLimpios {
				continue
			}
		}
		if o.PosSaleID > 0 && o.Hoja == nil && !o.SinHoja {
			continue
		}
		pedidos = append(pedidos, o)
	}
	c.JSON(http.StatusOK, gin.H{"pedidos": pedidos, "estados": statuses, "empresas": models.ConvenioEmpresas, "limpios": limpios})
}

// labLastStatus — la última columna que ve el laboratorio (Control de calidad).
func labLastStatus() string {
	all, _ := models.GetAllOrderStatuses()
	hidden := models.RecepcionOnlyStatuses(all)
	last, lastOrder := "", -1<<31
	for _, s := range all {
		if !hidden[s.Key] && s.SortOrder >= lastOrder {
			last, lastOrder = s.Key, s.SortOrder
		}
	}
	return last
}

// LabClearColumn — POST /api/laboratorio/limpiar {status}
// Limpia la columna de Control de calidad: los trabajos no se borran, solo
// dejan de salir en el tablero.
func LabClearColumn(c *gin.Context) {
	var in struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || strings.TrimSpace(in.Status) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Columna inválida."})
		return
	}
	if strings.TrimSpace(in.Status) != labLastStatus() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Solo se puede limpiar la columna de Control de calidad."})
		return
	}
	n, err := models.ClearLabColumn(strings.TrimSpace(in.Status))
	if err != nil {
		log.Println("laboratorio.ClearColumn:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo limpiar la columna."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"limpiados": n})
}

// LabSetConvenio — PUT /api/laboratorio/pedidos/:id/convenio {convenio, empresa}
func LabSetConvenio(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	var in struct {
		Convenio string `json:"convenio"`
		Empresa  string `json:"empresa"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if err := models.SetOrderConvenio(id, in.Convenio, in.Empresa); err != nil {
		if errors.Is(err, models.ErrOrderNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese trabajo ya no existe."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar."})
		return
	}
	conv, emp := models.NormalizeConvenio(in.Convenio, in.Empresa)
	c.JSON(http.StatusOK, gin.H{"convenio": conv, "empresa": emp})
}

// LabDeleteOrder — DELETE /api/laboratorio/pedidos/:id (solo admin)
// Borra el trabajo para siempre (para los de prueba).
func LabDeleteOrder(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	if err := models.DeleteLabOrderHard(id); err != nil {
		if errors.Is(err, models.ErrOrderNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese trabajo ya no existe."})
			return
		}
		log.Println("laboratorio.DeleteOrder:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// LabSetExterno — PUT /api/laboratorio/pedidos/:id/externo {externo}
func LabSetExterno(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	var in struct {
		Externo bool `json:"externo"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if err := models.SetOrderLabExterno(id, in.Externo); err != nil {
		if errors.Is(err, models.ErrOrderNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese trabajo ya no existe."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"externo": in.Externo})
}

type labStatusInput struct {
	Status string `json:"status"`
}

// LabSetStatus — PATCH /api/laboratorio/pedidos/:id/estado
func LabSetStatus(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	var in labStatusInput
	if err := c.ShouldBindJSON(&in); err != nil || strings.TrimSpace(in.Status) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estado inválido."})
		return
	}
	status := strings.TrimSpace(in.Status)
	if !models.IsOrderStatus(status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ese estado no existe. Revisa los estados en Admin → Pedidos."})
		return
	}
	if all, _ := models.GetAllOrderStatuses(); models.RecepcionOnlyStatuses(all)[status] {
		c.JSON(http.StatusForbidden, gin.H{"error": "Ese estatus lo pone recepción."})
		return
	}
	if err := models.SetOrderStatusBy(id, status, staffName(c), labRole(c)); err != nil {
		if errors.Is(err, models.ErrOrderNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Ese pedido ya no existe."})
			return
		}
		log.Println("laboratorio.SetStatus:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar el estado."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type labNotesInput struct {
	Notes string `json:"notes"`
}

// LabSetNotes — PUT /api/laboratorio/pedidos/:id/notas
func LabSetNotes(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	var in labNotesInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	notes := strings.TrimSpace(in.Notes)
	if r := []rune(notes); len(r) > 500 {
		notes = string(r[:500])
	}
	if err := models.SetOrderLabNotes(id, notes); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese pedido ya no existe."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "notes": notes})
}

// LabOrderHistory — GET /api/laboratorio/pedidos/:id/historial
func LabOrderHistory(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	list, err := models.ListOrderHistory(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el historial."})
		return
	}
	c.JSON(http.StatusOK, list)
}

// LabCreateOrder — POST /api/laboratorio/pedidos (trabajo nuevo con
// producto del inventario).
func LabCreateOrder(c *gin.Context) {
	var in models.LabOrderInput
	if err := c.ShouldBindJSON(&in); err != nil || in.InventoryID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige un producto del inventario."})
		return
	}
	in.CustomerName = strings.TrimSpace(in.CustomerName)
	if in.CustomerName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe el nombre del cliente."})
		return
	}
	if in.Quantity > 999 {
		in.Quantity = 999
	}
	for _, s := range []*string{&in.CustomerName, &in.RxOD, &in.RxOI} {
		if r := []rune(*s); len(r) > 120 {
			*s = string(r[:120])
		}
	}
	if r := []rune(in.Notes); len(r) > 500 {
		in.Notes = string(r[:500])
	}
	o, err := models.CreateLabOrder(in, staffName(c), labRole(c))
	if err != nil {
		if errors.Is(err, models.ErrInvArticuloNotFound) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		log.Println("laboratorio.CreateOrder:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el trabajo."})
		return
	}
	c.Set("lab_order", o.OrderCode)
	c.JSON(http.StatusCreated, o)
}

// labInvItem: lo que ve el laboratorio de cada artículo (sin costos).
type labInvItem struct {
	ID           int64   `json:"id"`
	Clave        string  `json:"clave"`
	Descripcion  string  `json:"descripcion"`
	Departamento string  `json:"departamento"`
	Categoria    string  `json:"categoria"`
	Existencia   int     `json:"existencia"`
	Minimo       int     `json:"minimo"`
	Precio       float64 `json:"precio"`
	Servicio     bool    `json:"servicio"`
	Localizacion string  `json:"localizacion"`
}

// LabInventario — GET /api/laboratorio/inventario
func LabInventario(c *gin.Context) {
	list, err := models.ListInvArticulos()
	if err != nil {
		log.Println("laboratorio.Inventario:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el inventario."})
		return
	}
	out := make([]labInvItem, 0, len(list))
	for _, a := range list {
		out = append(out, labInvItem{
			ID: a.ID, Clave: a.Clave, Descripcion: a.Descripcion, Departamento: a.Departamento,
			Categoria: a.Categoria, Existencia: a.Existencia, Minimo: a.Minimo, Precio: a.Precio1,
			Servicio: a.Servicio, Localizacion: a.Localizacion,
		})
	}
	c.JSON(http.StatusOK, out)
}

// LabGetHoja — GET /api/laboratorio/hojas/:id (orden de laboratorio + plantilla)
func LabGetHoja(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	h, t, err := models.GetLabHojaFull(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa orden de laboratorio ya no existe."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hoja": h, "plantilla": t})
}

// LabSearchHojas — GET /api/laboratorio/hojas?q=
func LabSearchHojas(c *gin.Context) {
	list, err := models.SearchLabHojas(c.Query("q"), 40)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las órdenes de laboratorio."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"hojas": list})
}

// LabLinkHoja — PUT /api/laboratorio/pedidos/:id/hoja {sheetId} (0 = automática)
func LabLinkHoja(c *gin.Context) {
	id, ok := labParamID(c)
	if !ok {
		return
	}
	var in struct {
		SheetID int64 `json:"sheetId"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	err := models.SetOrderLabHoja(id, in.SheetID)
	switch {
	case errors.Is(err, models.ErrLabHojaNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa orden de laboratorio ya no existe."})
	case errors.Is(err, models.ErrOrderNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese trabajo ya no existe."})
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo ligar la orden."})
	default:
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// LabScan — POST /api/laboratorio/escanear {code}
// El escáner lee el código de barras del ticket (la clave AVT…) y el
// trabajo pasa al siguiente paso del tablero. En Control de calidad (el
// último paso del laboratorio) ya no avanza: «Listo para la entrega» lo
// pone recepción.
func LabScan(c *gin.Context) {
	var in struct {
		Code string `json:"code"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se leyó ningún código."})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(in.Code))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No se leyó ningún código."})
		return
	}
	list, err := models.ListLabOrders()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los trabajos."})
		return
	}
	var o *models.LabOrder
	for i := range list {
		if strings.EqualFold(list[i].OrderCode, code) {
			o = &list[i]
			break
		}
	}
	if o == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No hay ningún trabajo con la clave " + code + "."})
		return
	}
	if o.PosSaleID > 0 && o.Hoja == nil && !o.SinHoja {
		c.JSON(http.StatusConflict, gin.H{"error": code + " todavía no tiene orden de laboratorio: el optometrista la tiene que hacer primero."})
		return
	}
	all, _ := models.GetAllOrderStatuses()
	hidden := models.RecepcionOnlyStatuses(all)
	var steps []models.OrderStatus
	for _, s := range all {
		if !hidden[s.Key] {
			steps = append(steps, s)
		}
	}
	sort.SliceStable(steps, func(i, j int) bool { return steps[i].SortOrder < steps[j].SortOrder })
	if hidden[o.Status] {
		c.JSON(http.StatusConflict, gin.H{"error": code + " ya salió del laboratorio (está con recepción)."})
		return
	}
	cur := -1
	for i, s := range steps {
		if s.Key == o.Status {
			cur = i
		}
	}
	if cur >= 0 && cur == len(steps)-1 {
		c.JSON(http.StatusConflict, gin.H{"error": code + " ya está en " + steps[cur].Label + ". El siguiente paso lo pone recepción.", "id": o.ID, "status": o.Status})
		return
	}
	next := steps[0]
	if cur >= 0 {
		next = steps[cur+1]
	}
	if err := models.SetOrderStatusBy(o.ID, next.Key, staffName(c), labRole(c)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cambiar el estatus."})
		return
	}
	prev := ""
	if cur >= 0 {
		prev = steps[cur].Label
	}
	c.JSON(http.StatusOK, gin.H{"id": o.ID, "code": o.OrderCode, "cliente": o.CustomerName, "from": prev, "status": next.Key, "label": next.Label})
}
