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

// getAppointmentsInWindow trae las citas confirmadas cuya fecha+hora cae
// dentro de [from, to] y que todavía no recibieron el recordatorio de
// esa ventana. reminderColumn SIEMPRE viene fijo desde las dos
// funciones públicas de abajo (nunca desde afuera), así que no hay
// riesgo de inyección SQL aunque se arme con concatenación.
func getAppointmentsInWindow(from, to time.Time, reminderColumn string) ([]Appointment, error) {
	query := `
		SELECT id, appt_date, appt_time, nombre, apellido, celular, correo, cuestionario, status, cancel_reason, user_id, created_at
		FROM appointments
		WHERE status = 'confirmada'
		  AND ` + reminderColumn + ` IS NULL
		  AND TIMESTAMP(appt_date, appt_time) BETWEEN ? AND ?
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
