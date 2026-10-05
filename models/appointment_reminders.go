package models

import (
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod.
//
// Requiere dos columnas nuevas en la tabla appointments — corre esto
// una vez contra tu base:
//
//	ALTER TABLE appointments ADD COLUMN reminder_24h_sent_at TIMESTAMP NULL;
//	ALTER TABLE appointments ADD COLUMN reminder_1h_sent_at TIMESTAMP NULL;
//
// NULL significa "todavía no se le mandó ese recordatorio" — es lo que
// usa el job de reminders/ para no mandar el mismo recordatorio dos
// veces.

// getAppointmentsInWindow trae las citas verificadas cuya fecha+hora cae
// dentro de [from, to] y que todavía no recibieron el recordatorio de
// esa ventana. reminderColumn SIEMPRE viene fijo desde las dos
// funciones públicas de abajo (nunca desde afuera), así que no hay
// riesgo de inyección SQL aunque se arme con concatenación.
//
// No se le recuerda a quien "vino sin cita" (etiqueta sin_cita): ya está
// en la óptica. Las citas que ya pasaron nunca caen en la ventana (el
// scheduler solo busca citas que vienen), así que tampoco reciben nada.
//
// Antes buscaba status = 'confirmada', pero las citas se guardan como
// 'verificada' — por eso nunca salía ningún recordatorio. Además faltaba
// fecha_nacimiento en el SELECT (scanAppointmentRow lee 13 columnas).
func getAppointmentsInWindow(from, to time.Time, reminderColumn string) ([]Appointment, error) {
	query := `
		SELECT a.id, a.appt_date, a.appt_time, a.nombre, a.apellido, a.celular, a.correo, a.fecha_nacimiento,
		       a.cuestionario, a.status, a.cancel_reason, a.user_id, a.created_at
		FROM appointments a
		WHERE a.status = 'verificada'
		  AND a.` + reminderColumn + ` IS NULL
		  AND TIMESTAMP(a.appt_date, a.appt_time) BETWEEN ? AND ?
		  AND NOT EXISTS (
		      SELECT 1 FROM appointment_tags t
		      WHERE t.appointment_id = a.id AND t.tag = 'sin_cita'
		  )
	`
	rows, err := db.DB.Query(query, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Appointment
	for rows.Next() {
		var a Appointment
		if err := scanAppointmentRow(rows, &a); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
}

// GetAppointmentsForReminder24h trae las citas que caen en la ventana de
// 24 horas antes (el [from, to] ya lo calcula reminders/scheduler.go) y
// que todavía no recibieron ese recordatorio.
func GetAppointmentsForReminder24h(from, to time.Time) ([]Appointment, error) {
	return getAppointmentsInWindow(from, to, "reminder_24h_sent_at")
}

// GetAppointmentsForReminder1h — igual, para la ventana de 1 hora antes.
func GetAppointmentsForReminder1h(from, to time.Time) ([]Appointment, error) {
	return getAppointmentsInWindow(from, to, "reminder_1h_sent_at")
}

// MarkReminder24hSent marca que ya se mandó el recordatorio de 24h, para
// que la siguiente pasada del job no lo vuelva a mandar.
func MarkReminder24hSent(id int64) error {
	_, err := db.DB.Exec("UPDATE appointments SET reminder_24h_sent_at = NOW() WHERE id = ?", id)
	return err
}

// MarkReminder1hSent — igual, para el recordatorio de 1h.
func MarkReminder1hSent(id int64) error {
	_, err := db.DB.Exec("UPDATE appointments SET reminder_1h_sent_at = NOW() WHERE id = ?", id)
	return err
}
