package auth

import (
	"net/http"
	"net/url"
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
// Dos cuentas del MISMO rol en el mismo navegador siguen sin poder estar
// a la vez (comparten la cookie de ese rol); para eso, otra ventana de
// incógnito u otro navegador.

// LastStaffRoleCookie guarda el rol del último inicio de sesión.
const LastStaffRoleCookie = "avante_staff_last"

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

// StaffCookieName es la cookie de sesión de ese rol.
func StaffCookieName(role string) string { return AdminSessionName + "_" + role }

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
	have := map[string]bool{}
	for _, role := range StaffRoles {
		if _, err := r.Cookie(StaffCookieName(role)); err != nil {
			continue
		}
		s, _ := Store.Get(r, StaffCookieName(role))
		if sessionHasStaff(s) {
			cands = append(cands, cand{role, s})
			have[role] = true
		}
	}
	// Cookie vieja (de antes de este cambio): sigue sirviendo hasta que
	// expire o se vuelva a iniciar sesión.
	if _, err := r.Cookie(AdminSessionName); err == nil {
		if s, _ := Store.Get(r, AdminSessionName); sessionHasStaff(s) {
			role, _ := s.Values["staff_role"].(string)
			if !have[role] {
				cands = append(cands, cand{role, s})
			}
		}
	}

	if len(cands) == 0 {
		s, _ := Store.Get(r, AdminSessionName)
		return s
	}
	if len(cands) == 1 {
		return cands[0].s
	}

	// La del panel de la pestaña (prefijo más largo).
	best, bestLen := -1, 0
	for i, c := range cands {
		for _, p := range staffRolePrefixes[c.role] {
			if hasPrefixPath(path, p) && len(p) > bestLen {
				best, bestLen = i, len(p)
			}
		}
	}
	if best >= 0 {
		return cands[best].s
	}
	// Si no, la del último inicio de sesión.
	if ck, err := r.Cookie(LastStaffRoleCookie); err == nil {
		for _, c := range cands {
			if c.role == ck.Value {
				return c.s
			}
		}
	}
	return cands[0].s
}

// HasStaffRole: ¿hay sesión activa de ese rol en este navegador?
func HasStaffRole(r *http.Request, role string) bool {
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
