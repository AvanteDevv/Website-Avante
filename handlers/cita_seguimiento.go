package handlers

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Seguimiento de cita (Recepción → Citas → "Asistió"): si el cliente
// compró algo y cada cuánto le toca su próxima revisión (3 meses, 6
// meses o 1 año). Si no compró, no se le programa revisión. Lo usa el
// calendario en "Revisiones" para saber a quién recordarle volver.

// ListCitaSeguimiento — GET /api/receptionist/citas/seguimiento
//
//	→ { "items": { "12": { "compro": true, "meses": 6 }, "15": { "compro": false } } }
func ListCitaSeguimiento(c *gin.Context) {
	items, err := models.ListAppointmentFollowups()
	if err != nil {
		log.Printf("citas.ListSeguimiento: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el seguimiento de las citas."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// SetCitaSeguimiento — PUT /api/receptionist/citas/:id/seguimiento
//
//	{ "compro": true, "meses": 6 }   // meses: 3, 6 o 12 (solo si compró)
//	{ "compro": false }
//
// Además marca la cita como "asistio" si todavía no lo estaba: así el
// botón "Asistió" del panel hace las dos cosas en un solo paso.
func SetCitaSeguimiento(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cita inválida."})
		return
	}
	var body struct {
		Compro *bool `json:"compro"`
		Meses  int   `json:"meses"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Compro == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Indica si compró o no compró."})
		return
	}
	compro := *body.Compro
	meses := 0
	if compro {
		meses = body.Meses
		if meses == 0 {
			meses = 12 // por defecto, 1 año
		}
		if !models.IsRevisionMonths(meses) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "La revisión solo puede ser a 3 meses, 6 meses o 1 año."})
			return
		}
	}

	appt, err := models.GetAppointmentByID(id)
	if errors.Is(err, models.ErrAppointmentNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa cita ya no existe. Recarga la página."})
		return
	}
	if err != nil {
		log.Printf("citas.SetSeguimiento: leer cita: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer la cita."})
		return
	}

	nameVal, _ := c.Get("staff_name")
	name, _ := nameVal.(string)
	if err := models.SetAppointmentFollowup(id, compro, meses, name); err != nil {
		log.Printf("citas.SetSeguimiento: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar si compró."})
		return
	}
	if appt.Status != "asistio" {
		if err := models.UpdateAppointmentStatus(id, "asistio"); err != nil {
			log.Printf("citas.SetSeguimiento: marcar asistió: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Se guardó la compra, pero no se pudo marcar que asistió."})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "item": models.AppointmentFollowup{Compro: compro, Meses: meses}})
}
