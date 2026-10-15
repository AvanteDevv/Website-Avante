package models

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"avante-optics/db"
)

// Orden de laboratorio ↔ trabajo del panel de Laboratorio.
//
// Si el trabajo tiene orders.lab_sheet_id, esa es su hoja. Si no, se busca
// sola: la orden de laboratorio más reciente del mismo cliente (mismo
// celular o mismo nombre) hecha antes del trabajo (o hasta 3 días después)
// y no más de 120 días antes.

// LabHojaRef — lo que el tablero necesita para poner el ícono.
type LabHojaRef struct {
	ID      int64     `json:"id"`
	Folio   int       `json:"folio,omitempty"`
	Fecha   time.Time `json:"fecha"`
	Patient string    `json:"paciente"`
	Auto    bool      `json:"auto"` // true = encontrada sola (no ligada a mano)
}

var ErrLabHojaNotFound = errors.New("orden de laboratorio no encontrada")

type labHojaRow struct {
	ref   LabHojaRef
	name  string
	phone string
}

func labHojasAll() ([]labHojaRow, error) {
	rows, err := db.DB.Query(`SELECT id, COALESCE(folio, 0), patient_name, patient_phone, created_at
		FROM lab_order_sheets WHERE kind = 'laboratorio' ORDER BY created_at DESC, id DESC LIMIT 3000`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []labHojaRow{}
	for rows.Next() {
		var h labHojaRow
		if err := rows.Scan(&h.ref.ID, &h.ref.Folio, &h.ref.Patient, &h.phone, &h.ref.Fecha); err != nil {
			return nil, err
		}
		h.name = NormalizePatientName(h.ref.Patient)
		h.phone = phoneTail(h.phone)
		out = append(out, h)
	}
	return out, rows.Err()
}

func attachLabHojas(list []LabOrder) {
	if len(list) == 0 {
		return
	}
	hojas, err := labHojasAll()
	if err != nil || len(hojas) == 0 {
		return
	}
	byID := map[int64]labHojaRow{}
	for _, h := range hojas {
		byID[h.ref.ID] = h
	}
	for i := range list {
		o := &list[i]
		if o.hojaID > 0 {
			if h, ok := byID[o.hojaID]; ok {
				r := h.ref
				o.Hoja = &r
			}
			continue
		}
		name := NormalizePatientName(o.CustomerName)
		if name == "" || strings.Contains(name, "publico en general") {
			name = ""
		}
		phone := phoneTail(o.clientPhone)
		if name == "" && len(phone) < 7 {
			continue
		}
		limitHi := o.CreatedAt.Add(72 * time.Hour)
		limitLo := o.CreatedAt.Add(-120 * 24 * time.Hour)
		for _, h := range hojas { // de la más nueva a la más vieja
			if h.ref.Fecha.After(limitHi) || h.ref.Fecha.Before(limitLo) {
				continue
			}
			if (len(phone) >= 7 && h.phone == phone) || (name != "" && h.name == name) {
				r := h.ref
				r.Auto = true
				o.Hoja = &r
				break
			}
		}
	}
}

// SearchLabHojas — órdenes de laboratorio recientes (para ligarlas a mano).
func SearchLabHojas(q string, limit int) ([]LabHojaRef, error) {
	hojas, err := labHojasAll()
	if err != nil {
		return nil, err
	}
	q = NormalizePatientName(q)
	out := []LabHojaRef{}
	for _, h := range hojas {
		if q != "" && !strings.Contains(h.name, q) && !strings.Contains(h.phone, q) {
			continue
		}
		out = append(out, h.ref)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

// SetOrderLabHoja liga (sheetID > 0) o desliga (0 = volver a la automática)
// la orden de laboratorio de un trabajo.
func SetOrderLabHoja(orderID, sheetID int64) error {
	var arg interface{}
	if sheetID > 0 {
		var n int
		if err := db.DB.QueryRow("SELECT COUNT(*) FROM lab_order_sheets WHERE id = ? AND kind = 'laboratorio'", sheetID).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return ErrLabHojaNotFound
		}
		arg = sheetID
	}
	res, err := db.DB.Exec("UPDATE orders SET lab_sheet_id = ? WHERE id = ?", arg, orderID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var x int
		if err := db.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE id = ?", orderID).Scan(&x); err == nil && x == 0 {
			return ErrOrderNotFound
		}
	}
	return nil
}

// GetLabHojaFull — la hoja con su plantilla (para dibujarla en el modal).
func GetLabHojaFull(id int64) (*LabOrderSheet, *ExamTemplate, error) {
	h, err := GetLabOrderSheet(id)
	if err != nil {
		return nil, nil, err
	}
	if h.Kind != "laboratorio" {
		return nil, nil, ErrLabHojaNotFound
	}
	t, err := GetExamTemplateByID(h.TemplateID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		t = nil
	}
	return h, t, nil
}
