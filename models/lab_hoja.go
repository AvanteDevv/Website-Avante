package models

import (
	"database/sql"
	"errors"
	"strconv"
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

// Estatus que solo pone recepción ("Listo para la entrega" y los que van
// después, como "Entregado"): el laboratorio no los ve.
func RecepcionOnlyStatuses(all []OrderStatus) map[string]bool {
	out := map[string]bool{}
	cut := -1
	for _, s := range all {
		if s.Key == "listo_entrega" {
			cut = s.SortOrder
		}
	}
	for _, s := range all {
		l := NormalizePatientName(s.Label)
		if s.Key == "listo_entrega" || s.Key == "entregado" || (cut >= 0 && s.SortOrder >= cut) ||
			strings.Contains(l, "entregad") || strings.Contains(l, "listo para la entrega") {
			out[s.Key] = true
		}
	}
	return out
}

// SetOrderLabExterno marca / desmarca "laboratorio externo".
func SetOrderLabExterno(orderID int64, on bool) error {
	res, err := db.DB.Exec("UPDATE orders SET lab_externo = ? WHERE id = ?", on, orderID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var x int
		if db.DB.QueryRow("SELECT COUNT(*) FROM orders WHERE id = ?", orderID).Scan(&x) == nil && x == 0 {
			return ErrOrderNotFound
		}
	}
	return nil
}

/* ---------- ventas que esperan su orden de laboratorio (optometrista) ---------- */

// VentaPendienteOrden — una venta de recepción con pedido que todavía no
// tiene orden de laboratorio.
type VentaPendienteOrden struct {
	PedidoID   int64     `json:"pedidoId"`
	Code       string    `json:"code"`
	Folio      int64     `json:"folio"`
	Cliente    string    `json:"cliente"`
	Celular    string    `json:"celular"`
	Productos  []string  `json:"productos"`
	Total      float64   `json:"total"`
	Cajero     string    `json:"cajero"`
	Fecha      time.Time `json:"fecha"`
	TicketPath string    `json:"ticketPath"`
}

// ListVentasPendientesOrden — ventas (no canceladas, de los últimos 60
// días) cuyo pedido no tiene orden de laboratorio ni se marcó "sin orden".
func ListVentasPendientesOrden() ([]VentaPendienteOrden, error) {
	list, err := ListLabOrders()
	if err != nil {
		return nil, err
	}
	desde := time.Now().AddDate(0, 0, -60)
	ids := []int64{}
	byID := map[int64]*LabOrder{}
	for i := range list {
		o := &list[i]
		if o.PosSaleID == 0 || o.Hoja != nil || o.SinHoja || o.CreatedAt.Before(desde) {
			continue
		}
		ids = append(ids, o.ID)
		byID[o.ID] = o
	}
	out := []VentaPendienteOrden{}
	for _, id := range ids {
		o := byID[id]
		var v VentaPendienteOrden
		var cancelada bool
		err := db.DB.QueryRow(`SELECT s.id, s.cliente, COALESCE(c.celular, ''), s.total, s.cajero, s.created_at, s.cancelada
			FROM pos_sales s LEFT JOIN pos_clients c ON c.id = s.client_id WHERE s.id = ?`, o.PosSaleID).
			Scan(&v.Folio, &v.Cliente, &v.Celular, &v.Total, &v.Cajero, &v.Fecha, &cancelada)
		if err != nil || cancelada {
			continue
		}
		v.PedidoID, v.Code = o.ID, o.OrderCode
		rows, err := db.DB.Query(`SELECT it.cantidad, it.descripcion FROM pos_sale_items it
			LEFT JOIN inventory_items inv ON inv.id = it.inventory_id WHERE it.sale_id = ? ORDER BY it.id`, v.Folio)
		if err == nil {
			for rows.Next() {
				var q int
				var d string
				if rows.Scan(&q, &d) == nil {
					if q > 1 {
						d = strconv.Itoa(q) + " × " + d
					}
					v.Productos = append(v.Productos, d)
				}
			}
			rows.Close()
		}
		out = append(out, v)
	}
	return out, nil
}

// MarkPedidoSinHoja — la venta no lleva orden de laboratorio.
func MarkPedidoSinHoja(orderID int64) error {
	_, err := db.DB.Exec("UPDATE orders SET lab_sin_hoja = 1 WHERE id = ? AND pos_sale_id IS NOT NULL", orderID)
	return err
}
