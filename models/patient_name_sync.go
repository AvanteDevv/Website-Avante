package models

import (
	"regexp"
	"strings"
	"unicode"

	"avante-optics/db"
)

// Optometría corrige el nombre del paciente (recepción a veces solo
// apunta un nombre y un apellido). Si el examen salió de una cita, el
// nombre nuevo también se pone en lo que ve recepción:
//   - la cita de la que salió el examen, y las demás citas de esa misma
//     persona (mismo celular y mismo nombre de antes);
//   - el cliente del punto de venta con ese celular y ese nombre de antes.
// Solo se toca lo que tiene el mismo celular Y el mismo nombre anterior,
// para no cambiarle el nombre a otro familiar que comparte el celular.

// NameSyncPreview: lo que se cambiaría en recepción.
type NameSyncPreview struct {
	Changes  bool   `json:"changes"`  // el nombre de la cita es distinto al del examen
	Old      string `json:"old"`      // nombre como lo tiene recepción
	Nombre   string `json:"nombre"`   // sugerencia: nombre(s)
	Apellido string `json:"apellido"` // sugerencia: apellidos
	Citas    int    `json:"citas"`    // citas que cambian (incluye la de este examen)
	Clientes int    `json:"clientes"` // clientes del punto de venta que cambian
}

var spaces = regexp.MustCompile(`\s+`)

func cleanName(s string) string { return strings.TrimSpace(spaces.ReplaceAllString(s, " ")) }

// last10 deja los últimos 10 dígitos de un celular ("+52 662…" → "662…").
func last10(s string) string {
	d := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
	if len(d) > 10 {
		d = d[len(d)-10:]
	}
	return d
}

var nameParticles = map[string]bool{"de": true, "del": true, "la": true, "las": true, "los": true, "y": true, "san": true, "santa": true, "van": true, "von": true, "mc": true}

// SplitFullName separa "Juan Carlos Pérez López" en nombre(s) y
// apellidos (los dos últimos; "de la Cruz" cuenta como uno). Con dos
// palabras: una y una. Es solo la sugerencia: optometría la corrige en
// el aviso si no quedó bien (p. ej. "María José Pérez").
func SplitFullName(full string) (nombre, apellido string) {
	w := strings.Fields(cleanName(full))
	if len(w) <= 1 {
		return strings.Join(w, " "), ""
	}
	// unidades de apellido desde el final (las partículas se pegan a la siguiente palabra)
	end := len(w)
	start := end
	units := 0
	for units < 2 && start > 1 {
		i := start - 1
		for i > 1 && nameParticles[strings.ToLower(w[i-1])] {
			i--
		}
		start = i
		units++
	}
	return strings.Join(w[:start], " "), strings.Join(w[start:], " ")
}

// titleIfShouting: "JUAN PÉREZ" → "Juan Pérez" (las citas van así);
// si ya trae minúsculas se deja como lo escribieron.
func titleIfShouting(s string) string {
	if s != strings.ToUpper(s) {
		return s
	}
	out := []rune(strings.ToLower(s))
	up := true
	for i, r := range out {
		if up && unicode.IsLetter(r) {
			out[i] = unicode.ToUpper(r)
		}
		up = r == ' ' || r == '-'
	}
	res := string(out)
	for p := range nameParticles {
		t := strings.ToUpper(p[:1]) + p[1:]
		res = strings.ReplaceAll(" "+res+" ", " "+t+" ", " "+p+" ")
		res = strings.TrimSpace(res)
	}
	if res != "" {
		r := []rune(res)
		r[0] = unicode.ToUpper(r[0])
		res = string(r)
	}
	return res
}

// PreviewNameSync dice qué cambiaría en recepción si el examen de la
// cita apptID queda con el nombre full.
func PreviewNameSync(apptID int64, full string) (*NameSyncPreview, error) {
	a, err := GetAppointmentByID(apptID)
	if err != nil || a == nil {
		return &NameSyncPreview{}, err
	}
	full = cleanName(full)
	old := cleanName(a.Nombre + " " + a.Apellido)
	nom, ape := SplitFullName(titleIfShouting(full))
	p := &NameSyncPreview{Old: old, Nombre: nom, Apellido: ape}
	// Mismo texto (aunque cambien mayúsculas) = nada que cambiar.
	if full == "" || strings.EqualFold(full, old) {
		return p, nil
	}
	p.Changes = true
	p.Citas, p.Clientes = countNameSync(a, old)
	return p, nil
}

func countNameSync(a *Appointment, old string) (citas, clientes int) {
	citas = 1
	if c := last10(a.Celular); c != "" {
		_ = db.DB.QueryRow(`SELECT COUNT(*) FROM appointments WHERE id <> ? AND celular = ? AND TRIM(CONCAT(nombre, ' ', apellido)) = ?`,
			a.ID, a.Celular, old).Scan(&citas)
		citas++
		_ = db.DB.QueryRow(`SELECT COUNT(*) FROM pos_clients WHERE RIGHT(celular, 10) = ? AND TRIM(nombre) = ?`, c, old).Scan(&clientes)
	}
	return citas, clientes
}

// ApplyNameSync pone nombre/apellido en la cita apptID y en lo demás de
// esa misma persona que tiene recepción (ver arriba). Regresa cuántas
// citas y clientes cambió.
func ApplyNameSync(apptID int64, nombre, apellido string) (citas, clientes int, err error) {
	nombre, apellido = cleanName(nombre), cleanName(apellido)
	if nombre == "" {
		return 0, 0, nil
	}
	if len([]rune(nombre)) > 100 {
		nombre = string([]rune(nombre)[:100])
	}
	if len([]rune(apellido)) > 100 {
		apellido = string([]rune(apellido)[:100])
	}
	a, err := GetAppointmentByID(apptID)
	if err != nil || a == nil {
		return 0, 0, err
	}
	old := cleanName(a.Nombre + " " + a.Apellido)
	full := cleanName(nombre + " " + apellido)
	if old == full && cleanName(a.Nombre) == nombre {
		return 0, 0, nil
	}

	res, err := db.DB.Exec(`UPDATE appointments SET nombre = ?, apellido = ?
		WHERE id = ? OR (? <> '' AND celular = ? AND TRIM(CONCAT(nombre, ' ', apellido)) = ?)`,
		nombre, apellido, a.ID, a.Celular, a.Celular, old)
	if err != nil {
		return 0, 0, err
	}
	n, _ := res.RowsAffected()
	citas = int(n)

	if c := last10(a.Celular); c != "" && old != "" {
		rows, err := db.DB.Query(`SELECT id, nombre FROM pos_clients WHERE RIGHT(celular, 10) = ? AND TRIM(nombre) = ?`, c, old)
		if err == nil {
			type pc struct {
				id     int64
				nombre string
			}
			var list []pc
			for rows.Next() {
				var x pc
				if rows.Scan(&x.id, &x.nombre) == nil {
					list = append(list, x)
				}
			}
			rows.Close()
			for _, x := range list {
				v := full
				if x.nombre == strings.ToUpper(x.nombre) { // el punto de venta lo tenía en mayúsculas
					v = strings.ToUpper(full)
				}
				if _, err := db.DB.Exec(`UPDATE pos_clients SET nombre = ? WHERE id = ?`, v, x.id); err == nil {
					clientes++
				}
			}
		}
	}
	return citas, clientes, nil
}
