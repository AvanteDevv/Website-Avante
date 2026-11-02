package models

import (
	"database/sql"
	"errors"
	"regexp"
	"strconv"
	"strings"

	"avante-optics/db"
)

// TryonEstilo es una categoría de armazón del probador virtual.
type TryonEstilo struct {
	ID       int64  `json:"id"`
	Slug     string `json:"slug"`
	Nombre   string `json:"nombre"`
	ImageKey string `json:"-"`
	Imagen   string `json:"imagen"` // URL pública ("" = se dibuja con código)
	Base     bool   `json:"base"`
	Orden    int    `json:"orden"`
}

var ErrTryonNotFound = errors.New("ese estilo ya no existe")

func tryonURL(key string) string {
	if key == "" {
		return ""
	}
	return "/media/probador/" + key
}

// ListTryonEstilos regresa los estilos en el orden en que se muestran.
func ListTryonEstilos() ([]TryonEstilo, error) {
	rows, err := db.DB.Query(`SELECT id, slug, nombre, image_key, base, orden FROM tryon_estilos ORDER BY orden, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TryonEstilo{}
	for rows.Next() {
		var e TryonEstilo
		if err := rows.Scan(&e.ID, &e.Slug, &e.Nombre, &e.ImageKey, &e.Base, &e.Orden); err != nil {
			return nil, err
		}
		e.Imagen = tryonURL(e.ImageKey)
		out = append(out, e)
	}
	return out, rows.Err()
}

func GetTryonEstilo(id int64) (*TryonEstilo, error) {
	var e TryonEstilo
	err := db.DB.QueryRow(`SELECT id, slug, nombre, image_key, base, orden FROM tryon_estilos WHERE id = ?`, id).
		Scan(&e.ID, &e.Slug, &e.Nombre, &e.ImageKey, &e.Base, &e.Orden)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrTryonNotFound
	}
	if err != nil {
		return nil, err
	}
	e.Imagen = tryonURL(e.ImageKey)
	return &e, nil
}

var slugClean = regexp.MustCompile(`[^a-z0-9]+`)

// tryonSlug: "Cat-eye grande" → "cat-eye-grande" (sin acentos).
func tryonSlug(nombre string) string {
	r := strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n")
	s := slugClean.ReplaceAllString(r.Replace(strings.ToLower(strings.TrimSpace(nombre))), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "estilo"
	}
	if len(s) > 50 {
		s = s[:50]
	}
	return s
}

// CreateTryonEstilo agrega un estilo al final de la lista.
func CreateTryonEstilo(nombre, imageKey string) (*TryonEstilo, error) {
	base := tryonSlug(nombre)
	slug := base
	for i := 2; ; i++ {
		var n int
		if err := db.DB.QueryRow(`SELECT COUNT(*) FROM tryon_estilos WHERE slug = ?`, slug).Scan(&n); err != nil {
			return nil, err
		}
		if n == 0 {
			break
		}
		slug = base + "-" + strconv.Itoa(i)
	}
	var orden int
	_ = db.DB.QueryRow(`SELECT COALESCE(MAX(orden), 0) + 1 FROM tryon_estilos`).Scan(&orden)
	res, err := db.DB.Exec(`INSERT INTO tryon_estilos (slug, nombre, image_key, base, orden) VALUES (?, ?, ?, 0, ?)`, slug, nombre, imageKey, orden)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetTryonEstilo(id)
}

// UpdateTryonEstilo cambia el nombre y/o la imagen ("" = se queda la de
// antes; clearImage = quitarla). Regresa la key vieja si cambió, para
// borrarla del bucket.
func UpdateTryonEstilo(id int64, nombre, newKey string, clearImage bool) (oldKey string, err error) {
	cur, err := GetTryonEstilo(id)
	if err != nil {
		return "", err
	}
	key := cur.ImageKey
	if newKey != "" || clearImage {
		key = newKey
		oldKey = cur.ImageKey
	}
	if nombre == "" {
		nombre = cur.Nombre
	}
	_, err = db.DB.Exec(`UPDATE tryon_estilos SET nombre = ?, image_key = ? WHERE id = ?`, nombre, key, id)
	return oldKey, err
}

// DeleteTryonEstilo quita el estilo y regresa su key de imagen.
func DeleteTryonEstilo(id int64) (string, error) {
	cur, err := GetTryonEstilo(id)
	if err != nil {
		return "", err
	}
	_, err = db.DB.Exec(`DELETE FROM tryon_estilos WHERE id = ?`, id)
	return cur.ImageKey, err
}

// ReorderTryonEstilos guarda el orden (ids en el orden nuevo).
func ReorderTryonEstilos(ids []int64) error {
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.Exec(`UPDATE tryon_estilos SET orden = ? WHERE id = ?`, i+1, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
