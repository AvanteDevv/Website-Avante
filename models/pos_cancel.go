package models

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"avante-optics/db"
)

// Cancelar una venta del Punto de venta (como "Ventas canceladas" de SICAR):
//   - regresa al inventario lo que se vendió (y sus números de rastreo
//     vuelven a quedar disponibles), con su renglón en el kárdex;
//   - el crédito de esa venta queda en 0 (si tenía abonos vivos, primero
//     hay que cancelarlos);
//   - el dinero sale de la caja en el corte en el que se cancela.

var (
	ErrPosVentaCancelada  = errors.New("esa venta ya estaba cancelada")
	ErrPosVentaConAbonos  = errors.New("esa venta tiene abonos: primero cancela los abonos en Punto de venta → Créditos y abonos")
	ErrPosMotivoRequerido = errors.New("escribe el motivo de la cancelación")
)

// CancelPosSale cancela la venta.
func CancelPosSale(folio int64, por, motivo string) error {
	motivo = cut(strings.TrimSpace(motivo), 200)
	if motivo == "" {
		return ErrPosMotivoRequerido
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var cancelada bool
	err = tx.QueryRow("SELECT cancelada FROM pos_sales WHERE id = ? FOR UPDATE", folio).Scan(&cancelada)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrPosSaleNotFound
	}
	if err != nil {
		return err
	}
	if cancelada {
		return ErrPosVentaCancelada
	}
	var abonos int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM pos_credit_payments p JOIN pos_credits cr ON cr.id = p.credit_id
		WHERE cr.sale_id = ? AND p.cancelado = 0`, folio).Scan(&abonos); err != nil {
		return err
	}
	if abonos > 0 {
		return ErrPosVentaConAbonos
	}
	now := posNow()

	// Regresar al inventario (los servicios no llevan existencia).
	rows, err := tx.Query(`SELECT it.inventory_id, it.cantidad FROM pos_sale_items it
		JOIN inventory_items inv ON inv.id = it.inventory_id
		WHERE it.sale_id = ? AND inv.servicio = 0`, folio)
	if err != nil {
		return err
	}
	type back struct {
		id   int64
		cant int
	}
	var items []back
	for rows.Next() {
		var b back
		if err := rows.Scan(&b.id, &b.cant); err != nil {
			rows.Close()
			return err
		}
		items = append(items, b)
	}
	rows.Close()
	for _, b := range items {
		var antes int
		if err := tx.QueryRow("SELECT cantidad_actual FROM inventory_items WHERE id = ? FOR UPDATE", b.id).Scan(&antes); err != nil {
			return err
		}
		if _, err := tx.Exec("UPDATE inventory_items SET cantidad_actual = cantidad_actual + ? WHERE id = ?", b.cant, b.id); err != nil {
			return err
		}
		if _, err := tx.Exec(`INSERT INTO inv_movimientos (item_id, tipo, cantidad, existencia_antes, existencia_despues, venta_id, comentario, usuario, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, b.id, InvMovEntrada, b.cant, antes, antes+b.cant, folio,
			fmt.Sprintf("Cancelación del ticket %d", folio), por, now); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`UPDATE inv_piezas SET estado = 'disponible', venta_id = NULL, salida_at = NULL
		WHERE venta_id = ? AND estado = 'vendida'`, folio); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE pos_credits SET saldo = 0 WHERE sale_id = ?", folio); err != nil {
		return err
	}
	if _, err := tx.Exec("UPDATE pos_sales SET cancelada = 1, cancelada_at = ?, cancelada_por = ?, cancel_motivo = ? WHERE id = ?",
		now, por, motivo, folio); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	// El pedido de la venta (clave de rastreo) queda como cancelado si ese
	// estatus existe en Laboratorio.
	if p, err := GetPosPedido(folio); err == nil && p != nil {
		for _, st := range []string{"cancelado", "cancelada"} {
			if IsOrderStatus(st) {
				_ = SetOrderStatusBy(p.ID, st, por, "recepcion")
				break
			}
		}
	}
	return nil
}
