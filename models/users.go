package models

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

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
// Y para saber cómo se registró cada cuenta (formulario, o Google —
// ya activo desde este archivo — Microsoft/Facebook cuando existan):
//
//	ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'formulario';
//
// El registro público (/registro) ahora también pide apellido, fecha
// de nacimiento y dirección — corre esto una vez si no las tienes:
//
//	ALTER TABLE users ADD COLUMN apellido VARCHAR(255) NOT NULL DEFAULT '';
//	ALTER TABLE users ADD COLUMN fecha_nacimiento DATE NULL;
//	ALTER TABLE users ADD COLUMN direccion VARCHAR(500) NOT NULL DEFAULT '';
//
// fecha_nacimiento va NULL-able a propósito: los usuarios creados
// desde el panel admin (CreateUserByAdmin) o por Google
// (CreateUserFromGoogle) no la traen, solo el registro público la
// pide.
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
	Apellido     string `json:"apellido,omitempty"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Phone        string `json:"phone,omitempty"`
	Role         string `json:"role"`
	// AuthProvider: "formulario" | "google" | "microsoft" | "facebook".
	// "formulario" y "google" ya están activos. "microsoft" y
	// "facebook" existen en el esquema para cuando esos logins existan
	// de verdad, pero ningún código los asigna todavía.
	AuthProvider string `json:"auth_provider"`
	// FechaNacimiento y Direccion solo las trae una cuenta creada por
	// el registro público (Register en auth.go) — zero value / "" en
	// las demás (admin, Google).
	FechaNacimiento time.Time `json:"fecha_nacimiento,omitempty"`
	Direccion       string    `json:"direccion,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// FechaNacimientoValue regresa la fecha de nacimiento formateada para
// precargar un <input type="date"> (formato "2006-01-02"), o "" si el
// usuario no la tiene guardada (mismo criterio que PromoEndsAtValue en
// product.go).
func (u User) FechaNacimientoValue() string {
	if u.FechaNacimiento.IsZero() {
		return ""
	}
	return u.FechaNacimiento.Format("2006-01-02")
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

// CreateUser inserta un nuevo usuario con rol "cliente" y
// auth_provider "formulario" — es la que ya usa el registro público
// (Register en auth.go). El hasheo con bcrypt se hace en el handler,
// no aquí.
func CreateUser(nombre, apellido, email, phone, passwordHash string, fechaNacimiento time.Time, direccion string) (*User, error) {
	return createUser(nombre, apellido, email, phone, passwordHash, "cliente", "formulario", fechaNacimiento, direccion)
}

// CreateUserByAdmin inserta un usuario con teléfono y rol elegidos
// desde el panel de administración (modal "Nuevo usuario"). Siempre
// queda como auth_provider "formulario": lo crea un admin a mano, no
// llega por ningún login social. El modal de admin no pide apellido,
// fecha de nacimiento ni dirección, así que quedan vacías/zero.
func CreateUserByAdmin(name, email, phone, passwordHash, role string) (*User, error) {
	if role == "" {
		role = "cliente"
	}
	return createUser(name, "", email, phone, passwordHash, role, "formulario", time.Time{}, "")
}

// CreateUserFromGoogle inserta un usuario que llega por primera vez a
// través de "Continuar con Google". No pide contraseña: se genera un
// hash de bcrypt sobre 32 bytes aleatorios (imposible de adivinar), así
// la cuenta jamás puede entrar por el formulario normal de
// iniciar-sesion — solo por Google. El nombre y el correo vienen ya
// verificados por Google (GoogleCallback solo llega aquí si
// email_verified es true), así que se guardan tal cual. Google no
// entrega apellido por separado ni fecha de nacimiento/dirección,
// quedan vacías/zero.
func CreateUserFromGoogle(name, email string) (*User, error) {
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword(randomBytes, bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	return createUser(name, "", email, "", string(hash), "cliente", "google", time.Time{}, "")
}

// GetOrCreateGoogleUser es el punto de entrada que usa GoogleCallback:
// si ya existe una cuenta con ese correo (sin importar si se creó por
// formulario o por Google antes) simplemente la regresa — así alguien
// que ya tenía cuenta con contraseña puede seguir entrando también con
// Google usando el mismo correo, sin que truene por "correo
// duplicado". Si no existe ninguna, la crea.
func GetOrCreateGoogleUser(name, email string) (*User, error) {
	user, err := GetUserByEmail(email)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, ErrUserNotFound) {
		return nil, err
	}
	return CreateUserFromGoogle(name, email)
}

func createUser(name, apellido, email, phone, passwordHash, role, authProvider string, fechaNacimiento time.Time, direccion string) (*User, error) {
	email = normalizeEmail(email)
	name = strings.TrimSpace(name)
	apellido = strings.TrimSpace(apellido)
	direccion = strings.TrimSpace(direccion)

	exists, err := EmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailTaken
	}

	var fechaNacimientoParam interface{}
	if !fechaNacimiento.IsZero() {
		fechaNacimientoParam = fechaNacimiento
	}

	result, err := db.DB.Exec(
		"INSERT INTO users (name, apellido, email, password_hash, phone, role, auth_provider, fecha_nacimiento, direccion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		name, apellido, email, passwordHash, phone, role, authProvider, fechaNacimientoParam, direccion,
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &User{ID: id, Name: name, Apellido: apellido, Email: email, PasswordHash: passwordHash, Phone: phone, Role: role, AuthProvider: authProvider, FechaNacimiento: fechaNacimiento, Direccion: direccion}, nil
}

// GetUserByEmail busca un usuario por correo. Devuelve ErrUserNotFound si
// no existe ninguno con ese correo.
func GetUserByEmail(email string) (*User, error) {
	email = normalizeEmail(email)

	var u User
	var fechaNacimiento sql.NullTime
	err := db.DB.QueryRow(
		"SELECT id, name, apellido, email, password_hash, phone, role, auth_provider, fecha_nacimiento, direccion, created_at FROM users WHERE email = ?",
		email,
	).Scan(&u.ID, &u.Name, &u.Apellido, &u.Email, &u.PasswordHash, &nullablePhone{&u.Phone}, &u.Role, &u.AuthProvider, &fechaNacimiento, &u.Direccion, &u.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if fechaNacimiento.Valid {
		u.FechaNacimiento = fechaNacimiento.Time
	}

	return &u, nil
}

// GetUserByID busca un usuario por su id (útil para leer la sesión y
// mostrar datos del usuario logueado, p. ej. en el panel de cliente).
func GetUserByID(id int64) (*User, error) {
	var u User
	var fechaNacimiento sql.NullTime
	err := db.DB.QueryRow(
		"SELECT id, name, apellido, email, password_hash, phone, role, auth_provider, fecha_nacimiento, direccion, created_at FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Name, &u.Apellido, &u.Email, &u.PasswordHash, &nullablePhone{&u.Phone}, &u.Role, &u.AuthProvider, &fechaNacimiento, &u.Direccion, &u.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, ErrUserNotFound
	}
	if err != nil {
		return nil, err
	}
	if fechaNacimiento.Valid {
		u.FechaNacimiento = fechaNacimiento.Time
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
