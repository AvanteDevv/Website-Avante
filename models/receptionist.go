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
// Requiere una tabla nueva, separada de `admins`. Corre esto una vez
// contra tu base de datos:
//
//	CREATE TABLE receptionists (
//	  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  name          VARCHAR(120) NOT NULL,
//	  email         VARCHAR(190) NOT NULL UNIQUE,
//	  password_hash VARCHAR(255) NOT NULL,
//	  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);

// Receptionist representa una cuenta de recepción — puede entrar al
// mismo login que admin (POST /api/admin/iniciar-sesion) y a las
// mismas rutas /admin que su rol tenga permitidas (ver
// handlers.RequireRole), pero es una identidad completamente separada
// de Admin: tabla propia, sin ningún permiso de admin por defecto.
type Receptionist struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// ErrReceptionistEmailTaken se devuelve cuando ya existe una recepcionista con ese correo.
var ErrReceptionistEmailTaken = errors.New("ya existe una cuenta de recepción con ese correo")

// ErrReceptionistNotFound se devuelve cuando no hay ninguna recepcionista con ese correo/id.
var ErrReceptionistNotFound = errors.New("cuenta de recepción no encontrada")

// ReceptionistEmailExists indica si ya hay una recepcionista registrada con ese correo.
func ReceptionistEmailExists(email string) (bool, error) {
	email = normalizeEmail(email)
	var count int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM receptionists WHERE email = ?", email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateReceptionist inserta una nueva cuenta de recepción con la
// contraseña ya hasheada (bcrypt se hace en el caller). Al igual que
// CreateAdmin, no hay endpoint público que la llame — se crea desde
// una pantalla del panel de admin ya autenticado.
func CreateReceptionist(name, email, passwordHash string) (*Receptionist, error) {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	exists, err := ReceptionistEmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrReceptionistEmailTaken
	}

	result, err := db.DB.Exec(
		"INSERT INTO receptionists (name, email, password_hash) VALUES (?, ?, ?)",
		name, email, passwordHash,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Receptionist{ID: id, Name: name, Email: email, PasswordHash: passwordHash}, nil
}

// GetReceptionistByEmail busca una recepcionista por correo. Devuelve
// ErrReceptionistNotFound si no existe ninguna con ese correo.
func GetReceptionistByEmail(email string) (*Receptionist, error) {
	email = normalizeEmail(email)

	var r Receptionist
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM receptionists WHERE email = ?",
		email,
	).Scan(&r.ID, &r.Name, &r.Email, &r.PasswordHash, &r.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrReceptionistNotFound
	}
	if err != nil {
		return nil, err
	}

	return &r, nil
}

// GetReceptionistByID busca una recepcionista por su id (para leer la
// sesión y mostrar su nombre/correo en el userbar del panel).
func GetReceptionistByID(id int64) (*Receptionist, error) {
	var r Receptionist
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM receptionists WHERE id = ?",
		id,
	).Scan(&r.ID, &r.Name, &r.Email, &r.PasswordHash, &r.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrReceptionistNotFound
	}
	if err != nil {
		return nil, err
	}

	return &r, nil
}
