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
//	  user_id         BIGINT NULL,
//	  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);
//
// Si ya tenías la tabla de antes (sin user_id), corre además:
//
//	ALTER TABLE eye_exams ADD COLUMN user_id BIGINT NULL, ADD INDEX idx_eye_exams_user_id (user_id);
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
	// UserID: la cuenta de cliente a la que quedó ligado este examen —
	// 0 si el paciente no tiene cuenta en Avante Optics (en ese caso el
	// examen solo se puede compartir por WhatsApp/correo, no aparece en
	// ningún "Mis exámenes").
	UserID    int64     `json:"userId,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// PatientMatch es lo mínimo que necesita el autocompletado de
// "Nombre" en Nuevo examen para ofrecer resultados de la tabla
// `users` — no expone nada más de la cuenta (ni email, ni rol).
type PatientMatch struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Phone string `json:"phone"`
}

// SearchPatients busca clientes por nombre o teléfono — usado por el
// campo "Nombre" del formulario de examen para saber si la persona ya
// tiene cuenta (y así poder ligar el examen con user_id) o no (en
// cuyo caso solo se puede compartir por WhatsApp/correo).
func SearchPatients(term string) ([]PatientMatch, error) {
	rows, err := db.DB.Query(
		`SELECT id, name, COALESCE(phone, '') FROM users WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 8`,
		"%"+term+"%", "%"+term+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []PatientMatch{}
	for rows.Next() {
		var p PatientMatch
		if err := rows.Scan(&p.ID, &p.Name, &p.Phone); err != nil {
			return nil, err
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

var ErrEyeExamNotFound = errors.New("examen no encontrado")

// rowScanner ya está definido en appointments.go, dentro del mismo
// paquete `models` — se reutiliza aquí tal cual, no hace falta
// declararlo otra vez (Go tronaba con "redeclared in this block").

// scanEyeExamRow escanea una fila con las columnas "id, template_id,
// patient_name, patient_phone, data, created_by_role, created_by_id,
// created_by_name, user_id, created_at" (en ese orden) — la usan
// GetEyeExamByID, ListEyeExams, ListEyeExamsByPatientName y
// ListEyeExamsByUser, para no repetir el manejo de user_id (nullable
// en la tabla, int64 plano en el struct) cuatro veces.
func scanEyeExamRow(row rowScanner, e *EyeExam) error {
	var raw []byte
	var userID sql.NullInt64
	if err := row.Scan(&e.ID, &e.TemplateID, &e.PatientName, &e.PatientPhone, &raw, &e.CreatedByRole, &e.CreatedByID, &e.CreatedByName, &userID, &e.CreatedAt); err != nil {
		return err
	}
	e.Data = json.RawMessage(raw)
	if userID.Valid {
		e.UserID = userID.Int64
	}
	return nil
}

// CreateEyeExam guarda un examen ya llenado. userID es opcional: si el
// optometrista encontró y seleccionó al paciente en la búsqueda contra
// la base (tiene cuenta), pásalo; si no, pasa 0 y el examen queda sin
// ligar a ninguna cuenta — solo se podrá compartir por WhatsApp/correo.
func CreateEyeExam(templateID int64, patientName, patientPhone string, data json.RawMessage, createdByRole string, createdByID int64, createdByName string, userID int64) (*EyeExam, error) {
	var userIDArg interface{}
	if userID > 0 {
		userIDArg = userID
	}

	result, err := db.DB.Exec(
		`INSERT INTO eye_exams (template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, user_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		templateID, patientName, patientPhone, []byte(data), createdByRole, createdByID, createdByName, userIDArg,
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
	row := db.DB.QueryRow(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, user_id, created_at
		 FROM eye_exams WHERE id = ?`,
		id,
	)
	if err := scanEyeExamRow(row, &e); err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrEyeExamNotFound
		}
		return nil, err
	}
	return &e, nil
}

// ListEyeExams devuelve los exámenes más recientes primero — usado
// tanto por la lista de "Exámenes recientes" en examen-vista.html
// como, filtrando por nombre, por el buscador de historial-clinico.html
// más adelante.
func ListEyeExams() ([]EyeExam, error) {
	rows, err := db.DB.Query(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, user_id, created_at
		 FROM eye_exams ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []EyeExam
	for rows.Next() {
		var e EyeExam
		if err := scanEyeExamRow(rows, &e); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, nil
}

// ListEyeExamsByPatientName busca exámenes cuyo nombre de paciente
// contenga el término dado (búsqueda simple, sin acentos/mayúsculas
// exactas) — para el buscador de historial-clinico.html.
func ListEyeExamsByPatientName(term string) ([]EyeExam, error) {
	rows, err := db.DB.Query(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, user_id, created_at
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
		if err := scanEyeExamRow(rows, &e); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, nil
}

// ListEyeExamsByUser devuelve los exámenes ligados a la cuenta de un
// cliente — usado por el panel "Mis exámenes".
func ListEyeExamsByUser(userID int64) ([]EyeExam, error) {
	rows, err := db.DB.Query(
		`SELECT id, template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, user_id, created_at
		 FROM eye_exams WHERE user_id = ? ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []EyeExam{}
	for rows.Next() {
		var e EyeExam
		if err := scanEyeExamRow(rows, &e); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, nil
}
