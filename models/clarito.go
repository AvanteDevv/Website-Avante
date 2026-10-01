package models

import (
	"database/sql"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// DriveConnection es la cuenta de Google Drive conectada (una sola para
// toda la óptica). El refresh_token es lo que la mantiene conectada para
// siempre: solo se borra al desconectar a mano.
type DriveConnection struct {
	Email        string
	Name         string
	RefreshToken string
	AccessToken  string
	Expiry       time.Time
	RootID       string
	RootName     string
	Settings     string
	Status       string // ok | error (Google rechazó el token; hay que volver a conectar)
	LastError    string
	ConnectedBy  string
	ConnectedAt  time.Time
	CheckedAt    *time.Time
}

// GetDriveConnection regresa la conexión o nil si no hay ninguna.
func GetDriveConnection() (*DriveConnection, error) {
	var c DriveConnection
	var access, settings sql.NullString
	var expiry, checked sql.NullTime
	err := db.DB.QueryRow(`SELECT email, name, refresh_token, access_token, expiry, root_id, root_name,
		settings, status, last_error, connected_by, connected_at, checked_at FROM drive_connection WHERE id = 1`).
		Scan(&c.Email, &c.Name, &c.RefreshToken, &access, &expiry, &c.RootID, &c.RootName,
			&settings, &c.Status, &c.LastError, &c.ConnectedBy, &c.ConnectedAt, &checked)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	c.AccessToken = access.String
	c.Settings = settings.String
	if expiry.Valid {
		c.Expiry = expiry.Time
	}
	if checked.Valid {
		t := checked.Time
		c.CheckedAt = &t
	}
	return &c, nil
}

// SaveDriveConnection crea o reemplaza la conexión (al conectar).
func SaveDriveConnection(c DriveConnection) error {
	_, err := db.DB.Exec(`INSERT INTO drive_connection
		(id, email, name, refresh_token, access_token, expiry, root_id, root_name, settings, status, last_error, connected_by, connected_at, checked_at)
		VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 'ok', '', ?, NOW(), NOW())
		ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), refresh_token = VALUES(refresh_token),
		access_token = VALUES(access_token), expiry = VALUES(expiry), root_id = VALUES(root_id), root_name = VALUES(root_name),
		settings = COALESCE(VALUES(settings), settings), status = 'ok', last_error = '', connected_by = VALUES(connected_by),
		connected_at = NOW(), checked_at = NOW()`,
		c.Email, c.Name, c.RefreshToken, c.AccessToken, c.Expiry, c.RootID, c.RootName, nullStr(c.Settings), c.ConnectedBy)
	return err
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

// UpdateDriveAccessToken guarda el access token renovado.
func UpdateDriveAccessToken(token string, expiry time.Time, newRefresh string) error {
	if newRefresh != "" {
		_, err := db.DB.Exec(`UPDATE drive_connection SET access_token = ?, expiry = ?, refresh_token = ?, status = 'ok', last_error = '', checked_at = NOW() WHERE id = 1`, token, expiry, newRefresh)
		return err
	}
	_, err := db.DB.Exec(`UPDATE drive_connection SET access_token = ?, expiry = ?, status = 'ok', last_error = '', checked_at = NOW() WHERE id = 1`, token, expiry)
	return err
}

// MarkDriveError marca que Google rechazó el token. NO borra la conexión:
// solo se borra cuando alguien da clic en "Desconectar".
func MarkDriveError(msg string) error {
	if len(msg) > 490 {
		msg = msg[:490]
	}
	_, err := db.DB.Exec(`UPDATE drive_connection SET status = 'error', last_error = ?, checked_at = NOW() WHERE id = 1`, msg)
	return err
}

// UpdateDriveRoot cambia la carpeta principal.
func UpdateDriveRoot(id, name string) error {
	_, err := db.DB.Exec(`UPDATE drive_connection SET root_id = ?, root_name = ? WHERE id = 1`, id, name)
	return err
}

// UpdateDriveSettings guarda la configuración (JSON).
func UpdateDriveSettings(settings string) error {
	_, err := db.DB.Exec(`UPDATE drive_connection SET settings = ? WHERE id = 1`, settings)
	return err
}

// DeleteDriveConnection — solo al desconectar a mano.
func DeleteDriveConnection() error {
	_, err := db.DB.Exec(`DELETE FROM drive_connection WHERE id = 1`)
	return err
}

// ClaritoDocument es un formato llenado y subido a Drive.
type ClaritoDocument struct {
	ID         int64     `json:"id"`
	FormKey    string    `json:"form_key"`
	FormName   string    `json:"form_name"`
	ClientName string    `json:"client_name"`
	FileName   string    `json:"file_name"`
	DriveID    string    `json:"drive_id"`
	FolderID   string    `json:"folder_id"`
	FolderPath string    `json:"folder_path"`
	WebLink    string    `json:"web_link"`
	CreatedBy  string    `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
}

// CreateClaritoDocument registra un formato subido.
func CreateClaritoDocument(d ClaritoDocument) (int64, error) {
	res, err := db.DB.Exec(`INSERT INTO clarito_documents
		(form_key, form_name, client_name, file_name, drive_id, folder_id, folder_path, web_link, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.FormKey, d.FormName, d.ClientName, d.FileName, d.DriveID, d.FolderID, d.FolderPath, d.WebLink, d.CreatedBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ListClaritoDocuments regresa los últimos formatos subidos.
func ListClaritoDocuments(limit int) ([]ClaritoDocument, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := db.DB.Query(`SELECT id, form_key, form_name, client_name, file_name, drive_id, folder_id,
		folder_path, web_link, created_by, created_at FROM clarito_documents ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClaritoDocument{}
	for rows.Next() {
		var d ClaritoDocument
		if err := rows.Scan(&d.ID, &d.FormKey, &d.FormName, &d.ClientName, &d.FileName, &d.DriveID, &d.FolderID,
			&d.FolderPath, &d.WebLink, &d.CreatedBy, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}
