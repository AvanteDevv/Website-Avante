package receptionist

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/handlers"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod, igual que en el resto del proyecto.

// Citas renderiza el panel de citas de recepción — mismos datos que ve
// el admin (models.GetAllAppointments(), sin filtrar por rol: no hay
// "citas asignadas a esta recepcionista", todas las citas son de toda
// la óptica), pero con la plantilla y el sidebar propios de recepción,
// y mostrando el calendario primero en vez de la tabla.
//
// A propósito NO se duplica la lógica de actualizar/eliminar cita: las
// rutas PATCH /admin/citas/:id/estado y DELETE /admin/citas/:id ya
// están abiertas para el rol receptionist (ver citasStaff en main.go),
// así que citas-recepcion.js pega directo a esos mismos endpoints.
func Citas(c *gin.Context) {
	appointments, err := models.GetAllAppointments()
	if err != nil {
		log.Printf("receptionist.Citas: error querying appointments: %v", err)
		c.HTML(http.StatusOK, "citas-recepcion.html", handlers.WithStaff(c, gin.H{
			"ActivePage": "receptionist-citas",
			"DBError":    "No se pudieron cargar las citas en este momento.",
		}))
		return
	}

	c.HTML(http.StatusOK, "citas-recepcion.html", handlers.WithStaff(c, gin.H{
		"ActivePage": "receptionist-citas",
		"Citas":      appointments,
	}))
}
