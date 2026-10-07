package models

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// NÚMEROS DE RASTREO: cada pieza en existencia lleva su propio número
// (AVT000001, AVT000002, …). Si entran 10 lentes, se generan 10 números.
//
//   - Se generan solos cuando entra mercancía: alta del artículo con
//     existencia, Ajustar → entrada / fijar hacia arriba, e inventario
//     físico cuando sobra.
//   - Cuando sale mercancía (venta del POS, salida, ajuste hacia abajo) se
//     marcan como vendidas / dadas de baja las piezas más viejas primero.
//   - Los números nunca se reutilizan ni se borran: quedan para consultar.
//
// Tabla inv_piezas (la crea db.EnsureInventarioProTables).

const (
	PiezaDisponible = "disponible"
	PiezaVendida    = "vendida"
	PiezaBaja       = "baja"

	// Máximo de números de rastreo que se generan en un solo movimiento.
	MaxPiezasPorMovimiento = 10000
)

var (
	ErrRastreoNotFound  = errors.New("número de rastreo no encontrado")
	ErrDemasiadasPiezas = fmt.Errorf("solo se pueden generar hasta %d números de rastreo por movimiento", MaxPiezasPorMovimiento)
)

// numeroRastreo: AVT + el id con al menos 6 dígitos (AVT000123).
const numeroRastreoSQL = "CONCAT('AVT', IF(id < 1000000, LPAD(id, 6, '0'), id))"

type execer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	Query(query string, args ...interface{}) (*sql.Rows, error)
}

// addPiezas da de alta n piezas del artículo y regresa sus números.
func addPiezas(tx execer, itemID int64, n int, origen string, ajusteID int64, now string) ([]string, error) {
	if n <= 0 {
		return nil, nil
	}
	if n > MaxPiezasPorMovimiento {
		return nil, ErrDemasiadasPiezas
	}
	var aj interface{}
	if ajusteID > 0 {
		aj = ajusteID
	}
	// Se insertan en bloques; luego se les pone el número según su id.
	for left := n; left > 0; {
		k := left
		if k > 500 {
			k = 500
		}
		vals := make([]string, k)
		args := make([]interface{}, 0, k*4)
		for i := 0; i < k; i++ {
			vals[i] = "(?, ?, ?, ?)"
			args = append(args, itemID, origen, aj, now)
		}
		if _, err := tx.Exec("INSERT INTO inv_piezas (item_id, origen, ajuste_id, created_at) VALUES "+strings.Join(vals, ","), args...); err != nil {
			return nil, err
		}
		left -= k
	}
	if _, err := tx.Exec("UPDATE inv_piezas SET numero = "+numeroRastreoSQL+" WHERE numero IS NULL AND item_id = ?", itemID); err != nil {
		return nil, err
	}
	rows, err := tx.Query("SELECT numero FROM inv_piezas WHERE item_id = ? ORDER BY id DESC LIMIT ?", itemID, n)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, n)
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	// Del más viejo al más nuevo.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, rows.Err()
}

// removePiezas marca como vendidas / baja las n piezas disponibles más
// viejas del artículo. Si hay menos disponibles, marca las que haya.
func removePiezas(tx execer, itemID int64, n int, estado string, ventaID, ajusteID int64, now string) error {
	if n <= 0 {
		return nil
	}
	var v, aj interface{}
	if ventaID > 0 {
		v = ventaID
	}
	if ajusteID > 0 {
		aj = ajusteID
	}
	_, err := tx.Exec(
		`UPDATE inv_piezas SET estado = ?, venta_id = COALESCE(?, venta_id), salida_ajuste_id = ?, salida_at = ?
		 WHERE item_id = ? AND estado = 'disponible' ORDER BY id LIMIT ?`,
		estado, v, aj, now, itemID, n,
	)
	return err
}

// ajustarPiezas sube o baja las piezas según la diferencia de existencia.
func ajustarPiezas(tx execer, itemID int64, diff int, origen string, ajusteID int64, now string) ([]string, error) {
	if diff > 0 {
		return addPiezas(tx, itemID, diff, origen, ajusteID, now)
	}
	if diff < 0 {
		return nil, removePiezas(tx, itemID, -diff, PiezaBaja, 0, ajusteID, now)
	}
	return nil, nil
}

/* ---------- consultas ---------- */

type InvPieza struct {
	Numero    string `json:"numero"`
	Estado    string `json:"estado"`
	Origen    string `json:"origen"`
	CreatedAt string `json:"created_at"`
	SalidaAt  string `json:"salida_at,omitempty"`
	VentaID   int64  `json:"venta_id,omitempty"`
	AjusteID  int64  `json:"ajuste_id,omitempty"`
	SalidaAj  int64  `json:"salida_ajuste_id,omitempty"`
	ItemID    int64  `json:"item_id"`
}

type InvPiezasTotales struct {
	Disponibles int `json:"disponibles"`
	Vendidas    int `json:"vendidas"`
	Bajas       int `json:"bajas"`
}

const invPiezaSelect = `
	SELECT numero, estado, origen, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'),
	       COALESCE(DATE_FORMAT(salida_at, '%Y-%m-%dT%H:%i:%s'), ''),
	       COALESCE(venta_id, 0), COALESCE(ajuste_id, 0), COALESCE(salida_ajuste_id, 0), item_id
	FROM inv_piezas`

func scanInvPieza(sc interface{ Scan(...interface{}) error }) (InvPieza, error) {
	var p InvPieza
	err := sc.Scan(&p.Numero, &p.Estado, &p.Origen, &p.CreatedAt, &p.SalidaAt, &p.VentaID, &p.AjusteID, &p.SalidaAj, &p.ItemID)
	return p, err
}

// ListInvPiezas — los números de rastreo de un artículo (estado "" = todos).
func ListInvPiezas(itemID int64, estado string) ([]InvPieza, InvPiezasTotales, error) {
	var t InvPiezasTotales
	if err := db.DB.QueryRow(`SELECT
		COALESCE(SUM(estado = 'disponible'), 0), COALESCE(SUM(estado = 'vendida'), 0), COALESCE(SUM(estado = 'baja'), 0)
		FROM inv_piezas WHERE item_id = ? AND numero IS NOT NULL`, itemID).Scan(&t.Disponibles, &t.Vendidas, &t.Bajas); err != nil {
		return nil, t, err
	}
	q := invPiezaSelect + " WHERE item_id = ? AND numero IS NOT NULL"
	args := []interface{}{itemID}
	if estado != "" {
		q += " AND estado = ?"
		args = append(args, estado)
	}
	q += " ORDER BY (estado = 'disponible') DESC, id ASC LIMIT 5000"
	rows, err := db.DB.Query(q, args...)
	if err != nil {
		return nil, t, err
	}
	defer rows.Close()
	out := []InvPieza{}
	for rows.Next() {
		p, err := scanInvPieza(rows)
		if err != nil {
			return nil, t, err
		}
		out = append(out, p)
	}
	return out, t, rows.Err()
}

// GetInvPieza busca un número de rastreo (sin importar mayúsculas).
func GetInvPieza(numero string) (*InvPieza, error) {
	numero = strings.ToUpper(strings.TrimSpace(numero))
	p, err := scanInvPieza(db.DB.QueryRow(invPiezaSelect+" WHERE numero = ?", numero))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrRastreoNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// BackfillInvPiezas da números de rastreo a la existencia que ya había
// antes de que existieran (una vez; si ya los tiene, no hace nada). Se
// llama al arrancar.
func BackfillInvPiezas() {
	rows, err := db.DB.Query(`
		SELECT i.id, i.cantidad_actual - COUNT(p.id)
		FROM inventory_items i
		LEFT JOIN inv_piezas p ON p.item_id = i.id AND p.estado = 'disponible'
		WHERE i.servicio = 0 AND i.cantidad_actual > 0
		GROUP BY i.id, i.cantidad_actual
		HAVING i.cantidad_actual - COUNT(p.id) > 0`)
	if err != nil {
		log.Printf("inventario: no se pudieron revisar los números de rastreo: %v", err)
		return
	}
	type falta struct {
		id int64
		n  int
	}
	var faltan []falta
	for rows.Next() {
		var f falta
		if err := rows.Scan(&f.id, &f.n); err == nil {
			faltan = append(faltan, f)
		}
	}
	rows.Close()
	total := 0
	for _, f := range faltan {
		n := f.n
		if n > MaxPiezasPorMovimiento {
			n = MaxPiezasPorMovimiento
		}
		tx, err := db.DB.Begin()
		if err != nil {
			log.Printf("inventario: números de rastreo: %v", err)
			return
		}
		if _, err := addPiezas(tx, f.id, n, "existente", 0, invNow()); err != nil {
			tx.Rollback()
			log.Printf("inventario: no se pudieron generar números de rastreo del artículo %d: %v", f.id, err)
			continue
		}
		if err := tx.Commit(); err != nil {
			log.Printf("inventario: números de rastreo: %v", err)
			continue
		}
		total += n
	}
	if total > 0 {
		log.Printf("inventario: se generaron %d números de rastreo para la existencia que ya había", total)
	}
}
