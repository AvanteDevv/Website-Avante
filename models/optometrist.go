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
//	CREATE TABLE optometrists (
//	  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  name          VARCHAR(120) NOT NULL,
//	  email         VARCHAR(190) NOT NULL UNIQUE,
//	  password_hash VARCHAR(255) NOT NULL,
//	  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);

// Optometrist representa una cuenta de optometrista — puede entrar al
// mismo login que admin (POST /api/admin/iniciar-sesion) y a las
// mismas rutas /admin que su rol tenga permitidas (ver
// handlers.RequireRole), pero es una identidad completamente separada
// de Admin: tabla propia, sin ningún permiso de admin por defecto.
type Optometrist struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// ErrOptometristEmailTaken se devuelve cuando ya existe un optometrista con ese correo.
var ErrOptometristEmailTaken = errors.New("ya existe una cuenta de optometrista con ese correo")

// ErrOptometristNotFound se devuelve cuando no hay ningún optometrista con ese correo/id.
var ErrOptometristNotFound = errors.New("cuenta de optometrista no encontrada")

// OptometristEmailExists indica si ya hay un optometrista registrado con ese correo.
func OptometristEmailExists(email string) (bool, error) {
	email = normalizeEmail(email)
	var count int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM optometrists WHERE email = ?", email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateOptometrist inserta una nueva cuenta de optometrista con la
// contraseña ya hasheada (bcrypt se hace en el caller). No hay
// endpoint público que la llame — se crea desde una pantalla del
// panel de admin ya autenticado.
func CreateOptometrist(name, email, passwordHash string) (*Optometrist, error) {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	exists, err := OptometristEmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrOptometristEmailTaken
	}

	result, err := db.DB.Exec(
		"INSERT INTO optometrists (name, email, password_hash) VALUES (?, ?, ?)",
		name, email, passwordHash,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Optometrist{ID: id, Name: name, Email: email, PasswordHash: passwordHash}, nil
}

// GetOptometristByEmail busca un optometrista por correo. Devuelve
// ErrOptometristNotFound si no existe ninguno con ese correo.
func GetOptometristByEmail(email string) (*Optometrist, error) {
	email = normalizeEmail(email)

	var o Optometrist
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM optometrists WHERE email = ?",
		email,
	).Scan(&o.ID, &o.Name, &o.Email, &o.PasswordHash, &o.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrOptometristNotFound
	}
	if err != nil {
		return nil, err
	}

	return &o, nil
}

// GetOptometristByID busca un optometrista por su id (para leer la
// sesión y mostrar su nombre/correo en el userbar del panel).
func GetOptometristByID(id int64) (*Optometrist, error) {
	var o Optometrist
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM optometrists WHERE id = ?",
		id,
	).Scan(&o.ID, &o.Name, &o.Email, &o.PasswordHash, &o.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrOptometristNotFound
	}
	if err != nil {
		return nil, err
	}

	return &o, nil
}

// UpdateOptometrist actualiza nombre y correo de una cuenta de
// optometrista existente — usado desde el modal "Editar usuario" del
// panel. El rol no se puede cambiar desde ahí (movería la cuenta entre
// tablas), así que esta función nunca toca password_hash.
func UpdateOptometrist(id int64, name, email string) error {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)
	_, err := db.DB.Exec("UPDATE optometrists SET name = ?, email = ? WHERE id = ?", name, email, id)
	return err
}

// UpdateOptometristPassword cambia la contraseña de una cuenta de
// optometrista — se llama aparte de UpdateOptometrist solo cuando el
// modal de edición trae una contraseña nueva (si viene vacía, no se toca).
func UpdateOptometristPassword(id int64, passwordHash string) error {
	_, err := db.DB.Exec("UPDATE optometrists SET password_hash = ? WHERE id = ?", passwordHash, id)
	return err
}

// DeleteOptometrist elimina una cuenta de optometrista — usado desde
// el menú de fila del panel "Base de datos". No es un error si el id
// no existía (el DELETE simplemente afecta 0 filas).
func DeleteOptometrist(id int64) error {
	_, err := db.DB.Exec("DELETE FROM optometrists WHERE id = ?", id)
	return err
}
