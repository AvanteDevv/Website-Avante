package models

import (
	"errors"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requires a MySQL table. Run this once against your database, then
// seed the six default statuses:
//
//	CREATE TABLE order_statuses (
//	  id         INT AUTO_INCREMENT PRIMARY KEY,
//	  status_key VARCHAR(40) NOT NULL UNIQUE,
//	  label      VARCHAR(60) NOT NULL,
//	  color      VARCHAR(20) NOT NULL DEFAULT '#767b8a',
//	  sort_order INT NOT NULL DEFAULT 0
//	);
//
//	INSERT INTO order_statuses (status_key, label, color, sort_order) VALUES
//	  ('recibido',        'Recibido',              '#33399e', 1),
//	  ('aprobado',        'Aprobado',               '#1a5c9e', 2),
//	  ('en_proceso',      'En proceso',             '#8a6a12', 3),
//	  ('control_calidad', 'Control de calidad',     '#4a2f9e', 4),
//	  ('listo_entrega',   'Listo para la entrega',  '#0f7a86', 5),
//	  ('entregado',       'Entregado',              '#1f7a3d', 6);

// OrderStatus is one of the configurable statuses an order can be in —
// managed from the gear icon on the admin Pedidos panel.
type OrderStatus struct {
	ID        int64  `json:"id"`
	Key       string `json:"key"`
	Label     string `json:"label"`
	Color     string `json:"color"`
	SortOrder int    `json:"sortOrder"`
}

// ErrStatusNotFound is returned when no status option matches the given id.
var ErrStatusNotFound = errors.New("estado no encontrado")

// GetAllOrderStatuses returns every configured status, in display order.
func GetAllOrderStatuses() ([]OrderStatus, error) {
	rows, err := db.DB.Query(
		"SELECT id, status_key, label, color, sort_order FROM order_statuses ORDER BY sort_order ASC, id ASC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []OrderStatus
	for rows.Next() {
		var s OrderStatus
		if err := rows.Scan(&s.ID, &s.Key, &s.Label, &s.Color, &s.SortOrder); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, nil
}

// slugify turns a label like "Control de calidad" into a status_key
// like "control_de_calidad" — accents/symbols are dropped.
func slugify(label string) string {
	out := make([]rune, 0, len(label))
	lastUnderscore := true // avoids a leading underscore
	for _, r := range label {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			out = append(out, r)
			lastUnderscore = false
		case r >= 'A' && r <= 'Z':
			out = append(out, r+32)
			lastUnderscore = false
		case r == ' ' || r == '-' || r == '_':
			if !lastUnderscore {
				out = append(out, '_')
				lastUnderscore = true
			}
		}
	}
	return string(out)
}

// CreateOrderStatus adds a new status option. Its status_key is
// derived from the label and is what actually gets stored on each
// order (the label can be renamed later without breaking that link).
func CreateOrderStatus(label, color string, sortOrder int) (*OrderStatus, error) {
	key := slugify(label)
	result, err := db.DB.Exec(
		"INSERT INTO order_statuses (status_key, label, color, sort_order) VALUES (?, ?, ?, ?)",
		key, label, color, sortOrder,
	)
	if err != nil {
		return nil, err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &OrderStatus{ID: id, Key: key, Label: label, Color: color, SortOrder: sortOrder}, nil
}

// UpdateOrderStatusDef edits an existing status's label and color. The
// status_key is left untouched so orders already using it keep matching.
func UpdateOrderStatusDef(id int64, label, color string) error {
	result, err := db.DB.Exec("UPDATE order_statuses SET label = ?, color = ? WHERE id = ?", label, color, id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrStatusNotFound
	}
	return nil
}

// DeleteOrderStatusDef removes a status option. Orders already carrying
// that status_key keep it as plain text — they just won't match a
// configured status anymore.
func DeleteOrderStatusDef(id int64) error {
	result, err := db.DB.Exec("DELETE FROM order_statuses WHERE id = ?", id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrStatusNotFound
	}
	return nil
}
