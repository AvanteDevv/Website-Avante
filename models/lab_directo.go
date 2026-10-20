package models

import (
	"strings"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Orden de laboratorio SIN venta. Es el segundo camino, independiente del
// de Punto de venta → Optometrista → Laboratorio (ese sigue igual):
// cuando el optometrista guarda una orden de laboratorio que no viene de
// una venta, se crea su trabajo en el tablero del laboratorio
// (orders.lab_directo = 1, ligado con lab_sheet_id). No lleva clave de
// rastreo (order_code queda vacío), por eso no sale en Admin → Pedidos
// ni en Rastreo.

const labDirectoProducto = "Orden de laboratorio"

// CreateDirectLabJob — crea el trabajo de una orden de laboratorio hecha
// sin venta. Regresa el id del trabajo.
func CreateDirectLabJob(sheet *LabOrderSheet, by, role string) (int64, error) {
	name := strings.TrimSpace(sheet.PatientName)
	res, err := db.DB.Exec(
		`INSERT INTO orders
			(product_name, product_brand, quantity, unit_price, total, rx_option, rx_od, rx_oi, customer_name, status, lab_sheet_id, lab_directo)
		 VALUES (?, '', 1, 0, 0, '', '', '', ?, 'recibido', ?, 1)`,
		labDirectoProducto, name, sheet.ID,
	)
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	AddOrderStatusHistory(id, "recibido", by, role)
	return id, nil
}

// SyncDirectLabJob — al editar la orden, el trabajo toma el nombre nuevo
// del paciente.
func SyncDirectLabJob(sheetID int64, patientName string) {
	_, _ = db.DB.Exec("UPDATE orders SET customer_name = ? WHERE lab_sheet_id = ? AND lab_directo = 1",
		strings.TrimSpace(patientName), sheetID)
}

// DeleteDirectLabJob — si se borra la orden, se va también su trabajo
// (solo el que salió de ella; los de una venta no se tocan).
func DeleteDirectLabJob(sheetID int64) {
	var ids []int64
	rows, err := db.DB.Query("SELECT id FROM orders WHERE lab_sheet_id = ? AND lab_directo = 1", sheetID)
	if err != nil {
		return
	}
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		_, _ = db.DB.Exec("DELETE FROM order_status_history WHERE order_id = ?", id)
		_, _ = db.DB.Exec("DELETE FROM orders WHERE id = ?", id)
	}
}
