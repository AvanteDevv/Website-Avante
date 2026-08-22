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
//	CREATE TABLE eye_exams (
//	  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  template_id     BIGINT NOT NULL,
//	  patient_name    VARCHAR(120) NOT NULL,
//	  patient_phone   VARCHAR(30) NOT NULL DEFAULT '',
//	  data            JSON NOT NULL,
//	  created_by_role VARCHAR(20) NOT NULL DEFAULT '',
//	  created_by_id   BIGINT NOT NULL DEFAULT 0,
//	  created_by_name VARCHAR(120) NOT NULL DEFAULT '',
//	  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);
//
// `data` guarda un JSON con dos partes que arma el frontend:
//   - fields: { "<fieldKey del elemento de texto>": "valor escrito" }
//   - tables: { "<id del elemento de tabla>": [["fila1col1","fila1col2"], ...] }
// No se valida su forma aquí — el formulario de llenado (fase 2 del
// frontend) es quien construye ese JSON según los elementos de la
// plantilla que se usó, y la vista de "ver examen" es quien sabe
// leerlo de vuelta cruzándolo con esa misma plantilla.

type EyeExam struct {
	ID            int64           `json:"id"`
	TemplateID    int64           `json:"templateId"`
	PatientName   string          `json:"patientName"`
	PatientPhone  string          `json:"patientPhone"`
	Data          json.RawMessage `json:"data"`
	CreatedByRole string          `json:"createdByRole"`
	CreatedByID   int64           `json:"createdById"`
	CreatedByName string          `json:"createdByName"`
	CreatedAt     time.Time       `json:"createdAt"`
}

var ErrEyeExamNotFound = errors.New("examen no encontrado")

// CreateEyeExam guarda un examen ya llenado.
func CreateEyeExam(templateID int64, patientName, patientPhone string, data json.RawMessage, createdByRole string, createdByID int64, createdByName string) (*EyeExam, error) {
	result, err := db.DB.Exec(
		`INSERT INTO eye_exams (template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		templateID, patientName, patientPhone, []byte(data), createdByRole, createdByID, createdByName,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	return GetEyeExamByID(id)
}

// GetEyeExamByID busca un examen por su id — lo usa la vista de
// detalle para volver a renderizarlo sobre la plantilla que se usó.
func GetEyeExamByID(id int64) (*EyeExam, error) {
	var e EyeExam
	var raw []byte
	err := db.DB.QueryRow(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, created_at
		 FROM eye_exams WHERE id = ?`,
		id,
	).Scan(&e.ID, &e.TemplateID, &e.PatientName, &e.PatientPhone, &raw, &e.CreatedByRole, &e.CreatedByID, &e.CreatedByName, &e.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrEyeExamNotFound
	}
	if err != nil {
		return nil, err
	}
	e.Data = json.RawMessage(raw)
	return &e, nil
}

// ListEyeExams devuelve los exámenes más recientes primero — usado
// tanto por la lista de "Exámenes recientes" en examen-vista.html
// como, filtrando por nombre, por el buscador de historial-clinico.html
// más adelante.
func ListEyeExams() ([]EyeExam, error) {
	rows, err := db.DB.Query(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, created_at
		 FROM eye_exams ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []EyeExam
	for rows.Next() {
		var e EyeExam
		var raw []byte
		if err := rows.Scan(&e.ID, &e.TemplateID, &e.PatientName, &e.PatientPhone, &raw, &e.CreatedByRole, &e.CreatedByID, &e.CreatedByName, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Data = json.RawMessage(raw)
		list = append(list, e)
	}
	return list, nil
}

// ListEyeExamsByPatientName busca exámenes cuyo nombre de paciente
// contenga el término dado (búsqueda simple, sin acentos/mayúsculas
// exactas) — para el buscador de historial-clinico.html.
func ListEyeExamsByPatientName(term string) ([]EyeExam, error) {
	rows, err := db.DB.Query(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, created_at
		 FROM eye_exams WHERE patient_name LIKE ? ORDER BY created_at DESC`,
		"%"+term+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []EyeExam
	for rows.Next() {
		var e EyeExam
		var raw []byte
		if err := rows.Scan(&e.ID, &e.TemplateID, &e.PatientName, &e.PatientPhone, &raw, &e.CreatedByRole, &e.CreatedByID, &e.CreatedByName, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Data = json.RawMessage(raw)
		list = append(list, e)
	}
	return list, nil
}
