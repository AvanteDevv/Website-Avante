package models

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"time"

	"avante-optics/db"
)

// Links para mandarle al cliente su formato lleno (Clarito → "Enviar por
// WhatsApp"). El link es /formato/<token>: abre el PDF sin iniciar
// sesión hasta que vence. Si el archivo se renombra o se mueve, el link
// se actualiza (ver UpdateClaritoDocumentKey); si se borra, deja de abrir.

// ClaritoShareDays: cuánto dura el link.
const ClaritoShareDays = 30

// GetOrCreateClaritoShareLink regresa un link vigente de ese archivo (si
// todavía le quedan 7 días o más) o crea uno nuevo.
func GetOrCreateClaritoShareLink(key, by string) (token string, expires time.Time, err error) {
	err = db.DB.QueryRow(`SELECT token, expires_at FROM clarito_share_links
		WHERE object_key = ? AND expires_at > DATE_ADD(NOW(), INTERVAL 7 DAY)
		ORDER BY expires_at DESC LIMIT 1`, key).Scan(&token, &expires)
	if err == nil {
		return token, expires, nil
	}
	if err != sql.ErrNoRows {
		return "", time.Time{}, err
	}
	b := make([]byte, 18)
	if _, err = rand.Read(b); err != nil {
		return "", time.Time{}, err
	}
	token = base64.RawURLEncoding.EncodeToString(b) // 24 caracteres
	if _, err = db.DB.Exec(`INSERT INTO clarito_share_links (token, object_key, created_by, expires_at)
		VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`, token, key, by, ClaritoShareDays); err != nil {
		return "", time.Time{}, err
	}
	err = db.DB.QueryRow(`SELECT expires_at FROM clarito_share_links WHERE token = ?`, token).Scan(&expires)
	return token, expires, err
}

// GetClaritoShareKey regresa el archivo de ese link. ok = false si no
// existe o ya venció.
func GetClaritoShareKey(token string) (key string, ok bool, err error) {
	var expired bool
	err = db.DB.QueryRow(`SELECT object_key, expires_at <= NOW() FROM clarito_share_links WHERE token = ?`, token).Scan(&key, &expired)
	if err == sql.ErrNoRows {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return key, !expired, nil
}
