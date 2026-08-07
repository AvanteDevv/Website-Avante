package models

import (
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requiere que la tabla appointments tenga las columnas nombre, apellido
// y celular — ver migracion_appointments.sql.

// Appointment represents a booking made from the public "Agenda tu cita"
// section (agendar.html / agendar.js).
type Appointment struct {
	ID        int64
	Date      time.Time // day only, stored as SQL DATE
	Time      string    // "HH:MM" — one of the fixed slots offered in agendar.js
	Nombre    string
	Apellido  string
	Celular   string // formato "+52XXXXXXXXXX", verificado por WhatsApp antes de agendar
	Status    string // "pendiente" | "confirmada" | "cancelada"
	CreatedAt time.Time
}

// ErrAppointmentNotFound is returned when no appointment matches the
// given id.
var ErrAppointmentNotFound = errors.New("cita no encontrada")

// CreateAppointment inserts a new booking with status "pendiente". El
// número de celular debe haber pasado ya por la verificación de código
// (ver ConsumeVerification en otp.go) antes de llegar aquí.
func CreateAppointment(date time.Time, apptTime, nombre, apellido, celular string) (*Appointment, error) {
	result, err := db.DB.Exec(
		"INSERT INTO appointments (appt_date, appt_time, nombre, apellido, celular, status) VALUES (?, ?, ?, ?, ?, 'pendiente')",
		date.Format("2006-01-02"), apptTime, nombre, apellido, celular,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &Appointment{
		ID: id, Date: date, Time: apptTime,
		Nombre: nombre, Apellido: apellido, Celular: celular,
		Status: "pendiente",
	}, nil
}

// GetAllAppointments returns every booking, most recently created
// first — used by the admin Citas panel.
func GetAllAppointments() ([]Appointment, error) {
	rows, err := db.DB.Query(
		"SELECT id, appt_date, appt_time, nombre, apellido, celular, status, created_at FROM appointments ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Appointment
	for rows.Next() {
		var a Appointment
		if err := rows.Scan(&a.ID, &a.Date, &a.Time, &a.Nombre, &a.Apellido, &a.Celular, &a.Status, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
}

// GetBookedTimes regresa todas las horas ("HH:MM") que ya están ocupadas
// para ese día — cualquier cita que no esté cancelada cuenta como
// ocupada. Se usa para pintar de "Ocupado" esas horas en el calendario
// público, igual que Doctoralia.
func GetBookedTimes(date time.Time) ([]string, error) {
	rows, err := db.DB.Query(
		"SELECT appt_time FROM appointments WHERE appt_date = ? AND status != 'cancelada'",
		date.Format("2006-01-02"),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var times []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		times = append(times, t)
	}
	return times, nil
}

// IsSlotBooked checks whether a specific date+time is already taken by a
// non-cancelled appointment. Se usa justo antes de crear la cita, como
// última verificación por si dos personas intentaron agendar la misma
// hora casi al mismo tiempo (entre que vieron el calendario y que
// confirmaron el código).
func IsSlotBooked(date time.Time, apptTime string) (bool, error) {
	var cnt int
	err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM appointments WHERE appt_date = ? AND appt_time = ? AND status != 'cancelada'",
		date.Format("2006-01-02"), apptTime,
	).Scan(&cnt)
	if err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// UpdateAppointmentStatus changes a booking's status (e.g. to
// "confirmada" when the admin approves it).
func UpdateAppointmentStatus(id int64, status string) error {
	result, err := db.DB.Exec("UPDATE appointments SET status = ? WHERE id = ?", status, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrAppointmentNotFound
	}
	return nil
}

// DeleteAppointment removes a booking.
func DeleteAppointment(id int64) error {
	result, err := db.DB.Exec("DELETE FROM appointments WHERE id = ?", id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrAppointmentNotFound
	}
	return nil
}
