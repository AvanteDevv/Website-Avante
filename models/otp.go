package models

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"
)

// ⚠️ Este archivo va dentro del mismo paquete "models" que appointments.go
// (colócalo en la misma carpeta, p.ej. models/otp.go).
//
// Guarda los códigos de verificación en memoria (no en MySQL) porque son
// datos de muy corta vida. Si el servidor corre en varias instancias
// (varios contenedores/réplicas) esto NO se comparte entre ellas — en ese
// caso habría que moverlo a Redis o a una tabla con expiración. Para un
// solo servidor (caso típico en Railway con una instancia) esto es
// suficiente.

type otpEntry struct {
	Code       string
	Nombre     string
	Apellido   string
	ExpiresAt  time.Time
	Verified   bool
	VerifiedAt time.Time
	// LastEmailAt: última vez que se mandó este código por correo — para
	// no dejar que alguien use el botón para spamear un correo ajeno.
	LastEmailAt time.Time
}

var (
	otpStore = map[string]*otpEntry{} // key: celular normalizado, ej. "+526622131792"
	otpMutex sync.Mutex
)

const (
	otpTTL         = 5 * time.Minute  // tiempo para ingresar el código antes de que expire
	otpVerifiedTTL = 10 * time.Minute // tiempo que dura "verificado" para poder agendar después
)

var ErrInvalidOrExpiredCode = errors.New("código inválido o expirado")
var ErrNotVerified = errors.New("número no verificado")
var ErrEmailCooldown = errors.New("espera un momento antes de volver a pedir el código por correo")

const otpEmailCooldown = 30 * time.Second

// generateCode crea un código de 4 dígitos (0000-9999) con crypto/rand.
func generateCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(10000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%04d", n.Int64()), nil
}

// SaveCode genera un código nuevo para ese celular, lo guarda y lo
// regresa para que el handler lo "envíe" (por ahora solo se simula el
// envío — ver comentario en el handler).
func SaveCode(celular, nombre, apellido string) (string, error) {
	code, err := generateCode()
	if err != nil {
		return "", err
	}

	otpMutex.Lock()
	otpStore[celular] = &otpEntry{
		Code:      code,
		Nombre:    nombre,
		Apellido:  apellido,
		ExpiresAt: time.Now().Add(otpTTL),
	}
	otpMutex.Unlock()

	return code, nil
}

// VerifyCode revisa que el código coincida y no haya expirado. Si es
// correcto, marca ese celular como "verificado" (válido por
// otpVerifiedTTL) para que CreateAppointment lo pueda confirmar después.
func VerifyCode(celular, code string) error {
	otpMutex.Lock()
	defer otpMutex.Unlock()

	entry, ok := otpStore[celular]
	if !ok {
		return ErrInvalidOrExpiredCode
	}
	if time.Now().After(entry.ExpiresAt) {
		delete(otpStore, celular)
		return ErrInvalidOrExpiredCode
	}
	if entry.Code != code {
		return ErrInvalidOrExpiredCode
	}

	entry.Verified = true
	entry.VerifiedAt = time.Now()
	return nil
}

// ConsumeVerification confirma que ese celular fue verificado
// recientemente y, si es así, "consume" el registro (lo borra) para que
// no se pueda reusar el mismo código para agendar dos veces.
func ConsumeVerification(celular string) error {
	otpMutex.Lock()
	defer otpMutex.Unlock()

	entry, ok := otpStore[celular]
	if !ok || !entry.Verified {
		return ErrNotVerified
	}
	if time.Now().After(entry.VerifiedAt.Add(otpVerifiedTTL)) {
		delete(otpStore, celular)
		return ErrNotVerified
	}

	delete(otpStore, celular)
	return nil
}

// CodeForEmail regresa el código que se debe mandar por correo para ese
// celular. Si ya hay uno vigente (el que se acaba de mandar por SMS), se
// reutiliza EL MISMO — así da igual si le llega primero el SMS o el
// correo, cualquiera de los dos sirve en VerifyCode. Si no hay uno
// vigente (expiró o nunca se pidió), genera uno nuevo con SaveCode.
func CodeForEmail(celular, nombre, apellido string) (string, error) {
	otpMutex.Lock()
	entry, ok := otpStore[celular]
	if ok && !entry.Verified && time.Now().Before(entry.ExpiresAt) {
		if time.Since(entry.LastEmailAt) < otpEmailCooldown {
			otpMutex.Unlock()
			return "", ErrEmailCooldown
		}
		entry.LastEmailAt = time.Now()
		code := entry.Code
		otpMutex.Unlock()
		return code, nil
	}
	otpMutex.Unlock()

	code, err := SaveCode(celular, nombre, apellido)
	if err != nil {
		return "", err
	}
	otpMutex.Lock()
	if e, ok := otpStore[celular]; ok {
		e.LastEmailAt = time.Now()
	}
	otpMutex.Unlock()
	return code, nil
}
