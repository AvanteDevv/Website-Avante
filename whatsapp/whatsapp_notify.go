// Envíos de WhatsApp disparados por EVENTOS de citas (agendada,
// cancelada, no-show) — a diferencia de reminders/scheduler.go, que
// corre en segundo plano cada 15 min revisando ventanas de tiempo,
// estas funciones se llaman directo desde los handlers justo cuando
// pasa el evento (ver handlers/appointments.go, admin/appointments_admin.go).
//
// Requiere las mismas variables de entorno que client.go, más:
//
//	WHATSAPP_TEMPLATE_CITA_AGENDADA   — plantilla aprobada para avisar que la cita quedó agendada
//	WHATSAPP_TEMPLATE_CITA_CANCELADA  — plantilla aprobada para avisar que la cita se canceló
//	WHATSAPP_TEMPLATE_CITA_NO_ASISTIO — plantilla aprobada para avisar que no asistió + invitar a reagendar
//	WHATSAPP_TEMPLATE_CITA_REAGENDADA — plantilla aprobada para avisar el nuevo día/hora cuando el cliente reagenda su cita
//	WHATSAPP_TEMPLATE_LANG            — mismo código de idioma que ya usas para los recordatorios (default "es_MX")
//
// Si dejas alguna plantilla vacía en el entorno, ese aviso en
// particular simplemente se salta (mismo criterio que ya usas en
// scheduler.go para las plantillas de recordatorio).
package whatsapp

import (
	"log"
	"os"
)

func notifyTemplateLang() string {
	if v := os.Getenv("WHATSAPP_TEMPLATE_LANG"); v != "" {
		return v
	}
	return "es_MX"
}

// NotifyBooked avisa al cliente que su cita quedó agendada. Llámala
// justo después de guardar la cita en la base — tanto desde el flujo
// público (handlers.CreateAppointment) como desde "Crear cita" de
// recepción/admin (admin.CreateAppointmentByStaff).
func NotifyBooked(celular, nombre, fecha, hora string) {
	sendAsync(os.Getenv("WHATSAPP_TEMPLATE_CITA_AGENDADA"), celular, []string{nombre, fecha, hora})
}

// NotifyCancelled avisa que la cita se canceló, sin importar si la
// canceló el cliente desde "Mis citas" o recepción/admin desde su
// panel (PATCH .../estado con status "cancelada").
func NotifyCancelled(celular, nombre, fecha, hora string) {
	sendAsync(os.Getenv("WHATSAPP_TEMPLATE_CITA_CANCELADA"), celular, []string{nombre, fecha, hora})
}

// NotifyNoShow avisa que el cliente no se presentó y lo invita a
// reagendar. Se dispara cuando recepción/admin marca la cita como
// "no_asistio" (PATCH .../estado).
func NotifyNoShow(celular, nombre, fecha, hora string) {
	sendAsync(os.Getenv("WHATSAPP_TEMPLATE_CITA_NO_ASISTIO"), celular, []string{nombre, fecha, hora})
}

// NotifyRescheduled avisa el nuevo día/hora cuando el cliente mueve su
// propia cita desde "Mis citas" (POST /api/mis-citas/:id/reagendar).
func NotifyRescheduled(celular, nombre, fecha, hora string) {
	sendAsync(os.Getenv("WHATSAPP_TEMPLATE_CITA_REAGENDADA"), celular, []string{nombre, fecha, hora})
}

// sendAsync manda el mensaje en background (goroutine) para no
// bloquear ni tumbar la respuesta HTTP del handler que la llamó por un
// error o una demora de la Cloud API — si falla, solo queda en el log
// y no se reintenta (a diferencia de los recordatorios del scheduler,
// que sí reintentan en la siguiente pasada porque leen de una cola).
func sendAsync(templateName, celular string, params []string) {
	if templateName == "" {
		return // plantilla no configurada todavía: se salta el envío
	}
	go func() {
		if err := SendTemplateMessage(celular, templateName, notifyTemplateLang(), params); err != nil {
			log.Println("[whatsapp] no se pudo enviar notificación de evento:", err)
		}
	}()
}