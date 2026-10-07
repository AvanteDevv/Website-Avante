package models

import (
	"database/sql"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// ClaritoSignRequest es un link para que el cliente firme desde su celular.
type ClaritoSignRequest struct {
	ID         int64
	Token      string
	FormName   string
	ClientName string
	FieldLabel string
	Status     string // pendiente | firmada | cancelada
	DraftKey   string // PDF de vista previa en el bucket ("" si ya se borró)
	Signature  string // data:image/png;base64,…
	CreatedBy  string
	Expired    bool
	SignedAt   *time.Time
}

// CreateClaritoSignRequest guarda un link nuevo que vence en `hours` horas.
func CreateClaritoSignRequest(r ClaritoSignRequest, hours int) error {
	_, err := db.DB.Exec(`INSERT INTO clarito_sign_requests
		(token, form_name, client_name, field_label, draft_key, created_by, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))`,
		r.Token, r.FormName, r.ClientName, r.FieldLabel, r.DraftKey, r.CreatedBy, hours)
	return err
}

// GetClaritoSignRequest regresa el link o nil si no existe.
func GetClaritoSignRequest(token string) (*ClaritoSignRequest, error) {
	var r ClaritoSignRequest
	var sig sql.NullString
	var signed sql.NullTime
	err := db.DB.QueryRow(`SELECT id, token, form_name, client_name, field_label, status, draft_key, signature,
		created_by, expires_at <= NOW(), signed_at FROM clarito_sign_requests WHERE token = ?`, token).
		Scan(&r.ID, &r.Token, &r.FormName, &r.ClientName, &r.FieldLabel, &r.Status, &r.DraftKey, &sig,
			&r.CreatedBy, &r.Expired, &signed)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.Signature = sig.String
	if signed.Valid {
		t := signed.Time
		r.SignedAt = &t
	}
	return &r, nil
}

// SignClaritoRequest guarda la firma. Regresa false si el link ya no
// estaba pendiente (ya firmado, cancelado o vencido).
func SignClaritoRequest(token, signature, ip, ua string) (bool, error) {
	res, err := db.DB.Exec(`UPDATE clarito_sign_requests
		SET status = 'firmada', signature = ?, signed_ip = ?, signed_ua = ?, signed_at = NOW()
		WHERE token = ? AND status = 'pendiente' AND expires_at > NOW()`, signature, ip, ua, token)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// CancelClaritoSignRequest cancela un link pendiente.
func CancelClaritoSignRequest(token string) error {
	_, err := db.DB.Exec(`UPDATE clarito_sign_requests SET status = 'cancelada' WHERE token = ? AND status = 'pendiente'`, token)
	return err
}

// ClearClaritoSignDraft marca que el PDF de vista previa ya se borró.
func ClearClaritoSignDraft(token string) error {
	_, err := db.DB.Exec(`UPDATE clarito_sign_requests SET draft_key = '' WHERE token = ?`, token)
	return err
}

// OldClaritoSignDrafts regresa los PDF de vista previa que ya no hacen
// falta (links firmados, cancelados o vencidos).
func OldClaritoSignDrafts(limit int) (map[string]string, error) {
	rows, err := db.DB.Query(`SELECT token, draft_key FROM clarito_sign_requests
		WHERE draft_key <> '' AND (status <> 'pendiente' OR expires_at <= NOW()) LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var t, k string
		if err := rows.Scan(&t, &k); err != nil {
			return nil, err
		}
		out[t] = k
	}
	return out, rows.Err()
}

// PurgeClaritoSignRequests borra los links de hace más de 30 días.
func PurgeClaritoSignRequests() error {
	_, err := db.DB.Exec(`DELETE FROM clarito_sign_requests WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND draft_key = ''`)
	return err
}
