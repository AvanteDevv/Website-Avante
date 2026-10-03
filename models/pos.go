package models

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
	_ "time/tzdata" // zona horaria de Hermosillo aunque el servidor no la traiga

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Punto de venta (Recepción): clientes, ventas, créditos y abonos.
//
// Crédito = lo que el cliente queda a deber de una venta. En la óptica
// normalmente deja un anticipo (efectivo, tarjeta…) y paga el resto al
// recoger sus lentes: ese resto es el crédito, y cada pago posterior es
// un abono. No tiene nada que ver con meses sin intereses.

var (
	ErrPosClientDuplicate  = errors.New("ya existe un cliente con ese número")
	ErrPosClientNotFound   = errors.New("cliente no encontrado")
	ErrPosCreditNotFound   = errors.New("crédito no encontrado")
	ErrPosPaymentNotFound  = errors.New("abono no encontrado")
	ErrPosCreditLimit      = errors.New("el crédito pasa del límite del cliente")
	ErrPosPaymentTooBig    = errors.New("el abono es mayor que el saldo")
	ErrPosPaymentNotToday  = errors.New("solo se pueden cancelar abonos del mismo día")
	ErrPosPaymentCancelled = errors.New("ese abono ya estaba cancelado")
)

// posLoc: las fechas (vencimientos, "hoy") van en hora de Hermosillo,
// aunque el servidor (Railway) esté en UTC.
var posLoc = func() *time.Location {
	if l, err := time.LoadLocation("America/Hermosillo"); err == nil {
		return l
	}
	return time.FixedZone("MST", -7*3600)
}()

// PosToday regresa la fecha de hoy en Hermosillo ("YYYY-MM-DD").
func PosToday() string { return time.Now().In(posLoc).Format("2006-01-02") }

func round2(v float64) float64 { return math.Round(v*100) / 100 }

/* =========================================================
   CLIENTES
   ========================================================= */

type PosClient struct {
	ID            int64   `json:"id"`
	Numero        string  `json:"numero"`
	Clave         string  `json:"clave"`
	Nombre        string  `json:"nombre"`
	Celular       string  `json:"celular"`
	Representante string  `json:"representante"`
	DiasCredito   int     `json:"dias"`
	LimiteCredito float64 `json:"limite"`
	// Calculados a partir de sus créditos abiertos:
	Saldo        float64 `json:"saldo"`         // lo que debe en total
	SaldoVencido float64 `json:"saldo_vencido"` // de eso, lo que ya pasó su fecha
	ProximoVence string  `json:"proximo_vence"` // vencimiento más cercano con saldo ("" = ninguno)
	Creditos     int     `json:"creditos"`      // créditos con saldo
}

const posClientSelect = `
	SELECT c.id, c.numero, c.clave, c.nombre, c.celular, c.representante, c.dias_credito, c.limite_credito,
	       COALESCE(SUM(cr.saldo), 0),
	       COALESCE(SUM(CASE WHEN cr.vence IS NOT NULL AND cr.vence < ? THEN cr.saldo ELSE 0 END), 0),
	       COALESCE(DATE_FORMAT(MIN(cr.vence), '%Y-%m-%d'), ''),
	       COUNT(cr.id)
	FROM pos_clients c
	LEFT JOIN pos_credits cr ON cr.client_id = c.id AND cr.saldo > 0`

func scanPosClient(sc interface{ Scan(...interface{}) error }) (PosClient, error) {
	var c PosClient
	err := sc.Scan(&c.ID, &c.Numero, &c.Clave, &c.Nombre, &c.Celular, &c.Representante, &c.DiasCredito, &c.LimiteCredito,
		&c.Saldo, &c.SaldoVencido, &c.ProximoVence, &c.Creditos)
	c.Saldo, c.SaldoVencido = round2(c.Saldo), round2(c.SaldoVencido)
	return c, err
}

// ListPosClients busca clientes por número, clave, nombre o celular
// (todas las palabras deben aparecer). Sin búsqueda regresa primero a los
// que deben algo y luego los más recientes.
func ListPosClients(q string, limit int) ([]PosClient, error) {
	if limit <= 0 || limit > 200 {
		limit = 60
	}
	args := []interface{}{PosToday()}
	where := []string{}
	for _, w := range strings.Fields(strings.ToLower(q)) {
		like := "%" + w + "%"
		where = append(where, "(LOWER(c.nombre) LIKE ? OR c.numero LIKE ? OR LOWER(c.clave) LIKE ? OR c.celular LIKE ?)")
		args = append(args, like, like, like, like)
	}
	query := posClientSelect
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " GROUP BY c.id ORDER BY (COALESCE(SUM(cr.saldo),0) > 0) DESC, c.clave <> '' DESC, c.id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PosClient{}
	for rows.Next() {
		c, err := scanPosClient(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetPosClient trae un cliente con su saldo.
func GetPosClient(id int64) (*PosClient, error) {
	c, err := scanPosClient(db.DB.QueryRow(posClientSelect+" WHERE c.id = ? GROUP BY c.id", PosToday(), id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPosClientNotFound
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// NextPosClientNumero sugiere el siguiente No. de cliente (el mayor
// número + 1). Si el número es personalizado (p. ej. "VIP-1") se ignora.
func NextPosClientNumero() (string, error) {
	var max sql.NullInt64
	err := db.DB.QueryRow("SELECT MAX(CAST(numero AS UNSIGNED)) FROM pos_clients WHERE numero REGEXP '^[0-9]+$'").Scan(&max)
	if err != nil {
		return "1", err
	}
	return fmt.Sprint(max.Int64 + 1), nil
}

// CreatePosClient guarda un cliente nuevo.
func CreatePosClient(c PosClient, createdBy string) (*PosClient, error) {
	res, err := db.DB.Exec(
		`INSERT INTO pos_clients (numero, clave, nombre, celular, representante, dias_credito, limite_credito, created_by)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Numero, c.Clave, c.Nombre, c.Celular, c.Representante, c.DiasCredito, round2(c.LimiteCredito), createdBy,
	)
	if err != nil {
		if strings.Contains(err.Error(), "1062") {
			return nil, ErrPosClientDuplicate
		}
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetPosClient(id)
}

/* =========================================================
   VENTAS
   ========================================================= */

type PosSaleItem struct {
	InventoryID int64   `json:"inventory_id"`
	Clave       string  `json:"clave"`
	Descripcion string  `json:"descripcion"`
	Cantidad    int     `json:"cantidad"`
	Precio      float64 `json:"precio"`
	Descuento   float64 `json:"descuento"` // %
	Importe     float64 `json:"importe"`
}

type PosPayments struct {
	Efectivo      float64 `json:"efectivo"`
	Tarjeta       float64 `json:"tarjeta"`
	Transferencia float64 `json:"transferencia"`
	Vales         float64 `json:"vales"`
	Cheque        float64 `json:"cheque"`
	Credito       float64 `json:"credito"`
}

type PosSale struct {
	ID         int64         `json:"folio"`
	ClientID   int64         `json:"client_id,omitempty"`
	Cliente    string        `json:"cliente"`
	Cajero     string        `json:"cajero"`
	Subtotal   float64       `json:"subtotal"`
	Descuento  float64       `json:"descuento"`
	Total      float64       `json:"total"`
	Pagos      PosPayments   `json:"pagos"`
	Cambio     float64       `json:"cambio"`
	Referencia string        `json:"referencia"`
	Items      []PosSaleItem `json:"productos"`
	CreatedAt  time.Time     `json:"fecha"`
	// Si quedó algo a crédito:
	CreditID int64  `json:"credit_id,omitempty"`
	Vence    string `json:"vence,omitempty"` // "YYYY-MM-DD" o "" si el cliente no tiene días de crédito
}

// PosStockError: no alcanzó la existencia de un producto.
type PosStockError struct {
	Descripcion string
	Disponible  int
}

func (e *PosStockError) Error() string {
	return fmt.Sprintf("solo hay %d en existencia de %s", e.Disponible, e.Descripcion)
}

// CreatePosSale guarda la venta en una sola transacción: descuenta el
// inventario, guarda el ticket con sus productos y, si quedó algo a
// crédito, abre el crédito del cliente (revisando su límite).
// Los importes los recalcula aquí; no se confía en los del navegador.
func CreatePosSale(s PosSale) (*PosSale, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Productos: precio y existencia salen del inventario.
	var subtotal, total float64
	for i := range s.Items {
		it := &s.Items[i]
		var desc, clave string
		var precio float64
		var stock int
		err := tx.QueryRow("SELECT descripcion, COALESCE(clave,''), precio_venta, cantidad_actual FROM inventory_items WHERE id = ? FOR UPDATE", it.InventoryID).
			Scan(&desc, &clave, &precio, &stock)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("un producto de la venta ya no existe en el inventario")
		}
		if err != nil {
			return nil, err
		}
		if it.Cantidad <= 0 {
			it.Cantidad = 1
		}
		if stock < it.Cantidad {
			return nil, &PosStockError{Descripcion: desc, Disponible: stock}
		}
		if it.Descuento < 0 {
			it.Descuento = 0
		}
		if it.Descuento > 100 {
			it.Descuento = 100
		}
		it.Descripcion, it.Clave, it.Precio = desc, clave, round2(precio)
		it.Importe = round2(it.Precio * float64(it.Cantidad) * (1 - it.Descuento/100))
		subtotal += it.Precio * float64(it.Cantidad)
		total += it.Importe
		if _, err := tx.Exec("UPDATE inventory_items SET cantidad_actual = cantidad_actual - ? WHERE id = ?", it.Cantidad, it.InventoryID); err != nil {
			return nil, err
		}
	}
	s.Subtotal, s.Total = round2(subtotal), round2(total)
	s.Descuento = round2(s.Subtotal - s.Total)

	p := &s.Pagos
	for _, v := range []*float64{&p.Efectivo, &p.Tarjeta, &p.Transferencia, &p.Vales, &p.Cheque, &p.Credito} {
		if *v < 0 {
			*v = 0
		}
		*v = round2(*v)
	}
	noCash := round2(p.Tarjeta + p.Transferencia + p.Vales + p.Cheque + p.Credito)
	if noCash > s.Total {
		return nil, fmt.Errorf("tarjeta, transferencia, vales, cheque y crédito no pueden pasar del total (solo el efectivo da cambio)")
	}
	paid := round2(noCash + p.Efectivo)
	if paid < s.Total {
		return nil, fmt.Errorf("falta cobrar %.2f", round2(s.Total-paid))
	}
	s.Cambio = round2(paid - s.Total)

	// Cliente y crédito
	var client *PosClient
	if s.ClientID > 0 {
		var c PosClient
		err := tx.QueryRow("SELECT id, nombre, dias_credito, limite_credito FROM pos_clients WHERE id = ? FOR UPDATE", s.ClientID).
			Scan(&c.ID, &c.Nombre, &c.DiasCredito, &c.LimiteCredito)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrPosClientNotFound
		}
		if err != nil {
			return nil, err
		}
		client = &c
		s.Cliente = c.Nombre
	}
	if p.Credito > 0 {
		if client == nil {
			return nil, fmt.Errorf("para dejar algo a crédito elige un cliente")
		}
		if client.LimiteCredito > 0 {
			var saldo float64
			if err := tx.QueryRow("SELECT COALESCE(SUM(saldo),0) FROM pos_credits WHERE client_id = ? AND saldo > 0", client.ID).Scan(&saldo); err != nil {
				return nil, err
			}
			if round2(saldo+p.Credito) > round2(client.LimiteCredito) {
				return nil, fmt.Errorf("%w: le quedan %.2f disponibles", ErrPosCreditLimit, round2(client.LimiteCredito-saldo))
			}
		}
	}
	if s.Cliente == "" {
		s.Cliente = "PÚBLICO EN GENERAL"
	}

	var clientArg interface{}
	if client != nil {
		clientArg = client.ID
	}
	res, err := tx.Exec(
		`INSERT INTO pos_sales (client_id, cliente, cajero, subtotal, descuento, total, efectivo, tarjeta, transferencia, vales, cheque, credito, cambio, referencia)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		clientArg, s.Cliente, s.Cajero, s.Subtotal, s.Descuento, s.Total,
		p.Efectivo, p.Tarjeta, p.Transferencia, p.Vales, p.Cheque, p.Credito, s.Cambio, s.Referencia,
	)
	if err != nil {
		return nil, err
	}
	s.ID, _ = res.LastInsertId()
	for _, it := range s.Items {
		if _, err := tx.Exec(
			`INSERT INTO pos_sale_items (sale_id, inventory_id, clave, descripcion, cantidad, precio, descuento, importe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			s.ID, it.InventoryID, it.Clave, it.Descripcion, it.Cantidad, it.Precio, it.Descuento, it.Importe,
		); err != nil {
			return nil, err
		}
	}

	if p.Credito > 0 {
		hoy := time.Now().In(posLoc)
		var venceArg interface{}
		if client.DiasCredito > 0 {
			s.Vence = hoy.AddDate(0, 0, client.DiasCredito).Format("2006-01-02")
			venceArg = s.Vence
		}
		res, err := tx.Exec(
			"INSERT INTO pos_credits (sale_id, client_id, monto, saldo, fecha, vence) VALUES (?, ?, ?, ?, ?, ?)",
			s.ID, client.ID, p.Credito, p.Credito, hoy.Format("2006-01-02"), venceArg,
		)
		if err != nil {
			return nil, err
		}
		s.CreditID, _ = res.LastInsertId()
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	s.CreatedAt = time.Now().In(posLoc)
	return &s, nil
}

/* =========================================================
   CRÉDITOS Y ABONOS
   ========================================================= */

type PosCreditPayment struct {
	ID         int64     `json:"id"`
	CreditID   int64     `json:"credit_id"`
	Monto      float64   `json:"monto"`
	FormaPago  string    `json:"forma_pago"`
	Referencia string    `json:"referencia"`
	Cajero     string    `json:"cajero"`
	Fecha      string    `json:"fecha"`
	CreatedAt  time.Time `json:"created_at"`
	Cancelado  bool      `json:"cancelado"`
	CancelPor  string    `json:"cancelado_por,omitempty"`
	Cancelable bool      `json:"cancelable"` // del mismo día y no cancelado
}

type PosCredit struct {
	ID        int64              `json:"id"`
	Folio     int64              `json:"folio"` // ticket de la venta
	Fecha     string             `json:"fecha"`
	Vence     string             `json:"vence"`
	Monto     float64            `json:"monto"`
	Abonado   float64            `json:"abonado"`
	Saldo     float64            `json:"saldo"`
	Vencido   bool               `json:"vencido"`
	Productos string             `json:"productos"` // resumen de lo que se vendió
	Abonos    []PosCreditPayment `json:"abonos"`
}

// ListPosClientCredits: los créditos del cliente (con saldo primero) y
// los abonos de cada uno.
func ListPosClientCredits(clientID int64) ([]PosCredit, error) {
	today := PosToday()
	rows, err := db.DB.Query(`
		SELECT cr.id, cr.sale_id, DATE_FORMAT(cr.fecha, '%Y-%m-%d'), COALESCE(DATE_FORMAT(cr.vence, '%Y-%m-%d'), ''), cr.monto, cr.saldo,
		       COALESCE((SELECT GROUP_CONCAT(CONCAT(i.cantidad, ' × ', i.descripcion) SEPARATOR ' · ') FROM pos_sale_items i WHERE i.sale_id = cr.sale_id), '')
		FROM pos_credits cr WHERE cr.client_id = ?
		ORDER BY (cr.saldo > 0) DESC, cr.fecha DESC, cr.id DESC`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PosCredit{}
	idx := map[int64]int{}
	for rows.Next() {
		var c PosCredit
		if err := rows.Scan(&c.ID, &c.Folio, &c.Fecha, &c.Vence, &c.Monto, &c.Saldo, &c.Productos); err != nil {
			return nil, err
		}
		c.Saldo = round2(c.Saldo)
		c.Abonado = round2(c.Monto - c.Saldo)
		c.Vencido = c.Saldo > 0 && c.Vence != "" && c.Vence < today
		c.Abonos = []PosCreditPayment{}
		idx[c.ID] = len(out)
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	prow, err := db.DB.Query(`
		SELECT id, credit_id, monto, forma_pago, referencia, cajero, DATE_FORMAT(fecha, '%Y-%m-%d'), created_at, cancelado, cancelado_por
		FROM pos_credit_payments WHERE client_id = ? ORDER BY id DESC`, clientID)
	if err != nil {
		return nil, err
	}
	defer prow.Close()
	for prow.Next() {
		var p PosCreditPayment
		if err := prow.Scan(&p.ID, &p.CreditID, &p.Monto, &p.FormaPago, &p.Referencia, &p.Cajero, &p.Fecha, &p.CreatedAt, &p.Cancelado, &p.CancelPor); err != nil {
			return nil, err
		}
		p.Cancelable = !p.Cancelado && p.Fecha == today
		if i, ok := idx[p.CreditID]; ok {
			out[i].Abonos = append(out[i].Abonos, p)
		}
	}
	return out, prow.Err()
}

var posFormasPago = map[string]bool{"efectivo": true, "tarjeta": true, "transferencia": true, "vales": true, "cheque": true}

// IsPosFormaPago indica si la forma de pago de un abono es válida.
func IsPosFormaPago(f string) bool { return posFormasPago[f] }

// PosPaymentResult: lo que regresa un abono (para el recibo).
type PosPaymentResult struct {
	Payment       PosCreditPayment `json:"abono"`
	Folio         int64            `json:"folio"`
	ClientID      int64            `json:"client_id"`
	Cliente       string           `json:"cliente"`
	SaldoAnterior float64          `json:"saldo_anterior"`
	SaldoNuevo    float64          `json:"saldo_nuevo"`
}

// AddPosCreditPayment registra un abono a un crédito y baja su saldo.
func AddPosCreditPayment(creditID int64, monto float64, forma, referencia, cajero string) (*PosPaymentResult, error) {
	monto = round2(monto)
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var r PosPaymentResult
	err = tx.QueryRow(`SELECT cr.sale_id, cr.client_id, cr.saldo, c.nombre FROM pos_credits cr
		JOIN pos_clients c ON c.id = cr.client_id WHERE cr.id = ? FOR UPDATE`, creditID).
		Scan(&r.Folio, &r.ClientID, &r.SaldoAnterior, &r.Cliente)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPosCreditNotFound
	}
	if err != nil {
		return nil, err
	}
	r.SaldoAnterior = round2(r.SaldoAnterior)
	if monto > r.SaldoAnterior {
		return nil, ErrPosPaymentTooBig
	}
	r.SaldoNuevo = round2(r.SaldoAnterior - monto)
	today := PosToday()
	res, err := tx.Exec(
		"INSERT INTO pos_credit_payments (credit_id, client_id, monto, forma_pago, referencia, cajero, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)",
		creditID, r.ClientID, monto, forma, referencia, cajero, today,
	)
	if err != nil {
		return nil, err
	}
	if _, err := tx.Exec("UPDATE pos_credits SET saldo = ? WHERE id = ?", r.SaldoNuevo, creditID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	r.Payment = PosCreditPayment{ID: id, CreditID: creditID, Monto: monto, FormaPago: forma, Referencia: referencia, Cajero: cajero,
		Fecha: today, CreatedAt: time.Now().In(posLoc), Cancelable: true}
	return &r, nil
}

// CancelPosCreditPayment cancela un abono del mismo día y regresa el
// monto al saldo del crédito (como en SICAR, que solo deja cancelar
// antes del corte de caja).
func CancelPosCreditPayment(paymentID int64, by string) (*PosPaymentResult, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var r PosPaymentResult
	var p PosCreditPayment
	err = tx.QueryRow(`SELECT id, credit_id, client_id, monto, forma_pago, DATE_FORMAT(fecha, '%Y-%m-%d'), cancelado
		FROM pos_credit_payments WHERE id = ? FOR UPDATE`, paymentID).
		Scan(&p.ID, &p.CreditID, &r.ClientID, &p.Monto, &p.FormaPago, &p.Fecha, &p.Cancelado)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPosPaymentNotFound
	}
	if err != nil {
		return nil, err
	}
	if p.Cancelado {
		return nil, ErrPosPaymentCancelled
	}
	if p.Fecha != PosToday() {
		return nil, ErrPosPaymentNotToday
	}
	if err := tx.QueryRow(`SELECT cr.sale_id, cr.saldo, c.nombre FROM pos_credits cr JOIN pos_clients c ON c.id = cr.client_id
		WHERE cr.id = ? FOR UPDATE`, p.CreditID).Scan(&r.Folio, &r.SaldoAnterior, &r.Cliente); err != nil {
		return nil, err
	}
	r.SaldoNuevo = round2(r.SaldoAnterior + p.Monto)
	if _, err := tx.Exec("UPDATE pos_credit_payments SET cancelado = 1, cancelado_por = ? WHERE id = ?", by, paymentID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec("UPDATE pos_credits SET saldo = ? WHERE id = ?", r.SaldoNuevo, p.CreditID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	p.Cancelado, p.CancelPor = true, by
	r.Payment = p
	return &r, nil
}
