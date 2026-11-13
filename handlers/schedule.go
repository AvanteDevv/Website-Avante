package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// GetAgendaHours returns the currently configured opening/closing time
// for bookings, so the public "Agenda tu cita" widget (agendar.js /
// index.js) can build its list of time slots dynamically instead of a
// fixed one. No login required — it's read by anyone visiting the site.
// También regresa los días de la semana en que se abre ("days").
func GetAgendaHours(c *gin.Context) {
	open, close, err := models.GetAgendaHours()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el horario."})
		return
	}
	// days: días de la semana en que se dan citas (0 = domingo … 6 =
	// sábado). Los calendarios deshabilitan los demás.
	days, _ := models.GetAgendaDays()
	// closed: fechas sueltas en que la óptica no abre (día inhábil,
	// inventario…), de ayer en adelante, con su motivo. Los calendarios
	// las muestran como «Cerrado» y no dejan elegirlas.
	from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	closed, err := models.ListAgendaClosedDays(from)
	if err != nil {
		closed = []models.AgendaClosedDay{}
	}
	// Es público: no se manda quién lo cerró.
	for i := range closed {
		closed[i].CreatedBy = ""
	}
	// "sms": si al agendar se pide el código por SMS (lo usan agendar.js,
	// mis-citas.js y registro.js para el texto de los botones).
	c.JSON(http.StatusOK, gin.H{"open": open, "close": close, "days": days, "closed": closed, "sms": models.SMSVerificationEnabled()})
}
