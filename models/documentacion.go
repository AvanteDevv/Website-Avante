package models

import (
	"database/sql"
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Documento: un archivo de Administración → Documentación (requisitos de
// UNISON, de empresas, …). Se comparte con el link público
// /documento/<Token> (o su código QR); el link no cambia aunque se
// reemplace el archivo.
type Documento struct {
	ID          int64     `json:"id"`
	Token       string    `json:"token"`
	Title       string    `json:"title"`
	Category    string    `json:"category"` // unison | empresas | otros
	FileName    string    `json:"fileName"`
	ObjectKey   string    `json:"-"`
	ContentType string    `json:"contentType"`
	SizeBytes   int64     `json:"sizeBytes"`
	Views       int       `json:"views"`
	CreatedBy   string    `json:"createdBy"`
	UpdatedBy   string    `json:"updatedBy"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

var ErrDocumentoNotFound = errors.New("documento no encontrado")

// DocumentoCategorias: las categorías válidas, en el orden en que se muestran.
var DocumentoCategorias = []string{"unison", "empresas", "otros"}

// IsDocumentoCategoria indica si la categoría es válida.
func IsDocumentoCategoria(c string) bool {
	for _, x := range DocumentoCategorias {
		if x == c {
			return true
		}
	}
	return false
}

const documentoCols = `id, token, title, category, file_name, object_key, content_type, size_bytes, views, created_by, updated_by, created_at, updated_at`

func scanDocumento(row rowScanner, d *Documento) error {
	return row.Scan(&d.ID, &d.Token, &d.Title, &d.Category, &d.FileName, &d.ObjectKey, &d.ContentType, &d.SizeBytes, &d.Views, &d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt)
}

// ListDocumentos: todos, el actualizado más recientemente primero.
func ListDocumentos() ([]Documento, error) {
	rows, err := db.DB.Query(`SELECT ` + documentoCols + ` FROM documentos ORDER BY updated_at DESC, id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Documento{}
	for rows.Next() {
		var d Documento
		if err := scanDocumento(rows, &d); err != nil {
			return nil, err
		}
		list = append(list, d)
	}
	return list, rows.Err()
}

func getDocumento(where string, arg interface{}) (*Documento, error) {
	var d Documento
	err := scanDocumento(db.DB.QueryRow(`SELECT `+documentoCols+` FROM documentos WHERE `+where, arg), &d)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrDocumentoNotFound
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// GetDocumentoByID busca un documento por id.
func GetDocumentoByID(id int64) (*Documento, error) { return getDocumento("id = ?", id) }

// GetDocumentoByToken busca un documento por el token de su link público.
func GetDocumentoByToken(token string) (*Documento, error) {
	return getDocumento("token = ?", token)
}

// CreateDocumento guarda el registro de un documento ya subido al bucket.
func CreateDocumento(d *Documento) error {
	res, err := db.DB.Exec(
		`INSERT INTO documentos (token, title, category, file_name, object_key, content_type, size_bytes, created_by, updated_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		d.Token, d.Title, d.Category, d.FileName, d.ObjectKey, d.ContentType, d.SizeBytes, d.CreatedBy, d.CreatedBy,
	)
	if err != nil {
		return err
	}
	d.ID, err = res.LastInsertId()
	return err
}

// UpdateDocumentoInfo cambia el título y la categoría.
func UpdateDocumentoInfo(id int64, title, category, by string) error {
	res, err := db.DB.Exec(
		`UPDATE documentos SET title = ?, category = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		title, category, by, id,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrDocumentoNotFound
	}
	return nil
}

// ReplaceDocumentoFile apunta el documento a un archivo nuevo (el link no cambia).
func ReplaceDocumentoFile(id int64, fileName, objectKey, contentType string, size int64, by string) error {
	res, err := db.DB.Exec(
		`UPDATE documentos SET file_name = ?, object_key = ?, content_type = ?, size_bytes = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		fileName, objectKey, contentType, size, by, id,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrDocumentoNotFound
	}
	return nil
}

// DeleteDocumento borra el registro (el archivo del bucket lo borra el handler).
func DeleteDocumento(id int64) error {
	res, err := db.DB.Exec(`DELETE FROM documentos WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrDocumentoNotFound
	}
	return nil
}

// AddDocumentoView suma una visita al link público.
func AddDocumentoView(id int64) {
	_, _ = db.DB.Exec(`UPDATE documentos SET views = views + 1 WHERE id = ?`, id)
}
