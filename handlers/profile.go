package handlers

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/auth"
	"avante-optics/models"
)

// sessionUserID lee el user_id directo de la cookie de sesión de
// cliente. A diferencia de currentUserID(c) (auth.go), que asume que
// RequireAuthAPI() ya lo dejó guardado en el contexto de la petición
// con c.Set(...), esta sirve para rutas de PÁGINA protegidas con
// RequireAuth() en vez de RequireAuthAPI() — RequireAuth() nunca hace
// ese c.Set, solo revisa que la sesión exista y deja pasar.
func sessionUserID(c *gin.Context) int64 {
	session, _ := auth.Store.Get(c.Request, auth.SessionName)
	switch id := session.Values["user_id"].(type) {
	case int64:
		return id
	case int:
		return int64(id)
	default:
		return 0
	}
}

// MiPerfil renderiza el panel "Mi perfil" con los datos reales de la
// cuenta logueada — antes la plantilla traía valores fijos ("Cliente
// Avante", "cliente@avanteoptics.mx") sin importar quién entrara.
// WithUser ya aporta UserName/UserEmail/UserInitials (los lee de la
// sesión); aquí solo hace falta ir a la base por el teléfono, que la
// sesión no guarda.
func MiPerfil(c *gin.Context) {
	user, err := models.GetUserByID(sessionUserID(c))
	if err != nil {
		log.Println("MiPerfil: error al leer usuario:", err)
		c.HTML(http.StatusOK, "mi-perfil.html", WithUser(c, gin.H{
			"ActivePage":   "mi-perfil",
			"ProfileError": "No se pudieron cargar tus datos en este momento.",
		}))
		return
	}

	c.HTML(http.StatusOK, "mi-perfil.html", WithUser(c, gin.H{
		"ActivePage":       "mi-perfil",
		"UserPhone":        user.Phone,
		"UserAuthProvider": user.AuthProvider,
	}))
}

// MisCitas renderiza el panel "Mis citas" — igual que MiPerfil, la
// única razón de tener un handler dedicado en vez del inline que había
// en main.go es traer el teléfono de la cuenta (la sesión no lo
// guarda), para que el widget de agendar cita lo pueda autocompletar
// junto con nombre y apellido, en vez de pedirlo de nuevo.
func MisCitas(c *gin.Context) {
	user, err := models.GetUserByID(sessionUserID(c))
	if err != nil {
		log.Println("MisCitas: error al leer usuario:", err)
		c.HTML(http.StatusOK, "mis-citas.html", WithUser(c, gin.H{
			"ActivePage": "mis-citas",
		}))
		return
	}

	c.HTML(http.StatusOK, "mis-citas.html", WithUser(c, gin.H{
		"ActivePage": "mis-citas",
		"UserPhone":  user.Phone,
	}))
}

type updateProfileInput struct {
	Name  string `json:"name" binding:"required,min=3"`
	Email string `json:"email" binding:"required,email"`
	Phone string `json:"phone"`
}

// UpdateMyProfile deja que el cliente logueado edite su propio nombre,
// correo y teléfono — PUT /api/mi-perfil.
func UpdateMyProfile(c *gin.Context) {
	var input updateProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa tu nombre y correo."})
		return
	}

	err := models.UpdateUserProfile(currentUserID(c), input.Name, input.Email, input.Phone)
	if errors.Is(err, models.ErrEmailTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una cuenta con ese correo."})
		return
	}
	if err != nil {
		log.Println("UpdateMyProfile: error al actualizar:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron guardar los cambios."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Perfil actualizado correctamente."})
}

type updatePasswordInput struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// UpdateMyPassword cambia la contraseña del cliente logueado —
// PATCH /api/mi-perfil/password. A diferencia del cambio que hace el
// admin desde "Editar usuario" (que no la pide), aquí SÍ se exige la
// contraseña actual correcta antes de aceptar la nueva.
func UpdateMyPassword(c *gin.Context) {
	var input updatePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La nueva contraseña debe tener al menos 8 caracteres."})
		return
	}

	user, err := models.GetUserByID(currentUserID(c))
	if err != nil {
		log.Println("UpdateMyPassword: error al leer usuario:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo verificar tu contraseña actual."})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Tu contraseña actual no es correcta."})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Println("UpdateMyPassword: error al generar hash:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	if err := models.UpdateUserPassword(user.ID, string(hash)); err != nil {
		log.Println("UpdateMyPassword: error al guardar contraseña:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo actualizar la contraseña."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Contraseña actualizada correctamente."})
}
