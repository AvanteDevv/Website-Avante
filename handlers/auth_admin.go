package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/auth"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Separado de auth.go a propósito: la autenticación de admin no es "login
// de cliente + un permiso extra", es un flujo distinto (sin registro
// público, tabla propia `admins`, cookie de sesión propia). Mantenerlo en
// su propio archivo evita que un bug en el login de cliente arrastre al
// de admin, o viceversa.

type adminLoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// AdminLogin valida credenciales de administrador y arranca su sesión.
// A propósito NO existe un AdminRegister público: los admins se crean
// con el script cmd/seedadmin (el primero) o desde una pantalla del
// propio panel ya autenticado (los siguientes) — nunca desde un endpoint
// abierto al público.
func AdminLogin(c *gin.Context) {
	var input adminLoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ingresa un correo y contraseña válidos."})
		return
	}

	admin, err := models.GetAdminByEmail(input.Email)
	if errors.Is(err, models.ErrAdminNotFound) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	}

	if err := startAdminSession(c, admin); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo iniciar sesión. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Bienvenido al panel de administrador.",
		"redirect": "/admin/base-de-datos",
	})
}

// AdminLogout cierra la sesión de administrador (cookie AdminSessionName,
// no toca la sesión de cliente si hubiera una activa en el mismo navegador).
func AdminLogout(c *gin.Context) {
	session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	session.Options.MaxAge = -1
	session.Save(c.Request, c.Writer)
	c.Redirect(http.StatusFound, "/admin/iniciar-sesion")
}

// RequireAdminAuth protege las rutas del panel de administrador. Úsalo
// así en main.go:
//
//	admin := router.Group("/admin", handlers.RequireAdminAuth())
//	admin.GET("/base-de-datos", ...)
func RequireAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
		if session.Values["admin_id"] == nil {
			c.Redirect(http.StatusFound, "/admin/iniciar-sesion")
			c.Abort()
			return
		}
		c.Next()
	}
}

func startAdminSession(c *gin.Context, admin *models.Admin) error {
	session, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	// Sesión de admin más corta que la de cliente (8h vs. 7 días) —
	// tiene más privilegios, así que conviene que expire más rápido.
	session.Options.MaxAge = 8 * 60 * 60
	session.Values["admin_id"] = admin.ID
	session.Values["admin_name"] = admin.Name
	return session.Save(c.Request, c.Writer)
}
