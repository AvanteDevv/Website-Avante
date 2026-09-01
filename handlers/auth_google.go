package handlers

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"

	"avante-optics/auth"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" arriba para que coincida con el nombre del
// módulo declarado en tu go.mod (primera línea: "module xxxxx").

// GoogleLogin manda al usuario a la pantalla de consentimiento de
// Google. Es el MISMO endpoint que usan tanto "Iniciar sesión" como
// "Registro" — no hace falta uno distinto para cada botón: si la
// cuenta ya existe, GoogleCallback la reconoce y solo arranca sesión;
// si no existe, la crea sola. Así el flujo de Google nunca le pregunta
// al usuario si "quiere entrar o registrarse", igual que en la mayoría
// de sitios.
func GoogleLogin(c *gin.Context) {
	if auth.GoogleOAuthConfig == nil {
		log.Println("GoogleLogin: GoogleOAuthConfig es nil — revisa GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URL en tu .env")
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google_config")
		return
	}

	state, err := auth.NewOAuthState(c.Writer, c.Request)
	if err != nil {
		log.Println("GoogleLogin: no se pudo generar el state:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	url := auth.GoogleOAuthConfig.AuthCodeURL(state)
	c.Redirect(http.StatusFound, url)
}

// googleUserInfo son los únicos campos que nos importan de la respuesta
// del endpoint de perfil de Google (openid-connect userinfo).
type googleUserInfo struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
}

// GoogleCallback recibe el "code" que regresa Google después de que el
// usuario acepta, lo cambia por un token, pide su perfil (correo +
// nombre) y arranca sesión — creando la cuenta sola la primera vez que
// esa persona entra con Google (ver models.GetOrCreateGoogleUser).
func GoogleCallback(c *gin.Context) {
	if auth.GoogleOAuthConfig == nil {
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google_config")
		return
	}

	if errMsg := c.Query("error"); errMsg != "" {
		// El usuario canceló el consentimiento en Google, o Google
		// mandó un error propio — no es un bug nuestro.
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google_cancelado")
		return
	}

	state := c.Query("state")
	if !auth.ValidOAuthState(c.Writer, c.Request, state) {
		log.Println("GoogleCallback: state inválido o ausente (posible CSRF o link reusado)")
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	token, err := auth.GoogleOAuthConfig.Exchange(c.Request.Context(), code)
	if err != nil {
		log.Println("GoogleCallback: error al intercambiar el código:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	client := auth.GoogleOAuthConfig.Client(c.Request.Context(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v3/userinfo")
	if err != nil {
		log.Println("GoogleCallback: error al pedir el perfil a Google:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Println("GoogleCallback: error al leer el perfil de Google:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	var info googleUserInfo
	if err := json.Unmarshal(body, &info); err != nil || info.Email == "" {
		log.Println("GoogleCallback: perfil de Google inválido:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}
	if !info.EmailVerified {
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google_sin_verificar")
		return
	}

	name := info.Name
	if name == "" {
		name = info.Email
	}

	user, err := models.GetOrCreateGoogleUser(name, info.Email)
	if err != nil {
		log.Println("GoogleCallback: error al obtener/crear el usuario:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	if err := startSession(c, user); err != nil {
		log.Println("GoogleCallback: error al iniciar sesión:", err)
		c.Redirect(http.StatusFound, "/iniciar-sesion?error=google")
		return
	}

	c.Redirect(http.StatusFound, "/dashboard")
}
