package models

import (
	"database/sql"
	"sort"
	"strings"
	"time"

	"avante-optics/db"
)

// PUNTO DE VENTA — cliente ligado a Citas y Clarito+:
//   - Citas de hoy: recepción elige al que llegó y se trae su nombre,
//     celular, correo y fecha de nacimiento.
//   - Al cobrar, la cita de ese cliente se marca "Asistió · Compró".
//   - Perfil del cliente: sus datos, sus compras y sus exámenes de la
//     vista (agrupados por año).
//   - Folios de miembros Clarito+ para la clave del cliente.

// last10 está en patient_name_sync.go.

/* ---------- Citas de hoy ---------- */

type PosCitaHoy struct {
	ID         int64  `json:"id"`
	Hora       string `json:"hora"`
	Nombre     string `json:"nombre"`
	Celular    string `json:"celular"` // 10 dígitos
	Correo     string `json:"correo"`
	Nacimiento string `json:"nacimiento"`
	Status     string `json:"status"`
	Compro     bool   `json:"compro"`
	ClientID   int64  `json:"client_id,omitempty"` // cliente del Punto de venta con ese celular o nombre
}

// ListPosCitasHoy: las citas de hoy (sin las canceladas), por hora.
func ListPosCitasHoy() ([]PosCitaHoy, error) {
	rows, err := db.DB.Query(`SELECT a.id, COALESCE(a.appt_time, ''), TRIM(CONCAT(a.nombre, ' ', COALESCE(a.apellido, ''))),
			COALESCE(a.celular, ''), COALESCE(a.correo, ''), COALESCE(a.fecha_nacimiento, ''), a.status,
			COALESCE(f.compro, 0)
		FROM appointments a
		LEFT JOIN appointment_followups f ON f.appointment_id = a.id
		WHERE a.appt_date = ? AND a.status <> 'cancelada'
		ORDER BY a.appt_time, a.id`, PosToday())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PosCitaHoy{}
	for rows.Next() {
		var c PosCitaHoy
		if err := rows.Scan(&c.ID, &c.Hora, &c.Nombre, &c.Celular, &c.Correo, &c.Nacimiento, &c.Status, &c.Compro); err != nil {
			return nil, err
		}
		if len(c.Hora) > 5 {
			c.Hora = c.Hora[:5]
		}
		c.Celular = last10(c.Celular)
		if len(c.Nacimiento) > 10 {
			c.Nacimiento = c.Nacimiento[:10]
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	for i := range out {
		out[i].ClientID = findPosClientFor(out[i].Nombre, out[i].Celular)
	}
	return out, nil
}

// findPosClientFor: el cliente del Punto de venta con ese celular (o, si
// no, con el mismo nombre). 0 = no hay.
func findPosClientFor(nombre, celular string) int64 {
	var id int64
	if cel := last10(celular); len(cel) == 10 {
		if db.DB.QueryRow(`SELECT id FROM pos_clients WHERE celular = ? ORDER BY id DESC LIMIT 1`, cel).Scan(&id) == nil {
			return id
		}
	}
	want := NormalizePatientName(nombre)
	if want == "" {
		return 0
	}
	rows, err := db.DB.Query(`SELECT id, nombre FROM pos_clients WHERE LOWER(nombre) LIKE ? ORDER BY id DESC`, "%"+firstWord(want)+"%")
	if err != nil {
		return 0
	}
	defer rows.Close()
	for rows.Next() {
		var n string
		if rows.Scan(&id, &n) == nil && NormalizePatientName(n) == want {
			return id
		}
	}
	return 0
}

func firstWord(s string) string {
	if f := strings.Fields(s); len(f) > 0 {
		return f[0]
	}
	return s
}

// MarkCitaCompro: la venta se liga a la cita de hoy del cliente y en
// Citas queda "Asistió · Compró" (revisión en 1 año, o la que ya tenía).
// citaID = la que eligió recepción; si es 0 se busca la cita de hoy con
// el celular o el nombre del cliente. Regresa el id de la cita (0 = no
// había).
func MarkCitaCompro(saleID, citaID, clientID int64, by string) int64 {
	if citaID <= 0 && clientID > 0 {
		var nombre, celular string
		if db.DB.QueryRow(`SELECT nombre, celular FROM pos_clients WHERE id = ?`, clientID).Scan(&nombre, &celular) != nil {
			return 0
		}
		citas, err := ListPosCitasHoy()
		if err != nil {
			return 0
		}
		cel, want := last10(celular), NormalizePatientName(nombre)
		for _, c := range citas {
			if (len(cel) == 10 && c.Celular == cel) || (want != "" && NormalizePatientName(c.Nombre) == want) {
				citaID = c.ID
				break
			}
		}
	}
	if citaID <= 0 {
		return 0
	}
	var status string
	if err := db.DB.QueryRow(`SELECT status FROM appointments WHERE id = ?`, citaID).Scan(&status); err != nil {
		return 0
	}
	meses := 12
	var prev sql.NullInt64
	if db.DB.QueryRow(`SELECT revision_meses FROM appointment_followups WHERE appointment_id = ?`, citaID).Scan(&prev) == nil && prev.Valid && IsRevisionMonths(int(prev.Int64)) {
		meses = int(prev.Int64)
	}
	if err := SetAppointmentFollowup(citaID, true, meses, by); err != nil {
		return 0
	}
	if status != "asistio" && status != "cancelada" {
		_ = UpdateAppointmentStatus(citaID, "asistio")
	}
	if saleID > 0 {
		_, _ = db.DB.Exec(`UPDATE pos_sales SET cita_id = ? WHERE id = ?`, citaID, saleID)
	}
	return citaID
}

/* ---------- Folios Clarito+ ---------- */

type ClaritoFolio struct {
	Folio      string `json:"folio"`
	Nombre     string `json:"nombre"`
	Telefono   string `json:"telefono"`
	Correo     string `json:"correo"`
	Nacimiento string `json:"nacimiento"`
	Direccion  string `json:"direccion"`
	Tipo       string `json:"tipo"`
	Empresa    string `json:"empresa"`
	Pasatiempo string `json:"pasatiempo"`
	Profesion  string `json:"profesion"`
	Vigencia   string `json:"vigencia"`
}

// ListClaritoFolios: los miembros Clarito+ con folio (para elegir la
// clave del cliente y traer sus datos).
func ListClaritoFolios() ([]ClaritoFolio, error) {
	list, err := ListClaritoPlus("miembros")
	if err != nil {
		return nil, err
	}
	out := []ClaritoFolio{}
	for _, r := range list {
		f := strings.TrimSpace(r.Folio)
		if f == "" {
			f = strings.TrimSpace(r.Datos["folio"])
		}
		if f == "" {
			continue
		}
		d := r.Datos
		nombre := r.Nombre
		if nombre == "" {
			nombre = d["nombre"]
		}
		out = append(out, ClaritoFolio{
			Folio: strings.ToUpper(f), Nombre: nombre, Telefono: last10(d["telefono"]), Correo: d["correo"],
			Nacimiento: d["nacimiento"], Direccion: d["direccion"], Tipo: d["empresa"], Empresa: d["empresa_nombre"],
			Pasatiempo: d["pasatiempo"], Profesion: d["profesion"], Vigencia: d["vigencia"],
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Folio < out[j].Folio })
	return out, nil
}

/* ---------- Perfil del cliente ---------- */

type PosPerfilVenta struct {
	Folio     int64   `json:"folio"`
	Fecha     string  `json:"fecha"`
	Total     float64 `json:"total"`
	Credito   float64 `json:"credito"`
	Productos string  `json:"productos"`
	Cancelada bool    `json:"cancelada"`
}

type PosPerfilExamen struct {
	ID    int64     `json:"id"`
	Fecha time.Time `json:"fecha"`
	Por   string    `json:"por"`
}

type PosPerfil struct {
	Cliente      *PosClient        `json:"cliente"`
	Ventas       []PosPerfilVenta  `json:"ventas"`
	TotalCompras float64           `json:"total_compras"`
	Examenes     []PosPerfilExamen `json:"examenes"`
	PacienteKey  string            `json:"paciente_key"`
	Revision     string            `json:"revision"`       // "YYYY-MM-DD" de su próxima revisión ("" = sin exámenes)
	RevisionMes  int               `json:"revision_meses"` // cada cuánto
	Citas        int               `json:"citas"`
}

// GetPosPerfil: datos, compras y exámenes de la vista del cliente.
func GetPosPerfil(clientID int64) (*PosPerfil, error) {
	cl, err := GetPosClient(clientID)
	if err != nil {
		return nil, err
	}
	p := &PosPerfil{Cliente: cl, Ventas: []PosPerfilVenta{}, Examenes: []PosPerfilExamen{}}

	rows, err := db.DB.Query(`SELECT s.id, DATE_FORMAT(s.created_at, '%Y-%m-%dT%H:%i:%s'), s.total, s.credito,
			COALESCE(GROUP_CONCAT(CONCAT(i.cantidad, ' × ', i.descripcion) ORDER BY i.id SEPARATOR ' · '), ''), s.cancelada
		FROM pos_sales s LEFT JOIN pos_sale_items i ON i.sale_id = s.id
		WHERE s.client_id = ? GROUP BY s.id ORDER BY s.created_at DESC, s.id DESC LIMIT 200`, clientID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var v PosPerfilVenta
		if err := rows.Scan(&v.Folio, &v.Fecha, &v.Total, &v.Credito, &v.Productos, &v.Cancelada); err != nil {
			rows.Close()
			return nil, err
		}
		if !v.Cancelada {
			p.TotalCompras += v.Total
		}
		p.Ventas = append(p.Ventas, v)
	}
	rows.Close()
	p.TotalCompras = round2(p.TotalCompras)

	// Exámenes de la vista: el paciente del Historial clínico con su
	// celular o con su mismo nombre.
	exams, err := ListEyeExamsLite()
	if err == nil {
		groups := groupPatients(exams)
		cel, want := last10(cl.Celular), NormalizePatientName(cl.Nombre)
		var best *PatientSummary
		for _, g := range groups {
			if want != "" && NormalizePatientName(g.Name) == want {
				best = g
				break
			}
			if best == nil && len(cel) == 10 && last10(g.Phone) == cel {
				best = g
			}
		}
		if best != nil {
			applyRevisionMonths([]*PatientSummary{best})
			p.PacienteKey = best.Key
			p.RevisionMes = best.RevisionMeses
			if !best.NextRevision.IsZero() {
				p.Revision = best.NextRevision.Format("2006-01-02")
			}
			ids := map[int64]bool{}
			for _, id := range best.examIDs {
				ids[id] = true
			}
			for _, e := range exams {
				if ids[e.ID] {
					p.Examenes = append(p.Examenes, PosPerfilExamen{ID: e.ID, Fecha: e.CreatedAt, Por: e.CreatedByName})
				}
			}
		}
	}

	if cel := last10(cl.Celular); len(cel) == 10 {
		_ = db.DB.QueryRow(`SELECT COUNT(*) FROM appointments WHERE celular LIKE ? AND status <> 'cancelada'`, "%"+cel).Scan(&p.Citas)
	}
	return p, nil
}
