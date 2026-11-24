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
	// Codigo: 4 dígitos del catálogo de colores de la tienda (Negro 0001…);
	// es la última parte de la clave automática del armazón.
	Codigo string `json:"codigo"`
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
	rows, err := db.DB.Query(`SELECT id, nombre, hex, codigo FROM inv_colores ORDER BY orden, nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvColor{}
	for rows.Next() {
		var c InvColor
		if err := rows.Scan(&c.ID, &c.Nombre, &c.Hex, &c.Codigo); err != nil {
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
	// Color nuevo = el siguiente código libre (0028, 0029…).
	codigo := db.NextColorCode()
	res, err := db.DB.Exec(`INSERT INTO inv_colores (nombre, hex, codigo, orden) VALUES (?, ?, ?, ?)`, nombre, hex, codigo, orden)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &InvColor{ID: id, Nombre: nombre, Hex: hex, Codigo: codigo}, nil
}

// TryonSlugExists: ¿hay un estilo del probador con ese slug?
func TryonSlugExists(slug string) bool {
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM tryon_estilos WHERE slug = ?`, slug).Scan(&n); err != nil {
		return false
	}
	return n > 0
}

// InvMaterial: un material de armazón de la lista.
type InvMaterial struct {
	ID     int64  `json:"id"`
	Nombre string `json:"nombre"`
	// Identificador: ARMT (metal) o ARZL (pasta). Es la primera parte de la
	// clave automática del armazón.
	Identificador string `json:"identificador"`
}

var ErrInvMaterialNotFound = errors.New("material no encontrado")

var ErrInvMaterialTaken = errors.New("ese material ya existe")

func ListInvMateriales() ([]InvMaterial, error) {
	rows, err := db.DB.Query(`SELECT id, nombre, identificador FROM inv_materiales ORDER BY orden, nombre`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvMaterial{}
	for rows.Next() {
		var m InvMaterial
		if err := rows.Scan(&m.ID, &m.Nombre, &m.Identificador); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func CreateInvMaterial(nombre, identificador string) (*InvMaterial, error) {
	var n int
	if err := db.DB.QueryRow(`SELECT COUNT(*) FROM inv_materiales WHERE LOWER(nombre) = LOWER(?)`, nombre).Scan(&n); err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, ErrInvMaterialTaken
	}
	var orden int
	_ = db.DB.QueryRow(`SELECT COALESCE(MAX(orden), 0) + 1 FROM inv_materiales`).Scan(&orden)
	res, err := db.DB.Exec(`INSERT INTO inv_materiales (nombre, identificador, orden) VALUES (?, ?, ?)`, nombre, identificador, orden)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &InvMaterial{ID: id, Nombre: nombre, Identificador: identificador}, nil
}

// DeleteInvMaterial lo quita de la lista. Los artículos que ya lo tienen
// lo conservan (se guarda por nombre).
func DeleteInvMaterial(id int64) error {
	res, err := db.DB.Exec(`DELETE FROM inv_materiales WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrInvMaterialNotFound
	}
	return nil
}

// CleanMateriales deja la lista sin vacíos ni repetidos (máximo 4).
func CleanMateriales(in []string) ([]string, bool) {
	out := []string{}
	for _, m := range in {
		m = strings.Join(strings.Fields(strings.ReplaceAll(m, ",", " ")), " ")
		if m == "" {
			continue
		}
		if len([]rune(m)) > 30 {
			return nil, false
		}
		dup := false
		for _, x := range out {
			if strings.EqualFold(x, m) {
				dup = true
			}
		}
		if !dup {
			out = append(out, m)
		}
	}
	return out, len(out) <= 4
}
