package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Orden de laboratorio: la hoja que se llena justo después de la
// historia clínica (plantilla con kind = 'laboratorio'). Se guarda en
// lab_order_sheets, ligada al examen (exam_id) del que salió.

// Tipos de plantilla / hoja que se llenan después de la historia clínica.
const (
	ExamTemplateKindLab      = "laboratorio"
	ExamTemplateKindGarantia = "garantia"
)

// IsDocKind: tipos válidos de hoja después de la historia.
func IsDocKind(kind string) bool {
	return kind == ExamTemplateKindLab || kind == ExamTemplateKindGarantia
}

// GetLabExamTemplate: la plantilla de la orden de laboratorio.
func GetLabExamTemplate() (*ExamTemplate, error) { return GetExamTemplateByKind(ExamTemplateKindLab) }

// GetExamTemplateByKind: la plantilla de ese tipo (la más reciente si
// hubiera varias).
func GetExamTemplateByKind(kind string) (*ExamTemplate, error) {
	var t ExamTemplate
	var raw []byte
	err := db.DB.QueryRow(
		"SELECT id, name, canvas_w, canvas_h, elements, is_active, kind, created_at, updated_at FROM exam_templates WHERE kind = ? ORDER BY updated_at DESC, id DESC LIMIT 1",
		kind,
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

// IsLabExamTemplate indica si la plantilla es una de las que se llenan
// después de la historia (orden de laboratorio o garantía): esas no se
// activan como examen.
func IsLabExamTemplate(id int64) bool {
	var kind string
	if err := db.DB.QueryRow("SELECT kind FROM exam_templates WHERE id = ?", id).Scan(&kind); err != nil {
		return false
	}
	return kind != ""
}

// LabOrderSheet: una orden de laboratorio llenada.
type LabOrderSheet struct {
	ID            int64           `json:"id"`
	Kind          string          `json:"kind"` // "laboratorio" | "garantia"
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

const labOrderSheetCols = "id, kind, exam_id, template_id, patient_name, patient_phone, user_id, data, created_by_role, created_by_name, created_at"

func scanLabOrderSheet(sc interface{ Scan(...any) error }) (*LabOrderSheet, error) {
	var o LabOrderSheet
	var examID, userID sql.NullInt64
	var raw []byte
	if err := sc.Scan(&o.ID, &o.Kind, &examID, &o.TemplateID, &o.PatientName, &o.PatientPhone, &userID, &raw, &o.CreatedByRole, &o.CreatedByName, &o.CreatedAt); err != nil {
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
func CreateLabOrderSheet(kind string, examID, templateID int64, patientName, patientPhone string, userID int64, data json.RawMessage, role string, byID int64, byName string) (*LabOrderSheet, error) {
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
		"INSERT INTO lab_order_sheets (kind, exam_id, template_id, patient_name, patient_phone, user_id, data, created_by_role, created_by_id, created_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		kind, exam, templateID, patientName, patientPhone, user, []byte(data), role, byID, byName,
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
func ListLabOrderSheets(examID int64, kind string) ([]LabOrderSheet, error) {
	q := "SELECT " + labOrderSheetCols + " FROM lab_order_sheets WHERE 1=1"
	args := []any{}
	if examID > 0 {
		q += " AND exam_id = ?"
		args = append(args, examID)
	}
	if kind != "" {
		q += " AND kind = ?"
		args = append(args, kind)
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

// GarantiasResumen: las garantías del periodo [from, to), cuántas lleva
// cada optometrista (por quien la llenó). Cuentan las hojas de garantía
// marcadas como GARANTÍA; las marcadas como REPARACIÓN se cuentan aparte.
type GarantiasResumen struct {
	Total           int            `json:"total"`
	Reparaciones    int            `json:"reparaciones"`
	PorOptometrista map[string]int `json:"porOptometrista"`
}

func GetGarantiasResumen(from, to time.Time) (*GarantiasResumen, error) {
	rows, err := db.DB.Query(
		"SELECT created_by_name, data FROM lab_order_sheets WHERE kind = ? AND created_at >= ? AND created_at < ?",
		ExamTemplateKindGarantia, from, to,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := &GarantiasResumen{PorOptometrista: map[string]int{}}
	for rows.Next() {
		var who string
		var raw []byte
		if err := rows.Scan(&who, &raw); err != nil {
			return nil, err
		}
		if isReparacion(raw) {
			out.Reparaciones++
			continue
		}
		out.Total++
		if who == "" {
			who = "Sin nombre"
		}
		out.PorOptometrista[who]++
	}
	return out, rows.Err()
}

// isReparacion: el TIPO marcado en la hoja es REPARACIÓN (y no GARANTÍA).
// Si no se marcó nada, cuenta como garantía (es el documento de garantía).
func isReparacion(raw []byte) bool {
	var d struct {
		Fields map[string]string `json:"fields"`
	}
	if json.Unmarshal(raw, &d) != nil {
		return false
	}
	t := strings.ToUpper(d.Fields["tipo"])
	return strings.Contains(t, "REPARACI") && !strings.Contains(t, "GARANT")
}
