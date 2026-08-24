package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/auth"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Separado de auth.go a propósito: la autenticación de staff (admin /
// recepción / optometría) no es "login de cliente + un permiso extra",
// es un flujo distinto (sin registro público, tablas propias, cookie
// de sesión propia). Mantenerlo en su propio archivo evita que un bug
// en el login de cliente arrastre al de staff, o viceversa.
//
// Las tres cuentas (admin, recepción, optometría) comparten el MISMO
// formulario de login y la MISMA cookie de sesión (AdminSessionName)
// — es un solo panel de entrada. Lo que cambia es la tabla en la que
// vive cada cuenta: son identidades separadas (Admin / Receptionist /
// Optometrist, cada una en su propio archivo de modelo), no una sola
// tabla con una columna de rol.

// Roles válidos para la sesión de staff — usa estas constantes en
// RequireRole(...) en vez de escribir el string a mano.
const (
	RoleAdmin        = "admin"
	RoleReceptionist = "receptionist"
	RoleOptometrist  = "optometrist"
)

type adminLoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// AdminLogin valida credenciales contra las tres tablas de staff, en
// este orden: admins -> receptionists -> optometrists. La primera que
// tenga ese correo (y cuya contraseña haga match) es la que arranca
// sesión. Un correo solo debería existir en una de las tres tablas a
// la vez — tú controlas eso al crear las cuentas, aquí no se valida.
//
// A propósito NO existe un registro público para ninguna de las tres:
// el primer admin se crea con cmd/seedadmin; las cuentas de recepción
// y optometría se crean desde una pantalla del propio panel ya
// autenticado como admin.
func AdminLogin(c *gin.Context) {
	var input adminLoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ingresa un correo y contraseña válidos."})
		return
	}

	// 1) Admin
	if admin, err := models.GetAdminByEmail(input.Email); err == nil {
		if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(input.Password)) == nil {
			finishStaffLogin(c, RoleAdmin, admin.ID, admin.Name, admin.Email, "/admin/base-de-datos")
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	} else if !errors.Is(err, models.ErrAdminNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	// 2) Recepción
	if r, err := models.GetReceptionistByEmail(input.Email); err == nil {
		if bcrypt.CompareHashAndPassword([]byte(r.PasswordHash), []byte(input.Password)) == nil {
			finishStaffLogin(c, RoleReceptionist, r.ID, r.Name, r.Email, "/receptionist/citas")
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	} else if !errors.Is(err, models.ErrReceptionistNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	// 3) Optometría
	if o, err := models.GetOptometristByEmail(input.Email); err == nil {
		if bcrypt.CompareHashAndPassword([]byte(o.PasswordHash), []byte(input.Password)) == nil {
			finishStaffLogin(c, RoleOptometrist, o.ID, o.Name, o.Email, "/optometrist/historial-clinico")
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	} else if !errors.Is(err, models.ErrOptometristNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	// No apareció en ninguna de las tres tablas.
	c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
}

// finishStaffLogin arranca la sesión y responde el JSON de éxito —
// compartido por las tres ramas de AdminLogin para no repetir la
// misma respuesta tres veces.
func finishStaffLogin(c *gin.Context, role string, id int64, name string, email string, redirect string) {
	if err := startStaffSession(c, role, id, name, email); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo iniciar sesión. Intenta de nuevo."})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":  "Bienvenido al panel de administración.",
		"redirect": redirect,
	})
}

// AdminLogout cierra la sesión de staff (cookie AdminSessionName,
// no toca la sesión de cliente si hubiera una activa en el mismo navegador).
// Sirve para las tres cuentas por igual — es la misma cookie.
func AdminLogout(c *gin.Context) {
	session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	session.Options.MaxAge = -1
	session.Save(c.Request, c.Writer)
	c.Redirect(http.StatusFound, "/admin/iniciar-sesion")
}

// RequireAdminAuth protege las rutas del panel de staff — cualquiera
// de los tres roles pasa esta capa, siempre y cuando tenga sesión
// activa. Úsalo así en main.go:
//
//	admin := router.Group("/admin", handlers.RequireAdminAuth())
//	admin.GET("/base-de-datos", ...)
//
// Además de validar la sesión, deja el rol disponible en el contexto
// (c.Set("staff_role", ...)) para que RequireRole (abajo) y los propios
// handlers puedan leerlo sin volver a tocar la cookie.
func RequireAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
		if session.Values["staff_id"] == nil {
			c.Redirect(http.StatusFound, "/admin/iniciar-sesion")
			c.Abort()
			return
		}
		if role, ok := session.Values["staff_role"].(string); ok {
			c.Set("staff_role", role)
		}
		if id, ok := session.Values["staff_id"].(int64); ok {
			c.Set("staff_id", id)
		}
		if name, ok := session.Values["staff_name"].(string); ok {
			c.Set("staff_name", name)
		}
		if email, ok := session.Values["staff_email"].(string); ok {
			c.Set("staff_email", email)
		}
		c.Next()
	}
}

// RequireRole restringe una ruta a uno o más roles específicos — debe ir
// SIEMPRE después de RequireAdminAuth() en la cadena, nunca solo:
//
//	adminGroup := router.Group("/admin", handlers.RequireAdminAuth())
//	adminGroup.GET("/productos", handlers.RequireRole(handlers.RoleAdmin), adminHandlers.Products)
//
//	apiAdmin := router.Group("/api/admin", handlers.RequireAdminAuth())
//	apiAdmin.GET("/pedidos", handlers.RequireRole(handlers.RoleAdmin, handlers.RoleReceptionist), adminHandlers.ListOrders)
//
// Si alguien con un rol no autorizado intenta entrar directo por URL
// (sin que el sidebar le muestre el link), esto lo corta con 403 —
// nunca confíes solo en que el frontend oculte el botón.
func RequireRole(allowed ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, _ := c.Get("staff_role")
		role, _ := raw.(string)

		for _, r := range allowed {
			if role == r {
				c.Next()
				return
			}
		}

		if c.GetHeader("Accept") == "application/json" || len(c.Request.Header.Get("X-Requested-With")) > 0 {
			c.JSON(http.StatusForbidden, gin.H{"error": "No tienes permiso para esto."})
		} else {
			c.String(http.StatusForbidden, "No tienes permiso para acceder a esta sección.")
		}
		c.Abort()
	}
}

func startStaffSession(c *gin.Context, role string, id int64, name string, email string) error {
	session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	// Sesión de staff más corta que la de cliente (8h vs. 7 días) —
	// tiene más privilegios, así que conviene que expire más rápido.
	session.Options.MaxAge = 8 * 60 * 60
	session.Values["staff_id"] = id
	session.Values["staff_name"] = name
	session.Values["staff_email"] = email
	session.Values["staff_role"] = role
	return session.Save(c.Request, c.Writer)
}

// roleLabel traduce el rol interno (en inglés, usado en el código y
// las rutas) a la etiqueta en español que se muestra en el userbar.
func roleLabel(role string) string {
	switch role {
	case RoleAdmin:
		return "Administrador"
	case RoleReceptionist:
		return "Recepción"
	case RoleOptometrist:
		return "Optometrista"
	default:
		return role
	}
}

// staffInitialsOf saca las iniciales (hasta 2 letras) de un nombre para
// el avatar circular del userbar de staff — "Dra. Barbara López" -> "BL".
// Nombre propio (no "initialsOf" a secas) para no chocar con la función
// homónima que ya tienes en user_context.go para el lado de cliente.
func staffInitialsOf(name string) string {
	words := strings.Fields(name)
	out := ""
	for _, w := range words {
		// Salta partículas cortas tipo "de", "la" o títulos con punto
		// como "Dr."/"Dra." para que las iniciales sean de nombre real.
		clean := strings.TrimRight(w, ".")
		if len(clean) <= 3 && (strings.EqualFold(clean, "dr") || strings.EqualFold(clean, "dra") || strings.EqualFold(clean, "de") || strings.EqualFold(clean, "la") || strings.EqualFold(clean, "el")) {
			continue
		}
		r := []rune(clean)
		if len(r) > 0 {
			out += strings.ToUpper(string(r[0]))
		}
		if len(out) >= 2 {
			break
		}
	}
	if out == "" && len(words) > 0 {
		r := []rune(words[0])
		if len(r) > 0 {
			out = strings.ToUpper(string(r[0]))
		}
	}
	return out
}

// WithStaff agrega el nombre, rol, correo e iniciales de la cuenta de
// staff logueada (admin/recepción/optometría) a los datos que le
// pasas a una plantilla — así el userbar puede mostrar quién es de
// verdad en vez de un texto fijo. Úsalo en vez de armar el gin.H a
// mano en cada ruta:
//
//	c.HTML(http.StatusOK, "historial-clinico.html", handlers.WithStaff(c, gin.H{
//	    "ActivePage": "optometrist-historial",
//	}))
func WithStaff(c *gin.Context, data gin.H) gin.H {
	if data == nil {
		data = gin.H{}
	}
	nameVal, _ := c.Get("staff_name")
	name, _ := nameVal.(string)
	roleVal, _ := c.Get("staff_role")
	role, _ := roleVal.(string)
	emailVal, _ := c.Get("staff_email")
	email, _ := emailVal.(string)

	data["StaffName"] = name
	data["StaffRole"] = roleLabel(role)
	data["StaffEmail"] = email
	data["StaffInitials"] = staffInitialsOf(name)
	return data
}
