package handlers

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Etiquetas de cita (Recepción → Citas): reloj = vino sin cita,
// corazón = chequeo, teléfono, WhatsApp.

// ListCitaEtiquetas — GET /api/receptionist/citas/etiquetas
func ListCitaEtiquetas(c *gin.Context) {
	tags, err := models.ListAppointmentTags()
	if err != nil {
		log.Printf("citas.ListEtiquetas: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las etiquetas."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tags": tags})
}

// SetCitaEtiqueta — PUT /api/receptionist/citas/:id/etiqueta  {"tag": "chequeo"}
// tag vacío quita la etiqueta.
func SetCitaEtiqueta(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cita inválida."})
		return
	}
	var body struct {
		Tag string `json:"tag"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	if body.Tag != "" && !models.IsAppointmentTag(body.Tag) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Esa etiqueta no existe."})
		return
	}
	nameVal, _ := c.Get("staff_name")
	name, _ := nameVal.(string)
	if err := models.SetAppointmentTag(id, body.Tag, name); err != nil {
		log.Printf("citas.SetEtiqueta: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la etiqueta."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "tag": body.Tag})
}
