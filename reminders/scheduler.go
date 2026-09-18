// Package reminders corre en segundo plano y manda los recordatorios
// automáticos de citas por WhatsApp (24h antes y 2h antes), usando
// plantillas ya aprobadas por Meta — ver whatsapp/client.go.
//
// Requiere, además de las variables de entorno de whatsapp/client.go:
//
//	WHATSAPP_TEMPLATE_REMINDER_24H — nombre EXACTO de la plantilla aprobada para el recordatorio de 24h
//	WHATSAPP_TEMPLATE_REMINDER_2H  — nombre EXACTO de la plantilla aprobada para el recordatorio de 2h
//	WHATSAPP_TEMPLATE_LANG         — código de idioma con el que se aprobaron (ej. "es_MX"); default "es_MX"
//
// Si dejas alguna de las dos variables de plantilla vacía, ese
// recordatorio específico simplemente se salta (útil mientras solo
// tienes UNA de las dos plantillas aprobada).
//
// ⚠️ Los nombres internos de abajo (GetAppointmentsForReminder1h,
// MarkReminder1hSent, etc. en models/) se dejaron tal cual con "1h" —
// solo se cambió la ventana real a 2 horas — para no tener que tocar
// el esquema de la base de datos. Si en algún momento quieres
// renombrarlos por prolijidad, es un find-and-replace sin lógica nueva.
package reminders

import (
	"fmt"
	"log"
	"os"
	"time"

	"avante-optics/models"
	"avante-optics/whatsapp"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida
// con el nombre del módulo en tu go.mod.

// checkInterval: cada cuánto se revisan citas que ya entraron en alguna
// de las dos ventanas. 15 min es frecuente para no dejar pasar ninguna
// cita, sin bombardear la base de datos.
const checkInterval = 15 * time.Minute

// windowMargin: qué tan ancha es cada ventana de búsqueda alrededor del
// punto exacto (ej. "24h antes"). Tiene que ser >= checkInterval para
// que dos pasadas consecutivas del job no dejen un hueco sin cubrir
// entre ellas.
const windowMargin = 20 * time.Minute

var monthsEs = [...]string{
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
}

func templateLang() string {
	if v := os.Getenv("WHATSAPP_TEMPLATE_LANG"); v != "" {
		return v
	}
	return "es_MX"
}

// Start arranca el job en segundo plano — llámalo UNA SOLA VEZ desde
// main.go, después de db.Connect(), con:
//
//	go reminders.Start()
func Start() {
	ticker := time.NewTicker(checkInterval)
	go func() {
		runOnce() // corre una vez de inmediato al arrancar, no hasta el primer tick
		for range ticker.C {
			runOnce()
		}
	}()
}

func runOnce() {
	sendWindow(24*time.Hour, os.Getenv("WHATSAPP_TEMPLATE_REMINDER_24H"), models.GetAppointmentsForReminder24h, models.MarkReminder24hSent)
	sendWindow(2*time.Hour, os.Getenv("WHATSAPP_TEMPLATE_REMINDER_2H"), models.GetAppointmentsForReminder1h, models.MarkReminder1hSent)
}

func sendWindow(
	aheadBy time.Duration,
	templateName string,
	fetch func(from, to time.Time) ([]models.Appointment, error),
	markSent func(id int64) error,
) {
	if templateName == "" {
		return // recordatorio de esta ventana desactivado (falta la plantilla en el .env)
	}

	target := time.Now().Add(aheadBy)
	from := target.Add(-windowMargin / 2)
	to := target.Add(windowMargin / 2)

	appts, err := fetch(from, to)
	if err != nil {
		log.Println("[reminders] error al consultar citas:", err)
		return
	}

	for _, a := range appts {
		fecha := formatFechaEs(a.Date)
		hora := formatHour12(a.Time)

		if err := whatsapp.SendTemplateMessage(a.Celular, templateName, templateLang(), []string{a.Nombre, fecha, hora}); err != nil {
			log.Println("[reminders] no se pudo mandar recordatorio a", a.Celular, "(cita", a.ID, "):", err)
			continue // no se marca como enviado: se reintenta en la siguiente pasada
		}
		if err := markSent(a.ID); err != nil {
			log.Println("[reminders] mensaje mandado pero no se pudo marcar como enviado (cita", a.ID, "):", err)
		}
	}
}

// formatFechaEs da "8 de septiembre" — Go no trae nombres de mes en
// español de fábrica, así que se mapean a mano (mismo criterio que ya
// usas en el JS del sitio, ver MONTHS en agendar.js/mis-citas.js).
func formatFechaEs(d time.Time) string {
	return fmt.Sprintf("%d de %s", d.Day(), monthsEs[d.Month()-1])
}

// formatHour12 convierte "14:30" -> "2:30 PM".
func formatHour12(hhmm string) string {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return hhmm
	}
	return t.Format("3:04 PM")
}
