package models

import (
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requires a MySQL table. Run this once against your database:
//
//	CREATE TABLE appointments (
//	  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  appt_date  DATE NOT NULL,
//	  appt_time  VARCHAR(10) NOT NULL,
//	  status     VARCHAR(20) NOT NULL DEFAULT 'pendiente',
//	  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);

// Appointment represents a booking made from the public "Agenda tu cita"
// section (agendar.html / agendar.js).
type Appointment struct {
	ID        int64
	Date      time.Time // day only, stored as SQL DATE
	Time      string    // "HH:MM" — one of the fixed slots offered in agendar.js
	Status    string    // "pendiente" | "confirmada" | "cancelada"
	CreatedAt time.Time
}

// ErrAppointmentNotFound is returned when no appointment matches the
// given id.
var ErrAppointmentNotFound = errors.New("cita no encontrada")

// CreateAppointment inserts a new booking with status "pendiente". No
// login is required to book — anyone visiting the public site can call
// this through POST /api/agendar.
func CreateAppointment(date time.Time, apptTime string) (*Appointment, error) {
	result, err := db.DB.Exec(
		"INSERT INTO appointments (appt_date, appt_time, status) VALUES (?, ?, 'pendiente')",
		date.Format("2006-01-02"), apptTime,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &Appointment{ID: id, Date: date, Time: apptTime, Status: "pendiente"}, nil
}

// GetAllAppointments returns every booking, most recently created
// first — used by the admin Citas panel.
func GetAllAppointments() ([]Appointment, error) {
	rows, err := db.DB.Query(
		"SELECT id, appt_date, appt_time, status, created_at FROM appointments ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Appointment
	for rows.Next() {
		var a Appointment
		if err := rows.Scan(&a.ID, &a.Date, &a.Time, &a.Status, &a.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, nil
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
