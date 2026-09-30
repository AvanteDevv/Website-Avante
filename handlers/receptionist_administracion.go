package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Recepción → Administración. Dos pestañas: "Reportes" y "Clarito".
// Por ahora las dos están vacías; la pestaña abierta va en la URL
// (?tab=reportes | ?tab=clarito) para poder mandar el link directo.

// ReceptionistAdministracionPage — GET /receptionist/administracion
func ReceptionistAdministracionPage(c *gin.Context) {
	tab := c.Query("tab")
	if tab != "clarito" {
		tab = "reportes"
	}
	c.HTML(http.StatusOK, "administracion-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-administracion",
		"Tab":        tab,
	}))
}
