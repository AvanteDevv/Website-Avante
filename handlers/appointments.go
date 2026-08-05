package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

type createAppointmentInput struct {
	Date string `json:"date" binding:"required"` // "2026-08-20"
	Time string `json:"time" binding:"required"` // "10:00"
}

// CreateAppointment handles bookings from the public "Agenda tu cita"
// section. No login required — this is what agendar.js calls when the
// person confirms a day and time.
func CreateAppointment(c *gin.Context) {
	var input createAppointmentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona un día y una hora válidos."})
		return
	}

	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}

	if _, err := models.CreateAppointment(date, input.Time); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo agendar la cita. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Cita agendada correctamente."})
}
