package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/auth"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" arriba para que coincida con el nombre del
// módulo declarado en tu go.mod (primera línea: "module xxxxx").

type registerInput struct {
	Name     string `json:"name" binding:"required,min=3"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

type loginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Register crea una cuenta nueva y arranca sesión automáticamente.
func Register(c *gin.Context) {
	var input registerInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa tu nombre, correo y contraseña (mínimo 8 caracteres)."})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	user, err := models.CreateUser(input.Name, input.Email, string(hash))
	if errors.Is(err, models.ErrEmailTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una cuenta con ese correo."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear la cuenta. Intenta de nuevo."})
		return
	}

	if err := startSession(c, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Cuenta creada, pero no se pudo iniciar sesión automáticamente."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Cuenta creada correctamente.",
		"redirect": "/dashboard",
	})
}

// Login valida credenciales y arranca sesión.
func Login(c *gin.Context) {
	var input loginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ingresa un correo y contraseña válidos."})
		return
	}

	user, err := models.GetUserByEmail(input.Email)
	if errors.Is(err, models.ErrUserNotFound) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Correo o contraseña incorrectos."})
		return
	}

	if err := startSession(c, user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo iniciar sesión. Intenta de nuevo."})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Bienvenido de vuelta a Avante Optics.",
		"redirect": "/dashboard",
	})
}

// Logout cierra la sesión actual.
func Logout(c *gin.Context) {
	session, _ := auth.Store.Get(c.Request, auth.SessionName)
	session.Options.MaxAge = -1
	session.Save(c.Request, c.Writer)
	c.Redirect(http.StatusFound, "/")
}

// RequireAuth es un middleware opcional para proteger rutas del panel de
// cliente (mis-pedidos, mis-favoritos, etc.). Úsalo así en main.go:
//
//	client := router.Group("/", handlers.RequireAuth())
//	client.GET("/mis-favoritos", ...)
func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, _ := auth.Store.Get(c.Request, auth.SessionName)
		if session.Values["user_id"] == nil {
			c.Redirect(http.StatusFound, "/iniciar-sesion")
			c.Abort()
			return
		}
		c.Next()
	}
}

func startSession(c *gin.Context, user *models.User) error {
	session, _ := auth.Store.Get(c.Request, auth.SessionName)
	session.Values["user_id"] = user.ID
	session.Values["name"] = user.Name
	return session.Save(c.Request, c.Writer)
}
