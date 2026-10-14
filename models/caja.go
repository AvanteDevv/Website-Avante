package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"avante-optics/db"
)

// CORTE DE CAJA (como SICAR → Operaciones → Corte de caja).
//
// Un corte abarca todo lo que pasó en la caja DESDE el corte anterior
// HASTA el momento en que se guarda:
//   - ventas del Punto de venta (por forma de pago; efectivo ya sin cambio)
//   - ventas canceladas (salen como salida en el corte en que se cancelan)
//   - abonos a créditos (y abonos cancelados)
//   - movimientos de caja: gastos, compras, pagos a crédito de proveedor,
//     notas de crédito, devoluciones de proveedor, retiros, depósitos…
//   - propinas (las que no son en efectivo entran con su forma de pago)
//   - "entrada por corte": lo que se quedó en caja en el corte anterior
//     (contado − retiro), que es el fondo con el que se empieza.
//
// Calculado = entrada por corte + entradas − salidas, por forma de pago.
// El primer corte (sin corte anterior) empieza hoy a las 00:00.

const CajaDefault = "Caja 1"

// Formas de pago que se cuentan en caja (crédito no es dinero).
var CajaFormas = []string{"efectivo", "cheque", "vales", "tarjeta", "transferencia"}

var cajaFP = map[string]string{
	"efectivo": "EF", "cheque": "CH", "vales": "VA", "tarjeta": "TA", "transferencia": "TR", "credito": "CR",
}

// Conceptos de los movimientos de caja.
var CajaConceptos = map[string]struct {
	Tipo, Label, Code string
	Credito           bool // puede ser "a crédito" (no sale dinero)
}{
	"deposito":      {"entrada", "Depósito / fondo de caja", "DEP", false},
	"dev_proveedor": {"entrada", "Devolución de proveedor", "DPR", false},
	"otro_entrada":  {"entrada", "Otra entrada", "OEN", false},
	"gasto":         {"salida", "Gasto", "GAS", true},
	"compra":        {"salida", "Compra", "COM", true},
	"pago_credito":  {"salida", "Pago a crédito de proveedor", "PAC", false},
	"nota_credito":  {"salida", "Nota de crédito (devolución a cliente)", "NCR", false},
	"retiro":        {"salida", "Retiro de efectivo", "RET", false},
	"otro_salida":   {"salida", "Otra salida", "OSA", false},
}

var (
	ErrCajaMonto        = errors.New("el monto debe ser mayor a cero")
	ErrCajaConcepto     = errors.New("concepto no válido")
	ErrCajaForma        = errors.New("forma de pago no válida")
	ErrCajaRetiro       = errors.New("el retiro no puede ser mayor a lo contado")
	ErrCajaNotFound     = errors.New("no existe ese corte")
	ErrCajaMovNotFound  = errors.New("no existe ese movimiento")
	ErrCajaMovCancelado = errors.New("ese movimiento ya estaba cancelado")
	ErrCajaSinPropinas  = errors.New("no hay propinas pendientes de corte")
)

// CajaMontos — un importe por forma de pago.
type CajaMontos struct {
	Efectivo      float64 `json:"efectivo"`
	Cheque        float64 `json:"cheque"`
	Vales         float64 `json:"vales"`
	Tarjeta       float64 `json:"tarjeta"`
	Transferencia float64 `json:"transferencia"`
}

func (m *CajaMontos) ptr(forma string) *float64 {
	switch forma {
	case "efectivo":
		return &m.Efectivo
	case "cheque":
		return &m.Cheque
	case "vales":
		return &m.Vales
	case "tarjeta":
		return &m.Tarjeta
	case "transferencia":
		return &m.Transferencia
	}
	return nil
}

// Get / Add por nombre de forma.
func (m CajaMontos) Get(forma string) float64 {
	if p := m.ptr(forma); p != nil {
		return *p
	}
	return 0
}
func (m *CajaMontos) Add(forma string, v float64) {
	if p := m.ptr(forma); p != nil {
		*p = round2(*p + v)
	}
}
func (m CajaMontos) Total() float64 {
	return round2(m.Efectivo + m.Cheque + m.Vales + m.Tarjeta + m.Transferencia)
}
func (m *CajaMontos) round() {
	for _, f := range CajaFormas {
		p := m.ptr(f)
		*p = round2(*p)
	}
}

// CajaSeccion — "Datos de las ventas / compras / gastos" del reporte.
type CajaSeccion struct {
	Contado        float64 `json:"contado"`
	Credito        float64 `json:"credito"`
	Total          float64 `json:"total"`
	Canceladas     float64 `json:"canceladas"`
	CreditoCanc    float64 `json:"credito_canc"`
	TotalCanc      float64 `json:"total_canc"`
	Diferencia     float64 `json:"diferencia"`
	Cantidad       int     `json:"cantidad"`
	CantidadCancel int     `json:"cantidad_canc"`
}

func (s *CajaSeccion) close() {
	s.Contado, s.Credito = round2(s.Contado), round2(s.Credito)
	s.Canceladas, s.CreditoCanc = round2(s.Canceladas), round2(s.CreditoCanc)
	s.Total = round2(s.Contado + s.Credito)
	s.TotalCanc = round2(s.Canceladas + s.CreditoCanc)
	s.Diferencia = round2(s.Total - s.TotalCanc)
}

// CajaEntradas / CajaSalidas — "Datos de los movimientos (Entradas/Salidas)".
type CajaEntradas struct {
	Ventas       float64 `json:"ventas"`
	CredRecup    float64 `json:"cred_recup"`
	ComprasCanc  float64 `json:"compras_canc"`
	NotasCreCanc float64 `json:"notas_cre_canc"`
	Movimientos  float64 `json:"movimientos"`
	DevPro       float64 `json:"dev_pro"`
	GastosCanc   float64 `json:"gastos_canc"`
	Propinas     float64 `json:"propinas"`
	Corte        float64 `json:"corte"`
	Total        float64 `json:"total"`
}
type CajaSalidas struct {
	Compras      float64 `json:"compras"`
	PagoCred     float64 `json:"pago_cred"`
	VentasCanc   float64 `json:"ventas_canc"`
	NotasCredito float64 `json:"notas_credito"`
	Movimientos  float64 `json:"movimientos"`
	DevProCanc   float64 `json:"dev_pro_canc"`
	Gastos       float64 `json:"gastos"`
	AbonosCanc   float64 `json:"abonos_canc"`
	Total        float64 `json:"total"`
}

// CajaMov — un renglón de "Detalle de movimientos".
type CajaMov struct {
	Fecha      string  `json:"fecha"`
	Comentario string  `json:"comentario"`
	Mov        string  `json:"mov"`
	Doc        string  `json:"doc"`
	Folio      string  `json:"folio"`
	Forma      string  `json:"forma"`
	FP         string  `json:"fp"`
	Usuario    string  `json:"usuario"`
	Entrada    float64 `json:"entrada"`
	Salida     float64 `json:"salida"`
	Saldo      float64 `json:"saldo"`
	orden      int
}

// CajaReporte — el corte de caja extendido.
type CajaReporte struct {
	Caja      string     `json:"caja"`
	Desde     string     `json:"desde"`
	Hasta     string     `json:"hasta"`
	Fondo     CajaMontos `json:"fondo"` // entrada por corte (lo que quedó del corte anterior)
	Entradas  CajaMontos `json:"entradas_fp"`
	Salidas   CajaMontos `json:"salidas_fp"`
	Calculado CajaMontos `json:"calculado"`

	Ventas       CajaSeccion  `json:"ventas"`
	Compras      CajaSeccion  `json:"compras"`
	Gastos       CajaSeccion  `json:"gastos"`
	NotasCredito CajaSeccion  `json:"notas_credito"`
	DevProveedor CajaSeccion  `json:"dev_proveedor"`
	MovEntradas  CajaEntradas `json:"mov_entradas"`
	MovSalidas   CajaSalidas  `json:"mov_salidas"`
	MovDif       float64      `json:"mov_diferencia"`

	Transferencias float64    `json:"transferencias"`
	Anticipos      float64    `json:"anticipos"`
	PagosLinea     float64    `json:"pagos_linea"`
	Propinas       CajaMontos `json:"propinas"`
	PropinaEfect   float64    `json:"propinas_efectivo"`

	Movimientos []CajaMov `json:"movimientos"`
}

// CajaCorte — un corte guardado.
type CajaCorte struct {
	ID         int64        `json:"id"`
	Caja       string       `json:"caja"`
	Usuario    string       `json:"usuario"`
	Desde      string       `json:"desde"`
	Hasta      string       `json:"hasta"`
	Fecha      string       `json:"fecha"`
	Contado    CajaMontos   `json:"contado_fp"`
	Calculado  CajaMontos   `json:"calculado_fp"`
	Retiro     CajaMontos   `json:"retiro_fp"`
	TContado   float64      `json:"contado"`
	TCalculado float64      `json:"calculado"`
	TDif       float64      `json:"diferencia"`
	TRetirado  float64      `json:"retirado"`
	Reporte    *CajaReporte `json:"reporte,omitempty"`
}

// Quita lo que no puede ver quien no tiene permiso de "calculado".
func (c *CajaCorte) Ciego() {
	c.Calculado = CajaMontos{}
	c.TCalculado, c.TDif = 0, 0
	c.Reporte = nil
}

func cajaTS(t time.Time) string { return t.In(posLoc).Format("2006-01-02 15:04:05") }

/* ---------------- configuración ---------------- */

func CajaConfigGet(k string) string {
	var v string
	_ = db.DB.QueryRow("SELECT v FROM caja_config WHERE k = ?", k).Scan(&v)
	return v
}
func CajaConfigSet(k, v string) error {
	_, err := db.DB.Exec("INSERT INTO caja_config (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", k, v)
	return err
}

// Si recepción puede ver "Calculado" y "Diferencia" (como el rol Ventas de
// SICAR: apagado hasta que el administrador lo active).
func CajaRecepcionVeCalculado() bool { return CajaConfigGet("recepcion_ve_calculado") == "1" }

/* ---------------- último corte ---------------- */

func lastCajaCorte(q interface {
	QueryRow(string, ...interface{}) *sql.Row
}, caja string) (*CajaCorte, error) {
	c, err := scanCajaCorte(q.QueryRow(cajaCorteSelect+" WHERE caja = ? ORDER BY hasta DESC, id DESC LIMIT 1", caja), false)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return c, err
}

// LastCajaCorte — el último corte de la caja (nil si nunca se ha hecho).
func LastCajaCorte(caja string) (*CajaCorte, error) { return lastCajaCorte(db.DB, caja) }

const cajaCorteSelect = `SELECT id, caja, usuario, COALESCE(DATE_FORMAT(desde, '%Y-%m-%d %H:%i:%s'), ''), DATE_FORMAT(hasta, '%Y-%m-%d %H:%i:%s'),
	DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'),
	contado_efectivo, contado_cheque, contado_vales, contado_tarjeta, contado_transferencia,
	calculado_efectivo, calculado_cheque, calculado_vales, calculado_tarjeta, calculado_transferencia,
	retiro_efectivo, retiro_cheque, retiro_vales, retiro_tarjeta, retiro_transferencia,
	contado, calculado, diferencia, retirado, reporte FROM caja_cortes`

func scanCajaCorte(sc interface{ Scan(...interface{}) error }, withReport bool) (*CajaCorte, error) {
	var c CajaCorte
	var rep string
	err := sc.Scan(&c.ID, &c.Caja, &c.Usuario, &c.Desde, &c.Hasta, &c.Fecha,
		&c.Contado.Efectivo, &c.Contado.Cheque, &c.Contado.Vales, &c.Contado.Tarjeta, &c.Contado.Transferencia,
		&c.Calculado.Efectivo, &c.Calculado.Cheque, &c.Calculado.Vales, &c.Calculado.Tarjeta, &c.Calculado.Transferencia,
		&c.Retiro.Efectivo, &c.Retiro.Cheque, &c.Retiro.Vales, &c.Retiro.Tarjeta, &c.Retiro.Transferencia,
		&c.TContado, &c.TCalculado, &c.TDif, &c.TRetirado, &rep)
	if err != nil {
		return nil, err
	}
	if withReport && rep != "" {
		var r CajaReporte
		if json.Unmarshal([]byte(rep), &r) == nil {
			c.Reporte = &r
		}
	}
	return &c, nil
}

/* ---------------- cálculo del reporte ---------------- */

// cajaVentana — desde (exclusivo) del corte que sigue.
func cajaVentana(last *CajaCorte) string {
	if last != nil {
		return last.Hasta
	}
	return time.Now().In(posLoc).Format("2006-01-02") + " 00:00:00"
}

// CajaEstado — lo que lleva la caja desde el último corte hasta ahora.
func CajaEstado(caja string) (*CajaReporte, *CajaCorte, error) {
	last, err := LastCajaCorte(caja)
	if err != nil {
		return nil, nil, err
	}
	r, err := buildCajaReporte(db.DB, caja, last, cajaTS(time.Now()))
	return r, last, err
}

type cajaQuerier interface {
	Query(string, ...interface{}) (*sql.Rows, error)
	QueryRow(string, ...interface{}) *sql.Row
}

func buildCajaReporte(q cajaQuerier, caja string, last *CajaCorte, hasta string) (*CajaReporte, error) {
	desde := cajaVentana(last)
	r := &CajaReporte{Caja: caja, Desde: desde, Hasta: hasta, Movimientos: []CajaMov{}}
	ord := 0
	add := func(m CajaMov) {
		ord++
		m.orden = ord
		m.Entrada, m.Salida = round2(m.Entrada), round2(m.Salida)
		r.Movimientos = append(r.Movimientos, m)
	}
	entra := func(forma string, v float64) {
		r.Entradas.Add(forma, v)
	}
	sale := func(forma string, v float64) {
		r.Salidas.Add(forma, v)
	}

	// 1) Entrada por corte: lo que se quedó en caja la vez pasada.
	if last != nil {
		for _, f := range CajaFormas {
			v := round2(last.Contado.Get(f) - last.Retiro.Get(f))
			if v <= 0 {
				continue
			}
			r.Fondo.Add(f, v)
			r.MovEntradas.Corte += v
			add(CajaMov{Fecha: last.Hasta, Comentario: "Fondo que quedó del corte anterior", Mov: "COR", Doc: "CORTE",
				Folio: fmt.Sprint(last.ID), Forma: f, FP: cajaFP[f], Usuario: last.Usuario, Entrada: v})
		}
	}

	// 2) Ventas hechas en el periodo (aunque luego se cancelen).
	rows, err := q.Query(`SELECT id, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s'), cliente, cajero, total,
			efectivo - cambio, cheque, vales, tarjeta, transferencia, credito, propina, propina_forma, referencia
		FROM pos_sales WHERE created_at > ? AND created_at <= ? ORDER BY created_at, id`, desde, hasta)
	if err != nil {
		return nil, err
	}
	type ventaRow struct {
		id                                  int64
		fecha, cliente, cajero, pforma, ref string
		total, cred, propina                float64
		fp                                  CajaMontos
	}
	var ventas []ventaRow
	for rows.Next() {
		var v ventaRow
		if err := rows.Scan(&v.id, &v.fecha, &v.cliente, &v.cajero, &v.total, &v.fp.Efectivo, &v.fp.Cheque, &v.fp.Vales,
			&v.fp.Tarjeta, &v.fp.Transferencia, &v.cred, &v.propina, &v.pforma, &v.ref); err != nil {
			rows.Close()
			return nil, err
		}
		ventas = append(ventas, v)
	}
	rows.Close()
	for _, v := range ventas {
		r.Ventas.Contado += v.total - v.cred
		r.Ventas.Credito += v.cred
		r.Ventas.Cantidad++
		if v.cred > 0 {
			r.Anticipos += v.total - v.cred
		}
		com := v.cliente
		if v.ref != "" {
			com += " · Ref. " + v.ref
		}
		for _, f := range CajaFormas {
			if a := v.fp.Get(f); a > 0 {
				entra(f, a)
				r.MovEntradas.Ventas += a
				add(CajaMov{Fecha: v.fecha, Comentario: com, Mov: "VEN", Doc: "TIC", Folio: fmt.Sprint(v.id), Forma: f, FP: cajaFP[f], Usuario: v.cajero, Entrada: a})
			}
		}
		if v.cred > 0 {
			add(CajaMov{Fecha: v.fecha, Comentario: com + " · queda a crédito", Mov: "VEN", Doc: "TIC", Folio: fmt.Sprint(v.id), Forma: "credito", FP: "CR", Usuario: v.cajero})
		}
		if v.propina > 0 {
			if v.pforma == "efectivo" || v.pforma == "" {
				r.PropinaEfect += v.propina
				add(CajaMov{Fecha: v.fecha, Comentario: "Propina en efectivo (no entra a caja)", Mov: "PRO", Doc: "TIC", Folio: fmt.Sprint(v.id), Forma: "efectivo", FP: "EF", Usuario: v.cajero})
			} else {
				r.Propinas.Add(v.pforma, v.propina)
				entra(v.pforma, v.propina)
				r.MovEntradas.Propinas += v.propina
				add(CajaMov{Fecha: v.fecha, Comentario: "Propina", Mov: "PRO", Doc: "TIC", Folio: fmt.Sprint(v.id), Forma: v.pforma, FP: cajaFP[v.pforma], Usuario: v.cajero, Entrada: v.propina})
			}
		}
	}

	// 3) Ventas canceladas en el periodo: se regresa el dinero.
	rows, err = q.Query(`SELECT id, DATE_FORMAT(cancelada_at, '%Y-%m-%d %H:%i:%s'), cliente, cancelada_por, cancel_motivo, total,
			efectivo - cambio, cheque, vales, tarjeta, transferencia, credito, propina, propina_forma
		FROM pos_sales WHERE cancelada = 1 AND cancelada_at > ? AND cancelada_at <= ? ORDER BY cancelada_at, id`, desde, hasta)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var fecha, cliente, por, motivo string
		var total, cred, propina float64
		var pforma string
		var fp CajaMontos
		if err := rows.Scan(&id, &fecha, &cliente, &por, &motivo, &total, &fp.Efectivo, &fp.Cheque, &fp.Vales, &fp.Tarjeta, &fp.Transferencia, &cred, &propina, &pforma); err != nil {
			rows.Close()
			return nil, err
		}
		r.Ventas.Canceladas += total - cred
		r.Ventas.CreditoCanc += cred
		r.Ventas.CantidadCancel++
		com := "Venta cancelada · " + cliente
		if motivo != "" {
			com += " · " + motivo
		}
		for _, f := range CajaFormas {
			if a := fp.Get(f); a > 0 {
				sale(f, a)
				r.MovSalidas.VentasCanc += a
				add(CajaMov{Fecha: fecha, Comentario: com, Mov: "CAN", Doc: "TIC", Folio: fmt.Sprint(id), Forma: f, FP: cajaFP[f], Usuario: por, Salida: a})
			}
		}
		// La propina de una venta cancelada también se regresa (la de efectivo nunca entró).
		if propina > 0 && pforma != "" && pforma != "efectivo" {
			sale(pforma, propina)
			r.MovSalidas.VentasCanc += propina
			r.Propinas.Add(pforma, -propina)
			add(CajaMov{Fecha: fecha, Comentario: "Propina de venta cancelada", Mov: "CAN", Doc: "TIC", Folio: fmt.Sprint(id), Forma: pforma, FP: cajaFP[pforma], Usuario: por, Salida: propina})
		}
	}
	rows.Close()

	// 4) Abonos a créditos (créditos recuperados) y abonos cancelados.
	rows, err = q.Query(`SELECT p.id, DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s'), p.monto, p.forma_pago, p.referencia, p.cajero,
			COALESCE(c.nombre, ''), COALESCE(cr.sale_id, 0)
		FROM pos_credit_payments p
		LEFT JOIN pos_clients c ON c.id = p.client_id
		LEFT JOIN pos_credits cr ON cr.id = p.credit_id
		WHERE p.created_at > ? AND p.created_at <= ? ORDER BY p.created_at, p.id`, desde, hasta)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id, folio int64
		var fecha, forma, ref, cajero, cliente string
		var monto float64
		if err := rows.Scan(&id, &fecha, &monto, &forma, &ref, &cajero, &cliente, &folio); err != nil {
			rows.Close()
			return nil, err
		}
		if cajaFP[forma] == "" || forma == "credito" {
			forma = "efectivo"
		}
		entra(forma, monto)
		r.MovEntradas.CredRecup += monto
		com := "Abono de " + cliente + " al ticket " + fmt.Sprint(folio)
		if ref != "" {
			com += " · Ref. " + ref
		}
		add(CajaMov{Fecha: fecha, Comentario: com, Mov: "ABO", Doc: "ABO", Folio: fmt.Sprint(id), Forma: forma, FP: cajaFP[forma], Usuario: cajero, Entrada: monto})
	}
	rows.Close()
	rows, err = q.Query(`SELECT p.id, DATE_FORMAT(COALESCE(p.cancelado_at, p.created_at), '%Y-%m-%d %H:%i:%s'), p.monto, p.forma_pago, p.cancelado_por,
			COALESCE(c.nombre, '')
		FROM pos_credit_payments p LEFT JOIN pos_clients c ON c.id = p.client_id
		WHERE p.cancelado = 1 AND COALESCE(p.cancelado_at, p.created_at) > ? AND COALESCE(p.cancelado_at, p.created_at) <= ?
		ORDER BY COALESCE(p.cancelado_at, p.created_at), p.id`, desde, hasta)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var fecha, forma, por, cliente string
		var monto float64
		if err := rows.Scan(&id, &fecha, &monto, &forma, &por, &cliente); err != nil {
			rows.Close()
			return nil, err
		}
		if cajaFP[forma] == "" || forma == "credito" {
			forma = "efectivo"
		}
		sale(forma, monto)
		r.MovSalidas.AbonosCanc += monto
		add(CajaMov{Fecha: fecha, Comentario: "Abono cancelado · " + cliente, Mov: "ABC", Doc: "ABO", Folio: fmt.Sprint(id), Forma: forma, FP: cajaFP[forma], Usuario: por, Salida: monto})
	}
	rows.Close()

	// 5) Movimientos de caja (gastos, compras, retiros, depósitos…).
	movs, err := listCajaMovsWindow(q, caja, desde, hasta)
	if err != nil {
		return nil, err
	}
	for _, m := range movs {
		cc := CajaConceptos[m.Concepto]
		credito := m.Forma == "credito"
		com := cc.Label
		if m.Comentario != "" {
			com += " · " + m.Comentario
		}
		if m.Referencia != "" {
			com += " · Ref. " + m.Referencia
		}
		if m.enVentana { // alta del movimiento
			switch m.Concepto {
			case "compra":
				r.Compras.Cantidad++
				if credito {
					r.Compras.Credito += m.Monto
				} else {
					r.Compras.Contado += m.Monto
					r.MovSalidas.Compras += m.Monto
				}
			case "gasto":
				r.Gastos.Cantidad++
				if credito {
					r.Gastos.Credito += m.Monto
				} else {
					r.Gastos.Contado += m.Monto
					r.MovSalidas.Gastos += m.Monto
				}
			case "nota_credito":
				r.NotasCredito.Cantidad++
				r.NotasCredito.Contado += m.Monto
				r.MovSalidas.NotasCredito += m.Monto
			case "dev_proveedor":
				r.DevProveedor.Cantidad++
				r.DevProveedor.Contado += m.Monto
				r.MovEntradas.DevPro += m.Monto
			case "pago_credito":
				r.MovSalidas.PagoCred += m.Monto
			case "retiro", "otro_salida":
				r.MovSalidas.Movimientos += m.Monto
			case "deposito", "otro_entrada":
				r.MovEntradas.Movimientos += m.Monto
			}
			mv := CajaMov{Fecha: m.Fecha, Comentario: com, Mov: cc.Code, Doc: "MOV", Folio: fmt.Sprint(m.ID), Forma: m.Forma, FP: cajaFP[m.Forma], Usuario: m.Usuario}
			if !credito {
				if cc.Tipo == "entrada" {
					entra(m.Forma, m.Monto)
					mv.Entrada = m.Monto
				} else {
					sale(m.Forma, m.Monto)
					mv.Salida = m.Monto
				}
			} else {
				mv.Comentario += " · a crédito (no sale de caja)"
			}
			add(mv)
		}
		if m.canceladoEnVentana { // cancelación del movimiento: se revierte
			switch m.Concepto {
			case "compra":
				r.Compras.CantidadCancel++
				if credito {
					r.Compras.CreditoCanc += m.Monto
				} else {
					r.Compras.Canceladas += m.Monto
					r.MovEntradas.ComprasCanc += m.Monto
				}
			case "gasto":
				r.Gastos.CantidadCancel++
				if credito {
					r.Gastos.CreditoCanc += m.Monto
				} else {
					r.Gastos.Canceladas += m.Monto
					r.MovEntradas.GastosCanc += m.Monto
				}
			case "nota_credito":
				r.NotasCredito.CantidadCancel++
				r.NotasCredito.Canceladas += m.Monto
				r.MovEntradas.NotasCreCanc += m.Monto
			case "dev_proveedor":
				r.DevProveedor.CantidadCancel++
				r.DevProveedor.Canceladas += m.Monto
				r.MovSalidas.DevProCanc += m.Monto
			case "pago_credito", "retiro", "otro_salida":
				r.MovEntradas.Movimientos += m.Monto
			case "deposito", "otro_entrada":
				r.MovSalidas.Movimientos += m.Monto
			}
			mv := CajaMov{Fecha: m.CanceladoAt, Comentario: "Cancelado · " + com, Mov: cc.Code + "-C", Doc: "MOV", Folio: fmt.Sprint(m.ID), Forma: m.Forma, FP: cajaFP[m.Forma], Usuario: m.CanceladoPor}
			if !credito {
				if cc.Tipo == "entrada" {
					sale(m.Forma, m.Monto)
					mv.Salida = m.Monto
				} else {
					entra(m.Forma, m.Monto)
					mv.Entrada = m.Monto
				}
			}
			add(mv)
		}
	}

	// Totales.
	for _, s := range []*CajaSeccion{&r.Ventas, &r.Compras, &r.Gastos, &r.NotasCredito, &r.DevProveedor} {
		s.close()
	}
	e, s := &r.MovEntradas, &r.MovSalidas
	for _, p := range []*float64{&e.Ventas, &e.CredRecup, &e.ComprasCanc, &e.NotasCreCanc, &e.Movimientos, &e.DevPro, &e.GastosCanc, &e.Propinas, &e.Corte} {
		*p = round2(*p)
	}
	e.Total = round2(e.Ventas + e.CredRecup + e.ComprasCanc + e.NotasCreCanc + e.Movimientos + e.DevPro + e.GastosCanc + e.Propinas + e.Corte)
	for _, p := range []*float64{&s.Compras, &s.PagoCred, &s.VentasCanc, &s.NotasCredito, &s.Movimientos, &s.DevProCanc, &s.Gastos, &s.AbonosCanc} {
		*p = round2(*p)
	}
	s.Total = round2(s.Compras + s.PagoCred + s.VentasCanc + s.NotasCredito + s.Movimientos + s.DevProCanc + s.Gastos + s.AbonosCanc)
	r.MovDif = round2(e.Total - s.Total)
	r.Fondo.round()
	r.Entradas.round()
	r.Salidas.round()
	r.Propinas.round()
	for _, f := range CajaFormas {
		r.Calculado.Add(f, r.Fondo.Get(f)+r.Entradas.Get(f)-r.Salidas.Get(f))
	}
	r.Transferencias = r.Calculado.Transferencia
	r.Anticipos = round2(r.Anticipos)
	r.PropinaEfect = round2(r.PropinaEfect)

	// Detalle en orden de fecha, con saldo acumulado.
	sort.SliceStable(r.Movimientos, func(i, j int) bool {
		if r.Movimientos[i].Fecha != r.Movimientos[j].Fecha {
			return r.Movimientos[i].Fecha < r.Movimientos[j].Fecha
		}
		return r.Movimientos[i].orden < r.Movimientos[j].orden
	})
	saldo := 0.0
	for i := range r.Movimientos {
		saldo = round2(saldo + r.Movimientos[i].Entrada - r.Movimientos[i].Salida)
		r.Movimientos[i].Saldo = saldo
	}
	return r, nil
}

/* ---------------- guardar corte ---------------- */

var cajaMu sync.Mutex

// SaveCajaCorte guarda el corte: calcula todo al momento y guarda la foto.
func SaveCajaCorte(caja, usuario string, contado, retiro CajaMontos) (*CajaCorte, error) {
	cajaMu.Lock()
	defer cajaMu.Unlock()
	contado.round()
	retiro.round()
	// Transferencias no se cuentan a mano (como en SICAR): se toma lo
	// calculado.
	for _, f := range CajaFormas {
		if contado.Get(f) < 0 || retiro.Get(f) < 0 {
			return nil, ErrCajaMonto
		}
	}
	last, err := LastCajaCorte(caja)
	if err != nil {
		return nil, err
	}
	hasta := cajaTS(time.Now())
	rep, err := buildCajaReporte(db.DB, caja, last, hasta)
	if err != nil {
		return nil, err
	}
	contado.Transferencia = rep.Calculado.Transferencia
	if retiro.Transferencia == 0 {
		retiro.Transferencia = contado.Transferencia
	}
	for _, f := range CajaFormas {
		if retiro.Get(f) > contado.Get(f)+0.001 {
			return nil, fmt.Errorf("%w (%s)", ErrCajaRetiro, f)
		}
	}
	c := &CajaCorte{Caja: caja, Usuario: usuario, Desde: rep.Desde, Hasta: hasta, Contado: contado, Calculado: rep.Calculado, Retiro: retiro, Reporte: rep}
	c.TContado, c.TCalculado, c.TRetirado = contado.Total(), rep.Calculado.Total(), retiro.Total()
	c.TDif = round2(c.TContado - c.TCalculado)
	raw, _ := json.Marshal(rep)
	var desdeArg interface{}
	if last != nil {
		desdeArg = last.Hasta
	} else {
		desdeArg = rep.Desde
	}
	res, err := db.DB.Exec(`INSERT INTO caja_cortes (caja, usuario, desde, hasta,
			contado_efectivo, contado_cheque, contado_vales, contado_tarjeta, contado_transferencia,
			calculado_efectivo, calculado_cheque, calculado_vales, calculado_tarjeta, calculado_transferencia,
			retiro_efectivo, retiro_cheque, retiro_vales, retiro_tarjeta, retiro_transferencia,
			contado, calculado, diferencia, retirado, reporte, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		caja, usuario, desdeArg, hasta,
		contado.Efectivo, contado.Cheque, contado.Vales, contado.Tarjeta, contado.Transferencia,
		rep.Calculado.Efectivo, rep.Calculado.Cheque, rep.Calculado.Vales, rep.Calculado.Tarjeta, rep.Calculado.Transferencia,
		retiro.Efectivo, retiro.Cheque, retiro.Vales, retiro.Tarjeta, retiro.Transferencia,
		c.TContado, c.TCalculado, c.TDif, c.TRetirado, string(raw), hasta)
	if err != nil {
		return nil, err
	}
	c.ID, _ = res.LastInsertId()
	c.Fecha = strings.Replace(hasta, " ", "T", 1)
	return c, nil
}

// GetCajaCorte — un corte con su reporte.
func GetCajaCorte(id int64) (*CajaCorte, error) {
	c, err := scanCajaCorte(db.DB.QueryRow(cajaCorteSelect+" WHERE id = ?", id), true)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrCajaNotFound
	}
	return c, err
}

// ListCajaCortes — cortes entre dos fechas (YYYY-MM-DD), el más nuevo primero.
func ListCajaCortes(desde, hasta string, limit, offset int) ([]CajaCorte, int, error) {
	where := " WHERE 1 = 1"
	args := []interface{}{}
	if desde != "" {
		where += " AND created_at >= ?"
		args = append(args, desde+" 00:00:00")
	}
	if hasta != "" {
		where += " AND created_at <= ?"
		args = append(args, hasta+" 23:59:59")
	}
	var total int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM caja_cortes"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := db.DB.Query(cajaCorteSelect+where+" ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []CajaCorte{}
	for rows.Next() {
		c, err := scanCajaCorte(rows, false)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, *c)
	}
	return out, total, rows.Err()
}

/* ---------------- movimientos de caja ---------------- */

// CajaMovimiento — una entrada o salida de dinero que no es venta.
type CajaMovimiento struct {
	ID           int64   `json:"id"`
	Caja         string  `json:"caja"`
	Tipo         string  `json:"tipo"`
	Concepto     string  `json:"concepto"`
	ConceptoTxt  string  `json:"concepto_txt"`
	Forma        string  `json:"forma_pago"`
	Monto        float64 `json:"monto"`
	Comentario   string  `json:"comentario"`
	Referencia   string  `json:"referencia"`
	Usuario      string  `json:"usuario"`
	Fecha        string  `json:"fecha"`
	Cancelado    bool    `json:"cancelado"`
	CanceladoPor string  `json:"cancelado_por,omitempty"`
	CanceladoAt  string  `json:"cancelado_at,omitempty"`
	// ¿Ya entró en un corte? (no se puede cancelar sin que lo refleje el siguiente)
	EnCorte bool `json:"en_corte"`

	enVentana, canceladoEnVentana bool
}

const cajaMovSelect = `SELECT id, caja, tipo, concepto, forma_pago, monto, comentario, referencia, usuario,
	DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s'), cancelado, cancelado_por, COALESCE(DATE_FORMAT(cancelado_at, '%Y-%m-%d %H:%i:%s'), '')
	FROM caja_movimientos`

func scanCajaMov(sc interface{ Scan(...interface{}) error }) (CajaMovimiento, error) {
	var m CajaMovimiento
	err := sc.Scan(&m.ID, &m.Caja, &m.Tipo, &m.Concepto, &m.Forma, &m.Monto, &m.Comentario, &m.Referencia, &m.Usuario,
		&m.Fecha, &m.Cancelado, &m.CanceladoPor, &m.CanceladoAt)
	m.ConceptoTxt = CajaConceptos[m.Concepto].Label
	return m, err
}

func listCajaMovsWindow(q cajaQuerier, caja, desde, hasta string) ([]CajaMovimiento, error) {
	rows, err := q.Query(cajaMovSelect+` WHERE caja = ? AND ((created_at > ? AND created_at <= ?) OR (cancelado = 1 AND cancelado_at > ? AND cancelado_at <= ?))
		ORDER BY created_at, id`, caja, desde, hasta, desde, hasta)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CajaMovimiento{}
	for rows.Next() {
		m, err := scanCajaMov(rows)
		if err != nil {
			return nil, err
		}
		m.enVentana = m.Fecha > desde && m.Fecha <= hasta
		m.canceladoEnVentana = m.Cancelado && m.CanceladoAt > desde && m.CanceladoAt <= hasta
		out = append(out, m)
	}
	return out, rows.Err()
}

// ListCajaMovimientos — los movimientos entre dos fechas (YYYY-MM-DD).
func ListCajaMovimientos(caja, desde, hasta string) ([]CajaMovimiento, error) {
	rows, err := db.DB.Query(cajaMovSelect+" WHERE caja = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC, id DESC LIMIT 1000",
		caja, desde+" 00:00:00", hasta+" 23:59:59")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	last, _ := LastCajaCorte(caja)
	out := []CajaMovimiento{}
	for rows.Next() {
		m, err := scanCajaMov(rows)
		if err != nil {
			return nil, err
		}
		m.EnCorte = last != nil && m.Fecha <= last.Hasta
		out = append(out, m)
	}
	return out, rows.Err()
}

// CreateCajaMovimiento registra una entrada o salida de caja.
func CreateCajaMovimiento(m CajaMovimiento) (*CajaMovimiento, error) {
	cc, ok := CajaConceptos[m.Concepto]
	if !ok {
		return nil, ErrCajaConcepto
	}
	if cajaFP[m.Forma] == "" || (m.Forma == "credito" && !cc.Credito) {
		return nil, ErrCajaForma
	}
	m.Monto = round2(m.Monto)
	if m.Monto <= 0 || m.Monto > 10000000 {
		return nil, ErrCajaMonto
	}
	if m.Caja == "" {
		m.Caja = CajaDefault
	}
	m.Tipo = cc.Tipo
	m.Comentario = cut(strings.TrimSpace(m.Comentario), 200)
	m.Referencia = cut(strings.TrimSpace(m.Referencia), 80)
	now := posNow()
	res, err := db.DB.Exec(`INSERT INTO caja_movimientos (caja, tipo, concepto, forma_pago, monto, comentario, referencia, usuario, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, m.Caja, m.Tipo, m.Concepto, m.Forma, m.Monto, m.Comentario, m.Referencia, m.Usuario, now)
	if err != nil {
		return nil, err
	}
	m.ID, _ = res.LastInsertId()
	m.Fecha = now
	m.ConceptoTxt = cc.Label
	return &m, nil
}

// CancelCajaMovimiento cancela un movimiento (se revierte en el corte en
// que se cancela).
func CancelCajaMovimiento(id int64, por string) (*CajaMovimiento, error) {
	m, err := scanCajaMov(db.DB.QueryRow(cajaMovSelect+" WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrCajaMovNotFound
	}
	if err != nil {
		return nil, err
	}
	if m.Cancelado {
		return nil, ErrCajaMovCancelado
	}
	now := posNow()
	if _, err := db.DB.Exec("UPDATE caja_movimientos SET cancelado = 1, cancelado_por = ?, cancelado_at = ? WHERE id = ? AND cancelado = 0", por, now, id); err != nil {
		return nil, err
	}
	m.Cancelado, m.CanceladoPor, m.CanceladoAt = true, por, now
	return &m, nil
}

func cut(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

/* ---------------- propinas ---------------- */

// CajaPropinas — propinas pendientes de corte (o un corte de propinas).
type CajaPropinas struct {
	ID       int64      `json:"id,omitempty"`
	Usuario  string     `json:"usuario,omitempty"`
	Desde    string     `json:"desde"`
	Hasta    string     `json:"hasta"`
	Montos   CajaMontos `json:"montos"`
	Efectivo float64    `json:"efectivo"` // informativo: no entra al corte
	Total    float64    `json:"total"`    // total a repartir (sin efectivo)
	Ventas   int        `json:"ventas"`
}

func lastPropinaCorte(caja string) (*CajaPropinas, error) {
	var p CajaPropinas
	err := db.DB.QueryRow(`SELECT id, usuario, COALESCE(DATE_FORMAT(desde, '%Y-%m-%d %H:%i:%s'), ''), DATE_FORMAT(hasta, '%Y-%m-%d %H:%i:%s'),
			efectivo, tarjeta, transferencia, vales, cheque, total
		FROM caja_propina_cortes WHERE caja = ? ORDER BY hasta DESC, id DESC LIMIT 1`, caja).
		Scan(&p.ID, &p.Usuario, &p.Desde, &p.Hasta, &p.Efectivo, &p.Montos.Tarjeta, &p.Montos.Transferencia, &p.Montos.Vales, &p.Montos.Cheque, &p.Total)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return &p, err
}

// PendingPropinas — propinas desde el último corte de propinas.
func PendingPropinas(caja string) (*CajaPropinas, *CajaPropinas, error) {
	last, err := lastPropinaCorte(caja)
	if err != nil {
		return nil, nil, err
	}
	desde := "2000-01-01 00:00:00"
	if last != nil {
		desde = last.Hasta
	}
	hasta := posNow()
	p := &CajaPropinas{Desde: desde, Hasta: hasta}
	rows, err := db.DB.Query(`SELECT propina, propina_forma FROM pos_sales
		WHERE propina > 0 AND cancelada = 0 AND created_at > ? AND created_at <= ?`, desde, hasta)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var v float64
		var f string
		if err := rows.Scan(&v, &f); err != nil {
			return nil, nil, err
		}
		p.Ventas++
		if f == "efectivo" || f == "" {
			p.Efectivo += v
		} else {
			p.Montos.Add(f, v)
		}
	}
	p.Efectivo = round2(p.Efectivo)
	p.Montos.round()
	p.Total = p.Montos.Total()
	return p, last, rows.Err()
}

// SavePropinaCorte guarda el corte de propinas.
func SavePropinaCorte(caja, usuario string) (*CajaPropinas, error) {
	cajaMu.Lock()
	defer cajaMu.Unlock()
	p, last, err := PendingPropinas(caja)
	if err != nil {
		return nil, err
	}
	if p.Ventas == 0 {
		return nil, ErrCajaSinPropinas
	}
	var desdeArg interface{}
	if last != nil {
		desdeArg = last.Hasta
	}
	res, err := db.DB.Exec(`INSERT INTO caja_propina_cortes (caja, usuario, desde, hasta, efectivo, tarjeta, transferencia, vales, cheque, total, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, caja, usuario, desdeArg, p.Hasta, p.Efectivo, p.Montos.Tarjeta, p.Montos.Transferencia,
		p.Montos.Vales, p.Montos.Cheque, p.Total, p.Hasta)
	if err != nil {
		return nil, err
	}
	p.ID, _ = res.LastInsertId()
	p.Usuario = usuario
	return p, nil
}

// LastPropinaCorte — el último corte de propinas (nil si no hay).
func LastPropinaCorte(caja string) (*CajaPropinas, error) { return lastPropinaCorte(caja) }
