package admin

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// GetEntregaSettings — GET /api/admin/ecommerce/entrega
// Formas de entrega de la tienda (Elementor → Ecommerce).
func GetEntregaSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"sucursal":       true, // recoger en sucursal siempre está disponible
		"envioDomicilio": models.EnvioDomicilioActivo(),
	})
}

// SaveEntregaSettings — PUT /api/admin/ecommerce/entrega {"envioDomicilio": true}
func SaveEntregaSettings(c *gin.Context) {
	var body struct {
		EnvioDomicilio *bool `json:"envioDomicilio"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.EnvioDomicilio == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if err := models.SetEnvioDomicilioActivo(*body.EnvioDomicilio); err != nil {
		log.Printf("[elementor] entrega: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar. Intenta de nuevo."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "envioDomicilio": *body.EnvioDomicilio})
}
