package handlers

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"time"

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

type cancelMyAppointmentInput struct {
	Motivo string `json:"motivo" binding:"required"`
}

// CancelMyAppointment permite al cliente cancelar SU PROPIA cita —
// POST /api/mis-citas/:id/cancelar. Requiere sesión de cliente y un
// motivo obligatorio (models.CancelAppointmentByUser ya valida que el
// id le pertenezca al usuario de la sesión, no confía solo en el
// front). El motivo queda guardado en cancel_reason y es lo mismo que
// ve recepción/admin en su panel — no se duplica en otra tabla.
func CancelMyAppointment(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de cita inválido."})
		return
	}

	var input cancelMyAppointmentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cuéntanos el motivo de la cancelación."})
		return
	}

	err = models.CancelAppointmentByUser(id, currentUserID(c), input.Motivo)
	if errors.Is(err, models.ErrAppointmentNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No se encontró esa cita en tu cuenta."})
		return
	}
	if err != nil {
		log.Println("CancelMyAppointment: error al cancelar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cancelar la cita. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Cita cancelada."})
}

type rescheduleMyAppointmentInput struct {
	Date string `json:"date" binding:"required"` // "2026-08-20"
	Time string `json:"time" binding:"required"` // "10:00"
}

// RescheduleMyAppointment cambia la fecha/hora de UNA cita ya existente
// del cliente logueado — POST /api/mis-citas/:id/reagendar. A propósito
// NO pide verificar código otra vez (a diferencia de agendar una cita
// nueva desde cero): la sesión de cliente ya autentica que es dueño de
// esa cita, y models.RescheduleAppointmentByUser confirma el
// user_id antes de tocar nada.
func RescheduleMyAppointment(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de cita inválido."})
		return
	}

	var input rescheduleMyAppointmentInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona un día y una hora válidos."})
		return
	}

	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}

	// Última verificación anti-doble-booking, igual que al crear una
	// cita — excluyendo la propia cita que se está moviendo, por si el
	// cliente vuelve a elegir el mismo horario que ya tenía.
	booked, err := models.IsSlotBookedExcluding(date, input.Time, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar el horario."})
		return
	}
	if booked {
		c.JSON(http.StatusConflict, gin.H{"error": "Esa hora ya fue agendada por alguien más. Elige otra."})
		return
	}

	err = models.RescheduleAppointmentByUser(id, currentUserID(c), date, input.Time)
	if errors.Is(err, models.ErrAppointmentNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No se encontró esa cita en tu cuenta."})
		return
	}
	if err != nil {
		log.Println("RescheduleMyAppointment: error al reagendar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo reagendar la cita. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Cita reagendada."})
}
