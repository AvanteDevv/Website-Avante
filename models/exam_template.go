package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Requiere una tabla nueva. Corre esto una vez contra tu base de datos:
//
//	CREATE TABLE exam_templates (
//	  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  name       VARCHAR(120) NOT NULL,
//	  canvas_w   INT NOT NULL DEFAULT 816,
//	  canvas_h   INT NOT NULL DEFAULT 1056,
//	  elements   JSON NOT NULL,
//	  is_active  BOOLEAN NOT NULL DEFAULT FALSE,
//	  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
//	  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//	);
//
// `elements` guarda un arreglo JSON con cada pieza del lienzo — texto,
// línea, tabla, imagen/logo o título — con su x/y/ancho/alto y sus
// propiedades propias (contenido del texto, filas/columnas de la
// tabla, etc.). El frontend del editor es el que arma y lee ese JSON;
// aquí solo se guarda y se recupera tal cual.
//
// `is_active` marca cuál plantilla es la que usa el formulario de
// examen real cuando el optometrista da clic en "Nuevo examen" (fase
// 2, todavía no construida) — solo una puede estar activa a la vez.

type ExamTemplate struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	CanvasW   int             `json:"canvasW"`
	CanvasH   int             `json:"canvasH"`
	Elements  json.RawMessage `json:"elements"`
	IsActive  bool            `json:"isActive"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

var ErrExamTemplateNotFound = errors.New("plantilla de examen no encontrada")

// CreateExamTemplate inserta una plantilla nueva. elements debe ser un
// JSON válido (un arreglo) — el caller (el handler) es quien valida
// que el body de la petición sea JSON antes de llegar aquí.
func CreateExamTemplate(name string, canvasW, canvasH int, elements json.RawMessage) (*ExamTemplate, error) {
	result, err := db.DB.Exec(
		"INSERT INTO exam_templates (name, canvas_w, canvas_h, elements) VALUES (?, ?, ?, ?)",
		name, canvasW, canvasH, []byte(elements),
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	return GetExamTemplateByID(id)
}

// UpdateExamTemplate reemplaza el nombre, tamaño de lienzo y elementos
// de una plantilla existente — es lo que llama el botón "Guardar" del
// editor cada vez que el optometrista/admin ajusta algo.
func UpdateExamTemplate(id int64, name string, canvasW, canvasH int, elements json.RawMessage) error {
	result, err := db.DB.Exec(
		"UPDATE exam_templates SET name = ?, canvas_w = ?, canvas_h = ?, elements = ? WHERE id = ?",
		name, canvasW, canvasH, []byte(elements), id,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrExamTemplateNotFound
	}
	return nil
}

// SetActiveExamTemplate marca una plantilla como la activa y
// desmarca cualquier otra — solo una puede estar activa a la vez, ya
// que es la que va a usar el formulario de examen real.
func SetActiveExamTemplate(id int64) error {
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE exam_templates SET is_active = FALSE WHERE is_active = TRUE"); err != nil {
		tx.Rollback()
		return err
	}
	result, err := tx.Exec("UPDATE exam_templates SET is_active = TRUE WHERE id = ?", id)
	if err != nil {
		tx.Rollback()
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		tx.Rollback()
		return err
	}
	if affected == 0 {
		tx.Rollback()
		return ErrExamTemplateNotFound
	}
	return tx.Commit()
}

// GetExamTemplateByID busca una plantilla por su id.
func GetExamTemplateByID(id int64) (*ExamTemplate, error) {
	var t ExamTemplate
	var raw []byte
	err := db.DB.QueryRow(
		"SELECT id, name, canvas_w, canvas_h, elements, is_active, created_at, updated_at FROM exam_templates WHERE id = ?",
		id,
	).Scan(&t.ID, &t.Name, &t.CanvasW, &t.CanvasH, &raw, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrExamTemplateNotFound
	}
	if err != nil {
		return nil, err
	}
	t.Elements = json.RawMessage(raw)
	return &t, nil
}

// GetActiveExamTemplate busca la plantilla marcada como activa —
// la que usará el formulario de examen real (fase 2).
func GetActiveExamTemplate() (*ExamTemplate, error) {
	var t ExamTemplate
	var raw []byte
	err := db.DB.QueryRow(
		"SELECT id, name, canvas_w, canvas_h, elements, is_active, created_at, updated_at FROM exam_templates WHERE is_active = TRUE LIMIT 1",
	).Scan(&t.ID, &t.Name, &t.CanvasW, &t.CanvasH, &raw, &t.IsActive, &t.CreatedAt, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrExamTemplateNotFound
	}
	if err != nil {
		return nil, err
	}
	t.Elements = json.RawMessage(raw)
	return &t, nil
}

// ListExamTemplates devuelve todas las plantillas, más reciente primero
// — para un futuro selector "usar esta plantilla" si llegan a tener
// más de una guardada.
func ListExamTemplates() ([]ExamTemplate, error) {
	rows, err := db.DB.Query(
		"SELECT id, name, canvas_w, canvas_h, elements, is_active, created_at, updated_at FROM exam_templates ORDER BY updated_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ExamTemplate
	for rows.Next() {
		var t ExamTemplate
		var raw []byte
		if err := rows.Scan(&t.ID, &t.Name, &t.CanvasW, &t.CanvasH, &raw, &t.IsActive, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		t.Elements = json.RawMessage(raw)
		list = append(list, t)
	}
	return list, nil
}

// DeleteExamTemplate elimina una plantilla.
func DeleteExamTemplate(id int64) error {
	result, err := db.DB.Exec("DELETE FROM exam_templates WHERE id = ?", id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrExamTemplateNotFound
	}
	return nil
}
