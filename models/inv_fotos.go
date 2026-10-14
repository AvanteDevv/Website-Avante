package models

import (
	"database/sql"
	"errors"
	"fmt"

	"avante-optics/db"
)

// MaxInvFotos — fotos por artículo.
const MaxInvFotos = 6

var (
	ErrInvFotoNotFound = errors.New("foto no encontrada")
	ErrInvFotosLlenas  = fmt.Errorf("cada artículo puede tener hasta %d fotos", MaxInvFotos)
)

// InvFoto — una foto de un artículo.
type InvFoto struct {
	ID        int64  `json:"id"`
	ItemID    int64  `json:"item_id"`
	ObjectKey string `json:"-"`
	CType     string `json:"-"`
	URL       string `json:"url"`
	Principal bool   `json:"principal"`
}

// InvFotoURL — dónde se ve la foto (la sirve el panel, con sesión).
func InvFotoURL(id int64) string {
	if id <= 0 {
		return ""
	}
	return fmt.Sprintf("/media/inventario/foto/%d", id)
}

// invFotoPrincipalSQL — subconsulta con el id de la foto principal de i.id.
const invFotoPrincipalSQL = "(SELECT f.id FROM inv_fotos f WHERE f.item_id = i.id ORDER BY f.orden ASC, f.id ASC LIMIT 1)"

// ListInvFotos — fotos de un artículo, la principal primero.
func ListInvFotos(itemID int64) ([]InvFoto, error) {
	rows, err := db.DB.Query("SELECT id, item_id, object_key, ctype FROM inv_fotos WHERE item_id = ? ORDER BY orden ASC, id ASC", itemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvFoto{}
	for rows.Next() {
		var f InvFoto
		if err := rows.Scan(&f.ID, &f.ItemID, &f.ObjectKey, &f.CType); err != nil {
			return nil, err
		}
		f.URL = InvFotoURL(f.ID)
		f.Principal = len(out) == 0
		out = append(out, f)
	}
	return out, rows.Err()
}

// CountInvFotos — cuántas fotos tiene.
func CountInvFotos(itemID int64) (int, error) {
	var n int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM inv_fotos WHERE item_id = ?", itemID).Scan(&n)
	return n, err
}

// AddInvFoto registra una foto ya subida al bucket (va al final).
func AddInvFoto(itemID int64, key, ctype string) (*InvFoto, error) {
	var orden int
	if err := db.DB.QueryRow("SELECT COALESCE(MAX(orden), -1) + 1 FROM inv_fotos WHERE item_id = ?", itemID).Scan(&orden); err != nil {
		return nil, err
	}
	res, err := db.DB.Exec("INSERT INTO inv_fotos (item_id, object_key, ctype, orden) VALUES (?, ?, ?, ?)", itemID, key, ctype, orden)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &InvFoto{ID: id, ItemID: itemID, ObjectKey: key, CType: ctype, URL: InvFotoURL(id)}, nil
}

// GetInvFoto — una foto.
func GetInvFoto(id int64) (*InvFoto, error) {
	var f InvFoto
	err := db.DB.QueryRow("SELECT id, item_id, object_key, ctype FROM inv_fotos WHERE id = ?", id).Scan(&f.ID, &f.ItemID, &f.ObjectKey, &f.CType)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvFotoNotFound
	}
	if err != nil {
		return nil, err
	}
	f.URL = InvFotoURL(f.ID)
	return &f, nil
}

// DeleteInvFoto borra el registro (el archivo lo borra el handler).
func DeleteInvFoto(id int64) error {
	_, err := db.DB.Exec("DELETE FROM inv_fotos WHERE id = ?", id)
	return err
}

// SetInvFotoPrincipal pone esa foto primero.
func SetInvFotoPrincipal(id int64) error {
	f, err := GetInvFoto(id)
	if err != nil {
		return err
	}
	var minOrden int
	if err := db.DB.QueryRow("SELECT COALESCE(MIN(orden), 0) FROM inv_fotos WHERE item_id = ?", f.ItemID).Scan(&minOrden); err != nil {
		return err
	}
	_, err = db.DB.Exec("UPDATE inv_fotos SET orden = ? WHERE id = ?", minOrden-1, id)
	return err
}

// InvFotoKeysOfItem — llaves en el bucket (para borrarlas con el artículo).
func InvFotoKeysOfItem(itemID int64) []string {
	rows, err := db.DB.Query("SELECT object_key FROM inv_fotos WHERE item_id = ?", itemID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var keys []string
	for rows.Next() {
		var k string
		if rows.Scan(&k) == nil {
			keys = append(keys, k)
		}
	}
	return keys
}
