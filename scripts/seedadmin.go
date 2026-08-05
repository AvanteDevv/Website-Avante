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
// Script de un solo uso para crear el primer administrador. No hay
// endpoint público de registro de admin por seguridad — este comando se
// corre una vez, localmente (con las variables de entorno de Railway
// cargadas) o directo con `railway run`, y ya. Admins adicionales se
// crearían después desde una pantalla del propio panel ya autenticado.
//
// Va en: scripts/seedadmin.go — SUELTO dentro de scripts/, junto a los
// demás scripts que vengan después. Como cada script ahí tiene su propio
// func main(), NO se puede correr con `go run ./scripts` (Go se queja de
// "main redeclared" al intentar compilar la carpeta entera como un solo
// paquete) — hay que apuntar siempre al archivo exacto:
//
// Uso (parado en la raíz del repo, donde está tu main.go / go.mod):
//
//	go run scripts/seedadmin.go "Nombre Admin" admin@avanteoptics.mx "unaContraseñaSegura123"
//
// Contra Railway sin copiar credenciales a mano:
//
//	railway run go run scripts/seedadmin.go "Nombre Admin" admin@avanteoptics.mx "unaContraseñaSegura123"
func main() {
	if len(os.Args) != 4 {
		fmt.Println(`Uso: go run ./scripts/seedadmin "Nombre" correo@dominio.com contraseña`)
		os.Exit(1)
	}
	name, email, password := os.Args[1], os.Args[2], os.Args[3]

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

	admin, err := models.CreateAdmin(name, email, string(hash))
	if err != nil {
		log.Fatalf("Error creando el administrador: %v", err)
	}

	fmt.Printf("Administrador creado ✓  id=%d  correo=%s\n", admin.ID, admin.Email)
}
