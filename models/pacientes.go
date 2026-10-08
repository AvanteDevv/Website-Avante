package models

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida
// con el nombre del módulo en tu go.mod.
//
// Historial clínico: agrupa los exámenes por PACIENTE (no por examen)
// para el directorio, la ficha y los antecedentes.
//
// Cómo se identifica a un paciente (su "key"):
//   - "u:<id>"  si tiene cuenta (algún examen quedó ligado por user_id).
//   - "n:<nombre normalizado>" si no tiene cuenta (minúsculas, sin
//     acentos, espacios sencillos).
// Un examen sin user_id cuyo nombre coincide con el de UNA sola cuenta
// se junta con esa cuenta (p. ej. el primer examen se hizo antes de que
// se registrara).

// PatientSummary: una fila del directorio de Historial clínico.
type PatientSummary struct {
	Key           string    `json:"key"`
	Name          string    `json:"name"`
	Phone         string    `json:"phone"`
	UserID        int64     `json:"userId,omitempty"`
	Exams         int       `json:"exams"`
	FirstAt       time.Time `json:"firstAt"`
	LastAt        time.Time `json:"lastAt"`
	LastBy        string    `json:"lastBy"`
	LastExamID    int64     `json:"lastExamId"`
	RevisionMeses int       `json:"revisionMeses"` // cada cuánto le toca (de la cita, si recepción lo marcó; si no, 12)
	NextRevision  time.Time `json:"nextRevision"`

	lastApptID int64
	examIDs    []int64
	names      []string
}

var ErrPatientNotFound = errors.New("paciente no encontrado")

var patientKeyRe = regexp.MustCompile(`^(u:[0-9]{1,18}|n:.{2,180})$`)

// ValidPatientKey revisa la forma de la key que manda el frontend.
func ValidPatientKey(key string) bool { return patientKeyRe.MatchString(key) }

var accentFold = strings.NewReplacer(
	"á", "a", "à", "a", "ä", "a", "â", "a", "ã", "a",
	"é", "e", "è", "e", "ë", "e", "ê", "e",
	"í", "i", "ì", "i", "ï", "i", "î", "i",
	"ó", "o", "ò", "o", "ö", "o", "ô", "o", "õ", "o",
	"ú", "u", "ù", "u", "ü", "u", "û", "u",
	"ñ", "n", "ç", "c",
)

// NormalizePatientName: minúsculas, sin acentos y con espacios sencillos
// — igual que normalize() del frontend.
func NormalizePatientName(s string) string {
	s = accentFold.Replace(strings.ToLower(strings.TrimSpace(s)))
	return strings.Join(strings.Fields(s), " ")
}

// groupPatients junta los exámenes (más reciente primero) por paciente.
func groupPatients(exams []EyeExamLite) []*PatientSummary {
	// 1) nombre normalizado -> cuentas que lo usan
	userByName := map[string]map[int64]bool{}
	for _, e := range exams {
		if e.UserID > 0 {
			n := NormalizePatientName(e.PatientName)
			if userByName[n] == nil {
				userByName[n] = map[int64]bool{}
			}
			userByName[n][e.UserID] = true
		}
	}

	groups := map[string]*PatientSummary{}
	order := []string{}
	for _, e := range exams {
		key := ""
		if e.UserID > 0 {
			key = "u:" + strconv.FormatInt(e.UserID, 10)
		} else {
			n := NormalizePatientName(e.PatientName)
			if n == "" {
				continue
			}
			if us := userByName[n]; len(us) == 1 {
				for id := range us {
					key = "u:" + strconv.FormatInt(id, 10)
				}
			} else {
				key = "n:" + n
			}
		}

		g := groups[key]
		if g == nil {
			// El primero que aparece es el más reciente.
			g = &PatientSummary{
				Key:        key,
				Name:       strings.TrimSpace(e.PatientName),
				LastAt:     e.CreatedAt,
				LastBy:     e.CreatedByName,
				LastExamID: e.ID,
				lastApptID: e.AppointmentID,
			}
			if strings.HasPrefix(key, "u:") {
				g.UserID, _ = strconv.ParseInt(key[2:], 10, 64)
			}
			groups[key] = g
			order = append(order, key)
		}
		g.names = append(g.names, e.PatientName)
		if g.Phone == "" && strings.TrimSpace(e.PatientPhone) != "" {
			g.Phone = strings.TrimSpace(e.PatientPhone)
		}
		g.Exams++
		g.FirstAt = e.CreatedAt // va quedando el más viejo
		g.examIDs = append(g.examIDs, e.ID)
	}

	out := make([]*PatientSummary, 0, len(order))
	for _, k := range order {
		g := groups[k]
		g.Name = bestName(g.names)
		out = append(out, g)
	}
	applyAccountNames(out)
	return out
}

// bestName: de cómo se escribió el nombre en cada examen, el que trae
// acentos/ñ (el más completo); si empatan, el más reciente.
func bestName(names []string) string {
	best, bestScore := "", -1
	for _, n := range names {
		n = strings.Join(strings.Fields(n), " ")
		score := 0
		for _, r := range n {
			if r > 127 {
				score++
			}
		}
		if score > bestScore {
			best, bestScore = n, score
		}
	}
	return best
}

// applyAccountNames: si tiene cuenta, se usa el nombre de la cuenta.
func applyAccountNames(list []*PatientSummary) {
	ids := []interface{}{}
	ph := []string{}
	byID := map[int64]*PatientSummary{}
	for _, p := range list {
		if p.UserID > 0 {
			ids = append(ids, p.UserID)
			ph = append(ph, "?")
			byID[p.UserID] = p
		}
	}
	if len(ids) == 0 {
		return
	}
	rows, err := db.DB.Query(`SELECT id, name, COALESCE(phone, '') FROM users WHERE id IN (`+strings.Join(ph, ",")+`)`, ids...)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name, phone string
		if rows.Scan(&id, &name, &phone) != nil {
			continue
		}
		if p := byID[id]; p != nil {
			if n := strings.TrimSpace(name); n != "" {
				p.Name = n
			}
			if p.Phone == "" {
				p.Phone = strings.TrimSpace(phone)
			}
		}
	}
}

// applyRevisionMonths: cada cuánto le toca la revisión. Si el último
// examen salió de una cita y recepción marcó "compró · revisión cada N
// meses" (appointment_followups), se usa eso; si no, 12 meses.
func applyRevisionMonths(list []*PatientSummary) {
	ids := []interface{}{}
	ph := []string{}
	for _, p := range list {
		if p.lastApptID > 0 {
			ids = append(ids, p.lastApptID)
			ph = append(ph, "?")
		}
	}
	meses := map[int64]int{}
	if len(ids) > 0 {
		rows, err := db.DB.Query(
			`SELECT appointment_id, revision_meses FROM appointment_followups
			 WHERE compro = 1 AND revision_meses IS NOT NULL AND appointment_id IN (`+strings.Join(ph, ",")+`)`,
			ids...,
		)
		if err == nil {
			for rows.Next() {
				var id int64
				var m int
				if rows.Scan(&id, &m) == nil && IsRevisionMonths(m) {
					meses[id] = m
				}
			}
			rows.Close()
		}
	}
	for _, p := range list {
		p.RevisionMeses = 12
		if m, ok := meses[p.lastApptID]; ok {
			p.RevisionMeses = m
		}
		p.NextRevision = p.LastAt.AddDate(0, p.RevisionMeses, 0)
	}
}

// ListPatientSummaries: directorio de pacientes, el de visita más
// reciente primero.
func ListPatientSummaries() ([]PatientSummary, error) {
	exams, err := ListEyeExamsLite()
	if err != nil {
		return nil, err
	}
	groups := groupPatients(exams)
	applyRevisionMonths(groups)
	sort.SliceStable(groups, func(i, j int) bool { return groups[i].LastAt.After(groups[j].LastAt) })

	out := make([]PatientSummary, len(groups))
	for i, g := range groups {
		out[i] = *g
	}
	return out, nil
}

// GetPatientFile: el resumen y los exámenes completos de un paciente.
// Si la key es de una cuenta sin exámenes todavía, regresa el resumen
// con los datos de la cuenta y 0 exámenes.
func GetPatientFile(key string) (*PatientSummary, []EyeExam, error) {
	exams, err := ListEyeExamsLite()
	if err != nil {
		return nil, nil, err
	}
	groups := groupPatients(exams)
	for _, g := range groups {
		if g.Key == key {
			applyRevisionMonths([]*PatientSummary{g})
			full, err := GetEyeExamsByIDs(g.examIDs)
			if err != nil {
				return nil, nil, err
			}
			return g, full, nil
		}
	}

	if strings.HasPrefix(key, "u:") {
		id, _ := strconv.ParseInt(key[2:], 10, 64)
		var name, phone string
		err := db.DB.QueryRow(`SELECT name, COALESCE(phone, '') FROM users WHERE id = ?`, id).Scan(&name, &phone)
		if err == sql.ErrNoRows {
			return nil, nil, ErrPatientNotFound
		}
		if err != nil {
			return nil, nil, err
		}
		return &PatientSummary{Key: key, Name: name, Phone: phone, UserID: id, RevisionMeses: 12}, []EyeExam{}, nil
	}
	return nil, nil, ErrPatientNotFound
}

/* ---------- Antecedentes (no cambian en cada examen) ---------- */

// PatientAntecedentes: JSON libre que arma el frontend (diabetes,
// hipertensión, cirugías, alergias, notas…) y quién lo actualizó.
type PatientAntecedentes struct {
	Data      json.RawMessage `json:"data"`
	UpdatedBy string          `json:"updatedBy"`
	UpdatedAt *time.Time      `json:"updatedAt,omitempty"`
}

// GetPatientAntecedentes busca por key; si no hay nada y se dan otras
// keys (p. ej. el nombre de cuando todavía no tenía cuenta), prueba con
// ellas en orden.
func GetPatientAntecedentes(keys ...string) (*PatientAntecedentes, error) {
	for _, k := range keys {
		if k == "" {
			continue
		}
		var raw []byte
		var a PatientAntecedentes
		var at time.Time
		err := db.DB.QueryRow(
			`SELECT data, updated_by, updated_at FROM patient_antecedentes WHERE patient_key = ?`, k,
		).Scan(&raw, &a.UpdatedBy, &at)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return nil, err
		}
		a.Data = json.RawMessage(raw)
		a.UpdatedAt = &at
		return &a, nil
	}
	return &PatientAntecedentes{Data: json.RawMessage(`{}`)}, nil
}

// SetPatientAntecedentes guarda (o reemplaza) los antecedentes de un paciente.
func SetPatientAntecedentes(key, name string, data json.RawMessage, updatedBy string) error {
	_, err := db.DB.Exec(
		`INSERT INTO patient_antecedentes (patient_key, patient_name, data, updated_by) VALUES (?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE patient_name = VALUES(patient_name), data = VALUES(data),
		   updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
		key, name, []byte(data), updatedBy,
	)
	return err
}
