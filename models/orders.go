package models

import (
	"errors"
	"time"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requires a MySQL table. Run this once against your database:
//
//	CREATE TABLE orders (
//	  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  order_code    VARCHAR(20) NOT NULL DEFAULT '',
//	  product_name  VARCHAR(120) NOT NULL,
//	  product_brand VARCHAR(80) NOT NULL DEFAULT '',
//	  quantity      INT NOT NULL DEFAULT 1,
//	  unit_price    DECIMAL(10,2) NOT NULL,
//	  total         DECIMAL(10,2) NOT NULL,
//	  rx_option     VARCHAR(120) NOT NULL DEFAULT '',
//	  rx_od         VARCHAR(20) NOT NULL DEFAULT '',
//	  rx_oi         VARCHAR(20) NOT NULL DEFAULT '',
//	  customer_name VARCHAR(120) NOT NULL DEFAULT '',
//	  status        VARCHAR(20) NOT NULL DEFAULT 'recibido',
//	  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);

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
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"createdAt"`
}

// ErrOrderNotFound is returned when no order matches the given id.
var ErrOrderNotFound = errors.New("pedido no encontrado")

// CreateOrder inserts a new order with status "recibido". No login is
// required to buy — anyone visiting the public site can call this
// through POST /api/pedidos.
//
// The order_code (prefix + number, e.g. "AVT-10489") comes from
// order_settings — editable from the "Configurar estados" panel.
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

// GetAllOrders returns every order, most recently created first — used
// by the admin Pedidos panel.
func GetAllOrders() ([]Order, error) {
	rows, err := db.DB.Query(
		`SELECT id, order_code, product_name, product_brand, quantity, unit_price, total,
		        rx_option, rx_od, rx_oi, customer_name, status, created_at
		 FROM orders ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.OrderCode, &o.ProductName, &o.ProductBrand, &o.Quantity, &o.UnitPrice, &o.Total,
			&o.RxOption, &o.RxOD, &o.RxOI, &o.CustomerName, &o.Status, &o.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, o)
	}
	return list, nil
}

// UpdateOrderStatus changes an order's status (e.g. to "enviado" when
// the admin ships it). Valid values: recibido, preparacion, enviado,
// camino, entregado (must match ORDER_STATUS_LABEL in pedidos.js).
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
