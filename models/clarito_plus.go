package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"avante-optics/db"
)

// CLARITO+ — registros del programa de clientes preferentes (ver
// db/migrate_clarito_plus.go). Las columnas de cada hoja las define la
// página (static/js/receptionist/clarito-plus.js); aquí se guardan como
// JSON y solo se revisa lo básico.

var ClaritoPlusHojas = map[string]bool{"miembros": true, "vip": true, "contactos": true}

var (
	ErrCPHoja     = errors.New("hoja no válida")
	ErrCPNombre   = errors.New("escribe el nombre")
	ErrCPNotFound = errors.New("registro no encontrado")
	ErrCPGrande   = errors.New("el registro es demasiado grande")
)

type ClaritoPlusRegistro struct {
	ID        int64             `json:"id"`
	Hoja      string            `json:"hoja"`
	Folio     string            `json:"folio"`
	Nombre    string            `json:"nombre"`
	Datos     map[string]string `json:"datos"`
	CreatedBy string            `json:"created_by"`
	UpdatedBy string            `json:"updated_by"`
	CreatedAt string            `json:"created_at"`
	UpdatedAt string            `json:"updated_at"`
}

func cpNow() string { return time.Now().Format("2006-01-02 15:04:05") }

// cleanCPDatos recorta los valores y quita llaves raras o vacías.
var cpKeyRe = regexp.MustCompile(`^[a-z_]{1,40}$`)

func cleanCPDatos(in map[string]string) (map[string]string, error) {
	out := map[string]string{}
	total := 0
	for k, v := range in {
		if !cpKeyRe.MatchString(k) {
			continue
		}
		v = strings.TrimSpace(v)
		if r := []rune(v); len(r) > 2000 {
			v = string(r[:2000])
		}
		if v == "" {
			continue
		}
		total += len(v)
		out[k] = v
	}
	if total > 30000 {
		return nil, ErrCPGrande
	}
	return out, nil
}

func cut160(s string) string {
	if r := []rune(s); len(r) > 160 {
		return string(r[:160])
	}
	return s
}
func cut40(s string) string {
	if r := []rune(s); len(r) > 40 {
		return string(r[:40])
	}
	return s
}

// nextCPFolio — siguiente folio de miembro: CPAV-001, CPAV-002…
func nextCPFolio(q interface {
	Query(string, ...interface{}) (*sql.Rows, error)
}) string {
	rows, err := q.Query("SELECT folio FROM clarito_plus_registros WHERE hoja = 'miembros' AND folio LIKE 'CPAV-%'")
	max := 0
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var f string
			if rows.Scan(&f) == nil {
				if n, e := strconv.Atoi(strings.TrimPrefix(strings.ToUpper(f), "CPAV-")); e == nil && n > max {
					max = n
				}
			}
		}
	}
	return fmt.Sprintf("CPAV-%03d", max+1)
}

func scanCP(sc interface{ Scan(...interface{}) error }) (ClaritoPlusRegistro, error) {
	var r ClaritoPlusRegistro
	var raw string
	err := sc.Scan(&r.ID, &r.Hoja, &r.Folio, &r.Nombre, &raw, &r.CreatedBy, &r.UpdatedBy, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return r, err
	}
	r.Datos = map[string]string{}
	_ = json.Unmarshal([]byte(raw), &r.Datos)
	return r, nil
}

const cpSelect = `SELECT id, hoja, folio, nombre, datos, created_by, updated_by,
	DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s'), DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s')
	FROM clarito_plus_registros`

// ListClaritoPlus — todos los registros de la hoja (la página filtra).
func ListClaritoPlus(hoja string) ([]ClaritoPlusRegistro, error) {
	if !ClaritoPlusHojas[hoja] {
		return nil, ErrCPHoja
	}
	rows, err := db.DB.Query(cpSelect+" WHERE hoja = ? ORDER BY id ASC", hoja)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ClaritoPlusRegistro{}
	for rows.Next() {
		r, err := scanCP(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ClaritoPlusConteos — cuántos registros hay por hoja (para las pestañas).
func ClaritoPlusConteos() map[string]int {
	out := map[string]int{"miembros": 0, "vip": 0, "contactos": 0}
	rows, err := db.DB.Query("SELECT hoja, COUNT(*) FROM clarito_plus_registros GROUP BY hoja")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var h string
		var n int
		if rows.Scan(&h, &n) == nil {
			out[h] = n
		}
	}
	return out
}

func GetClaritoPlus(id int64) (*ClaritoPlusRegistro, error) {
	r, err := scanCP(db.DB.QueryRow(cpSelect+" WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrCPNotFound
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func prepCP(hoja string, datos map[string]string) (map[string]string, string, error) {
	if !ClaritoPlusHojas[hoja] {
		return nil, "", ErrCPHoja
	}
	d, err := cleanCPDatos(datos)
	if err != nil {
		return nil, "", err
	}
	nombre := cut160(d["nombre"])
	if nombre == "" {
		return nil, "", ErrCPNombre
	}
	return d, nombre, nil
}

// CreateClaritoPlus — nuevo registro. A los miembros sin folio se les da
// el siguiente CPAV-###.
func CreateClaritoPlus(hoja string, datos map[string]string, by string) (*ClaritoPlusRegistro, error) {
	d, nombre, err := prepCP(hoja, datos)
	if err != nil {
		return nil, err
	}
	if hoja == "miembros" && d["folio"] == "" {
		d["folio"] = nextCPFolio(db.DB)
	}
	raw, _ := json.Marshal(d)
	now := cpNow()
	res, err := db.DB.Exec(`INSERT INTO clarito_plus_registros (hoja, folio, nombre, datos, created_by, updated_by, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, hoja, cut40(d["folio"]), nombre, string(raw), by, by, now, now)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return GetClaritoPlus(id)
}

// UpdateClaritoPlus — reemplaza los datos del registro.
func UpdateClaritoPlus(id int64, datos map[string]string, by string) (*ClaritoPlusRegistro, error) {
	cur, err := GetClaritoPlus(id)
	if err != nil {
		return nil, err
	}
	d, nombre, err := prepCP(cur.Hoja, datos)
	if err != nil {
		return nil, err
	}
	if cur.Hoja == "miembros" && d["folio"] == "" {
		d["folio"] = cur.Folio
	}
	raw, _ := json.Marshal(d)
	if _, err := db.DB.Exec(`UPDATE clarito_plus_registros SET folio = ?, nombre = ?, datos = ?, updated_by = ?, updated_at = ? WHERE id = ?`,
		cut40(d["folio"]), nombre, string(raw), by, cpNow(), id); err != nil {
		return nil, err
	}
	return GetClaritoPlus(id)
}

func DeleteClaritoPlus(id int64) error {
	res, err := db.DB.Exec("DELETE FROM clarito_plus_registros WHERE id = ?", id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrCPNotFound
	}
	return nil
}

// cpDupKey — dos filas son la misma si coinciden nombre y folio/teléfono.
func cpDupKey(d map[string]string) string {
	norm := func(s string) string { return strings.Join(strings.Fields(strings.ToUpper(s)), " ") }
	tel := regexp.MustCompile(`\D`).ReplaceAllString(d["telefono"], "")
	return norm(d["nombre"]) + "|" + norm(d["folio"]) + "|" + tel
}

// ImportClaritoPlus — agrega muchas filas (del Excel). Las que ya existen
// (mismo nombre + folio + teléfono) o sin nombre se omiten.
func ImportClaritoPlus(hoja string, filas []map[string]string, by string) (int, int, error) {
	if !ClaritoPlusHojas[hoja] {
		return 0, 0, ErrCPHoja
	}
	existing, err := ListClaritoPlus(hoja)
	if err != nil {
		return 0, 0, err
	}
	seen := map[string]bool{}
	for _, r := range existing {
		seen[cpDupKey(r.Datos)] = true
	}
	tx, err := db.DB.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	now := cpNow()
	ins, skip := 0, 0
	for _, f := range filas {
		d, nombre, err := prepCP(hoja, f)
		if err != nil {
			skip++
			continue
		}
		k := cpDupKey(d)
		if seen[k] {
			skip++
			continue
		}
		seen[k] = true
		if hoja == "miembros" && d["folio"] == "" {
			d["folio"] = nextCPFolio(tx)
		}
		raw, _ := json.Marshal(d)
		if _, err := tx.Exec(`INSERT INTO clarito_plus_registros (hoja, folio, nombre, datos, created_by, updated_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, hoja, cut40(d["folio"]), nombre, string(raw), by, by, now, now); err != nil {
			return 0, 0, err
		}
		ins++
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return ins, skip, nil
}
