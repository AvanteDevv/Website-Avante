package handlers

import (
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/auth"
)

// PublicUserContext regresa LoggedIn/UserName/UserInitials según la sesión
// de CLIENTE activa (cookie avante_session) — no confundir con la sesión
// de admin. Se usa en las páginas públicas para que el navbar muestre el
// userbar en vez de los botones de Iniciar sesión/Registro.
//
// También regresa IsAdmin, checando la cookie avante_admin_session por
// separado: cuando un admin navega el sitio público (misma pestaña, sin
// tener sesión de cliente), el navbar esconde el carrito/rastreo porque
// no le aplican a él.
func PublicUserContext(c *gin.Context) gin.H {
	adminSession, _ := auth.Store.Get(c.Request, auth.AdminSessionName)
	isAdmin := adminSession.Values["admin_id"] != nil

	session, _ := auth.Store.Get(c.Request, auth.SessionName)
	uid := session.Values["user_id"]
	if uid == nil {
		return gin.H{"LoggedIn": false, "IsAdmin": isAdmin}
	}
	name, _ := session.Values["name"].(string)
	email, _ := session.Values["email"].(string)
	return gin.H{
		"LoggedIn":     true,
		"UserName":     name,
		"UserInitials": initialsOf(name),
		"UserEmail":    email,
		"IsAdmin":      isAdmin,
	}
}

// WithUser combina los datos propios de la página (data) con el contexto
// de sesión del usuario, para pasarle todo junto a c.HTML(...).
func WithUser(c *gin.Context, data gin.H) gin.H {
	if data == nil {
		data = gin.H{}
	}
	for k, v := range PublicUserContext(c) {
		data[k] = v
	}
	return data
}

func initialsOf(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "?"
	}
	parts := strings.Fields(name)
	first := []rune(parts[0])
	if len(parts) == 1 {
		if len(first) >= 2 {
			return strings.ToUpper(string(first[:2]))
		}
		return strings.ToUpper(string(first))
	}
	last := []rune(parts[len(parts)-1])
	return strings.ToUpper(string(first[0]) + string(last[0]))
}
