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
// InventoryUser es una cuenta del panel de Inventario (/inventario/…).
// Entra por el mismo login de staff (/admin/iniciar-sesion) con su propia
// tabla, igual que recepción, optometría y empleados. La cuenta inicial la
// crea db.EnsureInventoryUsersTable al arrancar.
type InventoryUser struct {
	ID           int64
	Name         string
	Email        string
	PasswordHash string
	CreatedAt    time.Time
}

// ErrInventoryUserNotFound — no hay cuenta de inventario con ese correo.
var ErrInventoryUserNotFound = errors.New("usuario de inventario no encontrado")

// GetInventoryUserByEmail busca la cuenta por correo (sin importar
// mayúsculas ni espacios).
func GetInventoryUserByEmail(email string) (*InventoryUser, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var u InventoryUser
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM inventory_users WHERE email = ?",
		email,
	).Scan(&u.ID, &u.Name, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrInventoryUserNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
