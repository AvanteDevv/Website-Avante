package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requiere que la tabla appointments tenga las columnas nombre, apellido
// y celular — ver migracion_appointments.sql. Además, para que las citas
// se puedan ligar a la cuenta del cliente que las agendó estando ya
// logueado, corre esto una vez contra tu base:
//
//	ALTER TABLE appointments ADD COLUMN user_id BIGINT NULL, ADD INDEX idx_appointments_user_id (user_id);
//
// Y para guardar el motivo cuando el cliente cancela su propia cita:
//
//	ALTER TABLE appointments ADD COLUMN cancel_reason VARCHAR(500) NULL;
//
// El formulario público (agendar.js) ahora también pide correo y un
// cuestionario rápido antes del código de verificación — corre esto
// una vez si no las tienes:
//
//	ALTER TABLE appointments ADD COLUMN correo VARCHAR(255) NOT NULL DEFAULT '';
//	ALTER TABLE appointments ADD COLUMN cuestionario JSON NULL;
//
// cuestionario va NULL-able porque las citas agendadas antes de este
// cambio no lo tienen.
//
// Para el panel de recepción (crear cita manual + revisar datos del
// cliente) también se agrega fecha de nacimiento. Se guarda como texto
// "YYYY-MM-DD" (igual que appt_date en el frontend), no como DATE, para
// no complicar el scan con otro sql.NullTime — nadie hace aritmética de
// fechas con este campo, solo se muestra:
//
//	ALTER TABLE appointments ADD COLUMN fecha_nacimiento VARCHAR(10) NULL;

// Appointment represents a booking made from the public "Agenda tu cita"
// section (agendar.html / agendar.js).
type Appointment struct {
	ID       int64     `json:"id"`
	Date     time.Time `json:"date"` // day only, stored as SQL DATE
	Time     string    `json:"time"` // "HH:MM" — one of the fixed slots offered in agendar.js
	Nombre   string    `json:"nombre"`
	Apellido string    `json:"apellido"`
	Celular  string    `json:"celular"` // formato "+52XXXXXXXXXX", verificado por WhatsApp antes de agendar
	Correo   string    `json:"correo,omitempty"`
	// FechaNacimiento va como texto "YYYY-MM-DD" — "" en citas de antes
	// de que existiera este campo, o en las que se agendaron desde el
	// flujo público (que todavía no lo pide).
	FechaNacimiento string `json:"fecha_nacimiento,omitempty"`
	Status          string `json:"status"`                  // "pendiente" | "verificada" | "cancelada" | "asistio" | "no_asistio"
	CancelReason    string `json:"cancel_reason,omitempty"` // motivo que dio el cliente al cancelar — vacío si no se canceló, o si la canceló staff
	// Cuestionario es el JSON crudo del cuestionario rápido (ver
	// appointmentQuestionnaire en el handler CreateAppointment) — ""
	// en citas agendadas antes de que existiera este cuestionario.
	Cuestionario string `json:"cuestionario,omitempty"`
	// UserID: la cuenta de cliente a la que quedó ligada esta cita — 0
	// si la agendó alguien sin sesión iniciada. Expuesto en JSON (a
	// diferencia de antes) porque "Examen de la vista" lo necesita para
	// poder ligar el examen a la cuenta correcta sin tener que
	// volver a buscarla.
	UserID    int64     `json:"userId,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// MarshalJSON serializa Date como "YYYY-MM-DD" (sin hora ni zona) — el
// formato que espera el frontend (agendar.js/mis-citas.js: parseApptDate
// hace cita.date.split('-')). Sin este método, Go serializaría
// time.Time con su formato completo RFC3339 ("2026-09-08T00:00:00Z"),
// lo que rompe ese split(): el "día" que le toca a la fecha
// ("08T00:00:00Z") no es un número válido, y el frontend caía siempre
// al valor por defecto 1 — por eso TODAS las citas se veían como
// "1 de [mes]" sin importar su fecha real.
func (a Appointment) MarshalJSON() ([]byte, error) {
	type alias Appointment // evita loop infinito al volver a marshalear
	return json.Marshal(&struct {
		Date string `json:"date"`
		alias
	}{
		Date:  a.Date.Format("2006-01-02"),
		alias: alias(a),
	})
}

// ErrAppointmentNotFound is returned when no appointment matches the
// given id.
var ErrAppointmentNotFound = errors.New("cita no encontrada")

// rowScanner es lo mínimo que necesita scanAppointmentRow — lo
// implementa *sql.Rows, así que sirve tal cual para rows.Scan(...).
type rowScanner interface {
	Scan(dest ...interface{}) error
}

// scanAppointmentRow escanea una fila con las columnas
// "id, appt_date, appt_time, nombre, apellido, celular, correo,
// cuestionario, status, cancel_reason, user_id, created_at" (en ese
// orden) — la usan tanto GetAllAppointments como
// GetAppointmentsByUser, para no repetir dos veces el manejo de
// cancel_reason, cuestionario y user_id (nullable en la tabla,
// string/int64 planos en el struct).
func scanAppointmentRow(row rowScanner, a *Appointment) error {
	var reason sql.NullString
	var fechaNacimiento sql.NullString
	var cuestionario sql.NullString
	var userID sql.NullInt64
	if err := row.Scan(&a.ID, &a.Date, &a.Time, &a.Nombre, &a.Apellido, &a.Celular, &a.Correo, &fechaNacimiento, &cuestionario, &a.Status, &reason, &userID, &a.CreatedAt); err != nil {
		return err
	}
	if reason.Valid {
		a.CancelReason = reason.String
	}
	if fechaNacimiento.Valid {
		a.FechaNacimiento = fechaNacimiento.String
	}
	if cuestionario.Valid {
		a.Cuestionario = cuestionario.String
	}
	if userID.Valid {
		a.UserID = userID.Int64
	}
	return nil
}

// CreateAppointment inserts a new booking with status "verificada" — el
// número de celular ya pasó por la verificación de código (ver
// ConsumeVerification en otp.go) antes de llegar aquí, así que la cita
// nace verificada, no pendiente.
//
// cuestionarioJSON es el JSON ya serializado del cuestionario rápido
// (el handler CreateAppointment lo arma con json.Marshal) — se guarda
// tal cual en la columna cuestionario.
//
// userID es opcional: si la persona tenía sesión de cliente iniciada al
// momento de agendar, pásalo (currentUserID/optionalUserID en el
// handler); si agendó como invitada, pasa 0 y la cita queda sin dueño
// (no aparecerá en ningún "Mis citas" — no hay forma de reclamarla
// después, ya que solo se identificó por celular, no por cuenta).
func CreateAppointment(date time.Time, apptTime, nombre, apellido, celular, correo, fechaNacimiento, cuestionarioJSON string, userID int64) (*Appointment, error) {
	var userIDArg interface{}
	if userID > 0 {
		userIDArg = userID
	}
	var fechaNacimientoArg interface{}
	if fechaNacimiento != "" {
		fechaNacimientoArg = fechaNacimiento
	}

	result, err := db.DB.Exec(
		"INSERT INTO appointments (appt_date, appt_time, nombre, apellido, celular, correo, fecha_nacimiento, cuestionario, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verificada', ?)",
		date.Format("2006-01-02"), apptTime, nombre, apellido, celular, correo, fechaNacimientoArg, cuestionarioJSON, userIDArg,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	appt := &Appointment{
		ID: id, Date: date, Time: apptTime,
		Nombre: nombre, Apellido: apellido, Celular: celular,
		Correo: correo, FechaNacimiento: fechaNacimiento, Cuestionario: cuestionarioJSON,
		Status: "verificada",
	}
	if userID > 0 {
		appt.UserID = userID
	}
	return appt, nil
}

// CreateAppointmentByStaff inserta una cita creada manualmente desde el
// panel de recepción/admin (botón "Crear cita") — a diferencia de
// CreateAppointment (flujo público de agendar.js/mis-citas.js), NO pasa
// por verificación de código SMS: quien la crea ya es personal
// autenticado del panel, así que no hace falta confirmar el celular del
// cliente. Tampoco lleva cuestionario (eso solo lo llena el cliente en
// el flujo público) ni user_id (no hay sesión de cliente involucrada;
// si el cliente ya tiene cuenta y quieres ligarla, tendría que
// reagendar/agendar él mismo desde su panel).
//
// status: si viene vacío, nace "verificada" (igual que las públicas) —
// normalmente se crea así porque el cliente ya llamó o se presentó
// directamente a agendar.
func CreateAppointmentByStaff(date time.Time, apptTime, nombre, apellido, celular, correo, fechaNacimiento, status string) (*Appointment, error) {
	if status == "" {
		status = "verificada"
	}
	var fechaNacimientoArg interface{}
	if fechaNacimiento != "" {
		fechaNacimientoArg = fechaNacimiento
	}

	result, err := db.DB.Exec(
		"INSERT INTO appointments (appt_date, appt_time, nombre, apellido, celular, correo, fecha_nacimiento, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		date.Format("2006-01-02"), apptTime, nombre, apellido, celular, correo, fechaNacimientoArg, status,
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
		Correo: correo, FechaNacimiento: fechaNacimiento,
		Status: status,
	}, nil
}

// GetAppointmentsByUser devuelve las citas ligadas a la cuenta de un
// cliente (las que agendó estando ya logueado), más próximas/recientes
// primero — usado por el panel "Mis citas".
func GetAppointmentsByUser(userID int64) ([]Appointment, error) {
	rows, err := db.DB.Query(
		"SELECT id, appt_date, appt_time, nombre, apellido, celular, correo, fecha_nacimiento, cuestionario, status, cancel_reason, user_id, created_at FROM appointments WHERE user_id = ? ORDER BY appt_date DESC, appt_time DESC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Appointment{}
	for rows.Next() {
		var a Appointment
		if err := scanAppointmentRow(rows, &a); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	return list, rows.Err()
}

// CancelAppointmentByUser cancela una cita, pero SOLO si pertenece al
// cliente que la está cancelando (WHERE id=? AND user_id=?) — así nadie
// puede cancelar la cita de otra persona adivinando el id. El motivo es
// obligatorio y queda visible para recepción/admin en su propio panel.
func CancelAppointmentByUser(id, userID int64, reason string) error {
	result, err := db.DB.Exec(
		"UPDATE appointments SET status = 'cancelada', cancel_reason = ? WHERE id = ? AND user_id = ?",
		reason, id, userID,
	)
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

// GetAllAppointments returns every booking, most recently created
// first — used by the admin Citas panel.
func GetAllAppointments() ([]Appointment, error) {
	rows, err := db.DB.Query(
		"SELECT id, appt_date, appt_time, nombre, apellido, celular, correo, fecha_nacimiento, cuestionario, status, cancel_reason, user_id, created_at FROM appointments ORDER BY created_at DESC",
	)
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

// IsSlotBookedExcluding es igual que IsSlotBooked, pero ignora una cita
// en particular — se usa al reagendar, para no marcar como "ocupado" el
// mismo horario que ya tenía la propia cita que se está moviendo (si el
// cliente vuelve a elegir la misma hora que ya tenía).
func IsSlotBookedExcluding(date time.Time, apptTime string, excludeID int64) (bool, error) {
	var cnt int
	err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM appointments WHERE appt_date = ? AND appt_time = ? AND status != 'cancelada' AND id != ?",
		date.Format("2006-01-02"), apptTime, excludeID,
	).Scan(&cnt)
	if err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// RescheduleAppointmentByUser cambia la fecha/hora de una cita — SOLO si
// pertenece al cliente que la está reagendando (WHERE id=? AND
// user_id=?), mismo criterio de seguridad que CancelAppointmentByUser.
// No toca status ni pide verificar código de nuevo: es la MISMA cita
// (mismo id), solo se mueve de horario — la sesión de cliente ya la
// autentica.
func RescheduleAppointmentByUser(id, userID int64, date time.Time, apptTime string) error {
	result, err := db.DB.Exec(
		"UPDATE appointments SET appt_date = ?, appt_time = ? WHERE id = ? AND user_id = ?",
		date.Format("2006-01-02"), apptTime, id, userID,
	)
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

// UpdateAppointmentStatus changes a booking's status (e.g. to
// "verificada" when the admin approves it).
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
