package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Recepción → Administración. Tres pestañas: "Reportes", "Clarito" y
// "Documentación". La pestaña abierta va en la URL
// (?tab=reportes | ?tab=clarito | ?tab=documentacion) para poder mandar
// el link directo.

// ReceptionistAdministracionPage — GET /receptionist/administracion
func ReceptionistAdministracionPage(c *gin.Context) {
	tab := c.Query("tab")
	if tab != "clarito" && tab != "documentacion" {
		tab = "reportes"
	}
	c.HTML(http.StatusOK, "administracion-recepcion.html", WithStaff(c, gin.H{
		"ActivePage": "receptionist-administracion",
		"Tab":        tab,
	}))
}
