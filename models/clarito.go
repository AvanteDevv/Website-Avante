package models

import (
	"database/sql"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// ClaritoDocument es un formato llenado y guardado en el bucket.
type ClaritoDocument struct {
	ID         int64     `json:"id"`
	FormKey    string    `json:"form_key"`
	FormName   string    `json:"form_name"`
	ClientName string    `json:"client_name"`
	FileName   string    `json:"file_name"`
	ObjectKey  string    `json:"key"`
	Size       int64     `json:"size"`
	FolderPath string    `json:"folder_path"`
	CreatedBy  string    `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
}

// CreateClaritoDocument registra un formato guardado.
func CreateClaritoDocument(d ClaritoDocument) (int64, error) {
	res, err := db.DB.Exec(`INSERT INTO clarito_documents
		(form_key, form_name, client_name, file_name, object_key, size_bytes, folder_path, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		d.FormKey, d.FormName, d.ClientName, d.FileName, d.ObjectKey, d.Size, d.FolderPath, d.CreatedBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// ListClaritoDocuments regresa los últimos formatos guardados en el bucket
// (los viejos de Google Drive no tienen object_key y no se muestran).
func ListClaritoDocuments(limit int) ([]ClaritoDocument, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := db.DB.Query(`SELECT id, form_key, form_name, client_name, file_name, object_key, size_bytes,
		folder_path, created_by, created_at FROM clarito_documents WHERE object_key <> '' ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClaritoDocument{}
	for rows.Next() {
		var d ClaritoDocument
		if err := rows.Scan(&d.ID, &d.FormKey, &d.FormName, &d.ClientName, &d.FileName, &d.ObjectKey, &d.Size,
			&d.FolderPath, &d.CreatedBy, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// DeleteClaritoDocumentsByKey quita del registro un archivo borrado del bucket.
func DeleteClaritoDocumentsByKey(key string) error {
	_, err := db.DB.Exec(`DELETE FROM clarito_documents WHERE object_key = ?`, key)
	return err
}

// UpdateClaritoDocumentKey actualiza el registro al renombrar o mover un archivo.
func UpdateClaritoDocumentKey(oldKey, newKey, fileName, folderPath string) error {
	_, err := db.DB.Exec(`UPDATE clarito_documents SET object_key = ?, file_name = ?, folder_path = ? WHERE object_key = ?`,
		newKey, fileName, folderPath, oldKey)
	return err
}

// MoveClaritoDocumentsPrefix actualiza el registro cuando se renombra una
// carpeta: todo lo que empezaba con oldPrefix ahora empieza con newPrefix.
func MoveClaritoDocumentsPrefix(oldPrefix, newPrefix, oldPath, newPath string) error {
	_, err := db.DB.Exec(`UPDATE clarito_documents
		SET object_key = CONCAT(?, SUBSTRING(object_key, ?)),
		    folder_path = CASE WHEN folder_path = ? THEN ? ELSE CONCAT(?, SUBSTRING(folder_path, ?)) END
		WHERE object_key LIKE ?`,
		newPrefix, len([]rune(oldPrefix))+1,
		oldPath, newPath, newPath, len([]rune(oldPath))+1,
		likePrefix(oldPrefix)+"%")
	return err
}

func likePrefix(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// GetClaritoSettings regresa el JSON guardado ("" si nunca se guardó).
func GetClaritoSettings() (string, error) {
	var s string
	err := db.DB.QueryRow(`SELECT settings FROM clarito_settings WHERE id = 1`).Scan(&s)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return s, err
}

// SaveClaritoSettings guarda la configuración (JSON).
func SaveClaritoSettings(settings string) error {
	_, err := db.DB.Exec(`INSERT INTO clarito_settings (id, settings) VALUES (1, ?)
		ON DUPLICATE KEY UPDATE settings = VALUES(settings)`, settings)
	return err
}
