package admin

import (
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/whatsapp"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// monthsEs / formatFechaEs / formatHour12 duplicados a propósito de
// reminders/scheduler.go y handlers/appointments.go — mismo criterio
// que ahí: es más simple repetir estas 2 funciones chiquitas que hacer
// que este paquete dependa de otro solo por eso.
var monthsEs = [...]string{
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
}

func formatFechaEs(d time.Time) string {
	return fmt.Sprintf("%d de %s", d.Day(), monthsEs[d.Month()-1])
}

func formatHour12(hhmm string) string {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return hhmm
	}
	return t.Format("3:04 PM")
}

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

// ListAppointmentsJSON devuelve todas las citas en JSON — a diferencia
// de Appointments (que renderiza citas.html), esta es la que consumen
// páginas que solo necesitan los datos, como "Examen de la vista"
// (para mostrar la próxima cita y ofrecer "Realizar examen").
// GET /api/citas.
func ListAppointmentsJSON(c *gin.Context) {
	appointments, err := models.GetAllAppointments()
	if err != nil {
		log.Printf("admin.ListAppointmentsJSON: error querying appointments: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar las citas."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"citas": appointments})
}

// UpdateAppointmentStatus lets the admin mark a booking as confirmed (or
// any other status — incluyendo "asistio"/"no_asistio" desde el panel
// de recepción). Called via PATCH /admin/citas/:id/estado.
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

	// Avisos por WhatsApp para los cambios de estado que le interesan al
	// cliente: "no_asistio" (invita a reagendar) y "cancelada" (cubre
	// cuando recepción/admin cancela manualmente desde su panel — el
	// cliente cancelando desde "Mis citas" pasa por otra ruta, ver
	// models.CancelAppointmentByUser). Se busca la cita completa después
	// de actualizarla porque el body del PATCH solo trae el status
	// nuevo, no celular/nombre/fecha/hora.
	if input.Status == "no_asistio" || input.Status == "cancelada" {
		if appt, err := models.GetAppointmentByID(id); err == nil {
			fecha := formatFechaEs(appt.Date)
			hora := formatHour12(appt.Time)
			if input.Status == "no_asistio" {
				whatsapp.NotifyNoShow(appt.Celular, appt.Nombre, fecha, hora)
			} else {
				whatsapp.NotifyCancelled(appt.Celular, appt.Nombre, fecha, hora)
			}
		} else {
			log.Println("admin.UpdateAppointmentStatus: no se pudo obtener la cita para notificar por WhatsApp:", err)
		}
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

// ---------------------------------------------------------------------
// Crear cita manualmente desde recepción/admin
// ---------------------------------------------------------------------

// A diferencia del flujo público (celularRe en handlers/appointments.go,
// que solo acepta +52 porque el SMS de verificación se manda por esa vía),
// aquí sí se admite +1 (EE. UU./Canadá) además de +52 — el widget de
// "Crear cita" en recepción deja elegir la lada, y como no pasa por
// verificación SMS, no hay ninguna dependencia de proveedor que lo
// restrinja a México.
var staffCelularRe = regexp.MustCompile(`^\+(52|1)\d{10}$`)

type createAppointmentByStaffInput struct {
	Date            string `json:"date" binding:"required"` // "2026-08-20"
	Time            string `json:"time" binding:"required"` // "10:00"
	Nombre          string `json:"nombre" binding:"required"`
	Apellido        string `json:"apellido" binding:"required"`
	Celular         string `json:"celular" binding:"required"` // "+52XXXXXXXXXX"
	Correo          string `json:"correo"`
	FechaNacimiento string `json:"fecha_nacimiento"` // "YYYY-MM-DD", opcional
	Status          string `json:"status"`           // opcional, default "verificada"
}

// CreateAppointmentByStaff crea una cita desde el botón "+ Crear cita"
// del panel de recepción/admin — a diferencia de CreateAppointment
// (handlers/appointments.go, flujo público de agendar.js), NO pide
// verificar el celular con código SMS: quien la crea ya es personal
// autenticado del panel (esta ruta vive en el grupo citasStaff de
// main.go, junto con PATCH .../estado y DELETE, así que aplica tanto
// para admin como para recepción). Called via POST /admin/citas.
func CreateAppointmentByStaff(c *gin.Context) {
	var input createAppointmentByStaffInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Completa día, hora, nombre, apellido y celular."})
		return
	}

	if !staffCelularRe.MatchString(input.Celular) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Número de celular inválido. Debe incluir +52 y 10 dígitos."})
		return
	}

	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}

	// Mismo anti-doble-booking que el flujo público, para que recepción
	// no pueda crear dos citas encimadas en el mismo horario por error.
	booked, err := models.IsSlotBooked(date, input.Time)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar el horario."})
		return
	}
	if booked {
		c.JSON(http.StatusConflict, gin.H{"error": "Esa hora ya está ocupada. Elige otra."})
		return
	}

	if _, err := models.CreateAppointmentByStaff(date, input.Time, input.Nombre, input.Apellido, input.Celular, input.Correo, input.FechaNacimiento, input.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear la cita."})
		return
	}

	whatsapp.NotifyBooked(input.Celular, input.Nombre, formatFechaEs(date), formatHour12(input.Time))

	c.JSON(http.StatusCreated, gin.H{"message": "Cita creada."})
}
