package auth

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"os"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// ⚠️ Ajusta "avante-optics" del resto del proyecto para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx") —
// este archivo no importa ese path directo, así que no necesita ajuste
// aquí, pero los handlers que lo usan sí.

// GoogleOAuthConfig se arma una sola vez en InitGoogleOAuth() (llamada
// desde main.go junto a InitStore()). Si faltan las variables de
// entorno se queda en nil — GoogleLogin lo revisa y responde con un
// error legible en vez de tronar el arranque del servidor por esto.
var GoogleOAuthConfig *oauth2.Config

// oauthStateSessionKey es la llave dentro de la MISMA cookie de sesión
// de cliente (SessionName) donde se guarda el "state" random mientras
// el usuario está en la pantalla de consentimiento de Google. Se borra
// en cuanto se valida en el callback — nunca convive con user_id.
const oauthStateSessionKey = "google_oauth_state"

// InitGoogleOAuth prepara el cliente OAuth2 de Google, leyendo:
//
//	GOOGLE_CLIENT_ID
//	GOOGLE_CLIENT_SECRET
//	GOOGLE_REDIRECT_URL   — URL COMPLETA a /auth/google/callback tal
//	                        como la vera Google, ej:
//	                        https://avanteoptics.mx/auth/google/callback
//	                        (en local: http://localhost:8080/auth/google/callback)
//	                        Debe coincidir EXACTO con lo que registraste
//	                        como "Authorized redirect URI" en Google
//	                        Cloud Console (Credenciales → OAuth Client ID).
//
// Si cualquiera de las tres falta, GoogleOAuthConfig se queda en nil y
// el botón de Google responde con un error en vez de romper el server.
func InitGoogleOAuth() {
	clientID := os.Getenv("GOOGLE_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_CLIENT_SECRET")
	redirectURL := os.Getenv("GOOGLE_REDIRECT_URL")

	if clientID == "" || clientSecret == "" || redirectURL == "" {
		return
	}

	GoogleOAuthConfig = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
		},
		Endpoint: google.Endpoint,
	}
}

// NewOAuthState genera un valor aleatorio, lo guarda en la cookie de
// sesión de cliente y lo regresa para mandarlo como "state" en la URL
// de Google — es la defensa estándar contra CSRF en el flujo OAuth
// (alguien no puede forzar a otra persona a "aceptar" un login que no
// inició, porque el state no va a coincidir con el que quedó guardado
// en SU sesión).
func NewOAuthState(w http.ResponseWriter, r *http.Request) (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	state := base64.URLEncoding.EncodeToString(buf)

	session, _ := Store.Get(r, SessionName)
	session.Values[oauthStateSessionKey] = state
	if err := session.Save(r, w); err != nil {
		return "", err
	}
	return state, nil
}

// ValidOAuthState compara el state que regresó Google contra el que se
// guardó en NewOAuthState, y lo borra de la sesión en cuanto lo revisa
// (se usa una sola vez, sin importar si fue válido o no).
func ValidOAuthState(w http.ResponseWriter, r *http.Request, state string) bool {
	if state == "" {
		return false
	}

	session, _ := Store.Get(r, SessionName)
	saved, _ := session.Values[oauthStateSessionKey].(string)
	delete(session.Values, oauthStateSessionKey)
	session.Save(r, w)

	return saved != "" && saved == state
}
