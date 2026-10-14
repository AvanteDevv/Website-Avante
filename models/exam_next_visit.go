package models

import (
	"database/sql"
	"strings"
	"time"

	"avante-optics/db"
)

// Próxima cita de un examen: la revisión que recepción programó al
// marcar la cita como "Asistió · compró" (cada 3, 6 o 12 meses).
//
// La cita se busca así:
//  1. la cita de la que salió el examen (appointment_id), o
//  2. si el examen se hizo con "Nuevo examen" (sin cita ligada), una cita
//     del mismo día con el mismo celular o el mismo nombre.
//
// La fecha es: día de esa cita + los meses de revisión.
type ExamNextVisit struct {
	Fecha         string `json:"fecha"` // YYYY-MM-DD
	Meses         int    `json:"meses"`
	AppointmentID int64  `json:"appointmentId"`
}

func phoneTail(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	if len(d) > 10 {
		d = d[len(d)-10:]
	}
	return d
}

type apptFollow struct {
	id     int64
	date   time.Time
	nombre string
	phone  string
	meses  int
}

// AttachNextVisits llena ProximaCita en los exámenes que tengan una.
func AttachNextVisits(exams []EyeExam) {
	if len(exams) == 0 {
		return
	}
	// Solo las citas con seguimiento "compró" y meses (pocas filas).
	rows, err := db.DB.Query(`
		SELECT a.id, a.appt_date, CONCAT(a.nombre, ' ', a.apellido), COALESCE(a.celular, ''), f.revision_meses
		FROM appointment_followups f
		JOIN appointments a ON a.id = f.appointment_id
		WHERE f.compro = 1 AND f.revision_meses IS NOT NULL`)
	if err != nil {
		return
	}
	defer rows.Close()
	byID := map[int64]apptFollow{}
	byDay := map[string][]apptFollow{}
	for rows.Next() {
		var a apptFollow
		var meses sql.NullInt64
		if rows.Scan(&a.id, &a.date, &a.nombre, &a.phone, &meses) != nil || !meses.Valid || meses.Int64 <= 0 {
			continue
		}
		a.meses = int(meses.Int64)
		a.nombre = NormalizePatientName(a.nombre)
		a.phone = phoneTail(a.phone)
		byID[a.id] = a
		day := a.date.Format("2006-01-02")
		byDay[day] = append(byDay[day], a)
	}
	if len(byID) == 0 {
		return
	}
	for i := range exams {
		e := &exams[i]
		a, ok := byID[e.AppointmentID]
		if !ok { // sin cita ligada, o la ligada no tiene revisión: misma persona ese día
			day := e.CreatedAt.In(posLoc).Format("2006-01-02")
			name, phone := NormalizePatientName(e.PatientName), phoneTail(e.PatientPhone)
			for _, c := range byDay[day] {
				if (phone != "" && len(phone) >= 7 && c.phone == phone) || (name != "" && c.nombre == name) {
					a, ok = c, true
					break
				}
			}
		}
		if !ok {
			continue
		}
		d := time.Date(a.date.Year(), a.date.Month(), a.date.Day(), 12, 0, 0, 0, time.UTC).AddDate(0, a.meses, 0)
		e.ProximaCita = &ExamNextVisit{Fecha: d.Format("2006-01-02"), Meses: a.meses, AppointmentID: a.id}
	}
}
