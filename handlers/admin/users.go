package admin

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/handlers"
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

// CreateUser crea un usuario o una cuenta de staff desde el modal
// "Nuevo usuario" del panel de administración — POST /api/admin/usuarios.
//
// El rol decide en qué tabla se inserta: "cliente" va a `users`
// (models.CreateUserByAdmin); "admin", "receptionist" y "optometrist"
// van a sus tablas propias (models.CreateAdmin / CreateReceptionist /
// CreateOptometrist) — son identidades de staff separadas, no un
// permiso extra sobre `users` (ver auth_admin.go).
func CreateUser(c *gin.Context) {
	var input createUserInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa nombre, correo y contraseña (mínimo 8 caracteres)."})
		return
	}

	// Cliente, recepcionista y optometrista son personas: se exige
	// nombre(s) + apellido(s) (al menos 2 palabras). Admin se deja
	// libre porque a veces es una cuenta de marca (p. ej. "Avante-Admin").
	if input.Role == "cliente" || input.Role == handlers.RoleReceptionist || input.Role == handlers.RoleOptometrist {
		if len(strings.Fields(input.Name)) < 2 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe nombre(s) y apellido(s) completos."})
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
		return
	}

	switch input.Role {
	case handlers.RoleAdmin:
		admin, err := models.CreateAdmin(input.Name, input.Email, string(hash))
		if errors.Is(err, models.ErrAdminEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "Ya existe un administrador con ese correo."})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el administrador."})
			return
		}
		c.JSON(http.StatusCreated, admin)
		return

	case handlers.RoleReceptionist:
		r, err := models.CreateReceptionist(input.Name, input.Email, string(hash))
		if errors.Is(err, models.ErrReceptionistEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una cuenta de recepción con ese correo."})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear la cuenta de recepción."})
			return
		}
		c.JSON(http.StatusCreated, r)
		return

	case handlers.RoleOptometrist:
		o, err := models.CreateOptometrist(input.Name, input.Email, string(hash))
		if errors.Is(err, models.ErrOptometristEmailTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "Ya existe una cuenta de optometrista con ese correo."})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear la cuenta de optometrista."})
			return
		}
		c.JSON(http.StatusCreated, o)
		return
	}

	// Cualquier otro valor (incluido "cliente") cae aquí — cliente sigue
	// yendo a la tabla `users`, tal como ya funcionaba.
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

// UpdateUser edita un usuario o cuenta de staff existente —
// PUT /api/admin/usuarios/:id. Si Password viene vacío, la contraseña
// actual no se toca (así el modal de "Editar" puede dejarla en blanco).
//
// El rol viaja en el body pero NUNCA se usa para cambiar de tabla —
// solo para saber en cuál de las 4 ya está la cuenta. Cambiar el rol
// de alguien implicaría borrar de una tabla y crear en otra (con todo
// lo que eso arrastra: sesiones activas, historiales, etc.), así que
// el modal de edición ni siquiera deja tocarlo.
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

	if input.Password != "" && len(input.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "La contraseña debe tener al menos 8 caracteres."})
		return
	}
	var passwordHash string
	if input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor. Intenta de nuevo."})
			return
		}
		passwordHash = string(hash)
	}

	switch input.Role {
	case handlers.RoleAdmin:
		if err := models.UpdateAdmin(id, input.Name, input.Email); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Administrador no encontrado."})
			return
		}
		if passwordHash != "" {
			if err := models.UpdateAdminPassword(id, passwordHash); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Usuario actualizado, pero no se pudo cambiar la contraseña."})
				return
			}
		}

	case handlers.RoleReceptionist:
		if err := models.UpdateReceptionist(id, input.Name, input.Email); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Cuenta de recepción no encontrada."})
			return
		}
		if passwordHash != "" {
			if err := models.UpdateReceptionistPassword(id, passwordHash); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Usuario actualizado, pero no se pudo cambiar la contraseña."})
				return
			}
		}

	case handlers.RoleOptometrist:
		if err := models.UpdateOptometrist(id, input.Name, input.Email); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Cuenta de optometrista no encontrada."})
			return
		}
		if passwordHash != "" {
			if err := models.UpdateOptometristPassword(id, passwordHash); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Usuario actualizado, pero no se pudo cambiar la contraseña."})
				return
			}
		}

	default:
		// "cliente" y cualquier otro valor caen aquí — tabla `users`,
		// tal como ya funcionaba.
		if err := models.UpdateUser(id, input.Name, input.Email, input.Phone, input.Role); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado."})
			return
		}
		if passwordHash != "" {
			if err := models.UpdateUserPassword(id, passwordHash); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Usuario actualizado, pero no se pudo cambiar la contraseña."})
				return
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Usuario actualizado correctamente."})
}

// DeleteUser elimina un usuario o cuenta de staff — DELETE
// /api/admin/usuarios/:id?role=admin|receptionist|optometrist|cliente.
// El rol viene por query param (no por body, un DELETE normalmente no
// lleva uno) porque el mismo id se repite entre tablas — sin el rol
// no hay forma de saber cuál de las 4 borrar.
func DeleteUser(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID de usuario inválido."})
		return
	}

	switch c.Query("role") {
	case handlers.RoleAdmin:
		if err := models.DeleteAdmin(id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el administrador."})
			return
		}
	case handlers.RoleReceptionist:
		if err := models.DeleteReceptionist(id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la cuenta de recepción."})
			return
		}
	case handlers.RoleOptometrist:
		if err := models.DeleteOptometrist(id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar la cuenta de optometrista."})
			return
		}
	default:
		if err := models.DeleteUser(id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Usuario no encontrado."})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Usuario eliminado."})
}
