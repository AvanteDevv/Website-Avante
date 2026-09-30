package models

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// InventoryItem es un producto del inventario (Admin → Inventario).
type InventoryItem struct {
	ID             int64     `json:"id"`
	Descripcion    string    `json:"descripcion"`
	PrecioCosto    float64   `json:"precio_costo"`
	PrecioVenta    float64   `json:"precio_venta"`
	Cantidad       int       `json:"cantidad"`
	CantidadActual int       `json:"cantidad_actual"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// InventoryPublicItem es lo que ve recepción al buscar (Consultas):
// sin el precio de costo.
type InventoryPublicItem struct {
	ID             int64   `json:"id"`
	Descripcion    string  `json:"descripcion"`
	PrecioVenta    float64 `json:"precio_venta"`
	CantidadActual int     `json:"cantidad_actual"`
}

// ErrInventoryNotFound — no existe ese producto.
var ErrInventoryNotFound = errors.New("producto no encontrado")

// ErrInventoryNotEnough — no hay suficientes piezas para descontar.
var ErrInventoryNotEnough = errors.New("no hay suficientes piezas en existencia")

const inventoryCols = "id, descripcion, precio_costo, precio_venta, cantidad, cantidad_actual, created_at, updated_at"

func scanInventory(sc interface{ Scan(...interface{}) error }) (InventoryItem, error) {
	var it InventoryItem
	err := sc.Scan(&it.ID, &it.Descripcion, &it.PrecioCosto, &it.PrecioVenta, &it.Cantidad, &it.CantidadActual, &it.CreatedAt, &it.UpdatedAt)
	return it, err
}

// ListInventory regresa todo el inventario (admin), más nuevo primero.
func ListInventory() ([]InventoryItem, error) {
	rows, err := db.DB.Query("SELECT " + inventoryCols + " FROM inventory_items ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InventoryItem{}
	for rows.Next() {
		it, err := scanInventory(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// GetInventoryItem busca un producto por id.
func GetInventoryItem(id int64) (*InventoryItem, error) {
	it, err := scanInventory(db.DB.QueryRow("SELECT "+inventoryCols+" FROM inventory_items WHERE id = ?", id))
	if err == sql.ErrNoRows {
		return nil, ErrInventoryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &it, nil
}

// CreateInventoryItem agrega un producto.
func CreateInventoryItem(it InventoryItem) (*InventoryItem, error) {
	res, err := db.DB.Exec(
		"INSERT INTO inventory_items (descripcion, precio_costo, precio_venta, cantidad, cantidad_actual) VALUES (?, ?, ?, ?, ?)",
		strings.TrimSpace(it.Descripcion), it.PrecioCosto, it.PrecioVenta, it.Cantidad, it.CantidadActual,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return GetInventoryItem(id)
}

// UpdateInventoryItem guarda los cambios de un producto.
func UpdateInventoryItem(it InventoryItem) (*InventoryItem, error) {
	res, err := db.DB.Exec(
		"UPDATE inventory_items SET descripcion = ?, precio_costo = ?, precio_venta = ?, cantidad = ?, cantidad_actual = ? WHERE id = ?",
		strings.TrimSpace(it.Descripcion), it.PrecioCosto, it.PrecioVenta, it.Cantidad, it.CantidadActual, it.ID,
	)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// 0 filas también pasa si no cambió nada: se confirma que exista.
		if _, err := GetInventoryItem(it.ID); err != nil {
			return nil, err
		}
	}
	return GetInventoryItem(it.ID)
}

// DeleteInventoryItem elimina un producto.
func DeleteInventoryItem(id int64) error {
	_, err := db.DB.Exec("DELETE FROM inventory_items WHERE id = ?", id)
	return err
}

// SearchInventoryPublic busca por descripción o id (recepción → Consultas).
// Cada palabra tiene que aparecer en la descripción ("fibra cr" encuentra
// "Lente fibra de vidrio CR-39"). Sin texto regresa todo.
func SearchInventoryPublic(q string, limit int) ([]InventoryPublicItem, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	where := []string{}
	args := []interface{}{}
	for _, w := range strings.Fields(strings.TrimSpace(q)) {
		if len([]rune(w)) > 60 {
			w = string([]rune(w)[:60])
		}
		w = strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(w)
		where = append(where, "(descripcion LIKE ? OR CAST(id AS CHAR) = ?)")
		args = append(args, "%"+w+"%", w)
		if len(where) == 8 {
			break
		}
	}
	query := "SELECT id, descripcion, precio_venta, cantidad_actual FROM inventory_items"
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY descripcion ASC LIMIT ?"
	args = append(args, limit)

	rows, err := db.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InventoryPublicItem{}
	for rows.Next() {
		var it InventoryPublicItem
		if err := rows.Scan(&it.ID, &it.Descripcion, &it.PrecioVenta, &it.CantidadActual); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// DecreaseInventoryStock descuenta piezas de "cantidad actual". Lo usará
// el Punto de venta al cobrar; si no alcanza, no descuenta nada.
func DecreaseInventoryStock(id int64, qty int) error {
	if qty <= 0 {
		return nil
	}
	res, err := db.DB.Exec(
		"UPDATE inventory_items SET cantidad_actual = cantidad_actual - ? WHERE id = ? AND cantidad_actual >= ?",
		qty, id, qty,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := GetInventoryItem(id); err != nil {
			return err
		}
		return ErrInventoryNotEnough
	}
	return nil
}
