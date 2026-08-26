package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// GetMyAppointments devuelve las citas ligadas a la cuenta del cliente
// logueado — GET /api/mis-citas. Requiere sesión de cliente
// (RequireAuthAPI, igual que /api/favorites).
//
// Solo aparecen aquí las citas que la persona agendó ESTANDO YA
// logueada en ese momento (ver optionalUserID en appointments.go). Las
// que agendó como invitada antes de tener cuenta, o iniciar sesión,
// quedan identificadas solo por celular y no hay forma de "reclamarlas"
// después — no se cruzan automáticamente por número de teléfono.
func GetMyAppointments(c *gin.Context) {
	appointments, err := models.GetAppointmentsByUser(currentUserID(c))
	if err != nil {
		log.Println("GetMyAppointments: error al leer citas:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar tus citas."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"citas": appointments})
}
