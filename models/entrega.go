package models

import (
	"database/sql"
	"errors"
	"strings"

	"avante-optics/db"
)

// Formas de entrega de la tienda en línea.
const (
	EntregaSucursal  = "sucursal"  // el cliente recoge en la sucursal (siempre disponible)
	EntregaDomicilio = "domicilio" // envío a domicilio (se activa en Elementor → Ecommerce)
)

// SucursalRecoleccion es la dirección donde se recogen los pedidos.
const SucursalRecoleccion = "Luis Donaldo Colosio #69, Col. Centro, Hermosillo, Son."

// Direccion de envío que captura el cliente en la pasarela.
type Direccion struct {
	Calle       string `json:"calle"`
	Numero      string `json:"numero"`
	Colonia     string `json:"colonia"`
	CP          string `json:"cp"`
	Ciudad      string `json:"ciudad"`
	Referencias string `json:"referencias"`
}

// Texto de una sola línea, para el panel de pedidos.
func (d Direccion) String() string {
	var parts []string
	if s := strings.TrimSpace(strings.TrimSpace(d.Calle) + " " + strings.TrimSpace(d.Numero)); s != "" {
		parts = append(parts, s)
	}
	if d.Colonia != "" {
		parts = append(parts, "Col. "+d.Colonia)
	}
	if d.CP != "" {
		parts = append(parts, "C.P. "+d.CP)
	}
	if d.Ciudad != "" {
		parts = append(parts, d.Ciudad)
	}
	s := strings.Join(parts, ", ")
	if d.Referencias != "" {
		s += " (" + d.Referencias + ")"
	}
	return s
}

// EnvioDomicilioActivo dice si el cliente puede elegir envío a domicilio.
// Si no hay fila o falla la consulta, queda apagado.
func EnvioDomicilioActivo() bool {
	var on bool
	err := db.DB.QueryRow(`SELECT envio_domicilio FROM ecommerce_settings WHERE id = 1`).Scan(&on)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return false
	}
	return on
}

// SetEnvioDomicilioActivo prende o apaga el envío a domicilio.
func SetEnvioDomicilioActivo(on bool) error {
	_, err := db.DB.Exec(`INSERT INTO ecommerce_settings (id, envio_domicilio) VALUES (1, ?)
		ON DUPLICATE KEY UPDATE envio_domicilio = VALUES(envio_domicilio)`, on)
	return err
}

// SetOrderEntrega guarda cómo se entrega un pedido de la tienda en línea.
func SetOrderEntrega(orderID int64, entrega, direccion string) {
	_, _ = db.DB.Exec(`UPDATE orders SET entrega = ?, entrega_direccion = ? WHERE id = ?`, entrega, direccion, orderID)
}

// orderEntregas: entrega y dirección de los pedidos que la tienen.
func orderEntregas() map[int64][2]string {
	out := map[int64][2]string{}
	rows, err := db.DB.Query(`SELECT id, entrega, COALESCE(entrega_direccion, '') FROM orders WHERE entrega <> ''`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var e, d string
		if rows.Scan(&id, &e, &d) == nil {
			out[id] = [2]string{e, d}
		}
	}
	return out
}
