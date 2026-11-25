package models

import (
	"database/sql"
	"log"
	"strconv"
	"strings"
	"time"

	"avante-optics/db"
)

// MOVIMIENTOS BORRADOS: cada vez que el admin borra movimientos del
// kárdex (Movimientos) o un ticket de prueba (Ventas) queda una copia de
// lo que se quitó, quién lo hizo, cuándo y si se deshizo la existencia.
// Se ve en Movimientos → «Borrados» (solo admin).

// logInvMovBorrados copia (dentro de la misma transacción, antes de
// borrar) los movimientos y tickets que se van a quitar. Regresa el lote
// ("" si no se pudo guardar: el borrado sigue igual).
func logInvMovBorrados(tx *sql.Tx, movs, ventas []interface{}, revertir bool, quien, desde string) string {
	lote := strconv.FormatInt(time.Now().UnixNano(), 36)
	now := invNow()
	if len(movs) > 0 {
		ph := strings.TrimSuffix(strings.Repeat("?,", len(movs)), ",")
		args := append([]interface{}{lote, revertir, quien, desde, now}, movs...)
		if _, err := tx.Exec(`INSERT INTO inv_mov_borrados
			(lote, mov_id, item_id, clave, descripcion, tipo, cantidad, existencia_antes, existencia_despues,
			 venta_id, comentario, usuario, mov_fecha, exist_hoy, revertido, borrado_por, borrado_desde, borrado_at)
			SELECT ?, m.id, m.item_id, COALESCE(i.clave, ''), COALESCE(i.descripcion, ''), m.tipo, m.cantidad,
			       m.existencia_antes, m.existencia_despues, m.venta_id, m.comentario, m.usuario, m.created_at,
			       i.cantidad_actual, ?, ?, ?, ?
			FROM inv_movimientos m LEFT JOIN inventory_items i ON i.id = m.item_id
			WHERE m.id IN (`+ph+`)`, args...); err != nil {
			log.Printf("inventario: no se pudo guardar el registro de movimientos borrados: %v", err)
			return ""
		}
	}
	// Los tickets de prueba también quedan (aunque solo tuvieran servicios).
	for _, v := range ventas {
		var total float64
		var cliente string
		_ = tx.QueryRow(`SELECT total, COALESCE(cliente, '') FROM pos_sales WHERE id = ?`, v).Scan(&total, &cliente)
		desc := "Ticket " + strconv.FormatInt(v.(int64), 10) + " · $" + strconv.FormatFloat(total, 'f', 2, 64)
		if cliente != "" {
			desc += " · " + cliente
		}
		if _, err := tx.Exec(`INSERT INTO inv_mov_borrados
			(lote, tipo, descripcion, venta_id, revertido, borrado_por, borrado_desde, borrado_at)
			VALUES (?, 'ticket', ?, ?, ?, ?, ?, ?)`, lote, desc, v, revertir, quien, desde, now); err != nil {
			log.Printf("inventario: no se pudo guardar el ticket borrado %v: %v", v, err)
		}
	}
	return lote
}

type InvMovBorradoRow struct {
	MovID       int64      `json:"mov_id"`
	ItemID      int64      `json:"item_id"`
	Clave       string     `json:"clave"`
	Descripcion string     `json:"descripcion"`
	Tipo        string     `json:"tipo"`
	Cantidad    int        `json:"cantidad"`
	Antes       int        `json:"antes"`
	Despues     int        `json:"despues"`
	VentaID     int64      `json:"venta_id,omitempty"`
	Comentario  string     `json:"comentario"`
	Usuario     string     `json:"usuario"`
	Fecha       *time.Time `json:"fecha,omitempty"` // cuándo se hizo el movimiento
	ExistHoy    *int       `json:"exist_hoy,omitempty"`
	ExistQueda  *int       `json:"exist_queda,omitempty"`
}

// InvMovBorradoLote: un borrado (lo que se quitó de un jalón).
type InvMovBorradoLote struct {
	Lote      string             `json:"lote"`
	Fecha     time.Time          `json:"fecha"`
	Por       string             `json:"por"`
	Desde     string             `json:"desde"` // movimientos | ventas
	Revertido bool               `json:"revertido"`
	Movs      []InvMovBorradoRow `json:"movimientos"`
}

// ListInvMovBorrados: los borrados más recientes primero (q filtra por
// clave, descripción o quién borró).
func ListInvMovBorrados(q string, limit int) ([]InvMovBorradoLote, error) {
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	where, args := "", []interface{}{}
	if q = strings.ToLower(strings.TrimSpace(q)); q != "" {
		like := "%" + q + "%"
		where = `WHERE lote IN (SELECT lote FROM inv_mov_borrados WHERE LOWER(clave) LIKE ? OR LOWER(descripcion) LIKE ? OR LOWER(borrado_por) LIKE ?)`
		args = append(args, like, like, like)
	}
	// Primero los lotes, luego sus renglones.
	rows, err := db.DB.Query(`SELECT lote, MAX(borrado_at), MAX(borrado_por), MAX(borrado_desde), MAX(revertido)
		FROM inv_mov_borrados `+where+` GROUP BY lote ORDER BY MAX(borrado_at) DESC, MAX(id) DESC LIMIT `+strconv.Itoa(limit), args...)
	if err != nil {
		return nil, err
	}
	out := []InvMovBorradoLote{}
	idx := map[string]int{}
	for rows.Next() {
		var l InvMovBorradoLote
		if err := rows.Scan(&l.Lote, &l.Fecha, &l.Por, &l.Desde, &l.Revertido); err != nil {
			rows.Close()
			return nil, err
		}
		l.Movs = []InvMovBorradoRow{}
		idx[l.Lote] = len(out)
		out = append(out, l)
	}
	rows.Close()
	if len(out) == 0 {
		return out, nil
	}
	lotes := make([]interface{}, 0, len(out))
	for _, l := range out {
		lotes = append(lotes, l.Lote)
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(lotes)), ",")
	rows, err = db.DB.Query(`SELECT lote, mov_id, item_id, clave, descripcion, tipo, cantidad, existencia_antes, existencia_despues,
			COALESCE(venta_id, 0), comentario, usuario, mov_fecha, exist_hoy, exist_queda
		FROM inv_mov_borrados WHERE lote IN (`+ph+`) ORDER BY id`, lotes...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var lote string
		var r InvMovBorradoRow
		var fecha sql.NullTime
		var hoy, queda sql.NullInt64
		if err := rows.Scan(&lote, &r.MovID, &r.ItemID, &r.Clave, &r.Descripcion, &r.Tipo, &r.Cantidad, &r.Antes, &r.Despues,
			&r.VentaID, &r.Comentario, &r.Usuario, &fecha, &hoy, &queda); err != nil {
			return nil, err
		}
		if fecha.Valid {
			t := fecha.Time
			r.Fecha = &t
		}
		if hoy.Valid {
			v := int(hoy.Int64)
			r.ExistHoy = &v
		}
		if queda.Valid {
			v := int(queda.Int64)
			r.ExistQueda = &v
		}
		if i, ok := idx[lote]; ok {
			out[i].Movs = append(out[i].Movs, r)
		}
	}
	return out, rows.Err()
}
