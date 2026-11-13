package admin

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// Settings renders the "Configuración" admin page with the currently
// saved agenda hours.
func Settings(c *gin.Context) {
	open, close, err := models.GetAgendaHours()
	if err != nil {
		log.Printf("admin.Settings: error loading agenda hours: %v", err)
		open, close = models.DefaultAgendaOpen, models.DefaultAgendaClose
	}

	c.HTML(http.StatusOK, "configuracion.html", gin.H{
		"ActivePage":  "admin-configuracion",
		"AgendaOpen":  open,
		"AgendaClose": close,
	})
}

type updateAgendaHoursInput struct {
	Open  string `json:"open" binding:"required"`
	Close string `json:"close" binding:"required"`
	// Days: días de la semana en que se dan citas (0 = domingo … 6 =
	// sábado). Opcional: si no viene, se quedan los que ya estaban.
	Days *[]int `json:"days"`
}

// UpdateAgendaHours saves the opening/closing time chosen in the
// Configuración form. Called via POST /admin/configuracion/horarios.
func UpdateAgendaHours(c *gin.Context) {
	var input updateAgendaHoursInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona una hora de apertura y cierre válidas."})
		return
	}

	if input.Close <= input.Open {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La hora de cierre debe ser después de la de apertura."})
		return
	}
	if input.Days != nil {
		valid := 0
		for _, d := range *input.Days {
			if d >= 0 && d <= 6 {
				valid++
			}
		}
		if valid == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Elige al menos un día en que se den citas."})
			return
		}
	}

	if err := models.SetAgendaHours(input.Open, input.Close); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el horario."})
		return
	}
	if input.Days != nil {
		if err := models.SetAgendaDays(*input.Days); err != nil {
			log.Printf("admin.UpdateAgendaHours: error saving days: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Se guardó la hora, pero no los días."})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Horario actualizado."})
}

// ---------- Días cerrados ----------
// Fechas sueltas en que la óptica no abre (día inhábil, inventario, un
// evento…). Se administran en el modal "Horario de citas" del admin.

func closedDayStaffName(c *gin.Context) string {
	v, _ := c.Get("staff_name")
	s, _ := v.(string)
	if s == "" {
		s = "Admin"
	}
	return s
}

// ListClosedDays — GET /admin/configuracion/dias-cerrados
// Regresa los días cerrados de hoy en adelante.
func ListClosedDays(c *gin.Context) {
	from := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	days, err := models.ListAgendaClosedDays(from)
	if err != nil {
		log.Printf("admin.ListClosedDays: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los días cerrados."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": days})
}

type closedDayInput struct {
	Date   string `json:"date"`
	Reason string `json:"reason"`
}

// AddClosedDay — POST /admin/configuracion/dias-cerrados
// {"date":"2026-11-20","reason":"Inventario"}. Si ese día ya tiene
// citas, igual se cierra, pero regresa cuántas para avisarle al admin.
func AddClosedDay(c *gin.Context) {
	var in closedDayInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(in.Date))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige una fecha."})
		return
	}
	if date.Format("2006-01-02") < time.Now().AddDate(0, 0, -1).Format("2006-01-02") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Esa fecha ya pasó."})
		return
	}
	if err := models.SetAgendaClosedDay(date, in.Reason, closedDayStaffName(c)); err != nil {
		log.Printf("admin.AddClosedDay: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el día cerrado."})
		return
	}
	n, _ := models.CountActiveAppointmentsOn(date)
	c.JSON(http.StatusOK, gin.H{"message": "Día cerrado.", "citas": n})
}

// DeleteClosedDay — DELETE /admin/configuracion/dias-cerrados/:fecha
// Vuelve a abrir ese día.
func DeleteClosedDay(c *gin.Context) {
	date, err := time.Parse("2006-01-02", c.Param("fecha"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}
	if _, err := models.DeleteAgendaClosedDay(date); err != nil {
		log.Printf("admin.DeleteClosedDay: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo quitar el día cerrado."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Día abierto otra vez."})
}
