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

// User representa una fila de la tabla `users`.
// El campo PasswordHash nunca se serializa a JSON (json:"-") para que jamás
// se escape por accidente en una respuesta de la API.
type User struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Phone        string    `json:"phone,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// ErrEmailTaken se devuelve cuando ya existe una cuenta con ese correo.
var ErrEmailTaken = errors.New("ya existe una cuenta con ese correo")

// ErrUserNotFound se devuelve cuando no hay ningún usuario con ese correo.
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

// CreateUser inserta un nuevo usuario ya con la contraseña previamente
// hasheada (el hasheo con bcrypt se hace en el handler, no aquí).
func CreateUser(name, email, passwordHash string) (*User, error) {
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
		"INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
		name, email, passwordHash,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &User{ID: id, Name: name, Email: email, PasswordHash: passwordHash}, nil
}

// GetUserByEmail busca un usuario por correo. Devuelve ErrUserNotFound si
// no existe ninguno con ese correo.
func GetUserByEmail(email string) (*User, error) {
	email = normalizeEmail(email)

	var u User
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, phone, created_at FROM users WHERE email = ?",
		email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &nullablePhone{&u.Phone}, &u.CreatedAt)

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
		"SELECT id, name, email, password_hash, phone, created_at FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &nullablePhone{&u.Phone}, &u.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}

	return &u, nil
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