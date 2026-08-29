package models

import (
	"database/sql"
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// This file assumes the "orders" table already exists (created earlier
// without a user link). Run this ALTER once against your database to
// add the new column used by "Mis pedidos":
//
//	ALTER TABLE orders ADD COLUMN user_id BIGINT NULL AFTER customer_name;
//	ALTER TABLE orders ADD INDEX idx_orders_user_id (user_id);
//
// user_id stays NULL for guest purchases (no login required to buy —
// see CreateOrder below). Those orders simply won't show up under any
// account's "Mis pedidos" until AttachOrderToUser is called for them.

// Order represents a purchase made from the public product page
// (detalle-producto.html / detalle-producto.js).
type Order struct {
	ID           int64     `json:"id"`
	OrderCode    string    `json:"orderCode"`
	ProductName  string    `json:"productName"`
	ProductBrand string    `json:"productBrand"`
	Quantity     int       `json:"quantity"`
	UnitPrice    float64   `json:"unitPrice"`
	Total        float64   `json:"total"`
	RxOption     string    `json:"rxOption"`
	RxOD         string    `json:"rxOD"`
	RxOI         string    `json:"rxOI"`
	CustomerName string    `json:"customerName"`
	UserID       *int64    `json:"userId,omitempty"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"createdAt"`
}

// ErrOrderNotFound is returned when no order matches the given id.
var ErrOrderNotFound = errors.New("pedido no encontrado")

// CreateOrder inserts a new order with status "recibido". No login is
// required to buy — anyone visiting the public site can call this
// through POST /api/pedidos. Unchanged from before: it does NOT take a
// userID, so it keeps working with your existing checkout handler
// as-is. If the buyer happens to be logged in, call AttachOrderToUser
// right after this succeeds (see below) to link the order to their
// account so it shows up in "Mis pedidos".
func CreateOrder(productName, productBrand string, quantity int, unitPrice float64, rxOption, rxOD, rxOI, customerName string) (*Order, error) {
	total := unitPrice * float64(quantity)

	result, err := db.DB.Exec(
		`INSERT INTO orders
			(product_name, product_brand, quantity, unit_price, total, rx_option, rx_od, rx_oi, customer_name, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido')`,
		productName, productBrand, quantity, unitPrice, total, rxOption, rxOD, rxOI, customerName,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	code, err := nextOrderCode()
	if err != nil {
		return nil, err
	}
	if _, err := db.DB.Exec("UPDATE orders SET order_code = ? WHERE id = ?", code, id); err != nil {
		return nil, err
	}

	return &Order{
		ID: id, OrderCode: code, ProductName: productName, ProductBrand: productBrand,
		Quantity: quantity, UnitPrice: unitPrice, Total: total,
		RxOption: rxOption, RxOD: rxOD, RxOI: rxOI, CustomerName: customerName,
		Status: "recibido", CreatedAt: time.Now(),
	}, nil
}

// AttachOrderToUser links an already-created order to a logged-in
// account. Call this from your checkout handler right after
// CreateOrder succeeds, ONLY if the request has a valid session:
//
//	order, err := models.CreateOrder(...)
//	if err == nil {
//	    if userID, ok := getSessionUserID(c); ok {
//	        _ = models.AttachOrderToUser(order.ID, userID) // best-effort, don't fail the purchase over this
//	    }
//	}
func AttachOrderToUser(orderID int64, userID int64) error {
	_, err := db.DB.Exec("UPDATE orders SET user_id = ? WHERE id = ?", userID, orderID)
	return err
}

// GetAllOrders returns every order, most recently created first — used
// by the admin Pedidos panel.
func GetAllOrders() ([]Order, error) {
	rows, err := db.DB.Query(
		`SELECT id, order_code, product_name, product_brand, quantity, unit_price, total,
		        rx_option, rx_od, rx_oi, customer_name, user_id, status, created_at
		 FROM orders ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanOrders(rows)
}

// GetOrdersByUserID returns every order linked to a given account,
// most recently created first — used by the client "Mis pedidos" view
// (GET /api/mis-pedidos). Guest orders (user_id IS NULL) never show up
// here, even if the customer_name/email happen to match.
func GetOrdersByUserID(userID int64) ([]Order, error) {
	rows, err := db.DB.Query(
		`SELECT id, order_code, product_name, product_brand, quantity, unit_price, total,
		        rx_option, rx_od, rx_oi, customer_name, user_id, status, created_at
		 FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanOrders(rows)
}

// GetOrderByCode busca UN pedido por su código público (ej. "AVT-10499"),
// sin importar a qué cuenta pertenece ni si tiene user_id — es la
// consulta que usa el widget público de rastreo (GET /api/rastreo),
// que no requiere sesión. Regresa ErrOrderNotFound si no existe.
func GetOrderByCode(code string) (*Order, error) {
	row := db.DB.QueryRow(
		`SELECT id, order_code, product_name, product_brand, quantity, unit_price, total,
		        rx_option, rx_od, rx_oi, customer_name, user_id, status, created_at
		 FROM orders WHERE order_code = ?`,
		code,
	)

	var o Order
	var userID sql.NullInt64

	err := row.Scan(
		&o.ID, &o.OrderCode, &o.ProductName, &o.ProductBrand, &o.Quantity, &o.UnitPrice, &o.Total,
		&o.RxOption, &o.RxOD, &o.RxOI, &o.CustomerName, &userID, &o.Status, &o.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, ErrOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	if userID.Valid {
		o.UserID = &userID.Int64
	}

	return &o, nil
}

// scanOrders reads rows from either query above into []Order.
func scanOrders(rows *sql.Rows) ([]Order, error) {
	var list []Order
	for rows.Next() {
		var o Order
		var userID sql.NullInt64
		if err := rows.Scan(&o.ID, &o.OrderCode, &o.ProductName, &o.ProductBrand, &o.Quantity, &o.UnitPrice, &o.Total,
			&o.RxOption, &o.RxOD, &o.RxOI, &o.CustomerName, &userID, &o.Status, &o.CreatedAt); err != nil {
			return nil, err
		}
		if userID.Valid {
			o.UserID = &userID.Int64
		}
		list = append(list, o)
	}
	return list, nil
}

// UpdateOrderStatus changes an order's status (e.g. to "enviado" when
// the admin ships it). Valid values are whatever status_key's exist in
// order_statuses (configurable from the admin gear icon).
func UpdateOrderStatus(id int64, status string) error {
	result, err := db.DB.Exec("UPDATE orders SET status = ? WHERE id = ?", status, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrOrderNotFound
	}
	return nil
}

// DeleteOrder removes an order.
func DeleteOrder(id int64) error {
	result, err := db.DB.Exec("DELETE FROM orders WHERE id = ?", id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrOrderNotFound
	}
	return nil
}
