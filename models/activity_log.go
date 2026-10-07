package models

import (
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Bitácora de actividad del staff: qué páginas abre cada persona, a qué
// le da clic, qué busca y qué crea / cambia / elimina. La llena:
//   - el servidor (handlers/activity_log.go) con las acciones reales
//     (crear/cancelar/eliminar citas, iniciar/cerrar sesión, etc.), y
//   - el navegador (static/js/<rol>/bitacora-<rol>.js) con vistas,
//     clics y búsquedas.
//
// La lee el admin en /admin/bitacora. Requiere la tabla
// staff_activity_log (migrations/2026-09-28_bitacora.sql).

// Tipos de registro (columna kind).
const (
	ActivitySession = "sesion"   // inició / cerró sesión
	ActivityView    = "vista"    // abrió una página
	ActivityClick   = "clic"     // dio clic en algo
	ActivitySearch  = "busqueda" // escribió en un buscador
	ActivityAction  = "accion"   // creó / cambió / eliminó algo (lo confirma el servidor)
)

// ActivityKinds son los tipos válidos, en el orden en que se muestran.
var ActivityKinds = []string{ActivityAction, ActivityClick, ActivityView, ActivitySearch, ActivitySession}

// IsActivityKind valida un tipo.
func IsActivityKind(k string) bool {
	for _, x := range ActivityKinds {
		if x == k {
			return true
		}
	}
	return false
}

// ActivityEntry es un renglón de la bitácora.
type ActivityEntry struct {
	ID          int64     `json:"id"`
	StaffRole   string    `json:"staff_role"`
	StaffID     int64     `json:"staff_id"`
	StaffKey    string    `json:"staff_key"`
	StaffName   string    `json:"staff_name"`
	Kind        string    `json:"kind"`
	Action      string    `json:"action"`
	Description string    `json:"description"`
	Context     string    `json:"context"`
	Page        string    `json:"page"`
	Method      string    `json:"method"`
	Path        string    `json:"path"`
	StatusCode  int       `json:"status_code"`
	Details     string    `json:"details"`
	IP          string    `json:"ip"`
	UserAgent   string    `json:"user_agent"`
	CreatedAt   time.Time `json:"created_at"`
}

// Límites de cada columna (se recorta antes de guardar).
const (
	activityMaxName    = 120
	activityMaxAction  = 64
	activityMaxDesc    = 500
	activityMaxContext = 300
	activityMaxPage    = 255
	activityMaxPath    = 255
	activityMaxDetails = 4000
	activityMaxUA      = 255
)

// activityClip recorta a n runas (no bytes) para no partir acentos.
func activityClip(s string, n int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}

func (e *ActivityEntry) normalize() {
	e.StaffName = activityClip(e.StaffName, activityMaxName)
	e.Action = activityClip(e.Action, activityMaxAction)
	e.Description = activityClip(e.Description, activityMaxDesc)
	e.Context = activityClip(e.Context, activityMaxContext)
	e.Page = activityClip(e.Page, activityMaxPage)
	e.Path = activityClip(e.Path, activityMaxPath)
	e.Details = activityClip(e.Details, activityMaxDetails)
	e.UserAgent = activityClip(e.UserAgent, activityMaxUA)
	if len(e.Method) > 8 {
		e.Method = e.Method[:8]
	}
	if len(e.IP) > 45 {
		e.IP = e.IP[:45]
	}
	if e.CreatedAt.IsZero() {
		e.CreatedAt = time.Now()
	}
}

// InsertActivities guarda uno o varios renglones en un solo INSERT.
func InsertActivities(list []ActivityEntry) error {
	if len(list) == 0 {
		return nil
	}
	var sb strings.Builder
	sb.WriteString(`INSERT INTO staff_activity_log
		(staff_role, staff_id, staff_name, kind, action, description, context, page,
		 method, path, status_code, details, ip, user_agent, created_at) VALUES `)
	args := make([]interface{}, 0, len(list)*15)
	for i := range list {
		e := &list[i]
		e.normalize()
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString("(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
		args = append(args, e.StaffRole, e.StaffID, e.StaffName, e.Kind, e.Action, e.Description,
			e.Context, e.Page, e.Method, e.Path, e.StatusCode, e.Details, e.IP, e.UserAgent, e.CreatedAt)
	}
	_, err := db.DB.Exec(sb.String(), args...)
	return err
}

// ActivityFilter son los filtros de la pantalla del admin.
type ActivityFilter struct {
	Roles    []string   // solo estos roles (vacío = todos)
	Role     string     // persona: rol…
	StaffID  int64      // …e id (0 = todas)
	Kind     string     // tipo (vacío = todos)
	From     *time.Time // desde (incluido)
	To       *time.Time // hasta (excluido)
	Query    string     // texto libre
	BeforeID int64      // paginación hacia atrás (id < BeforeID)
	AfterID  int64      // "en vivo": solo lo nuevo (id > AfterID)
	Limit    int
}

func (f ActivityFilter) where() (string, []interface{}) {
	conds := []string{"1=1"}
	var args []interface{}
	if len(f.Roles) > 0 {
		ph := strings.TrimSuffix(strings.Repeat("?,", len(f.Roles)), ",")
		conds = append(conds, "staff_role IN ("+ph+")")
		for _, r := range f.Roles {
			args = append(args, r)
		}
	}
	if f.Role != "" && f.StaffID > 0 {
		conds = append(conds, "staff_role = ? AND staff_id = ?")
		args = append(args, f.Role, f.StaffID)
	}
	if f.Kind != "" {
		conds = append(conds, "kind = ?")
		args = append(args, f.Kind)
	}
	if f.From != nil {
		conds = append(conds, "created_at >= ?")
		args = append(args, *f.From)
	}
	if f.To != nil {
		conds = append(conds, "created_at < ?")
		args = append(args, *f.To)
	}
	if q := strings.TrimSpace(f.Query); q != "" {
		like := "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(q) + "%"
		conds = append(conds, "(description LIKE ? OR context LIKE ? OR page LIKE ? OR staff_name LIKE ?)")
		args = append(args, like, like, like, like)
	}
	if f.BeforeID > 0 {
		conds = append(conds, "id < ?")
		args = append(args, f.BeforeID)
	}
	if f.AfterID > 0 {
		conds = append(conds, "id > ?")
		args = append(args, f.AfterID)
	}
	return strings.Join(conds, " AND "), args
}

// ListActivities devuelve la bitácora más reciente primero. hasMore
// indica si hay más renglones viejos (para "Cargar más").
func ListActivities(f ActivityFilter) (items []ActivityEntry, hasMore bool, err error) {
	if f.Limit <= 0 || f.Limit > 300 {
		f.Limit = 100
	}
	where, args := f.where()
	args = append(args, f.Limit+1)
	rows, err := db.DB.Query(`
		SELECT id, staff_role, staff_id, staff_name, kind, action, description, context, page,
		       method, path, status_code, COALESCE(details, ''), ip, user_agent, created_at
		FROM staff_activity_log
		WHERE `+where+`
		ORDER BY id DESC
		LIMIT ?`, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	for rows.Next() {
		var e ActivityEntry
		if err := rows.Scan(&e.ID, &e.StaffRole, &e.StaffID, &e.StaffName, &e.Kind, &e.Action,
			&e.Description, &e.Context, &e.Page, &e.Method, &e.Path, &e.StatusCode, &e.Details,
			&e.IP, &e.UserAgent, &e.CreatedAt); err != nil {
			return nil, false, err
		}
		e.StaffKey = StaffKey(e.StaffRole, e.StaffID)
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	if len(items) > f.Limit {
		items = items[:f.Limit]
		hasMore = true
	}
	return items, hasMore, nil
}

// ActivityPersonStats es el resumen por persona del periodo elegido.
type ActivityPersonStats struct {
	Role     string     `json:"role"`
	ID       int64      `json:"id"`
	Key      string     `json:"key"`
	Name     string     `json:"name"`
	Email    string     `json:"email"`
	Total    int        `json:"total"`
	Actions  int        `json:"acciones"`
	Clicks   int        `json:"clics"`
	Views    int        `json:"vistas"`
	Searches int        `json:"busquedas"`
	Failed   int        `json:"fallidas"`
	FirstAt  *time.Time `json:"first_at"`
	LastAt   *time.Time `json:"last_at"`
	Online   bool       `json:"online"`
}

// ActivityStatsByPerson cuenta por persona dentro del periodo (sin
// filtrar por tipo ni texto: es el resumen general).
func ActivityStatsByPerson(f ActivityFilter) (map[string]*ActivityPersonStats, error) {
	f.Kind, f.Query, f.BeforeID, f.AfterID, f.Role, f.StaffID = "", "", 0, 0, "", 0
	where, args := f.where()
	rows, err := db.DB.Query(`
		SELECT staff_role, staff_id, MAX(staff_name),
		       COUNT(*),
		       SUM(kind = 'accion'), SUM(kind = 'clic'), SUM(kind = 'vista'), SUM(kind = 'busqueda'),
		       SUM(kind = 'accion' AND status_code >= 400),
		       MIN(created_at), MAX(created_at)
		FROM staff_activity_log
		WHERE `+where+`
		GROUP BY staff_role, staff_id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]*ActivityPersonStats{}
	for rows.Next() {
		var s ActivityPersonStats
		var first, last time.Time
		if err := rows.Scan(&s.Role, &s.ID, &s.Name, &s.Total, &s.Actions, &s.Clicks, &s.Views,
			&s.Searches, &s.Failed, &first, &last); err != nil {
			return nil, err
		}
		s.FirstAt, s.LastAt = &first, &last
		s.Key = StaffKey(s.Role, s.ID)
		out[s.Key] = &s
	}
	return out, rows.Err()
}

// PurgeActivitiesOlderThan borra lo que tenga más de `days` días.
func PurgeActivitiesOlderThan(days int) (int64, error) {
	res, err := db.DB.Exec("DELETE FROM staff_activity_log WHERE created_at < ?", time.Now().AddDate(0, 0, -days))
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// AnnouncementTitle es el título de un aviso (para describirlo en la
// bitácora). Vacío si no existe.
func AnnouncementTitle(id int64) string {
	var t string
	_ = db.DB.QueryRow("SELECT title FROM staff_announcements WHERE id = ?", id).Scan(&t)
	return t
}
