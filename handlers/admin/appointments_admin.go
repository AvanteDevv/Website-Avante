package admin

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
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
var staffEmailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
var staffTimeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
var staffBirthRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type createAppointmentByStaffInput struct {
	Date            string `json:"date" binding:"required"` // "2026-08-20"
	Time            string `json:"time" binding:"required"` // "10:00"
	Nombre          string `json:"nombre" binding:"required"`
	Apellido        string `json:"apellido" binding:"required"`
	Celular         string `json:"celular" binding:"required"` // "+52XXXXXXXXXX"
	Correo          string `json:"correo"`
	FechaNacimiento string `json:"fecha_nacimiento"` // "YYYY-MM-DD", opcional
	Status          string `json:"status"`           // opcional, default "verificada"
	// Cuestionario opcional del modal "Crear cita" (null si no se
	// contestó). Se guarda tal cual como JSON, igual que el público.
	Cuestionario json.RawMessage `json:"cuestionario"`
	// Etiqueta "¿Cómo llegó?" elegida al crear (sin_cita, chequeo,
	// telefono, whatsapp). Solo se usa para decidir si se avisa por
	// WhatsApp: a quien "vino sin cita" no se le manda "tu cita quedó
	// agendada" porque ya está en la óptica.
	Tag string `json:"tag"`
}

// apptLoc: la hora de la óptica (Hermosillo, sin horario de verano). La
// base guarda appt_date/appt_time en hora local. (No se llama
// hermosilloLoc porque ads.go ya tiene una variable con ese nombre.)
var apptLoc = func() *time.Location {
	if loc, err := time.LoadLocation("America/Hermosillo"); err == nil {
		return loc
	}
	return time.FixedZone("MST", -7*60*60)
}()

// apptAlreadyStarted indica si el día + hora de la cita ya pasó (o es
// ahorita) en hora de Hermosillo.
func apptAlreadyStarted(date time.Time, hhmm string) bool {
	if len(hhmm) > 5 {
		hhmm = hhmm[:5]
	}
	t, err := time.ParseInLocation("2006-01-02 15:04", date.Format("2006-01-02")+" "+hhmm, apptLoc)
	if err != nil {
		return false
	}
	return !t.After(time.Now().In(apptLoc))
}

// shouldNotifyBooked decide si se le manda al cliente "tu cita quedó
// agendada" al crearla desde el panel. NO se manda cuando:
//   - vino sin cita (ya está en la óptica, no tiene sentido avisarle),
//   - la cita se registró con estado de ya atendida o cancelada,
//   - el día y la hora ya pasaron (se está registrando algo de antes).
func shouldNotifyBooked(tag, status string, date time.Time, hhmm string) bool {
	if tag == "sin_cita" {
		return false
	}
	if status != "" && status != "verificada" && status != "pendiente" {
		return false
	}
	return !apptAlreadyStarted(date, hhmm)
}

// cuestionarioFromRaw valida el cuestionario que manda el panel y lo
// regresa como texto JSON listo para guardar. "" = sin cuestionario
// (null, vacío o {} sin respuestas) → la columna queda NULL.
func cuestionarioFromRaw(raw json.RawMessage) (string, error) {
	txt := strings.TrimSpace(string(raw))
	if txt == "" || txt == "null" || txt == "{}" {
		return "", nil
	}
	if len(txt) > 8<<10 {
		return "", errors.New("El cuestionario es demasiado largo.")
	}
	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(txt), &obj); err != nil {
		return "", errors.New("El cuestionario no es válido.")
	}
	return txt, nil
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

	cuestionario, err := cuestionarioFromRaw(input.Cuestionario)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !models.IsAgendaDayOpen(date) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ese día no se dan citas. Elige otro día."})
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

	appt, err := models.CreateAppointmentByStaff(date, input.Time, input.Nombre, input.Apellido, input.Celular, input.Correo, input.FechaNacimiento, cuestionario, input.Status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear la cita."})
		return
	}

	if shouldNotifyBooked(strings.TrimSpace(input.Tag), input.Status, date, input.Time) {
		whatsapp.NotifyBooked(input.Celular, input.Nombre, formatFechaEs(date), formatHour12(input.Time))
	} else {
		log.Printf("admin.CreateAppointmentByStaff: cita #%d sin aviso de WhatsApp (etiqueta %q, estado %q, %s %s)", appt.ID, input.Tag, input.Status, input.Date, input.Time)
	}

	// El id lo usa el panel para guardar la etiqueta ("¿Cómo llegó?")
	// de la cita recién creada sin tener que buscarla después.
	c.JSON(http.StatusCreated, gin.H{"message": "Cita creada.", "id": appt.ID})
}

// ---------------------------------------------------------------------
// Editar / reagendar una cita desde recepción/admin
// ---------------------------------------------------------------------

type updateAppointmentByStaffInput struct {
	Date            string          `json:"date" binding:"required"` // "2026-08-20"
	Time            string          `json:"time" binding:"required"` // "10:00"
	Nombre          string          `json:"nombre" binding:"required"`
	Apellido        string          `json:"apellido" binding:"required"`
	Celular         string          `json:"celular" binding:"required"` // "+52XXXXXXXXXX"
	Correo          string          `json:"correo"`
	FechaNacimiento string          `json:"fecha_nacimiento"` // "YYYY-MM-DD" o ""
	Cuestionario    json.RawMessage `json:"cuestionario"`     // null = sin respuestas
}

// UpdateAppointmentByStaff edita una cita existente — PUT
// /admin/citas/:id (grupo citasStaff: admin, optometrista y recepción).
// Sirve para dos cosas desde el panel de recepción:
//
//   - "Editar": corregir nombre, celular, correo, fecha de nacimiento o
//     el cuestionario (y, si quieren, también el día/hora).
//   - "Reagendar": mover la cita a otro día/hora.
//
// Si el día o la hora cambian se trata como reagendar: se revisa que el
// horario nuevo esté libre (sin contar la propia cita), si estaba
// cancelada o "no asistió" vuelve a "verificada", se reinician los
// recordatorios y se avisa al cliente por WhatsApp con la fecha nueva
// (mismo aviso que cuando el cliente reagenda desde "Mis citas").
func UpdateAppointmentByStaff(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido."})
		return
	}

	var input updateAppointmentByStaffInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Completa día, hora, nombre, apellido y celular."})
		return
	}
	input.Nombre = strings.TrimSpace(input.Nombre)
	input.Apellido = strings.TrimSpace(input.Apellido)
	input.Correo = strings.TrimSpace(input.Correo)
	input.FechaNacimiento = strings.TrimSpace(input.FechaNacimiento)
	if input.Nombre == "" || input.Apellido == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Completa nombre y apellido."})
		return
	}
	if !staffCelularRe.MatchString(input.Celular) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Número de celular inválido. Debe incluir la lada y 10 dígitos."})
		return
	}
	if input.Correo != "" && !staffEmailRe.MatchString(input.Correo) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El correo no es válido."})
		return
	}
	if input.FechaNacimiento != "" && !staffBirthRe.MatchString(input.FechaNacimiento) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha de nacimiento inválida."})
		return
	}
	if !staffTimeRe.MatchString(input.Time) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hora inválida."})
		return
	}
	date, err := time.Parse("2006-01-02", input.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fecha inválida."})
		return
	}
	cuestionario, err := cuestionarioFromRaw(input.Cuestionario)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	current, err := models.GetAppointmentByID(id)
	if errors.Is(err, models.ErrAppointmentNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa cita ya no existe. Recarga la página."})
		return
	}
	if err != nil {
		log.Println("admin.UpdateAppointmentByStaff: error al leer la cita:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo leer la cita."})
		return
	}

	// appt_time puede venir de MySQL como "10:00:00": se comparan HH:MM.
	oldTime := current.Time
	if len(oldTime) > 5 {
		oldTime = oldTime[:5]
	}
	moved := current.Date.Format("2006-01-02") != input.Date || oldTime != input.Time

	if moved && !models.IsAgendaDayOpen(date) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ese día no se dan citas. Elige otro día."})
		return
	}
	if moved {
		booked, err := models.IsSlotBookedExcluding(date, input.Time, id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar el horario."})
			return
		}
		if booked {
			c.JSON(http.StatusConflict, gin.H{"error": "Esa hora ya está ocupada. Elige otra."})
			return
		}
	}

	if err := models.UpdateAppointmentByStaff(id, date, input.Time, input.Nombre, input.Apellido, input.Celular, input.Correo, input.FechaNacimiento, cuestionario, moved); err != nil {
		log.Println("admin.UpdateAppointmentByStaff: error al guardar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar la cita."})
		return
	}

	if moved {
		if err := models.ResetAppointmentReminders(id); err != nil {
			log.Println("admin.UpdateAppointmentByStaff: no se reiniciaron los recordatorios:", err)
		}
		// Si la mueven a un día/hora que ya pasó (corrigiendo un registro)
		// no se le avisa al cliente.
		if !apptAlreadyStarted(date, input.Time) {
			whatsapp.NotifyRescheduled(input.Celular, input.Nombre, formatFechaEs(date), formatHour12(input.Time))
		}
	}

	msg := "Cita actualizada."
	if moved {
		msg = "Cita reagendada."
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "id": id, "reagendada": moved})
}
