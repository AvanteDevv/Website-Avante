package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"

	"avante-optics/db"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida
// con el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Script de un solo uso para crear cuentas de recepción u optometría
// (y admins adicionales) — hermano de seedadmin.go, mismo patrón. No
// hay endpoint público de registro para ninguna de las tres por
// seguridad — este comando se corre una vez por cuenta, localmente
// (con las variables de entorno de Railway cargadas) o directo con
// `railway run`.
//
// Va en: scripts/seedstaff.go — SUELTO dentro de scripts/, junto a
// seedadmin.go y los demás scripts. Como cada uno tiene su propio func
// main(), NO se puede correr con `go run ./scripts` — hay que apuntar
// siempre al archivo exacto:
//
// Uso (parado en la raíz del repo, donde está tu main.go / go.mod):
//
//	go run scripts/seedstaff.go receptionist "Ana Ramírez" ana@avanteoptics.mx "unaContraseñaSegura123"
//	go run scripts/seedstaff.go optometrist "Dr. López" lopez@avanteoptics.mx "unaContraseñaSegura123"
//	go run scripts/seedstaff.go admin "Otro Admin" otro@avanteoptics.mx "unaContraseñaSegura123"
//
// El primer argumento debe ser exactamente: admin, receptionist u
// optometrist.
//
// Contra Railway sin copiar credenciales a mano:
//
//	railway run go run scripts/seedstaff.go receptionist "Ana Ramírez" ana@avanteoptics.mx "unaContraseñaSegura123"
func main() {
	if len(os.Args) != 5 {
		fmt.Println(`Uso: go run scripts/seedstaff.go admin|receptionist|optometrist "Nombre" correo@dominio.com contraseña`)
		os.Exit(1)
	}
	role, name, email, password := os.Args[1], os.Args[2], os.Args[3], os.Args[4]

	if len(password) < 8 {
		log.Fatal("La contraseña debe tener al menos 8 caracteres.")
	}

	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}

	db.Connect()
	defer db.DB.Close()

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Error generando el hash: %v", err)
	}

	switch role {
	case "admin":
		admin, err := models.CreateAdmin(name, email, string(hash))
		if err != nil {
			log.Fatalf("Error creando el administrador: %v", err)
		}
		fmt.Printf("Administrador creado ✓  id=%d  correo=%s\n", admin.ID, admin.Email)

	case "receptionist":
		r, err := models.CreateReceptionist(name, email, string(hash))
		if err != nil {
			log.Fatalf("Error creando la cuenta de recepción: %v", err)
		}
		fmt.Printf("Recepción creada ✓  id=%d  correo=%s\n", r.ID, r.Email)

	case "optometrist":
		o, err := models.CreateOptometrist(name, email, string(hash))
		if err != nil {
			log.Fatalf("Error creando la cuenta de optometría: %v", err)
		}
		fmt.Printf("Optometría creada ✓  id=%d  correo=%s\n", o.ID, o.Email)

	default:
		fmt.Printf("Rol inválido: %q. Usa admin, receptionist u optometrist.\n", role)
		os.Exit(1)
	}
}
