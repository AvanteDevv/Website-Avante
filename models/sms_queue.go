package models

import (
	"database/sql"
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Este archivo va en la misma carpeta que appointments.go y otp.go
// (paquete "models"). Requiere la tabla sms_queue — ver
// migracion_sms_queue.sql.
//
// Cómo funciona el flujo completo:
//  1. SendVerificationCode (en el handler) llama a EnqueueSMS() en vez de
//     mandar el código real — solo inserta una fila con status
//     "pendiente".
//  2. El celular Android (con la app que manda SMS con la SIM del plan)
//     pregunta cada pocos segundos a GET /api/gateway/sms/siguiente si
//     hay algo pendiente.
//  3. Si hay algo, la app lo manda por SMS real (SmsManager de Android)
//     y luego confirma con POST /api/gateway/sms/:id/confirmar.
//  4. Esa fila pasa a status "enviado". Si algo falla del lado del
//     celular, puede mandar "fallido" en vez de "enviado".

// SMSMessage representa una fila de la tabla sms_queue.
type SMSMessage struct {
	ID        int64
	Celular   string // "+52XXXXXXXXXX"
	Mensaje   string // texto completo que se debe mandar por SMS
	Status    string // "pendiente" | "enviado" | "fallido"
	CreatedAt time.Time
	SentAt    sql.NullTime
}

var ErrSMSNotFound = errors.New("mensaje no encontrado en la cola")

// EnqueueSMS agrega un mensaje nuevo a la cola con status "pendiente".
// Regresa el id insertado, útil solo para logs/depuración.
func EnqueueSMS(celular, mensaje string) (int64, error) {
	result, err := db.DB.Exec(
		"INSERT INTO sms_queue (celular, mensaje, status) VALUES (?, ?, 'pendiente')",
		celular, mensaje,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

// GetNextPendingSMS regresa el mensaje pendiente más antiguo (FIFO), o
// nil si no hay ninguno. La app Android llama a esto en cada "poll".
func GetNextPendingSMS() (*SMSMessage, error) {
	var m SMSMessage
	err := db.DB.QueryRow(
		`SELECT id, celular, mensaje, status, created_at, sent_at
		 FROM sms_queue
		 WHERE status = 'pendiente'
		 ORDER BY created_at ASC
		 LIMIT 1`,
	).Scan(&m.ID, &m.Celular, &m.Mensaje, &m.Status, &m.CreatedAt, &m.SentAt)

	if err == sql.ErrNoRows {
		return nil, nil // no hay nada pendiente — no es un error
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// MarkSMSSent marca un mensaje como enviado exitosamente por el celular.
func MarkSMSSent(id int64) error {
	return updateSMSStatus(id, "enviado")
}

// MarkSMSFailed marca un mensaje como fallido (p. ej. el celular no tenía
// señal o SmsManager regresó error) — así se puede reintentar o alertar
// desde el panel admin en vez de quedar en "pendiente" para siempre.
func MarkSMSFailed(id int64) error {
	return updateSMSStatus(id, "fallido")
}

func updateSMSStatus(id int64, status string) error {
	result, err := db.DB.Exec(
		"UPDATE sms_queue SET status = ?, sent_at = NOW() WHERE id = ?",
		status, id,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrSMSNotFound
	}
	return nil
}
