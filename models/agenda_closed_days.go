package models

import (
	"database/sql"
	"strings"
	"time"
	"unicode/utf8"

	"avante-optics/db"
)

// AgendaClosedDay es una fecha suelta en que la óptica no abre (día
// inhábil, inventario, un evento…). Esos días no se dan citas aunque
// caigan en un día de la semana que sí se abre.
type AgendaClosedDay struct {
	Date      string `json:"date"`   // "2026-11-20"
	Reason    string `json:"reason"` // "Inventario", "Día inhábil"… (puede ir vacío)
	CreatedBy string `json:"created_by,omitempty"`
}

// MaxClosedDayReason: largo máximo del motivo (en letras).
const MaxClosedDayReason = 120

// ListAgendaClosedDays regresa los días cerrados desde la fecha "from"
// (incluida) en adelante, ordenados. Con from vacío regresa todos.
func ListAgendaClosedDays(from string) ([]AgendaClosedDay, error) {
	q := "SELECT DATE_FORMAT(fecha, '%Y-%m-%d'), motivo, created_by FROM agenda_closed_days"
	args := []interface{}{}
	if from != "" {
		q += " WHERE fecha >= ?"
		args = append(args, from)
	}
	q += " ORDER BY fecha"
	rows, err := db.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AgendaClosedDay{}
	for rows.Next() {
		var d AgendaClosedDay
		if err := rows.Scan(&d.Date, &d.Reason, &d.CreatedBy); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// SetAgendaClosedDay marca una fecha como cerrada (o le cambia el motivo
// si ya estaba).
func SetAgendaClosedDay(date time.Time, reason, by string) error {
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) > MaxClosedDayReason {
		reason = string([]rune(reason)[:MaxClosedDayReason])
	}
	_, err := db.DB.Exec(
		`INSERT INTO agenda_closed_days (fecha, motivo, created_by) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE motivo = VALUES(motivo), created_by = VALUES(created_by)`,
		date.Format("2006-01-02"), reason, by,
	)
	return err
}

// DeleteAgendaClosedDay vuelve a abrir una fecha. Regresa false si no
// estaba cerrada.
func DeleteAgendaClosedDay(date time.Time) (bool, error) {
	res, err := db.DB.Exec("DELETE FROM agenda_closed_days WHERE fecha = ?", date.Format("2006-01-02"))
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// GetAgendaClosedDay dice si esa fecha está cerrada y con qué motivo. Si
// no se pudiera leer la tabla, no bloquea (closed = false).
func GetAgendaClosedDay(date time.Time) (reason string, closed bool) {
	err := db.DB.QueryRow("SELECT motivo FROM agenda_closed_days WHERE fecha = ?", date.Format("2006-01-02")).Scan(&reason)
	if err != nil {
		return "", false
	}
	return reason, true
}

// CountActiveAppointmentsOn cuenta las citas de ese día que siguen en
// pie (ni canceladas ni marcadas como no asistió), para avisarle al
// admin al cerrar un día que ya tiene citas.
func CountActiveAppointmentsOn(date time.Time) (int, error) {
	var n int
	err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM appointments WHERE appt_date = ? AND status NOT IN ('cancelada', 'no_asistio')",
		date.Format("2006-01-02"),
	).Scan(&n)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return n, err
}

// AgendaDayClosedMessage regresa "" si ese día sí se dan citas, o el
// mensaje para el cliente/recepción si no: el de un día cerrado (con su
// motivo) o el de un día de la semana que no se abre.
func AgendaDayClosedMessage(date time.Time) string {
	if reason, closed := GetAgendaClosedDay(date); closed {
		if reason != "" {
			return "Ese día la óptica estará cerrada (" + reason + "). Elige otro día."
		}
		return "Ese día la óptica estará cerrada. Elige otro día."
	}
	if !IsAgendaDayOpen(date) {
		return "Ese día no se dan citas. Elige otro día."
	}
	return ""
}
