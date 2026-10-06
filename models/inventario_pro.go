package models

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Panel de Inventario (como el módulo de inventario de SICAR):
// artículos con departamento/categoría y 4 precios, ajustes de
// existencia (entrada, salida, inventario físico) y el kárdex de
// movimientos. Usa la misma tabla inventory_items que Admin → Inventario,
// Consultas y el Punto de venta:
//
//	precio_costo    = precio de compra (con IVA)
//	precio_venta    = precio 1 (precio de venta neto, con IVA)
//	cantidad_actual = existencia

var (
	ErrInvTieneExistencia = errors.New("el artículo todavía tiene existencia")
	ErrInvDepNotFound     = errors.New("departamento no encontrado")
	ErrInvDepDuplicado    = errors.New("ya existe un departamento con ese nombre")
	ErrInvDepEnUso        = errors.New("el departamento tiene artículos")
	ErrInvCatNotFound     = errors.New("categoría no encontrada")
	ErrInvCatDuplicada    = errors.New("ya existe esa categoría en el departamento")
	ErrInvCatEnUso        = errors.New("la categoría tiene artículos")
	ErrInvSinExistencia   = errors.New("no hay tantas piezas en existencia")
	ErrInvAjusteNotFound  = errors.New("ajuste no encontrado")
	ErrInvServicio        = errors.New("los servicios no llevan existencia")
)

// Tipos de movimiento del kárdex.
const (
	InvMovInicial = "inicial" // existencia con la que se dio de alta
	InvMovEntrada = "entrada" // Ajustar → entrada (compra, devolución…)
	InvMovSalida  = "salida"  // Ajustar → salida (merma, dañado…)
	InvMovAjuste  = "ajuste"  // inventario físico / fijar existencia
	InvMovVenta   = "venta"   // venta del Punto de venta
)

func invNow() string { return time.Now().In(posLoc).Format("2006-01-02 15:04:05") }

/* =========================================================
   ARTÍCULOS
   ========================================================= */

type InvArticulo struct {
	ID             int64   `json:"id"`
	Clave          string  `json:"clave"`
	ClaveAlterna   string  `json:"clave_alterna"`
	Descripcion    string  `json:"descripcion"`
	DepartamentoID int64   `json:"departamento_id"`
	Departamento   string  `json:"departamento"`
	CategoriaID    int64   `json:"categoria_id"`
	Categoria      string  `json:"categoria"`
	UnidadCompra   string  `json:"unidad_compra"`
	UnidadVenta    string  `json:"unidad_venta"`
	Factor         float64 `json:"factor"`
	Servicio       bool    `json:"servicio"`
	IVA            bool    `json:"iva"`
	PrecioCompra   float64 `json:"precio_compra"`
	Precio1        float64 `json:"precio_1"`
	Precio2        float64 `json:"precio_2"`
	Precio3        float64 `json:"precio_3"`
	Precio4        float64 `json:"precio_4"`
	Mayoreo2       int     `json:"mayoreo_2"`
	Mayoreo3       int     `json:"mayoreo_3"`
	Mayoreo4       int     `json:"mayoreo_4"`
	Existencia     int     `json:"existencia"`
	Minimo         int     `json:"minimo"`
	Maximo         int     `json:"maximo"`
	Localizacion   string  `json:"localizacion"`
	UpdatedAt      string  `json:"updated_at"`
}

const invArticuloSelect = `
	SELECT i.id, COALESCE(i.clave, ''), i.clave_alterna, i.descripcion,
	       COALESCE(i.departamento_id, 0), COALESCE(d.nombre, ''),
	       COALESCE(i.categoria_id, 0), COALESCE(c.nombre, ''),
	       i.unidad_compra, i.unidad_venta, i.factor, i.servicio, i.iva,
	       i.precio_costo, i.precio_venta, i.precio_2, i.precio_3, i.precio_4,
	       i.mayoreo_2, i.mayoreo_3, i.mayoreo_4,
	       i.cantidad_actual, i.inv_minimo, i.inv_maximo, i.localizacion,
	       DATE_FORMAT(i.updated_at, '%Y-%m-%dT%H:%i:%s')
	FROM inventory_items i
	LEFT JOIN inv_departamentos d ON d.id = i.departamento_id
	LEFT JOIN inv_categorias c ON c.id = i.categoria_id`

func scanInvArticulo(sc interface{ Scan(...interface{}) error }) (InvArticulo, error) {
	var a InvArticulo
	err := sc.Scan(&a.ID, &a.Clave, &a.ClaveAlterna, &a.Descripcion,
		&a.DepartamentoID, &a.Departamento, &a.CategoriaID, &a.Categoria,
		&a.UnidadCompra, &a.UnidadVenta, &a.Factor, &a.Servicio, &a.IVA,
		&a.PrecioCompra, &a.Precio1, &a.Precio2, &a.Precio3, &a.Precio4,
		&a.Mayoreo2, &a.Mayoreo3, &a.Mayoreo4,
		&a.Existencia, &a.Minimo, &a.Maximo, &a.Localizacion, &a.UpdatedAt)
	return a, err
}

// ListInvArticulos regresa todo el catálogo (la página filtra y pagina en
// el navegador: así buscar es instantáneo).
func ListInvArticulos() ([]InvArticulo, error) {
	rows, err := db.DB.Query(invArticuloSelect + " ORDER BY i.descripcion ASC, i.id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvArticulo{}
	for rows.Next() {
		a, err := scanInvArticulo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// GetInvArticulo trae un artículo.
func GetInvArticulo(id int64) (*InvArticulo, error) {
	a, err := scanInvArticulo(db.DB.QueryRow(invArticuloSelect+" WHERE i.id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInventoryNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func nullID(id int64) interface{} {
	if id <= 0 {
		return nil
	}
	return id
}

// checkInvClasificacion confirma que el departamento exista y que la
// categoría sea de ese departamento. Si la categoría se manda sin
// departamento, se toma el de la categoría.
func checkInvClasificacion(a *InvArticulo) error {
	if a.CategoriaID > 0 {
		var dep int64
		err := db.DB.QueryRow("SELECT departamento_id FROM inv_categorias WHERE id = ?", a.CategoriaID).Scan(&dep)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrInvCatNotFound
		}
		if err != nil {
			return err
		}
		if a.DepartamentoID <= 0 {
			a.DepartamentoID = dep
		} else if a.DepartamentoID != dep {
			return fmt.Errorf("esa categoría no es del departamento elegido")
		}
	}
	if a.DepartamentoID > 0 {
		var n int
		if err := db.DB.QueryRow("SELECT COUNT(*) FROM inv_departamentos WHERE id = ?", a.DepartamentoID).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			return ErrInvDepNotFound
		}
	}
	return nil
}

// CreateInvArticulo da de alta un artículo. La existencia con la que se
// crea queda en el kárdex como "inventario inicial".
func CreateInvArticulo(a InvArticulo, usuario string) (*InvArticulo, error) {
	if err := checkInvClasificacion(&a); err != nil {
		return nil, err
	}
	if a.Servicio {
		a.Existencia = 0
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	res, err := tx.Exec(
		`INSERT INTO inventory_items
		   (clave, clave_alterna, descripcion, departamento_id, categoria_id, unidad_compra, unidad_venta, factor,
		    servicio, iva, precio_costo, precio_venta, precio_2, precio_3, precio_4, mayoreo_2, mayoreo_3, mayoreo_4,
		    cantidad, cantidad_actual, inv_minimo, inv_maximo, localizacion)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		nullClave(NormalizeInventoryClave(a.Clave)), a.ClaveAlterna, a.Descripcion, nullID(a.DepartamentoID), nullID(a.CategoriaID),
		a.UnidadCompra, a.UnidadVenta, a.Factor, a.Servicio, a.IVA,
		round2(a.PrecioCompra), round2(a.Precio1), round2(a.Precio2), round2(a.Precio3), round2(a.Precio4),
		a.Mayoreo2, a.Mayoreo3, a.Mayoreo4,
		a.Existencia, a.Existencia, a.Minimo, a.Maximo, a.Localizacion,
	)
	if isDuplicateKey(err) {
		return nil, ErrInventoryClaveTaken
	}
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	if a.Existencia != 0 {
		if _, err := tx.Exec(
			`INSERT INTO inv_movimientos (item_id, tipo, cantidad, existencia_antes, existencia_despues, comentario, usuario, created_at)
			 VALUES (?, ?, ?, 0, ?, 'Alta del artículo', ?, ?)`,
			id, InvMovInicial, a.Existencia, a.Existencia, usuario, invNow(),
		); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return GetInvArticulo(id)
}

// UpdateInvArticulo guarda los datos del artículo. La existencia NO se
// cambia aquí (como en SICAR): eso se hace con Ajustar, para que quede
// en el kárdex.
func UpdateInvArticulo(a InvArticulo) (*InvArticulo, error) {
	if err := checkInvClasificacion(&a); err != nil {
		return nil, err
	}
	cur, err := GetInvArticulo(a.ID)
	if err != nil {
		return nil, err
	}
	if a.Servicio && cur.Existencia != 0 {
		return nil, fmt.Errorf("para marcarlo como servicio primero deja su existencia en 0 (Ajustar)")
	}
	_, err = db.DB.Exec(
		`UPDATE inventory_items SET
		   clave = ?, clave_alterna = ?, descripcion = ?, departamento_id = ?, categoria_id = ?,
		   unidad_compra = ?, unidad_venta = ?, factor = ?, servicio = ?, iva = ?,
		   precio_costo = ?, precio_venta = ?, precio_2 = ?, precio_3 = ?, precio_4 = ?,
		   mayoreo_2 = ?, mayoreo_3 = ?, mayoreo_4 = ?, inv_minimo = ?, inv_maximo = ?, localizacion = ?
		 WHERE id = ?`,
		nullClave(NormalizeInventoryClave(a.Clave)), a.ClaveAlterna, a.Descripcion, nullID(a.DepartamentoID), nullID(a.CategoriaID),
		a.UnidadCompra, a.UnidadVenta, a.Factor, a.Servicio, a.IVA,
		round2(a.PrecioCompra), round2(a.Precio1), round2(a.Precio2), round2(a.Precio3), round2(a.Precio4),
		a.Mayoreo2, a.Mayoreo3, a.Mayoreo4, a.Minimo, a.Maximo, a.Localizacion,
		a.ID,
	)
	if isDuplicateKey(err) {
		return nil, ErrInventoryClaveTaken
	}
	if err != nil {
		return nil, err
	}
	return GetInvArticulo(a.ID)
}

// DeleteInvArticulo elimina un artículo. Como en SICAR, solo si su
// existencia está en 0. Sus movimientos del kárdex se conservan.
func DeleteInvArticulo(id int64) error {
	a, err := GetInvArticulo(id)
	if err != nil {
		return err
	}
	if a.Existencia != 0 {
		return ErrInvTieneExistencia
	}
	_, err = db.DB.Exec("DELETE FROM inventory_items WHERE id = ?", id)
	return err
}

/* =========================================================
   AJUSTES DE EXISTENCIA
   ========================================================= */

// InvAjusteResult — lo que regresa un ajuste aplicado.
type InvAjusteResult struct {
	Folio     int64        `json:"folio"`
	Articulo  *InvArticulo `json:"articulo,omitempty"`
	Cambiados int          `json:"cambiados"`
	Articulos int          `json:"articulos"`
}

// AjustarInvArticulo hace un ajuste a un solo artículo (botón Ajustar):
//
//	modo "entrada": suma la cantidad (compra, devolución…)
//	modo "salida":  resta la cantidad (merma, dañado…)
//	modo "fijar":   la existencia queda en la cantidad escrita
func AjustarInvArticulo(itemID int64, modo string, cantidad int, comentario, usuario string) (*InvAjusteResult, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var antes int
	var servicio bool
	err = tx.QueryRow("SELECT cantidad_actual, servicio FROM inventory_items WHERE id = ? FOR UPDATE", itemID).Scan(&antes, &servicio)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInventoryNotFound
	}
	if err != nil {
		return nil, err
	}
	if servicio {
		return nil, ErrInvServicio
	}

	var despues int
	tipoMov, tipoAjuste := InvMovAjuste, "fijar"
	switch modo {
	case "entrada":
		despues, tipoMov, tipoAjuste = antes+cantidad, InvMovEntrada, "entrada"
	case "salida":
		despues, tipoMov, tipoAjuste = antes-cantidad, InvMovSalida, "salida"
		if despues < 0 {
			return nil, fmt.Errorf("%w: hay %d", ErrInvSinExistencia, antes)
		}
	default:
		despues = cantidad
	}
	diff := despues - antes

	now := invNow()
	res, err := tx.Exec("INSERT INTO inv_ajustes (tipo, comentario, usuario, articulos, created_at) VALUES (?, ?, ?, 1, ?)",
		tipoAjuste, comentario, usuario, now)
	if err != nil {
		return nil, err
	}
	folio, _ := res.LastInsertId()
	if _, err := tx.Exec("UPDATE inventory_items SET cantidad_actual = ? WHERE id = ?", despues, itemID); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(
		`INSERT INTO inv_movimientos (item_id, tipo, cantidad, existencia_antes, existencia_despues, ajuste_id, comentario, usuario, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		itemID, tipoMov, diff, antes, despues, folio, comentario, usuario, now,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	a, err := GetInvArticulo(itemID)
	if err != nil {
		return nil, err
	}
	cambiados := 0
	if diff != 0 {
		cambiados = 1
	}
	return &InvAjusteResult{Folio: folio, Articulo: a, Cambiados: cambiados, Articulos: 1}, nil
}

// InvConteo — una línea del inventario físico: lo que se contó.
type InvConteo struct {
	ItemID  int64 `json:"item_id"`
	Contado int   `json:"contado"`
}

// AplicarInventarioFisico aplica un conteo físico (Ajustes de inventario):
// la existencia de cada artículo queda en lo que se contó. Todas las
// líneas quedan en el folio (también las que no cambiaron, con
// diferencia 0) para poder consultar el conteo completo.
func AplicarInventarioFisico(lines []InvConteo, comentario, usuario string) (*InvAjusteResult, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	now := invNow()
	res, err := tx.Exec("INSERT INTO inv_ajustes (tipo, comentario, usuario, articulos, created_at) VALUES ('fisico', ?, ?, ?, ?)",
		comentario, usuario, len(lines), now)
	if err != nil {
		return nil, err
	}
	folio, _ := res.LastInsertId()
	cambiados := 0
	seen := map[int64]bool{}
	for _, l := range lines {
		if seen[l.ItemID] {
			continue
		}
		seen[l.ItemID] = true
		var antes int
		var desc string
		var servicio bool
		err := tx.QueryRow("SELECT cantidad_actual, descripcion, servicio FROM inventory_items WHERE id = ? FOR UPDATE", l.ItemID).Scan(&antes, &desc, &servicio)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("un artículo del conteo ya no existe; quítalo y vuelve a intentar")
		}
		if err != nil {
			return nil, err
		}
		if servicio {
			return nil, fmt.Errorf("«%s» es servicio y no lleva existencia; quítalo del conteo", desc)
		}
		diff := l.Contado - antes
		if diff != 0 {
			cambiados++
			if _, err := tx.Exec("UPDATE inventory_items SET cantidad_actual = ? WHERE id = ?", l.Contado, l.ItemID); err != nil {
				return nil, err
			}
		}
		if _, err := tx.Exec(
			`INSERT INTO inv_movimientos (item_id, tipo, cantidad, existencia_antes, existencia_despues, ajuste_id, comentario, usuario, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			l.ItemID, InvMovAjuste, diff, antes, l.Contado, folio, comentario, usuario, now,
		); err != nil {
			return nil, err
		}
	}
	if _, err := tx.Exec("UPDATE inv_ajustes SET articulos = ? WHERE id = ?", len(seen), folio); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return &InvAjusteResult{Folio: folio, Cambiados: cambiados, Articulos: len(seen)}, nil
}

// InvAjusteRow — un folio de ajuste en la lista.
type InvAjusteRow struct {
	Folio      int64  `json:"folio"`
	Tipo       string `json:"tipo"`
	Fecha      string `json:"fecha"`
	Comentario string `json:"comentario"`
	Usuario    string `json:"usuario"`
	Articulos  int    `json:"articulos"`
	Cambiados  int    `json:"cambiados"`
	Sobrantes  int    `json:"sobrantes"` // piezas que se sumaron
	Faltantes  int    `json:"faltantes"` // piezas que se restaron (positivo)
}

const invAjusteSelect = `
	SELECT a.id, a.tipo, DATE_FORMAT(a.created_at, '%Y-%m-%dT%H:%i:%s'), a.comentario, a.usuario, a.articulos,
	       COALESCE(SUM(m.cantidad <> 0), 0),
	       COALESCE(SUM(CASE WHEN m.cantidad > 0 THEN m.cantidad ELSE 0 END), 0),
	       COALESCE(SUM(CASE WHEN m.cantidad < 0 THEN -m.cantidad ELSE 0 END), 0)
	FROM inv_ajustes a
	LEFT JOIN inv_movimientos m ON m.ajuste_id = a.id`

func scanInvAjuste(sc interface{ Scan(...interface{}) error }) (InvAjusteRow, error) {
	var r InvAjusteRow
	err := sc.Scan(&r.Folio, &r.Tipo, &r.Fecha, &r.Comentario, &r.Usuario, &r.Articulos, &r.Cambiados, &r.Sobrantes, &r.Faltantes)
	return r, err
}

// ListInvAjustes — ajustes entre dos fechas (YYYY-MM-DD, incluidas).
func ListInvAjustes(desde, hasta string) ([]InvAjusteRow, error) {
	rows, err := db.DB.Query(invAjusteSelect+`
		WHERE a.created_at >= ? AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)
		GROUP BY a.id ORDER BY a.id DESC LIMIT 500`, desde, hasta)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InvAjusteRow{}
	for rows.Next() {
		r, err := scanInvAjuste(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// InvAjusteLinea — un artículo dentro de un ajuste.
type InvAjusteLinea struct {
	ItemID      int64  `json:"item_id"`
	Clave       string `json:"clave"`
	Descripcion string `json:"descripcion"`
	Antes       int    `json:"antes"`
	Despues     int    `json:"despues"`
	Diferencia  int    `json:"diferencia"`
}

// InvAjusteDetalle — un folio con sus artículos.
type InvAjusteDetalle struct {
	InvAjusteRow
	Lineas []InvAjusteLinea `json:"lineas"`
}

// GetInvAjuste trae un ajuste con sus artículos.
func GetInvAjuste(folio int64) (*InvAjusteDetalle, error) {
	r, err := scanInvAjuste(db.DB.QueryRow(invAjusteSelect+" WHERE a.id = ? GROUP BY a.id", folio))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInvAjusteNotFound
	}
	if err != nil {
		return nil, err
	}
	d := &InvAjusteDetalle{InvAjusteRow: r, Lineas: []InvAjusteLinea{}}
	rows, err := db.DB.Query(`
		SELECT m.item_id, COALESCE(i.clave, ''), COALESCE(i.descripcion, '(artículo eliminado)'),
		       m.existencia_antes, m.existencia_despues, m.cantidad
		FROM inv_movimientos m
		LEFT JOIN inventory_items i ON i.id = m.item_id
		WHERE m.ajuste_id = ?
		ORDER BY (m.cantidad = 0), i.descripcion`, folio)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var l InvAjusteLinea
		if err := rows.Scan(&l.ItemID, &l.Clave, &l.Descripcion, &l.Antes, &l.Despues, &l.Diferencia); err != nil {
			return nil, err
		}
		d.Lineas = append(d.Lineas, l)
	}
	return d, rows.Err()
}

/* =========================================================
   KÁRDEX (movimientos)
   ========================================================= */

type InvMovimiento struct {
	ID          int64  `json:"id"`
	Fecha       string `json:"fecha"`
	ItemID      int64  `json:"item_id"`
	Clave       string `json:"clave"`
	Descripcion string `json:"descripcion"`
	Tipo        string `json:"tipo"`
	Cantidad    int    `json:"cantidad"`
	Antes       int    `json:"antes"`
	Despues     int    `json:"despues"`
	AjusteID    int64  `json:"ajuste_id,omitempty"`
	VentaID     int64  `json:"venta_id,omitempty"`
	Comentario  string `json:"comentario"`
	Usuario     string `json:"usuario"`
}

type InvMovFilter struct {
	ItemID int64
	Desde  string // YYYY-MM-DD
	Hasta  string
	Tipo   string
	Q      string
}

type InvMovTotales struct {
	Movimientos int `json:"movimientos"`
	Entradas    int `json:"entradas"` // piezas que entraron
	Salidas     int `json:"salidas"`  // piezas que salieron (positivo)
}

// ListInvMovimientos — el kárdex con filtros. Las líneas con cantidad 0
// (artículos contados sin diferencia) no se muestran aquí.
func ListInvMovimientos(f InvMovFilter, limit int) ([]InvMovimiento, InvMovTotales, error) {
	if limit <= 0 || limit > 2000 {
		limit = 1000
	}
	where := []string{"m.cantidad <> 0"}
	args := []interface{}{}
	if f.ItemID > 0 {
		where = append(where, "m.item_id = ?")
		args = append(args, f.ItemID)
	}
	if f.Desde != "" {
		where = append(where, "m.created_at >= ?")
		args = append(args, f.Desde)
	}
	if f.Hasta != "" {
		where = append(where, "m.created_at < DATE_ADD(?, INTERVAL 1 DAY)")
		args = append(args, f.Hasta)
	}
	if f.Tipo != "" {
		where = append(where, "m.tipo = ?")
		args = append(args, f.Tipo)
	}
	for _, w := range strings.Fields(strings.ToLower(f.Q)) {
		like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(w) + "%"
		where = append(where, "(LOWER(COALESCE(i.descripcion,'')) LIKE ? OR LOWER(COALESCE(i.clave,'')) LIKE ? OR LOWER(m.comentario) LIKE ? OR LOWER(m.usuario) LIKE ?)")
		args = append(args, like, like, like, like)
	}
	cond := " WHERE " + strings.Join(where, " AND ")
	from := " FROM inv_movimientos m LEFT JOIN inventory_items i ON i.id = m.item_id"

	var t InvMovTotales
	if err := db.DB.QueryRow(`SELECT COUNT(*),
		COALESCE(SUM(CASE WHEN m.cantidad > 0 THEN m.cantidad ELSE 0 END), 0),
		COALESCE(SUM(CASE WHEN m.cantidad < 0 THEN -m.cantidad ELSE 0 END), 0)`+from+cond, args...).
		Scan(&t.Movimientos, &t.Entradas, &t.Salidas); err != nil {
		return nil, t, err
	}

	rows, err := db.DB.Query(`
		SELECT m.id, DATE_FORMAT(m.created_at, '%Y-%m-%dT%H:%i:%s'), m.item_id,
		       COALESCE(i.clave, ''), COALESCE(i.descripcion, '(artículo eliminado)'),
		       m.tipo, m.cantidad, m.existencia_antes, m.existencia_despues,
		       COALESCE(m.ajuste_id, 0), COALESCE(m.venta_id, 0), m.comentario, m.usuario`+from+cond+`
		ORDER BY m.created_at DESC, m.id DESC LIMIT ?`, append(args, limit)...)
	if err != nil {
		return nil, t, err
	}
	defer rows.Close()
	out := []InvMovimiento{}
	for rows.Next() {
		var m InvMovimiento
		if err := rows.Scan(&m.ID, &m.Fecha, &m.ItemID, &m.Clave, &m.Descripcion, &m.Tipo, &m.Cantidad,
			&m.Antes, &m.Despues, &m.AjusteID, &m.VentaID, &m.Comentario, &m.Usuario); err != nil {
			return nil, t, err
		}
		out = append(out, m)
	}
	return out, t, rows.Err()
}

// logInvVenta deja en el kárdex lo que salió por una venta del Punto de
// venta. Va dentro de la misma transacción de la venta; si la tabla del
// kárdex no existiera, la venta igual se guarda (solo no queda el
// movimiento).
func logInvVenta(tx *sql.Tx, itemID int64, cantidad, antes int, ventaID int64, cajero string) {
	if _, err := tx.Exec(
		`INSERT INTO inv_movimientos (item_id, tipo, cantidad, existencia_antes, existencia_despues, venta_id, comentario, usuario, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		itemID, InvMovVenta, -cantidad, antes, antes-cantidad, ventaID, fmt.Sprintf("Ticket %d", ventaID), cajero, invNow(),
	); err != nil {
		log.Printf("inventario: no se pudo registrar la venta %d en el kárdex: %v", ventaID, err)
	}
}

/* =========================================================
   DEPARTAMENTOS Y CATEGORÍAS
   ========================================================= */

type InvCategoria struct {
	ID             int64   `json:"id"`
	DepartamentoID int64   `json:"departamento_id"`
	Nombre         string  `json:"nombre"`
	Comision       float64 `json:"comision"`
	Articulos      int     `json:"articulos"`
}

type InvDepartamento struct {
	ID         int64          `json:"id"`
	Nombre     string         `json:"nombre"`
	Articulos  int            `json:"articulos"`
	Categorias []InvCategoria `json:"categorias"`
}

// ListInvDepartamentos — departamentos con sus categorías y cuántos
// artículos tiene cada uno.
func ListInvDepartamentos() ([]InvDepartamento, error) {
	rows, err := db.DB.Query(`
		SELECT d.id, d.nombre, (SELECT COUNT(*) FROM inventory_items i WHERE i.departamento_id = d.id)
		FROM inv_departamentos d ORDER BY d.nombre`)
	if err != nil {
		return nil, err
	}
	out := []InvDepartamento{}
	idx := map[int64]int{}
	for rows.Next() {
		var d InvDepartamento
		if err := rows.Scan(&d.ID, &d.Nombre, &d.Articulos); err != nil {
			rows.Close()
			return nil, err
		}
		d.Categorias = []InvCategoria{}
		idx[d.ID] = len(out)
		out = append(out, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	crows, err := db.DB.Query(`
		SELECT c.id, c.departamento_id, c.nombre, c.comision,
		       (SELECT COUNT(*) FROM inventory_items i WHERE i.categoria_id = c.id)
		FROM inv_categorias c ORDER BY c.nombre`)
	if err != nil {
		return nil, err
	}
	defer crows.Close()
	for crows.Next() {
		var c InvCategoria
		if err := crows.Scan(&c.ID, &c.DepartamentoID, &c.Nombre, &c.Comision, &c.Articulos); err != nil {
			return nil, err
		}
		if i, ok := idx[c.DepartamentoID]; ok {
			out[i].Categorias = append(out[i].Categorias, c)
		}
	}
	return out, crows.Err()
}

// NormalizeInvNombre deja nombres de departamento/categoría en
// mayúsculas y sin espacios de más (como en SICAR).
func NormalizeInvNombre(s string) string {
	return strings.ToUpper(strings.Join(strings.Fields(s), " "))
}

func CreateInvDepartamento(nombre string) (int64, error) {
	res, err := db.DB.Exec("INSERT INTO inv_departamentos (nombre) VALUES (?)", nombre)
	if isDuplicateKey(err) {
		return 0, ErrInvDepDuplicado
	}
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func RenameInvDepartamento(id int64, nombre string) error {
	res, err := db.DB.Exec("UPDATE inv_departamentos SET nombre = ? WHERE id = ?", nombre, id)
	if isDuplicateKey(err) {
		return ErrInvDepDuplicado
	}
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var c int
		if err := db.DB.QueryRow("SELECT COUNT(*) FROM inv_departamentos WHERE id = ?", id).Scan(&c); err != nil {
			return err
		}
		if c == 0 {
			return ErrInvDepNotFound
		}
	}
	return nil
}

// DeleteInvDepartamento borra el departamento y sus categorías, solo si
// ningún artículo lo usa.
func DeleteInvDepartamento(id int64) error {
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM inventory_items WHERE departamento_id = ?", id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w (%d)", ErrInvDepEnUso, n)
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("DELETE FROM inv_categorias WHERE departamento_id = ?", id); err != nil {
		return err
	}
	res, err := tx.Exec("DELETE FROM inv_departamentos WHERE id = ?", id)
	if err != nil {
		return err
	}
	if k, _ := res.RowsAffected(); k == 0 {
		return ErrInvDepNotFound
	}
	return tx.Commit()
}

func CreateInvCategoria(c InvCategoria) (int64, error) {
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM inv_departamentos WHERE id = ?", c.DepartamentoID).Scan(&n); err != nil {
		return 0, err
	}
	if n == 0 {
		return 0, ErrInvDepNotFound
	}
	res, err := db.DB.Exec("INSERT INTO inv_categorias (departamento_id, nombre, comision) VALUES (?, ?, ?)",
		c.DepartamentoID, c.Nombre, round2(c.Comision))
	if isDuplicateKey(err) {
		return 0, ErrInvCatDuplicada
	}
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

// UpdateInvCategoria cambia nombre, comisión o departamento. Si cambia de
// departamento, sus artículos se mueven con ella.
func UpdateInvCategoria(c InvCategoria) error {
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM inv_departamentos WHERE id = ?", c.DepartamentoID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return ErrInvDepNotFound
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.Exec("UPDATE inv_categorias SET departamento_id = ?, nombre = ?, comision = ? WHERE id = ?",
		c.DepartamentoID, c.Nombre, round2(c.Comision), c.ID)
	if isDuplicateKey(err) {
		return ErrInvCatDuplicada
	}
	if err != nil {
		return err
	}
	if k, _ := res.RowsAffected(); k == 0 {
		var e int
		if err := tx.QueryRow("SELECT COUNT(*) FROM inv_categorias WHERE id = ?", c.ID).Scan(&e); err != nil {
			return err
		}
		if e == 0 {
			return ErrInvCatNotFound
		}
	}
	if _, err := tx.Exec("UPDATE inventory_items SET departamento_id = ? WHERE categoria_id = ?", c.DepartamentoID, c.ID); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteInvCategoria borra la categoría si ningún artículo la usa.
func DeleteInvCategoria(id int64) error {
	var n int
	if err := db.DB.QueryRow("SELECT COUNT(*) FROM inventory_items WHERE categoria_id = ?", id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return fmt.Errorf("%w (%d)", ErrInvCatEnUso, n)
	}
	res, err := db.DB.Exec("DELETE FROM inv_categorias WHERE id = ?", id)
	if err != nil {
		return err
	}
	if k, _ := res.RowsAffected(); k == 0 {
		return ErrInvCatNotFound
	}
	return nil
}
