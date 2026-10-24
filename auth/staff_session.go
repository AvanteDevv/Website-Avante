package auth

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/gorilla/sessions"
)

// Sesiones de staff por ROL — para poder tener, en el mismo navegador,
// una pestaña como optometrista y otra como recepción (o admin, etc.).
//
// Antes había una sola cookie (AdminSessionName) y al iniciar sesión con
// otra cuenta en otra pestaña se reemplazaba la primera. Ahora cada rol
// tiene su cookie ("avante_admin_session_<rol>") y en cada petición se
// usa la del panel en el que está la pestaña:
//
//   - Al navegar (abrir una página) cuenta la ruta: /optometrist/... usa
//     la sesión de optometrista, /receptionist/... la de recepción, etc.
//   - En las peticiones de la página (fetch, envío de formularios) cuenta
//     la página desde donde se hacen (encabezado Referer); el WebSocket
//     manda su página en ?ctx=.
//   - Si la ruta no es de ningún panel en particular (p. ej. el admin
//     viendo páginas de optometría), se usa la del último inicio de sesión.
//
// Dos cuentas del MISMO rol (p. ej. dos optometristas) también pueden
// estar a la vez, cada una en su pestaña: cada cuenta tiene su propia
// cookie ("avante_admin_session_<rol>_<id>") y cada pestaña recuerda con
// qué cuenta entró (static/js/staff-tab.js, en sessionStorage). La
// pestaña avisa cuál es en cada petición:
//
//   - fetch / XHR: encabezado X-Staff-Account ("rol:id").
//   - WebSocket: ?acct=rol:id.
//   - Al abrir páginas: la cookie avante_staff_tab, que la pestaña pone
//     en cuanto se usa (clic, tecla, foco), justo antes de navegar.

// LastStaffRoleCookie guarda el rol del último inicio de sesión.
const LastStaffRoleCookie = "avante_staff_last"

// LastStaffAccountCookie guarda la cuenta ("rol:id") del último inicio de sesión.
const LastStaffAccountCookie = "avante_staff_last_acct"

// StaffTabCookie / StaffAccountHeader: la cuenta de la pestaña que hace la petición.
const (
	StaffTabCookie     = "avante_staff_tab"
	StaffAccountHeader = "X-Staff-Account"
)

// StaffRoles: en orden de preferencia cuando no hay otra pista.
var StaffRoles = []string{"admin", "receptionist", "optometrist", "employee", "inventario", "blogger", "laboratorio"}

// Rutas "de casa" de cada rol (la más larga gana).
var staffRolePrefixes = map[string][]string{
	"admin":        {"/admin", "/api/admin"},
	"receptionist": {"/receptionist", "/api/receptionist"},
	"optometrist":  {"/optometrist", "/api/optometrist"},
	"employee":     {"/employee"},
	"inventario":   {"/inventario", "/api/inventario"},
	"blogger":      {"/admin/blogs", "/admin/blog"},
	"laboratorio":  {"/laboratorio", "/api/laboratorio"},
}

// StaffCookieName es la cookie de sesión de ese rol (formato anterior, una
// por rol; se sigue leyendo mientras no expire).
func StaffCookieName(role string) string { return AdminSessionName + "_" + role }

// StaffAccountCookieName es la cookie de sesión de una cuenta en particular.
func StaffAccountCookieName(role string, id int64) string {
	return AdminSessionName + "_" + role + "_" + strconv.FormatInt(id, 10)
}

// StaffAccountKey — "rol:id" de una sesión.
func StaffAccountKey(s *sessions.Session) string {
	if s == nil {
		return ""
	}
	role, _ := s.Values["staff_role"].(string)
	id, _ := s.Values["staff_id"].(int64)
	if role == "" || id == 0 {
		return ""
	}
	return role + ":" + strconv.FormatInt(id, 10)
}

// requestedAccount — la cuenta que pide la pestaña (encabezado, ?acct= o cookie).
func requestedAccount(r *http.Request) string {
	if v := strings.TrimSpace(r.Header.Get(StaffAccountHeader)); v != "" {
		return v
	}
	if v := strings.TrimSpace(r.URL.Query().Get("acct")); v != "" {
		return v
	}
	if ck, err := r.Cookie(StaffTabCookie); err == nil {
		if v, err := url.QueryUnescape(ck.Value); err == nil {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// staffContextPath: la página "dueña" de la petición.
func staffContextPath(r *http.Request) string {
	if ctx := r.URL.Query().Get("ctx"); strings.HasPrefix(ctx, "/") {
		return ctx
	}
	navigate := r.Header.Get("Sec-Fetch-Mode") == "navigate" ||
		(r.Method == http.MethodGet && strings.Contains(r.Header.Get("Accept"), "text/html") && r.Header.Get("X-Requested-With") == "")
	if !navigate {
		if ref := r.Header.Get("Referer"); ref != "" {
			if u, err := url.Parse(ref); err == nil && (u.Host == "" || u.Host == r.Host) && u.Path != "" {
				return u.Path
			}
		}
	}
	return r.URL.Path
}

func hasPrefixPath(p, prefix string) bool {
	return p == prefix || strings.HasPrefix(p, prefix+"/")
}

func sessionHasStaff(s *sessions.Session) bool {
	return s != nil && s.Values["staff_id"] != nil
}

// StaffSession regresa la sesión de staff que aplica a esta petición
// (vacía si no hay ninguna — entonces Values["staff_id"] es nil).
func StaffSession(r *http.Request) *sessions.Session {
	path := staffContextPath(r)

	type cand struct {
		role string
		s    *sessions.Session
	}
	var cands []cand
	have := map[string]bool{} // por cuenta "rol:id"
	add := func(name string) {
		s, _ := Store.Get(r, name)
		if !sessionHasStaff(s) {
			return
		}
		key := StaffAccountKey(s)
		if have[key] {
			return
		}
		have[key] = true
		role, _ := s.Values["staff_role"].(string)
		cands = append(cands, cand{role, s})
	}
	// Una cookie por cuenta (las más nuevas) …
	for _, ck := range r.Cookies() {
		if strings.HasPrefix(ck.Name, AdminSessionName+"_") {
			rest := ck.Name[len(AdminSessionName)+1:]
			if i := strings.LastIndex(rest, "_"); i > 0 {
				if _, err := strconv.ParseInt(rest[i+1:], 10, 64); err == nil {
					add(ck.Name)
				}
			}
		}
	}
	// … y las de antes (una por rol, y la única de antes de eso): siguen
	// sirviendo hasta que expiren o se vuelva a iniciar sesión.
	for _, role := range StaffRoles {
		if _, err := r.Cookie(StaffCookieName(role)); err == nil {
			add(StaffCookieName(role))
		}
	}
	if _, err := r.Cookie(AdminSessionName); err == nil {
		add(AdminSessionName)
	}

	if len(cands) == 0 {
		s, _ := Store.Get(r, AdminSessionName)
		return s
	}
	if len(cands) == 1 {
		return cands[0].s
	}

	// Las del panel de la pestaña (prefijo más largo); si ninguna es de
	// ese panel, todas.
	bestLen := 0
	for _, c := range cands {
		for _, p := range staffRolePrefixes[c.role] {
			if hasPrefixPath(path, p) && len(p) > bestLen {
				bestLen = len(p)
			}
		}
	}
	pool := cands
	if bestLen > 0 {
		pool = nil
		for _, c := range cands {
			for _, p := range staffRolePrefixes[c.role] {
				if hasPrefixPath(path, p) && len(p) == bestLen {
					pool = append(pool, c)
					break
				}
			}
		}
	}
	if len(pool) == 1 {
		return pool[0].s
	}
	// Entre esas, la cuenta de esta pestaña …
	if want := requestedAccount(r); want != "" {
		for _, c := range pool {
			if StaffAccountKey(c.s) == want {
				return c.s
			}
		}
	}
	// … si no, la del último inicio de sesión.
	if ck, err := r.Cookie(LastStaffAccountCookie); err == nil {
		v, _ := url.QueryUnescape(ck.Value)
		for _, c := range pool {
			if StaffAccountKey(c.s) == v {
				return c.s
			}
		}
	}
	if ck, err := r.Cookie(LastStaffRoleCookie); err == nil {
		for _, c := range pool {
			if c.role == ck.Value {
				return c.s
			}
		}
	}
	return pool[0].s
}

// HasStaffRole: ¿hay sesión activa de ese rol en este navegador?
func HasStaffRole(r *http.Request, role string) bool {
	for _, ck := range r.Cookies() {
		if strings.HasPrefix(ck.Name, AdminSessionName+"_"+role+"_") {
			if s, _ := Store.Get(r, ck.Name); sessionHasStaff(s) {
				if v, _ := s.Values["staff_role"].(string); v == role {
					return true
				}
			}
		}
	}
	if _, err := r.Cookie(StaffCookieName(role)); err == nil {
		if s, _ := Store.Get(r, StaffCookieName(role)); sessionHasStaff(s) {
			return true
		}
	}
	if s, _ := Store.Get(r, AdminSessionName); sessionHasStaff(s) {
		if v, _ := s.Values["staff_role"].(string); v == role {
			return true
		}
	}
	return false
}

// staffCookieNames — todas las cookies de sesión de staff de la petición.
func staffCookieNames(r *http.Request) []string {
	out := []string{}
	for _, ck := range r.Cookies() {
		if ck.Name == AdminSessionName || strings.HasPrefix(ck.Name, AdminSessionName+"_") {
			out = append(out, ck.Name)
		}
	}
	return out
}

// TabStaffSession — la sesión de la cuenta de esta pestaña, sin importar
// la ruta (para cerrar sesión: que se cierre la de la pestaña y no otra).
func TabStaffSession(r *http.Request) *sessions.Session {
	if want := requestedAccount(r); want != "" {
		for _, name := range staffCookieNames(r) {
			if s, _ := Store.Get(r, name); sessionHasStaff(s) && StaffAccountKey(s) == want {
				return s
			}
		}
	}
	return StaffSession(r)
}

// ExpireStaffAccount borra todas las cookies que tengan esa cuenta ("rol:id"),
// incluida la de formato anterior (una por rol).
func ExpireStaffAccount(w http.ResponseWriter, r *http.Request, key string) {
	if key == "" {
		return
	}
	for _, name := range staffCookieNames(r) {
		if s, _ := Store.Get(r, name); sessionHasStaff(s) && StaffAccountKey(s) == key {
			s.Options.MaxAge = -1
			_ = s.Save(r, w)
		}
	}
}
