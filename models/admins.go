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

// Admin representa una fila de la tabla `admins`. Es una tabla separada
// de `users` a propósito: los administradores no son clientes con un
// permiso extra, son una identidad completamente distinta con su propia
// sesión (ver auth.AdminSessionName y handlers.RequireAdminAuth).
type Admin struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// ErrAdminEmailTaken se devuelve cuando ya existe un admin con ese correo.
var ErrAdminEmailTaken = errors.New("ya existe un administrador con ese correo")

// ErrAdminNotFound se devuelve cuando no hay ningún admin con ese correo/id.
var ErrAdminNotFound = errors.New("administrador no encontrado")

// AdminEmailExists indica si ya hay un admin registrado con ese correo.
func AdminEmailExists(email string) (bool, error) {
	email = normalizeEmail(email)
	var count int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM admins WHERE email = ?", email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateAdmin inserta un nuevo administrador con la contraseña ya
// hasheada (bcrypt se hace en el caller, igual que con CreateUser).
//
// A propósito NO hay un endpoint HTTP público que llame a esta función:
// los admins no se auto-registran. El primer admin se crea con el script
// cmd/seedadmin; admins adicionales se crearían desde una pantalla del
// propio panel de admin ya autenticado (RequireAdminAuth de por medio).
func CreateAdmin(name, email, passwordHash string) (*Admin, error) {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	exists, err := AdminEmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrAdminEmailTaken
	}

	result, err := db.DB.Exec(
		"INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)",
		name, email, passwordHash,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Admin{ID: id, Name: name, Email: email, PasswordHash: passwordHash}, nil
}

// GetAdminByEmail busca un admin por correo. Devuelve ErrAdminNotFound si
// no existe ninguno con ese correo.
func GetAdminByEmail(email string) (*Admin, error) {
	email = normalizeEmail(email)

	var a Admin
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM admins WHERE email = ?",
		email,
	).Scan(&a.ID, &a.Name, &a.Email, &a.PasswordHash, &a.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrAdminNotFound
	}
	if err != nil {
		return nil, err
	}

	return &a, nil
}

// GetAdminByID busca un admin por su id (para leer la sesión y mostrar
// su nombre/correo en el userbar del panel).
func GetAdminByID(id int64) (*Admin, error) {
	var a Admin
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM admins WHERE id = ?",
		id,
	).Scan(&a.ID, &a.Name, &a.Email, &a.PasswordHash, &a.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrAdminNotFound
	}
	if err != nil {
		return nil, err
	}

	return &a, nil
}

// UpdateAdmin actualiza nombre y correo de un administrador existente —
// usado desde el modal "Editar usuario" del panel. El rol no se puede
// cambiar desde ahí (movería la cuenta entre tablas), así que esta
// función nunca toca password_hash.
func UpdateAdmin(id int64, name, email string) error {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)
	_, err := db.DB.Exec("UPDATE admins SET name = ?, email = ? WHERE id = ?", name, email, id)
	return err
}

// UpdateAdminPassword cambia la contraseña de un administrador — se
// llama aparte de UpdateAdmin solo cuando el modal de edición trae
// una contraseña nueva (si viene vacía, no se toca).
func UpdateAdminPassword(id int64, passwordHash string) error {
	_, err := db.DB.Exec("UPDATE admins SET password_hash = ? WHERE id = ?", passwordHash, id)
	return err
}

// DeleteAdmin elimina un administrador — usado desde el menú de fila
// del panel "Base de datos". No es un error si el id no existía (el
// DELETE simplemente afecta 0 filas), igual que RemoveFavorite.
func DeleteAdmin(id int64) error {
	_, err := db.DB.Exec("DELETE FROM admins WHERE id = ?", id)
	return err
}

// Nota: normalizeEmail() ya está definida en users.go, dentro del mismo
// paquete `models` — se reutiliza aquí tal cual, no hace falta duplicarla.
