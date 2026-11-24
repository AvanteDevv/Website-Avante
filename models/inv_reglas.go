package models

import (
	"errors"
	"strconv"
	"strings"

	"avante-optics/db"
)

/* =========================================================
   PRECIO Y PROMOCIÓN POR GRUPO (Inventario → Artículos)
   "Todos los de la categoría LÍNEA valen $500" o "20 % de promoción a
   todos los de acetato": se aplica de una vez a los artículos que ya
   están y, si se marca, queda como regla para los que se den de alta
   después (inv_reglas).
   ========================================================= */

const (
	InvReglaPrecio = "precio"
	InvReglaPromo  = "promo"

	InvCampoCategoria = "categoria"
	InvCampoMaterial  = "material"
)

type InvRegla struct {
	ID        int64   `json:"id"`
	Tipo      string  `json:"tipo"`  // precio | promo
	Campo     string  `json:"campo"` // categoria | material
	Valor     string  `json:"valor"` // id de la categoría o nombre del material
	Etiqueta  string  `json:"etiqueta"`
	Monto     float64 `json:"monto"`
	Usuario   string  `json:"usuario"`
	CreatedAt string  `json:"created_at"`
}

var ErrInvGrupoInvalido = errors.New("grupo inválido")

// invGrupoWhere: el filtro SQL de los artículos de esa categoría o material.
func invGrupoWhere(campo, valor string) (string, []interface{}, error) {
	switch campo {
	case InvCampoCategoria:
		id, err := strconv.ParseInt(valor, 10, 64)
		if err != nil || id <= 0 {
			return "", nil, ErrInvGrupoInvalido
		}
		return "categoria_id = ?", []interface{}{id}, nil
	case InvCampoMaterial:
		v := strings.TrimSpace(valor)
		if v == "" || strings.Contains(v, ",") {
			return "", nil, ErrInvGrupoInvalido
		}
		// materiales se guarda "Metal,Acetato": se busca el nombre completo.
		return "CONCAT(',', LOWER(materiales), ',') LIKE CONCAT('%,', LOWER(?), ',%')", []interface{}{v}, nil
	}
	return "", nil, ErrInvGrupoInvalido
}

// CountInvGrupo: cuántos artículos hay en esa categoría o material.
func CountInvGrupo(campo, valor string) (int, error) {
	where, args, err := invGrupoWhere(campo, valor)
	if err != nil {
		return 0, err
	}
	var n int
	err = db.DB.QueryRow("SELECT COUNT(*) FROM inventory_items WHERE "+where, args...).Scan(&n)
	return n, err
}

// ApplyInvGrupo aplica la acción a todos los artículos del grupo y regresa
// cuántos cambiaron. accion: precio | promo | quitar_promo.
// recordar = también para los que se den de alta después (regla).
func ApplyInvGrupo(campo, valor, accion string, monto float64, recordar bool, usuario string) (int64, error) {
	where, args, err := invGrupoWhere(campo, valor)
	if err != nil {
		return 0, err
	}
	var set string
	var setArgs []interface{}
	tipo := ""
	switch accion {
	case "precio":
		set, setArgs, tipo = "precio_venta = ?", []interface{}{round2(monto)}, InvReglaPrecio
	case "promo":
		set, setArgs, tipo = "promo_pct = ?", []interface{}{round2(monto)}, InvReglaPromo
	case "quitar_promo":
		set = "promo_pct = 0"
	default:
		return 0, errors.New("acción inválida")
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	res, err := tx.Exec("UPDATE inventory_items SET "+set+" WHERE "+where, append(setArgs, args...)...)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	valor = strings.TrimSpace(valor)
	switch {
	case accion == "quitar_promo":
		if _, err := tx.Exec(`DELETE FROM inv_reglas WHERE tipo = ? AND campo = ? AND LOWER(valor) = LOWER(?)`, InvReglaPromo, campo, valor); err != nil {
			return 0, err
		}
	case recordar:
		if _, err := tx.Exec(
			`INSERT INTO inv_reglas (tipo, campo, valor, monto, usuario) VALUES (?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE monto = VALUES(monto), usuario = VALUES(usuario), created_at = CURRENT_TIMESTAMP`,
			tipo, campo, valor, round2(monto), usuario,
		); err != nil {
			return 0, err
		}
	default:
		// Aplicado solo a los que ya están: si había regla de ese tipo para el
		// grupo, se quita (si no, los nuevos tomarían el valor viejo).
		if _, err := tx.Exec(`DELETE FROM inv_reglas WHERE tipo = ? AND campo = ? AND LOWER(valor) = LOWER(?)`, tipo, campo, valor); err != nil {
			return 0, err
		}
	}
	return n, tx.Commit()
}

// ListInvReglas: las reglas vigentes, con el nombre de la categoría.
func ListInvReglas() ([]InvRegla, error) {
	rows, err := db.DB.Query(`
		SELECT r.id, r.tipo, r.campo, r.valor, COALESCE(c.nombre, r.valor), r.monto, r.usuario,
		       DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s')
		FROM inv_reglas r
		LEFT JOIN inv_categorias c ON r.campo = 'categoria' AND c.id = r.valor
		ORDER BY r.tipo, r.campo, r.valor`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvRegla{}
	for rows.Next() {
		var r InvRegla
		if err := rows.Scan(&r.ID, &r.Tipo, &r.Campo, &r.Valor, &r.Etiqueta, &r.Monto, &r.Usuario, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeleteInvRegla quita la regla (los artículos se quedan como están).
func DeleteInvRegla(id int64) error {
	_, err := db.DB.Exec(`DELETE FROM inv_reglas WHERE id = ?`, id)
	return err
}

// reglaAplica: ¿la regla es para la categoría o algún material del artículo?
func reglaAplica(r InvRegla, a InvArticulo) bool {
	switch r.Campo {
	case InvCampoCategoria:
		return a.CategoriaID > 0 && r.Valor == strconv.FormatInt(a.CategoriaID, 10)
	case InvCampoMaterial:
		for _, m := range a.Materiales {
			if strings.EqualFold(strings.TrimSpace(m), r.Valor) {
				return true
			}
		}
	}
	return false
}

// promoFromRules: la promoción más alta que le toca al artículo nuevo.
func promoFromRules(a InvArticulo) float64 {
	rs, err := ListInvReglas()
	if err != nil {
		return 0
	}
	best := 0.0
	for _, r := range rs {
		if r.Tipo == InvReglaPromo && reglaAplica(r, a) && r.Monto > best {
			best = r.Monto
		}
	}
	return best
}
