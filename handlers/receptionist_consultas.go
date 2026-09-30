package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Recepción → Consultas: buscar en el inventario (precio de venta y
// cuántas piezas quedan). El precio de costo nunca sale de aquí.

// ReceptionistConsultasPage — GET /receptionist/consultas
func ReceptionistConsultasPage(c *gin.Context) {
	c.HTML(http.StatusOK, "consultas-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-consultas",
	}))
}

// SearchInventarioRecepcion — GET /api/receptionist/inventario?q=fibra
func SearchInventarioRecepcion(c *gin.Context) {
	items, err := models.SearchInventoryPublic(c.Query("q"), 300)
	if err != nil {
		log.Printf("recepcion.SearchInventario: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo buscar en el inventario."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
