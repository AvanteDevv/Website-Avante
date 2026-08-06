package admin

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

type createUserInput struct {
	Name     string `json:"name" binding:"required,min=3"`
	Email    string `json:"email" binding:"required,email"`
	Phone    string `json:"phone"`
	Password string `json:"password" binding:"required,min=8"`
	Role     string `json:"role" binding:"required"`
}

// CreateUser crea un usuario desde el modal "Nuevo usuario" del panel
// de administración — POST /api/admin/usuarios.
//
// ⚠️ Por ahora SOLO crea clientes. Los admins viven en su propia tabla
// `admins` (ver database_admin.go / auth_admin.go), así que crear uno
// aquí insertándolo en `users` con role="admin" produciría una fila
// engañosa: se vería como admin en la lista pero no podría entrar por
// /admin/iniciar-sesion. Esto se activa en cuanto tengamos
// models/admin.go con su CreateAdmin correspondiente.
func CreateUser(c *gin.Context) {
	var input createUserInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa nombre, correo y contraseña (mínimo 8 caracteres)."})
		return
	}

	if input.Role == "admin" {
		c.JSON(http.StatusNotImplemented, gin.H{"error": "Crear administradores desde aquí todavía no está conectado."})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	user, err := models.CreateUserByAdmin(input.Name, input.Email, input.Phone, string(hash), input.Role)
	if errors.Is(err, models.ErrEmailTaken) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una cuenta con ese correo."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el usuario."})
		return
	}

	c.JSON(http.StatusCreated, user)
}

type updateUserInput struct {
	Name     string `json:"name" binding:"required,min=3"`
	Email    string `json:"email" binding:"required,email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
	Role     string `json:"role" binding:"required"`
}

// UpdateUser edita un usuario existente — PUT /api/admin/usuarios/:id.
// Si Password viene vacío, la contraseña actual no se toca (así el
// modal de "Editar" puede dejarla en blanco).
func UpdateUser(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de usuario inválido."})
		return
	}

	var input updateUserInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}

	if err := models.UpdateUser(id, input.Name, input.Email, input.Phone, input.Role); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado."})
		return
	}

	if input.Password != "" {
		if len(input.Password) < 8 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "La contraseña debe tener al menos 8 caracteres."})
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
			return
		}
		if err := models.UpdateUserPassword(id, string(hash)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Usuario actualizado, pero no se pudo cambiar la contraseña."})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Usuario actualizado correctamente."})
}

// DeleteUser elimina un usuario — DELETE /api/admin/usuarios/:id.
func DeleteUser(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de usuario inválido."})
		return
	}

	if err := models.DeleteUser(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Usuario eliminado."})
}
