package models

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"avante-optics/db"
)

// =========================================================
// MODO SIN CONEXIÓN — app "Avante Campo"
//
// La tablet trabaja sin internet (punto de venta y examen de la vista)
// con una copia del catálogo, los clientes, los pacientes y la plantilla
// del examen. Cuando hay señal manda lo que capturó a /api/offline/sync
// y aquí se guarda en las mismas tablas que usa la web.
//
// Reglas:
//   - Cada registro trae un UUID de la tablet (client_uuid, UNIQUE): si
//     ya existe, se regresa el mismo id (reintento seguro, sin duplicar).
//   - Ventas: se respeta el precio que se cobró en la tablet; el
//     inventario se descuenta aunque quede negativo (la venta ya ocurrió)
//     y no se revisa el límite de crédito. created_at = cuando llegó (así
//     entra al siguiente corte de caja); offline_at = cuándo se vendió.
//   - Exámenes: created_at = la fecha real del examen en la tablet.
// =========================================================

var (
	ErrOfflineDeviceNotFound = errors.New("tablet no vinculada o desactivada")
	ErrOfflineBadUUID        = errors.New("identificador inválido")
)

var offlineUUIDRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func validOfflineUUID(s string) bool { return offlineUUIDRe.MatchString(s) }

func offlineTokenHash(tok string) string {
	h := sha256.Sum256([]byte(tok))
	return hex.EncodeToString(h[:])
}

// offlineTime: "YYYY-MM-DD HH:MM:SS" de la tablet (hora de Hermosillo).
// Si viene mal o en el futuro, se usa la hora del servidor.
func offlineTime(s string) string {
	t, err := time.ParseInLocation("2006-01-02 15:04:05", strings.TrimSpace(s), posLoc)
	now := time.Now().In(posLoc)
	if err != nil || t.After(now.Add(10*time.Minute)) || t.Year() < 2020 {
		return now.Format("2006-01-02 15:04:05")
	}
	return t.Format("2006-01-02 15:04:05")
}

/* ---------------- dispositivos ---------------- */

type OfflineDevice struct {
	ID         int64  `json:"id"`
	Nombre     string `json:"nombre"`
	Prefijo    string `json:"prefijo"`
	StaffRole  string `json:"staff_role"`
	StaffID    int64  `json:"staff_id"`
	StaffName  string `json:"staff_name"`
	StaffEmail string `json:"staff_email"`
}

// CreateOfflineDevice vincula una tablet a una cuenta de staff. Regresa
// el token en claro (solo esta vez; aquí se guarda su hash).
func CreateOfflineDevice(nombre, role string, staffID int64, staffName, staffEmail string) (*OfflineDevice, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return nil, "", err
	}
	tok := hex.EncodeToString(buf)
	nombre = strings.TrimSpace(nombre)
	if nombre == "" {
		nombre = "Tablet"
	}
	if len([]rune(nombre)) > 80 {
		nombre = string([]rune(nombre)[:80])
	}
	res, err := db.DB.Exec(
		`INSERT INTO offline_devices (nombre, staff_role, staff_id, staff_name, staff_email, token_hash, last_seen_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		nombre, role, staffID, staffName, staffEmail, offlineTokenHash(tok), posNow(),
	)
	if err != nil {
		return nil, "", err
	}
	id, _ := res.LastInsertId()
	prefijo := fmt.Sprintf("C%d", id)
	if _, err := db.DB.Exec("UPDATE offline_devices SET prefijo = ? WHERE id = ?", prefijo, id); err != nil {
		return nil, "", err
	}
	return &OfflineDevice{ID: id, Nombre: nombre, Prefijo: prefijo, StaffRole: role, StaffID: staffID, StaffName: staffName, StaffEmail: staffEmail}, tok, nil
}

// GetOfflineDeviceByToken valida el token de la tablet.
func GetOfflineDeviceByToken(tok string) (*OfflineDevice, error) {
	tok = strings.TrimSpace(tok)
	if len(tok) < 32 {
		return nil, ErrOfflineDeviceNotFound
	}
	var d OfflineDevice
	err := db.DB.QueryRow(
		`SELECT id, nombre, prefijo, staff_role, staff_id, staff_name, staff_email
		 FROM offline_devices WHERE token_hash = ? AND revocado = 0`, offlineTokenHash(tok),
	).Scan(&d.ID, &d.Nombre, &d.Prefijo, &d.StaffRole, &d.StaffID, &d.StaffName, &d.StaffEmail)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrOfflineDeviceNotFound
	}
	if err != nil {
		return nil, err
	}
	if _, err := db.DB.Exec("UPDATE offline_devices SET last_seen_at = ? WHERE id = ?", posNow(), d.ID); err != nil {
		log.Printf("offline: last_seen_at %d: %v", d.ID, err)
	}
	return &d, nil
}

func TouchOfflineSync(deviceID int64) {
	if _, err := db.DB.Exec("UPDATE offline_devices SET last_sync_at = ? WHERE id = ?", posNow(), deviceID); err != nil {
		log.Printf("offline: last_sync_at %d: %v", deviceID, err)
	}
}

/* ---------------- datos para trabajar sin internet ---------------- */

type OfflineProducto struct {
	ID          int64   `json:"id"`
	Clave       string  `json:"clave"`
	Descripcion string  `json:"descripcion"`
	Precio      float64 `json:"precio"`
	Existencia  int     `json:"existencia"`
	Servicio    bool    `json:"servicio"`
}

func ListOfflineProductos() ([]OfflineProducto, error) {
	rows, err := db.DB.Query(`SELECT id, COALESCE(clave, ''), descripcion, precio_venta, cantidad_actual, servicio
		FROM inventory_items ORDER BY descripcion`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OfflineProducto{}
	for rows.Next() {
		var p OfflineProducto
		if err := rows.Scan(&p.ID, &p.Clave, &p.Descripcion, &p.Precio, &p.Existencia, &p.Servicio); err != nil {
			return nil, err
		}
		p.Precio = round2(p.Precio)
		out = append(out, p)
	}
	return out, rows.Err()
}

type OfflineCliente struct {
	ID      int64   `json:"id"`
	Numero  string  `json:"numero"`
	Nombre  string  `json:"nombre"`
	Celular string  `json:"celular"`
	Dias    int     `json:"dias"`
	Limite  float64 `json:"limite"`
	Saldo   float64 `json:"saldo"`
}

func ListOfflineClientes() ([]OfflineCliente, error) {
	rows, err := db.DB.Query(`SELECT c.id, c.numero, c.nombre, c.celular, c.dias_credito, c.limite_credito,
			COALESCE(SUM(cr.saldo), 0)
		FROM pos_clients c
		LEFT JOIN pos_credits cr ON cr.client_id = c.id AND cr.saldo > 0
		GROUP BY c.id ORDER BY c.nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OfflineCliente{}
	for rows.Next() {
		var c OfflineCliente
		if err := rows.Scan(&c.ID, &c.Numero, &c.Nombre, &c.Celular, &c.Dias, &c.Limite, &c.Saldo); err != nil {
			return nil, err
		}
		c.Limite, c.Saldo = round2(c.Limite), round2(c.Saldo)
		out = append(out, c)
	}
	return out, rows.Err()
}

type OfflinePaciente struct {
	UserID   int64  `json:"user_id"`
	Nombre   string `json:"nombre"`
	Telefono string `json:"telefono"`
}

// ListOfflinePacientes junta a los clientes con cuenta (users) y a los
// pacientes que ya tienen examen, sin repetir por nombre.
func ListOfflinePacientes() ([]OfflinePaciente, error) {
	seen := map[string]int{}
	out := []OfflinePaciente{}
	add := func(p OfflinePaciente) {
		k := NormalizePatientName(p.Nombre)
		if k == "" {
			return
		}
		if i, ok := seen[k]; ok {
			if out[i].UserID == 0 && p.UserID > 0 {
				out[i].UserID = p.UserID
			}
			if out[i].Telefono == "" {
				out[i].Telefono = p.Telefono
			}
			return
		}
		seen[k] = len(out)
		out = append(out, p)
	}

	rows, err := db.DB.Query(`SELECT id, name, COALESCE(phone, '') FROM users ORDER BY name LIMIT 20000`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var p OfflinePaciente
		if err := rows.Scan(&p.UserID, &p.Nombre, &p.Telefono); err != nil {
			rows.Close()
			return nil, err
		}
		add(p)
	}
	rows.Close()

	rows, err = db.DB.Query(`SELECT patient_name, MAX(patient_phone), COALESCE(MAX(user_id), 0)
		FROM eye_exams GROUP BY patient_name ORDER BY patient_name LIMIT 20000`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p OfflinePaciente
		if err := rows.Scan(&p.Nombre, &p.Telefono, &p.UserID); err != nil {
			return nil, err
		}
		add(p)
	}
	return out, rows.Err()
}

/* ---------------- lo que manda la tablet ---------------- */

type OfflineClienteIn struct {
	UUID    string `json:"uuid"`
	Nombre  string `json:"nombre"`
	Celular string `json:"celular"`
}

type OfflineSaleItemIn struct {
	InventoryID int64   `json:"inventory_id"`
	Clave       string  `json:"clave"`
	Descripcion string  `json:"descripcion"`
	Cantidad    int     `json:"cantidad"`
	Precio      float64 `json:"precio"`
	Descuento   float64 `json:"descuento"` // %
}

type OfflineSaleIn struct {
	UUID       string              `json:"uuid"`
	Folio      string              `json:"folio"`
	Fecha      string              `json:"fecha"`
	ClientID   int64               `json:"client_id"`
	ClientUUID string              `json:"client_uuid"`
	Cliente    string              `json:"cliente"`
	Items      []OfflineSaleItemIn `json:"productos"`
	Pagos      PosPayments         `json:"pagos"`
	Referencia string              `json:"referencia"`
}

type OfflineExamIn struct {
	UUID         string          `json:"uuid"`
	Fecha        string          `json:"fecha"`
	TemplateID   int64           `json:"template_id"`
	PatientName  string          `json:"patient_name"`
	PatientPhone string          `json:"patient_phone"`
	UserID       int64           `json:"user_id"`
	Data         json.RawMessage `json:"data"`
}

func cutRunes(s string, n int) string {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// SaveOfflineCliente da de alta un cliente creado en la tablet (con el
// siguiente No. de cliente). Regresa su id y número.
func SaveOfflineCliente(dev *OfflineDevice, in OfflineClienteIn) (int64, string, error) {
	if !validOfflineUUID(in.UUID) {
		return 0, "", ErrOfflineBadUUID
	}
	var id int64
	var numero string
	err := db.DB.QueryRow("SELECT id, numero FROM pos_clients WHERE client_uuid = ?", in.UUID).Scan(&id, &numero)
	if err == nil {
		return id, numero, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, "", err
	}
	nombre := cutRunes(in.Nombre, 120)
	if nombre == "" {
		return 0, "", fmt.Errorf("el cliente no trae nombre")
	}
	celular := cutRunes(in.Celular, 20)
	by := cutRunes(dev.StaffName+" ("+dev.Prefijo+")", 120)

	for intento := 0; intento < 5; intento++ {
		numero, _ = NextPosClientNumero()
		res, err := db.DB.Exec(
			`INSERT INTO pos_clients (numero, nombre, celular, created_by, client_uuid) VALUES (?, ?, ?, ?, ?)`,
			numero, nombre, celular, by, in.UUID,
		)
		if err == nil {
			id, _ = res.LastInsertId()
			return id, numero, nil
		}
		if !strings.Contains(err.Error(), "1062") {
			return 0, "", err
		}
		// ¿Ya entró por otro reintento? Si no, el número se ocupó: otro.
		if e := db.DB.QueryRow("SELECT id, numero FROM pos_clients WHERE client_uuid = ?", in.UUID).Scan(&id, &numero); e == nil {
			return id, numero, nil
		}
	}
	return 0, "", fmt.Errorf("no se pudo asignar número de cliente")
}

// OfflineClientIDByUUID: el id del servidor de un cliente creado en la tablet.
func OfflineClientIDByUUID(uuid string) int64 {
	var id int64
	if validOfflineUUID(uuid) {
		_ = db.DB.QueryRow("SELECT id FROM pos_clients WHERE client_uuid = ?", uuid).Scan(&id)
	}
	return id
}

type OfflineSaleResult struct {
	ID       int64      `json:"folio"`
	Existed  bool       `json:"-"`
	Pedido   *PosPedido `json:"pedido,omitempty"`
	CreditID int64      `json:"credit_id,omitempty"`
}

// SaveOfflineSale guarda una venta hecha sin internet (ver reglas arriba).
func SaveOfflineSale(dev *OfflineDevice, in OfflineSaleIn) (*OfflineSaleResult, error) {
	if !validOfflineUUID(in.UUID) {
		return nil, ErrOfflineBadUUID
	}
	var existing int64
	err := db.DB.QueryRow("SELECT id FROM pos_sales WHERE client_uuid = ?", in.UUID).Scan(&existing)
	if err == nil {
		return &OfflineSaleResult{ID: existing, Existed: true}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if len(in.Items) == 0 {
		return nil, fmt.Errorf("la venta no trae productos")
	}
	if in.ClientID == 0 && in.ClientUUID != "" {
		in.ClientID = OfflineClientIDByUUID(in.ClientUUID)
		if in.ClientID == 0 {
			return nil, fmt.Errorf("el cliente de la venta todavía no se sincroniza")
		}
	}
	vendida := offlineTime(in.Fecha)
	cajero := cutRunes(dev.StaffName, 120)

	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	type linea struct {
		item     PosSaleItem
		invID    interface{}
		antes    int
		servicio bool
	}
	lineas := make([]linea, 0, len(in.Items))
	var subtotal, total float64
	for _, it := range in.Items {
		l := linea{}
		cant := it.Cantidad
		if cant <= 0 {
			cant = 1
		}
		desc := it.Descuento
		if desc < 0 {
			desc = 0
		}
		if desc > 100 {
			desc = 100
		}
		precio := round2(it.Precio)
		if precio < 0 {
			precio = 0
		}
		descripcion, clave := cutRunes(it.Descripcion, 200), cutRunes(it.Clave, 60)
		if it.InventoryID > 0 {
			var d, c string
			var stock int
			var servicio bool
			e := tx.QueryRow("SELECT descripcion, COALESCE(clave,''), cantidad_actual, servicio FROM inventory_items WHERE id = ? FOR UPDATE", it.InventoryID).
				Scan(&d, &c, &stock, &servicio)
			switch {
			case e == nil:
				l.invID, l.antes, l.servicio = it.InventoryID, stock, servicio
				if descripcion == "" {
					descripcion = d
				}
				if clave == "" {
					clave = c
				}
				if !servicio {
					if _, err := tx.Exec("UPDATE inventory_items SET cantidad_actual = cantidad_actual - ? WHERE id = ?", cant, it.InventoryID); err != nil {
						return nil, err
					}
				}
			case errors.Is(e, sql.ErrNoRows):
				// El artículo se borró del inventario: la venta se guarda igual.
				l.servicio = true
			default:
				return nil, e
			}
		} else {
			l.servicio = true
		}
		if descripcion == "" {
			descripcion = "Artículo"
		}
		importe := round2(precio * float64(cant) * (1 - desc/100))
		l.item = PosSaleItem{InventoryID: it.InventoryID, Clave: clave, Descripcion: descripcion, Cantidad: cant, Precio: precio, Descuento: desc, Importe: importe}
		subtotal += precio * float64(cant)
		total += importe
		lineas = append(lineas, l)
	}
	subtotal, total = round2(subtotal), round2(total)

	p := in.Pagos
	for _, v := range []*float64{&p.Efectivo, &p.Tarjeta, &p.Transferencia, &p.Vales, &p.Cheque, &p.Credito} {
		if *v < 0 {
			*v = 0
		}
		*v = round2(*v)
	}
	paid := round2(p.Efectivo + p.Tarjeta + p.Transferencia + p.Vales + p.Cheque + p.Credito)
	if paid < total {
		return nil, fmt.Errorf("falta cobrar %.2f", round2(total-paid))
	}
	cambio := round2(paid - total)

	// Cliente
	cliente := cutRunes(in.Cliente, 120)
	var clientArg interface{}
	var diasCredito int
	if in.ClientID > 0 {
		var nombre string
		e := tx.QueryRow("SELECT nombre, dias_credito FROM pos_clients WHERE id = ?", in.ClientID).Scan(&nombre, &diasCredito)
		if errors.Is(e, sql.ErrNoRows) {
			return nil, ErrPosClientNotFound
		}
		if e != nil {
			return nil, e
		}
		clientArg = in.ClientID
		cliente = nombre
	}
	if p.Credito > 0 && clientArg == nil {
		return nil, fmt.Errorf("para dejar algo a crédito la venta necesita un cliente")
	}
	if cliente == "" {
		cliente = "PÚBLICO EN GENERAL"
	}
	ref := cutRunes(in.Referencia, 80)
	folio := cutRunes(in.Folio, 30)

	res, err := tx.Exec(
		`INSERT INTO pos_sales (client_id, cliente, cajero, subtotal, descuento, total, efectivo, tarjeta, transferencia, vales, cheque, credito, cambio, referencia,
			created_at, client_uuid, offline_folio, offline_at, device_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		clientArg, cliente, cajero, subtotal, round2(subtotal-total), total,
		p.Efectivo, p.Tarjeta, p.Transferencia, p.Vales, p.Cheque, p.Credito, cambio, ref,
		posNow(), in.UUID, folio, vendida, dev.ID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "1062") {
			// Entró por otro reintento al mismo tiempo.
			tx.Rollback()
			var id int64
			if e := db.DB.QueryRow("SELECT id FROM pos_sales WHERE client_uuid = ?", in.UUID).Scan(&id); e == nil {
				return &OfflineSaleResult{ID: id, Existed: true}, nil
			}
		}
		return nil, err
	}
	saleID, _ := res.LastInsertId()
	items := make([]PosSaleItem, 0, len(lineas))
	for _, l := range lineas {
		it := l.item
		if _, err := tx.Exec(
			`INSERT INTO pos_sale_items (sale_id, inventory_id, clave, descripcion, cantidad, precio, descuento, importe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			saleID, l.invID, it.Clave, it.Descripcion, it.Cantidad, it.Precio, it.Descuento, it.Importe,
		); err != nil {
			return nil, err
		}
		if !l.servicio {
			logInvVenta(tx, it.InventoryID, it.Cantidad, l.antes, saleID, cajero)
		}
		items = append(items, it)
	}
	if err := fillPosRastreo(tx, saleID, items); err != nil {
		log.Printf("offline: rastreo de la venta %d: %v", saleID, err)
	}

	out := &OfflineSaleResult{ID: saleID}
	if p.Credito > 0 {
		fecha, _ := time.ParseInLocation("2006-01-02 15:04:05", vendida, posLoc)
		var venceArg interface{}
		if diasCredito > 0 {
			venceArg = fecha.AddDate(0, 0, diasCredito).Format("2006-01-02")
		}
		res, err := tx.Exec(
			"INSERT INTO pos_credits (sale_id, client_id, monto, saldo, fecha, vence) VALUES (?, ?, ?, ?, ?, ?)",
			saleID, in.ClientID, p.Credito, p.Credito, fecha.Format("2006-01-02"), venceArg,
		)
		if err != nil {
			return nil, err
		}
		out.CreditID, _ = res.LastInsertId()
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	if ped, err := CreatePosPedido(saleID, cajero); err == nil {
		out.Pedido = ped
	} else if !errors.Is(err, ErrPosPedidoSinProductos) {
		log.Printf("offline: no se pudo abrir el pedido de la venta %d: %v", saleID, err)
	}
	return out, nil
}

// SaveOfflineExam guarda un examen de la vista hecho sin internet.
func SaveOfflineExam(dev *OfflineDevice, in OfflineExamIn) (int64, bool, error) {
	if !validOfflineUUID(in.UUID) {
		return 0, false, ErrOfflineBadUUID
	}
	var id int64
	err := db.DB.QueryRow("SELECT id FROM eye_exams WHERE client_uuid = ?", in.UUID).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, false, err
	}
	name := cutRunes(in.PatientName, 120)
	if name == "" {
		return 0, false, fmt.Errorf("el examen no trae nombre del paciente")
	}
	if in.TemplateID <= 0 {
		return 0, false, fmt.Errorf("el examen no trae plantilla")
	}
	if len(in.Data) == 0 || !json.Valid(in.Data) {
		return 0, false, fmt.Errorf("los datos del examen no son válidos")
	}
	var userArg interface{}
	if in.UserID > 0 {
		var n int
		if e := db.DB.QueryRow("SELECT COUNT(*) FROM users WHERE id = ?", in.UserID).Scan(&n); e == nil && n > 0 {
			userArg = in.UserID
		}
	}
	res, err := db.DB.Exec(
		`INSERT INTO eye_exams (template_id, patient_name, patient_phone, data, created_by_role, created_by_id, created_by_name, user_id, created_at, client_uuid, device_id)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		in.TemplateID, name, cutRunes(in.PatientPhone, 30), []byte(in.Data), dev.StaffRole, dev.StaffID, cutRunes(dev.StaffName, 120),
		userArg, offlineTime(in.Fecha), in.UUID, dev.ID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "1062") {
			if e := db.DB.QueryRow("SELECT id FROM eye_exams WHERE client_uuid = ?", in.UUID).Scan(&id); e == nil {
				return id, true, nil
			}
		}
		return 0, false, err
	}
	id, _ = res.LastInsertId()
	return id, false, nil
}
