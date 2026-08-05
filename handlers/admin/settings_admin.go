package admin

import (
	"log"
	"net/http"

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
}

// UpdateAgendaHours saves the opening/closing time chosen in the
// Configuración form. Called via POST /admin/configuracion/horarios.
func UpdateAgendaHours(c *gin.Context) {
	var input updateAgendaHoursInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecciona una hora de apertura y cierre válidas."})
		return
	}

	if err := models.SetAgendaHours(input.Open, input.Close); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el horario."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Horario actualizado."})
}
