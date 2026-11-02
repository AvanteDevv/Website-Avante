package models

import (
	"errors"
	"strings"

	"avante-optics/db"
)

// InvColor: un color de la paleta de armazones.
type InvColor struct {
	ID     int64  `json:"id"`
	Nombre string `json:"nombre"`
	Hex    string `json:"hex"`
}

var ErrInvColorTaken = errors.New("ese color ya existe")

// splitColores: "Rojo,Negro" → ["Rojo","Negro"] (vacío → []).
func splitColores(s string) []string {
	out := []string{}
	for _, c := range strings.Split(s, ",") {
		if c = strings.TrimSpace(c); c != "" {
			out = append(out, c)
		}
	}
	return out
}

func ListInvColores() ([]InvColor, error) {
	rows, err := db.DB.Query(`SELECT id, nombre, hex FROM inv_colores ORDER BY orden, nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvColor{}
	for rows.Next() {
		var c InvColor
		if err := rows.Scan(&c.ID, &c.Nombre, &c.Hex); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// CreateInvColor agrega un color al final de la paleta.
func CreateInvColor(nombre, hex string) (*InvColor, error) {
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM inv_colores WHERE LOWER(nombre) = LOWER(?)`, nombre).Scan(&n); err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, ErrInvColorTaken
	}
	var orden int
	_ = db.DB.QueryRow(`SELECT COALESCE(MAX(orden), 0) + 1 FROM inv_colores`).Scan(&orden)
	res, err := db.DB.Exec(`INSERT INTO inv_colores (nombre, hex, orden) VALUES (?, ?, ?)`, nombre, hex, orden)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &InvColor{ID: id, Nombre: nombre, Hex: hex}, nil
}

// TryonSlugExists: ¿hay un estilo del probador con ese slug?
func TryonSlugExists(slug string) bool {
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM tryon_estilos WHERE slug = ?`, slug).Scan(&n); err != nil {
		return false
	}
	return n > 0
}
