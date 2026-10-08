package models

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// BlogUser es una cuenta que solo administra el Blog (/admin/blogs).
// Entra por el mismo login de staff (/admin/iniciar-sesion) con su propia
// tabla, igual que recepción, optometría, empleados e inventario. La
// cuenta inicial la crea db.EnsureBlogUsersTable al arrancar.
type BlogUser struct {
	ID           int64
	Name         string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

// ErrBlogUserNotFound — no hay cuenta de blog con ese correo.
var ErrBlogUserNotFound = errors.New("usuario de blog no encontrado")

// GetBlogUserByEmail busca la cuenta por correo (sin importar mayúsculas
// ni espacios).
func GetBlogUserByEmail(email string) (*BlogUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u BlogUser
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM blog_users WHERE email = ?",
		email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrBlogUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
