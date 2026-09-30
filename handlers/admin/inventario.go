package admin

import (
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/handlers"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Admin → Inventario. La página carga la lista por API para poder
// agregar / editar / eliminar sin recargar.

// Inventario — GET /admin/inventario
func Inventario(c *gin.Context) {
	c.HTML(http.StatusOK, "inventario.html", handlers.WithStaff(c, gin.H{
		"ActivePage": "admin-inventario",
	}))
}

// ListInventario — GET /api/admin/inventario
func ListInventario(c *gin.Context) {
	items, err := models.ListInventory()
	if err != nil {
		log.Printf("admin.ListInventario: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el inventario."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type inventarioBody struct {
	Descripcion    string  `json:"descripcion"`
	PrecioCosto    float64 `json:"precio_costo"`
	PrecioVenta    float64 `json:"precio_venta"`
	Cantidad       int     `json:"cantidad"`
	CantidadActual *int    `json:"cantidad_actual"`
}

func (b *inventarioBody) validate() string {
	b.Descripcion = strings.TrimSpace(b.Descripcion)
	switch {
	case b.Descripcion == "":
		return "Escribe la descripción del producto."
	case len([]rune(b.Descripcion)) > 200:
		return "La descripción es muy larga (máximo 200 caracteres)."
	case b.PrecioCosto < 0 || b.PrecioVenta < 0 || math.IsNaN(b.PrecioCosto) || math.IsNaN(b.PrecioVenta):
		return "Los precios no pueden ser negativos."
	case b.PrecioCosto > 9999999999 || b.PrecioVenta > 9999999999:
		return "El precio es demasiado grande."
	case b.Cantidad < 0:
		return "La cantidad no puede ser negativa."
	case b.CantidadActual != nil && *b.CantidadActual < 0:
		return "La cantidad actual no puede ser negativa."
	}
	b.PrecioCosto = math.Round(b.PrecioCosto*100) / 100
	b.PrecioVenta = math.Round(b.PrecioVenta*100) / 100
	return ""
}

// CreateInventario — POST /api/admin/inventario
// Si no mandan cantidad_actual, arranca igual a cantidad.
func CreateInventario(c *gin.Context) {
	var b inventarioBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if msg := b.validate(); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	actual := b.Cantidad
	if b.CantidadActual != nil {
		actual = *b.CantidadActual
	}
	it, err := models.CreateInventoryItem(models.InventoryItem{
		Descripcion: b.Descripcion, PrecioCosto: b.PrecioCosto, PrecioVenta: b.PrecioVenta,
		Cantidad: b.Cantidad, CantidadActual: actual,
	})
	if err != nil {
		log.Printf("admin.CreateInventario: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"item": it})
}

// UpdateInventario — PUT /api/admin/inventario/:id
func UpdateInventario(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Producto inválido."})
		return
	}
	var b inventarioBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if msg := b.validate(); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	prev, err := models.GetInventoryItem(id)
	if err == models.ErrInventoryNotFound {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese producto ya no existe."})
		return
	}
	if err != nil {
		log.Printf("admin.UpdateInventario: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}
	actual := prev.CantidadActual
	if b.CantidadActual != nil {
		actual = *b.CantidadActual
	}
	it, err := models.UpdateInventoryItem(models.InventoryItem{
		ID: id, Descripcion: b.Descripcion, PrecioCosto: b.PrecioCosto, PrecioVenta: b.PrecioVenta,
		Cantidad: b.Cantidad, CantidadActual: actual,
	})
	if err != nil {
		log.Printf("admin.UpdateInventario: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el producto."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"item": it})
}

// DeleteInventario — DELETE /api/admin/inventario/:id
func DeleteInventario(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Producto inválido."})
		return
	}
	if err := models.DeleteInventoryItem(id); err != nil {
		log.Printf("admin.DeleteInventario: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el producto."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
