package auth

import (
	"net/http"
	"os"

	"github.com/gorilla/sessions"
)

// Store es el almacén de sesiones basado en cookies firmadas.
// Se inicializa una sola vez con InitStore() en main.go.
var Store *sessions.CookieStore

const SessionName = "avante_session"

// InitStore prepara el store de sesiones. La clave de firma sale de
// SESSION_SECRET (variable de entorno) — en producción SIEMPRE debe venir
// del entorno, nunca hardcodeada.
func InitStore() {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = "cambia-esto-por-una-clave-larga-y-aleatoria-en-produccion"
	}

	Store = sessions.NewCookieStore([]byte(secret))
	Store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400 * 7, // 7 días
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		// Secure: true, // actívalo cuando el sitio corra bajo HTTPS en producción
	}
}
