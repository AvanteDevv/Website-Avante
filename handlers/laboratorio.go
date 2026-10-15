package handlers

import (
	"errors"
	"log"
	"net/http"
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
		}))
	}
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
	pedidos := []models.LabOrder{}
	for _, o := range list {
		if hidden[o.Status] {
			continue
		}
		if o.PosSaleID > 0 && o.Hoja == nil && !o.SinHoja {
			continue
		}
		pedidos = append(pedidos, o)
	}
	c.JSON(http.StatusOK, gin.H{"pedidos": pedidos, "estados": statuses})
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
