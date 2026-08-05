package admin

import (
	"log"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// Appointments renders the admin panel with real bookings pulled live
// from MySQL — every booking made through /api/agendar shows up here.
func Appointments(c *gin.Context) {
	appointments, err := models.GetAllAppointments()
	if err != nil {
		log.Printf("admin.Appointments: error querying appointments: %v", err)
		c.HTML(http.StatusOK, "citas.html", gin.H{
			"ActivePage": "admin-citas",
			"DBError":    "No se pudieron cargar las citas en este momento.",
		})
		return
	}

	c.HTML(http.StatusOK, "citas.html", gin.H{
		"ActivePage": "admin-citas",
		"Citas":      appointments,
	})
}

type updateAppointmentStatusInput struct {
	Status string `json:"status" binding:"required"`
}

// UpdateAppointmentStatus lets the admin mark a booking as confirmed (or
// any other status). Called via PATCH /admin/citas/:id/estado.
func UpdateAppointmentStatus(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido."})
		return
	}

	var input updateAppointmentStatusInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Estado inválido."})
		return
	}

	if err := models.UpdateAppointmentStatus(id, input.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar la cita."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Cita actualizada."})
}

// DeleteAppointment removes a booking. Called via DELETE /admin/citas/:id.
func DeleteAppointment(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido."})
		return
	}

	if err := models.DeleteAppointment(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la cita."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Cita eliminada."})
}
