package models

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"avante-optics/db"
)

// Cada venta (compra) del Punto de venta que lleva productos abre un
// pedido con UNA clave de rastreo. No cuentan los servicios ni los
// artículos marcados "sin clave de rastreo" (microfibra, estuche…): si la
// venta solo trae esos, no se crea clave. Abre un pedido en "orders" con su clave de rastreo (la misma que usa
// la página pública de Rastreo y el panel de Laboratorio). Así:
//   - la clave sale en el ticket y el cliente consulta cómo va su trabajo,
//   - el laboratorio le cambia el estatus,
//   - en Ventas se ve ese estatus en cada ticket.

// PosPedido — el pedido de una venta.
type PosPedido struct {
	ID     int64  `json:"id"`
	Code   string `json:"code"`
	Status string `json:"status"`
}

var ErrPosPedidoSinProductos = errors.New("esta venta solo tiene servicios o artículos sin clave de rastreo: no lleva pedido")

// GetPosPedido — el pedido de esa venta (nil si no tiene).
func GetPosPedido(saleID int64) (*PosPedido, error) {
	var p PosPedido
	err := db.DB.QueryRow("SELECT id, COALESCE(order_code, ''), status FROM orders WHERE pos_sale_id = ? ORDER BY id LIMIT 1", saleID).
		Scan(&p.ID, &p.Code, &p.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// firstOrderStatus — "recibido" si existe; si no, el primero configurado.
func firstOrderStatus() string {
	if IsOrderStatus("recibido") {
		return "recibido"
	}
	var k string
	if err := db.DB.QueryRow("SELECT status_key FROM order_statuses ORDER BY sort_order ASC, id ASC LIMIT 1").Scan(&k); err == nil && k != "" {
		return k
	}
	return "recibido"
}

// CreatePosPedido abre el pedido de la venta (si ya tiene, regresa ese).
func CreatePosPedido(saleID int64, by string) (*PosPedido, error) {
	if p, err := GetPosPedido(saleID); err != nil || p != nil {
		return p, err
	}
	var cliente string
	if err := db.DB.QueryRow("SELECT cliente FROM pos_sales WHERE id = ?", saleID).Scan(&cliente); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrPosSaleNotFound
		}
		return nil, err
	}
	rows, err := db.DB.Query(`
		SELECT COALESCE(it.inventory_id, 0), it.descripcion, it.cantidad, it.importe
		FROM pos_sale_items it
		LEFT JOIN inventory_items inv ON inv.id = it.inventory_id
		WHERE it.sale_id = ? AND COALESCE(inv.servicio, 0) = 0 AND COALESCE(inv.sin_rastreo, 0) = 0
		ORDER BY it.id`, saleID)
	if err != nil {
		return nil, err
	}
	var names []string
	var firstInv int64
	total := 0.0
	for rows.Next() {
		var invID int64
		var desc string
		var cant int
		var imp float64
		if err := rows.Scan(&invID, &desc, &cant, &imp); err != nil {
			rows.Close()
			return nil, err
		}
		if firstInv == 0 {
			firstInv = invID
		}
		if cant > 1 {
			desc = fmt.Sprintf("%d × %s", cant, desc)
		}
		names = append(names, desc)
		total += imp
	}
	rows.Close()
	if len(names) == 0 {
		return nil, ErrPosPedidoSinProductos
	}
	name := strings.Join(names, " + ")
	if r := []rune(name); len(r) > 250 {
		name = string(r[:247]) + "…"
	}
	status := firstOrderStatus()
	var invArg interface{}
	if firstInv > 0 {
		invArg = firstInv
	}
	res, err := db.DB.Exec(
		`INSERT INTO orders (product_name, product_brand, quantity, unit_price, total, rx_option, rx_od, rx_oi, customer_name, status, inventory_id, lab_notes, pos_sale_id)
		 VALUES (?, 'Punto de venta', ?, ?, ?, 'Venta en tienda', '', '', ?, ?, ?, ?, ?)`,
		name, 1, round2(total), round2(total), cliente, status, invArg, fmt.Sprintf("Ticket %d", saleID), saleID,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	// La clave de rastreo del pedido es el número de rastreo de la primera
	// pieza vendida (AVT000061): así el cliente y recepción manejan UNA sola
	// clave. Si la venta no tiene piezas numeradas, se usa una clave nueva.
	var code string
	_ = db.DB.QueryRow(`SELECT p.numero FROM inv_piezas p
		WHERE p.venta_id = ? AND p.numero IS NOT NULL
		  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_code = p.numero)
		ORDER BY p.id LIMIT 1`, saleID).Scan(&code)
	if code == "" {
		if code, err = nextOrderCode(); err != nil {
			return nil, err
		}
	}
	if _, err := db.DB.Exec("UPDATE orders SET order_code = ? WHERE id = ?", code, id); err != nil {
		return nil, err
	}
	AddOrderStatusHistory(id, status, by, "recepcion")
	return &PosPedido{ID: id, Code: code, Status: status}, nil
}

// SetPosPedidoStatus cambia el estatus del pedido de la venta.
func SetPosPedidoStatus(saleID int64, status, by string) (*PosPedido, error) {
	p, err := GetPosPedido(saleID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrOrderNotFound
	}
	if err := SetOrderStatusBy(p.ID, status, by, "recepcion"); err != nil {
		return nil, err
	}
	p.Status = status
	return p, nil
}

// PosClientPhone — celular del cliente de la venta ("" si es público en general).
func PosClientPhone(clientID int64) string {
	if clientID <= 0 {
		return ""
	}
	var cel string
	_ = db.DB.QueryRow("SELECT celular FROM pos_clients WHERE id = ?", clientID).Scan(&cel)
	return cel
}

// OrderCodeForPieza — si "numero" es el número de rastreo de una pieza
// vendida en el Punto de venta, regresa la clave del pedido de esa venta
// (para que en Rastreo funcione cualquiera de las piezas del ticket).
func OrderCodeForPieza(numero string) string {
	var code string
	_ = db.DB.QueryRow(`SELECT o.order_code FROM inv_piezas p
		JOIN orders o ON o.pos_sale_id = p.venta_id
		WHERE p.numero = ? AND o.order_code IS NOT NULL
		ORDER BY o.id LIMIT 1`, strings.ToUpper(strings.TrimSpace(numero))).Scan(&code)
	return code
}
