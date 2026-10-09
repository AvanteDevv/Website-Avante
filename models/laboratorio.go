package models

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Panel de Laboratorio. Los "trabajos" son los mismos pedidos de la
// tabla orders: al cambiar aquí el estado, cambia igual en Admin →
// Pedidos y en la página pública de Rastreo (las tres leen la misma
// fila). El laboratorio también puede dar de alta un trabajo tomando
// el producto del inventario (orders.inventory_id).

/* ---------- Cuenta ---------- */

// LabUser es una cuenta del panel de Laboratorio (/laboratorio/…).
type LabUser struct {
	ID           int64
	Name         string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

var ErrLabUserNotFound = errors.New("usuario de laboratorio no encontrado")

// GetLabUserByEmail busca la cuenta por correo (sin importar mayúsculas ni espacios).
func GetLabUserByEmail(email string) (*LabUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u LabUser
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM lab_users WHERE email = ?", email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrLabUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

/* ---------- Trabajos (pedidos) ---------- */

// LabOrder: un pedido con lo que necesita ver el laboratorio.
type LabOrder struct {
	Order
	InventoryID  int64      `json:"inventoryId,omitempty"`
	Clave        string     `json:"clave,omitempty"`
	Existencia   *int       `json:"existencia,omitempty"`
	Departamento string     `json:"departamento,omitempty"`
	LabNotes     string     `json:"labNotes"`
	Origen       string     `json:"origen"` // "tienda" | "laboratorio"
	LastBy       string     `json:"lastBy,omitempty"`
	LastRole     string     `json:"lastRole,omitempty"`
	LastAt       *time.Time `json:"lastAt,omitempty"`
}

// ListLabOrders: todos los pedidos, el más reciente primero, con su
// artículo de inventario (si tiene) y el último cambio de estado.
func ListLabOrders() ([]LabOrder, error) {
	rows, err := db.DB.Query(`
		SELECT o.id, COALESCE(o.order_code, ''), o.product_name, COALESCE(o.product_brand, ''), o.quantity, o.unit_price, o.total,
		       COALESCE(o.rx_option, ''), COALESCE(o.rx_od, ''), COALESCE(o.rx_oi, ''), COALESCE(o.customer_name, ''), o.user_id, o.status, o.created_at,
		       COALESCE(o.inventory_id, 0), COALESCE(o.lab_notes, ''),
		       COALESCE(i.clave, ''), i.cantidad_actual, COALESCE(d.nombre, ''),
		       h.changed_by, h.changed_role, h.created_at
		FROM orders o
		LEFT JOIN inventory_items i ON i.id = o.inventory_id
		LEFT JOIN inv_departamentos d ON d.id = i.departamento_id
		LEFT JOIN order_status_history h ON h.id = (
			SELECT h2.id FROM order_status_history h2 WHERE h2.order_id = o.id ORDER BY h2.created_at DESC, h2.id DESC LIMIT 1
		)
		ORDER BY o.created_at DESC, o.id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []LabOrder{}
	for rows.Next() {
		var o LabOrder
		var userID sql.NullInt64
		var exist sql.NullInt64
		var lastBy, lastRole sql.NullString
		var lastAt sql.NullTime
		if err := rows.Scan(
			&o.ID, &o.OrderCode, &o.ProductName, &o.ProductBrand, &o.Quantity, &o.UnitPrice, &o.Total,
			&o.RxOption, &o.RxOD, &o.RxOI, &o.CustomerName, &userID, &o.Status, &o.CreatedAt,
			&o.InventoryID, &o.LabNotes, &o.Clave, &exist, &o.Departamento,
			&lastBy, &lastRole, &lastAt,
		); err != nil {
			return nil, err
		}
		if userID.Valid {
			o.UserID = &userID.Int64
		}
		if exist.Valid {
			n := int(exist.Int64)
			o.Existencia = &n
		}
		o.Origen = "tienda"
		if o.InventoryID > 0 {
			o.Origen = "laboratorio"
		}
		o.LastBy, o.LastRole = lastBy.String, lastRole.String
		if lastAt.Valid {
			t := lastAt.Time
			o.LastAt = &t
		}
		list = append(list, o)
	}
	return list, rows.Err()
}

// IsOrderStatus indica si la clave existe en los estados configurados.
func IsOrderStatus(key string) bool {
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM order_statuses WHERE status_key = ?", key).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

// AddOrderStatusHistory guarda quién cambió el estado (best-effort).
func AddOrderStatusHistory(orderID int64, status, by, role string) {
	_, _ = db.DB.Exec(
		"INSERT INTO order_status_history (order_id, status, changed_by, changed_role) VALUES (?, ?, ?, ?)",
		orderID, status, by, role,
	)
}

// SetOrderStatusBy cambia el estado y deja constancia de quién lo hizo.
// Si ya tenía ese estado no hace nada (y no es error).
func SetOrderStatusBy(id int64, status, by, role string) error {
	var cur string
	err := db.DB.QueryRow("SELECT status FROM orders WHERE id = ?", id).Scan(&cur)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrOrderNotFound
	}
	if err != nil {
		return err
	}
	if cur == status {
		return nil
	}
	if err := UpdateOrderStatus(id, status); err != nil {
		return err
	}
	AddOrderStatusHistory(id, status, by, role)
	return nil
}

// OrderHistoryEntry: un cambio de estado.
type OrderHistoryEntry struct {
	Status string    `json:"status"`
	By     string    `json:"by"`
	Role   string    `json:"role"`
	At     time.Time `json:"at"`
}

// ListOrderHistory: los cambios de estado de un pedido, el más reciente primero.
func ListOrderHistory(orderID int64) ([]OrderHistoryEntry, error) {
	rows, err := db.DB.Query(
		"SELECT status, changed_by, changed_role, created_at FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
		orderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OrderHistoryEntry{}
	for rows.Next() {
		var h OrderHistoryEntry
		if err := rows.Scan(&h.Status, &h.By, &h.Role, &h.At); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// SetOrderLabNotes guarda las notas del laboratorio de un pedido.
func SetOrderLabNotes(id int64, notes string) error {
	res, err := db.DB.Exec("UPDATE orders SET lab_notes = ? WHERE id = ?", notes, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Puede ser que las notas no cambiaron; se revisa que exista.
		var x int
		if err := db.DB.QueryRow("SELECT 1 FROM orders WHERE id = ?", id).Scan(&x); err != nil {
			return ErrOrderNotFound
		}
	}
	return nil
}

// LabOrderInput: lo que captura el laboratorio al dar de alta un trabajo.
type LabOrderInput struct {
	InventoryID  int64  `json:"inventoryId"`
	Quantity     int    `json:"quantity"`
	CustomerName string `json:"customerName"`
	RxOD         string `json:"rxOD"`
	RxOI         string `json:"rxOI"`
	Notes        string `json:"notes"`
}

var ErrInvArticuloNotFound = errors.New("ese artículo ya no está en el inventario")

// CreateLabOrder da de alta un trabajo (pedido) con el producto del
// inventario: nombre, departamento y precio salen del artículo. El
// pedido recibe su código (AVT-…) igual que los de la tienda, así el
// cliente lo puede rastrear y el admin lo ve en Pedidos. No descuenta
// existencia (eso lo hace la venta en Punto de venta).
func CreateLabOrder(in LabOrderInput, by, role string) (*Order, error) {
	a, err := GetInvArticulo(in.InventoryID)
	if err != nil || a == nil {
		return nil, ErrInvArticuloNotFound
	}
	if in.Quantity < 1 {
		in.Quantity = 1
	}
	brand := a.Departamento
	if a.Categoria != "" {
		if brand != "" {
			brand += " · "
		}
		brand += a.Categoria
	}
	rxOption := "Sin graduación"
	if strings.TrimSpace(in.RxOD) != "" || strings.TrimSpace(in.RxOI) != "" {
		rxOption = "Graduación del laboratorio"
	}
	o, err := CreateOrder(a.Descripcion, brand, in.Quantity, a.Precio1, rxOption, strings.TrimSpace(in.RxOD), strings.TrimSpace(in.RxOI), strings.TrimSpace(in.CustomerName))
	if err != nil {
		return nil, err
	}
	if _, err := db.DB.Exec("UPDATE orders SET inventory_id = ?, lab_notes = ? WHERE id = ?", a.ID, strings.TrimSpace(in.Notes), o.ID); err != nil {
		return nil, err
	}
	AddOrderStatusHistory(o.ID, o.Status, by, role)
	return o, nil
}
