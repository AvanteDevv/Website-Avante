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
//	CREATE TABLE employees (
//	  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
//	  name          VARCHAR(120) NOT NULL,
//	  email         VARCHAR(190) NOT NULL UNIQUE,
//	  password_hash VARCHAR(255) NOT NULL,
//	  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//	);

// Employee representa una cuenta de empleado general — entra por el
// mismo login de staff (POST /api/admin/iniciar-sesion) y solo ve las
// rutas que su rol tenga permitidas (ver handlers.RequireRole): avisos
// del admin y chat interno. Identidad separada de Admin: tabla propia,
// sin ningún permiso de admin por defecto.
type Employee struct {
	ID           int64     `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// ErrEmployeeEmailTaken se devuelve cuando ya existe un empleado con ese correo.
var ErrEmployeeEmailTaken = errors.New("ya existe una cuenta de empleado con ese correo")

// ErrEmployeeNotFound se devuelve cuando no hay ningún empleado con ese correo/id.
var ErrEmployeeNotFound = errors.New("cuenta de empleado no encontrada")

// EmployeeEmailExists indica si ya hay un empleado registrado con ese correo.
func EmployeeEmailExists(email string) (bool, error) {
	email = normalizeEmail(email)
	var count int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM employees WHERE email = ?", email).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateEmployee inserta una nueva cuenta de empleado con la contraseña
// ya hasheada (bcrypt se hace en el caller). No hay endpoint público
// que la llame — se crea desde el panel de admin ya autenticado.
func CreateEmployee(name, email, passwordHash string) (*Employee, error) {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)

	exists, err := EmployeeEmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmployeeEmailTaken
	}

	result, err := db.DB.Exec(
		"INSERT INTO employees (name, email, password_hash) VALUES (?, ?, ?)",
		name, email, passwordHash,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &Employee{ID: id, Name: name, Email: email, PasswordHash: passwordHash}, nil
}

// GetEmployeeByEmail busca un empleado por correo. Devuelve
// ErrEmployeeNotFound si no existe ninguno con ese correo.
func GetEmployeeByEmail(email string) (*Employee, error) {
	email = normalizeEmail(email)

	var e Employee
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM employees WHERE email = ?",
		email,
	).Scan(&e.ID, &e.Name, &e.Email, &e.PasswordHash, &e.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, err
	}

	return &e, nil
}

// GetEmployeeByID busca un empleado por su id (para leer la sesión y
// mostrar su nombre/correo en el userbar del panel).
func GetEmployeeByID(id int64) (*Employee, error) {
	var e Employee
	err := db.DB.QueryRow(
		"SELECT id, name, email, password_hash, created_at FROM employees WHERE id = ?",
		id,
	).Scan(&e.ID, &e.Name, &e.Email, &e.PasswordHash, &e.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrEmployeeNotFound
	}
	if err != nil {
		return nil, err
	}

	return &e, nil
}

// ListEmployees devuelve todos los empleados, más recientes primero —
// para la tabla de "Base de datos" y, más adelante, la lista de
// contactos del chat interno.
func ListEmployees() ([]Employee, error) {
	rows, err := db.DB.Query(
		"SELECT id, name, email, password_hash, created_at FROM employees ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Employee
	for rows.Next() {
		var e Employee
		if err := rows.Scan(&e.ID, &e.Name, &e.Email, &e.PasswordHash, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// UpdateEmployee actualiza nombre y correo de una cuenta de empleado
// existente — usado desde el modal "Editar usuario" del panel. El rol
// no se puede cambiar desde ahí (movería la cuenta entre tablas), así
// que esta función nunca toca password_hash.
func UpdateEmployee(id int64, name, email string) error {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)
	_, err := db.DB.Exec("UPDATE employees SET name = ?, email = ? WHERE id = ?", name, email, id)
	return err
}

// UpdateEmployeePassword cambia la contraseña de una cuenta de empleado
// — se llama aparte de UpdateEmployee solo cuando el modal de edición
// trae una contraseña nueva (si viene vacía, no se toca).
func UpdateEmployeePassword(id int64, passwordHash string) error {
	_, err := db.DB.Exec("UPDATE employees SET password_hash = ? WHERE id = ?", passwordHash, id)
	return err
}

// DeleteEmployee elimina una cuenta de empleado — usado desde el menú
// de fila del panel "Base de datos". No es un error si el id no
// existía (el DELETE simplemente afecta 0 filas).
func DeleteEmployee(id int64) error {
	_, err := db.DB.Exec("DELETE FROM employees WHERE id = ?", id)
	return err
}
