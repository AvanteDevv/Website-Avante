package models

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"avante-optics/db"
)

// PagoItem: una línea del carrito ya con el precio del servidor.
type PagoItem struct {
	ProductID int64   `json:"productId"`
	Name      string  `json:"name"`
	Brand     string  `json:"brand"`
	Qty       int     `json:"qty"`
	UnitPrice float64 `json:"unitPrice"`
	RxOption  string  `json:"rxOption,omitempty"`
	RxOD      string  `json:"rxOD,omitempty"`
	RxOI      string  `json:"rxOI,omitempty"`
}

// PagoClip: un intento de pago con Clip.
type PagoClip struct {
	ID         int64
	Ref        string
	ClipID     string
	URL        string
	Monto      float64
	Estado     string // pendiente | pagado | fallido
	ClipEstado string
	Items      []PagoItem
	Nombre     string
	Email      string
	Tel        string
	UserID     int64
	OrderIDs   []int64
}

var (
	// ErrPagoNotFound: no existe ese pago.
	ErrPagoNotFound = errors.New("pago no encontrado")
	// ErrProductNotFound: el producto ya no existe en la tienda.
	ErrProductNotFound = errors.New("producto no encontrado")
)

// NewPagoRef genera la referencia del pago (va en la URL de regreso).
func NewPagoRef() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "AVP" + strings.ToUpper(hex.EncodeToString(b))
}

// ProductForSale: título, marca y precio actual de un producto.
func ProductForSale(id int64) (title, brand string, price float64, err error) {
	err = db.DB.QueryRow(`SELECT title, brand, price FROM products WHERE id = ?`, id).Scan(&title, &brand, &price)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrProductNotFound
	}
	return
}

// ProductForSaleByName: para carritos viejos que no traen el id.
func ProductForSaleByName(name, brand string) (id int64, title, b string, price float64, err error) {
	err = db.DB.QueryRow(`SELECT id, title, brand, price FROM products WHERE title = ? AND (? = '' OR brand = ?) ORDER BY id DESC LIMIT 1`,
		name, brand, brand).Scan(&id, &title, &b, &price)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrProductNotFound
	}
	return
}

// CreatePagoClip guarda el intento de pago (antes de mandar al cliente a Clip).
func CreatePagoClip(p *PagoClip) error {
	items, _ := json.Marshal(p.Items)
	var uid interface{}
	if p.UserID > 0 {
		uid = p.UserID
	}
	res, err := db.DB.Exec(`INSERT INTO pagos_clip (ref, monto, items, cliente_nombre, cliente_email, cliente_tel, user_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, p.Ref, p.Monto, string(items), p.Nombre, p.Email, p.Tel, uid)
	if err != nil {
		return err
	}
	p.ID, _ = res.LastInsertId()
	p.Estado = "pendiente"
	return nil
}

// SetPagoClipLink guarda el id y el link que regresó Clip.
func SetPagoClipLink(ref, clipID, url, clipEstado string) error {
	_, err := db.DB.Exec(`UPDATE pagos_clip SET clip_id = ?, url = ?, clip_estado = ? WHERE ref = ?`, clipID, url, clipEstado, ref)
	return err
}

// SetPagoClipEstado actualiza el estado que reporta Clip (y "fallido" si ya no se va a pagar).
func SetPagoClipEstado(ref, clipEstado string, fallido bool) error {
	q := `UPDATE pagos_clip SET clip_estado = ? WHERE ref = ? AND estado = 'pendiente'`
	if fallido {
		q = `UPDATE pagos_clip SET clip_estado = ?, estado = 'fallido' WHERE ref = ? AND estado = 'pendiente'`
	}
	_, err := db.DB.Exec(q, clipEstado, ref)
	return err
}

const pagoCols = `id, ref, clip_id, COALESCE(url, ''), monto, estado, clip_estado, COALESCE(items, ''), cliente_nombre, cliente_email, cliente_tel, COALESCE(user_id, 0), order_ids`

func scanPago(row interface{ Scan(...any) error }) (*PagoClip, error) {
	var p PagoClip
	var items, orders string
	err := row.Scan(&p.ID, &p.Ref, &p.ClipID, &p.URL, &p.Monto, &p.Estado, &p.ClipEstado, &items, &p.Nombre, &p.Email, &p.Tel, &p.UserID, &orders)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrPagoNotFound
	}
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(items), &p.Items)
	for _, s := range strings.Split(orders, ",") {
		if v, e := strconv.ParseInt(strings.TrimSpace(s), 10, 64); e == nil && v > 0 {
			p.OrderIDs = append(p.OrderIDs, v)
		}
	}
	return &p, nil
}

// GetPagoClip por referencia.
func GetPagoClip(ref string) (*PagoClip, error) {
	return scanPago(db.DB.QueryRow(`SELECT `+pagoCols+` FROM pagos_clip WHERE ref = ?`, ref))
}

// GetPagoClipByClipID por el id del link de Clip (lo que trae el webhook).
func GetPagoClipByClipID(clipID string) (*PagoClip, error) {
	return scanPago(db.DB.QueryRow(`SELECT `+pagoCols+` FROM pagos_clip WHERE clip_id = ? ORDER BY id DESC LIMIT 1`, clipID))
}

// MarkPagoClipPagado marca el pago como pagado UNA sola vez: regresa
// true solo para quien lo marcó (así los pedidos no se duplican si el
// webhook y la página de regreso llegan al mismo tiempo).
func MarkPagoClipPagado(ref, clipEstado string) (bool, error) {
	res, err := db.DB.Exec(`UPDATE pagos_clip SET estado = 'pagado', clip_estado = ?, pagado = NOW()
		WHERE ref = ? AND estado <> 'pagado'`, clipEstado, ref)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

// SetPagoClipOrders guarda los pedidos que se crearon con el pago.
func SetPagoClipOrders(ref string, ids []int64) error {
	parts := make([]string, len(ids))
	for i, id := range ids {
		parts[i] = strconv.FormatInt(id, 10)
	}
	_, err := db.DB.Exec(`UPDATE pagos_clip SET order_ids = ? WHERE ref = ?`, strings.Join(parts, ","), ref)
	return err
}

// SetOrderPagoRef liga el pedido con su pago.
func SetOrderPagoRef(orderID int64, ref string) {
	db.DB.Exec(`UPDATE orders SET pago_ref = ? WHERE id = ?`, ref, orderID)
}
