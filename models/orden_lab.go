package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Orden de laboratorio: la hoja que se llena justo después de la
// historia clínica (plantilla con kind = 'laboratorio'). Se guarda en
// lab_order_sheets, ligada al examen (exam_id) del que salió.

const ExamTemplateKindLab = "laboratorio"

// GetLabExamTemplate: la plantilla de la orden de laboratorio (la más
// reciente si hubiera varias).
func GetLabExamTemplate() (*ExamTemplate, error) {
	var t ExamTemplate
	var raw []byte
	err := db.DB.QueryRow(
		"SELECT id, name, canvas_w, canvas_h, elements, is_active, kind, created_at, updated_at FROM exam_templates WHERE kind = ? ORDER BY updated_at DESC, id DESC LIMIT 1",
		ExamTemplateKindLab,
	).Scan(&t.ID, &t.Name, &t.CanvasW, &t.CanvasH, &raw, &t.IsActive, &t.Kind, &t.CreatedAt, &t.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrExamTemplateNotFound
	}
	if err != nil {
		return nil, err
	}
	t.Elements = json.RawMessage(raw)
	return &t, nil
}

// IsLabExamTemplate indica si la plantilla es la de la orden de laboratorio.
func IsLabExamTemplate(id int64) bool {
	var kind string
	if err := db.DB.QueryRow("SELECT kind FROM exam_templates WHERE id = ?", id).Scan(&kind); err != nil {
		return false
	}
	return kind == ExamTemplateKindLab
}

// LabOrderSheet: una orden de laboratorio llenada.
type LabOrderSheet struct {
	ID            int64           `json:"id"`
	ExamID        *int64          `json:"examId,omitempty"`
	TemplateID    int64           `json:"templateId"`
	PatientName   string          `json:"patientName"`
	PatientPhone  string          `json:"patientPhone"`
	UserID        *int64          `json:"userId,omitempty"`
	Data          json.RawMessage `json:"data"`
	CreatedByRole string          `json:"createdByRole"`
	CreatedByName string          `json:"createdByName"`
	CreatedAt     time.Time       `json:"createdAt"`
}

const labOrderSheetCols = "id, exam_id, template_id, patient_name, patient_phone, user_id, data, created_by_role, created_by_name, created_at"

func scanLabOrderSheet(sc interface{ Scan(...any) error }) (*LabOrderSheet, error) {
	var o LabOrderSheet
	var examID, userID sql.NullInt64
	var raw []byte
	if err := sc.Scan(&o.ID, &examID, &o.TemplateID, &o.PatientName, &o.PatientPhone, &userID, &raw, &o.CreatedByRole, &o.CreatedByName, &o.CreatedAt); err != nil {
		return nil, err
	}
	if examID.Valid {
		o.ExamID = &examID.Int64
	}
	if userID.Valid {
		o.UserID = &userID.Int64
	}
	o.Data = json.RawMessage(raw)
	return &o, nil
}

// CreateLabOrderSheet guarda una orden llenada.
func CreateLabOrderSheet(examID, templateID int64, patientName, patientPhone string, userID int64, data json.RawMessage, role string, byID int64, byName string) (*LabOrderSheet, error) {
	var exam, user any
	if examID > 0 {
		exam = examID
	}
	if userID > 0 {
		user = userID
	}
	if len(data) == 0 {
		data = json.RawMessage(`{}`)
	}
	res, err := db.DB.Exec(
		"INSERT INTO lab_order_sheets (exam_id, template_id, patient_name, patient_phone, user_id, data, created_by_role, created_by_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		exam, templateID, patientName, patientPhone, user, []byte(data), role, byID, byName,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return GetLabOrderSheet(id)
}

var ErrLabOrderSheetNotFound = errors.New("orden de laboratorio no encontrada")

// GetLabOrderSheet busca una orden por id.
func GetLabOrderSheet(id int64) (*LabOrderSheet, error) {
	o, err := scanLabOrderSheet(db.DB.QueryRow("SELECT "+labOrderSheetCols+" FROM lab_order_sheets WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrLabOrderSheetNotFound
	}
	return o, err
}

// ListLabOrderSheets: las órdenes, la más reciente primero; con examID > 0
// solo las de esa historia clínica.
func ListLabOrderSheets(examID int64) ([]LabOrderSheet, error) {
	q := "SELECT " + labOrderSheetCols + " FROM lab_order_sheets"
	args := []any{}
	if examID > 0 {
		q += " WHERE exam_id = ?"
		args = append(args, examID)
	}
	q += " ORDER BY created_at DESC, id DESC LIMIT 200"
	rows, err := db.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LabOrderSheet{}
	for rows.Next() {
		o, err := scanLabOrderSheet(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *o)
	}
	return out, rows.Err()
}
