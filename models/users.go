package models

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Este archivo ahora asume una columna "role" en la tabla `users`. Si
// todavía no la tienes, corre esto una vez contra tu base:
//
//	ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'cliente';
//	UPDATE users SET role = 'cliente' WHERE role IS NULL OR role = '';
//
// Y para saber cómo se registró cada cuenta (formulario, o más
// adelante Google/Microsoft/Facebook cuando esos login existan de
// verdad):
//
//	ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'formulario';
//
// Valores usados: 'cliente', 'optometrista', 'admin' — los mismos que
// ofrece el <select> del modal "Nuevo usuario" en base-de-datos.html.
//
// ⚠️ IMPORTANTE sobre el rol "admin": este archivo solo toca la tabla
// `users`. Como ya tienes AdminLogin/RequireAdminAuth como un sistema
// aparte, no sé si tus cuentas admin viven en `users` o en una tabla
// separada (p. ej. `admins`) que tu handler "Database" ya combina para
// pintar la tabla. Si es una tabla separada, crear aquí un usuario con
// role="admin" NO le va a dar acceso real al panel admin — avísame y
// te ajusto CreateUserByAdmin para que inserte también ahí.

// User representa una fila de la tabla `users`.
// El campo PasswordHash nunca se serializa a JSON (json:"-") para que jamás
// se escape por accidente en una respuesta de la API.
type User struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Phone        string `json:"phone,omitempty"`
	Role         string `json:"role"`
	// AuthProvider: "formulario" | "google" | "microsoft" | "facebook".
	// Por ahora TODAS las cuentas se crean con "formulario" — los otros
	// tres valores existen en el esquema para cuando esos logins
	// existan de verdad, pero ningún código los asigna todavía.
	AuthProvider string    `json:"auth_provider"`
	CreatedAt    time.Time `json:"created_at"`
}

// ErrEmailTaken se devuelve cuando ya existe una cuenta con ese correo.
var ErrEmailTaken = errors.New("ya existe una cuenta con ese correo")

// ErrUserNotFound se devuelve cuando no hay ningún usuario con ese correo/id.
var ErrUserNotFound = errors.New("usuario no encontrado")

// EmailExists indica si ya hay una cuenta registrada con ese correo.
func EmailExists(email string) (bool, error) {
	email = normalizeEmail(email)
	var count int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM users WHERE email = ?", email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateUser inserta un nuevo usuario con rol "cliente" — es la que ya
// usa el registro público (Register en auth.go). El hasheo con bcrypt
// se hace en el handler, no aquí.
func CreateUser(name, email, phone, passwordHash string) (*User, error) {
	return createUser(name, email, phone, passwordHash, "cliente")
}

// CreateUserByAdmin inserta un usuario con teléfono y rol elegidos
// desde el panel de administración (modal "Nuevo usuario").
func CreateUserByAdmin(name, email, phone, passwordHash, role string) (*User, error) {
	if role == "" {
		role = "cliente"
	}
	return createUser(name, email, phone, passwordHash, role)
}

func createUser(name, email, phone, passwordHash, role string) (*User, error) {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	exists, err := EmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailTaken
	}

	result, err := db.DB.Exec(
		"INSERT INTO users (name, email, password_hash, phone, role, auth_provider) VALUES (?, ?, ?, ?, ?, 'formulario')",
		name, email, passwordHash, phone, role,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &User{ID: id, Name: name, Email: email, PasswordHash: passwordHash, Phone: phone, Role: role, AuthProvider: "formulario"}, nil
}

// GetUserByEmail busca un usuario por correo. Devuelve ErrUserNotFound si
// no existe ninguno con ese correo.
func GetUserByEmail(email string) (*User, error) {
	email = normalizeEmail(email)

	var u User
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, phone, role, auth_provider, created_at FROM users WHERE email = ?",
		email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &nullablePhone{&u.Phone}, &u.Role, &u.AuthProvider, &u.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	return &u, nil
}

// GetUserByID busca un usuario por su id (útil para leer la sesión y
// mostrar datos del usuario logueado, p. ej. en el panel de cliente).
func GetUserByID(id int64) (*User, error) {
	var u User
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, phone, role, auth_provider, created_at FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &nullablePhone{&u.Phone}, &u.Role, &u.AuthProvider, &u.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	return &u, nil
}

// UpdateUserProfile edita nombre, correo y teléfono de un cliente —
// usado desde su propio "Mi perfil" (PUT /api/mi-perfil). A propósito
// NO toca el rol: eso solo lo hace UpdateUser (la que usa el admin
// desde "Editar usuario"), para que nadie pueda cambiarse su propio
// rol desde su perfil.
func UpdateUserProfile(id int64, name, email, phone string) error {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	// Si cambió de correo, hay que checar que no choque con otra
	// cuenta — pero sin marcar falso-positivo contra sí mismo.
	if existing, err := GetUserByEmail(email); err == nil {
		if existing.ID != id {
			return ErrEmailTaken
		}
	} else if !errors.Is(err, ErrUserNotFound) {
		return err
	}

	result, err := db.DB.Exec(
		"UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?",
		name, email, phone, id,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrUserNotFound
	}
	return nil
}

// UpdateUser edita nombre, correo, teléfono y rol — usado por
// PUT /api/admin/usuarios/:id. No toca la contraseña (ver
// UpdateUserPassword).
func UpdateUser(id int64, name, email, phone, role string) error {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	result, err := db.DB.Exec(
		"UPDATE users SET name = ?, email = ?, phone = ?, role = ? WHERE id = ?",
		name, email, phone, role, id,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrUserNotFound
	}
	return nil
}

// UpdateUserPassword cambia la contraseña de un usuario (hash ya
// generado con bcrypt en el handler, igual que en Register).
func UpdateUserPassword(id int64, passwordHash string) error {
	_, err := db.DB.Exec("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, id)
	return err
}

// DeleteUser elimina un usuario — usado por el botón "Eliminar" del
// panel de Base de datos.
func DeleteUser(id int64) error {
	result, err := db.DB.Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrUserNotFound
	}
	return nil
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// nullablePhone permite escanear una columna phone que puede venir NULL
// directo a un string normal (queda "" si es NULL), sin tener que usar
// sql.NullString en todos lados.
type nullablePhone struct {
	dest *string
}

func (n *nullablePhone) Scan(value interface{}) error {
	if value == nil {
		*n.dest = ""
		return nil
	}
	switch v := value.(type) {
	case string:
		*n.dest = v
	case []byte:
		*n.dest = string(v)
	}
	return nil
}
