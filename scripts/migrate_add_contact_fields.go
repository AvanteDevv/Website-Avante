//go:build ignore
// +build ignore

package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Migración para la tabla appointments: crea la tabla si no existe, o le
// agrega las columnas nombre/apellido/celular si ya existía sin ellas.
// Es idempotente — revisa qué columnas ya están antes de tocar nada, así
// que se puede correr varias veces sin error.
//
// Va en: scripts/migrate_add_contact_fields.go — igual que seedadmin.go,
// cada script en scripts/ tiene su propio func main(), así que siempre
// hay que apuntar al archivo exacto (no `go run ./scripts`).
//
// Uso (parado en la raíz del repo, donde está tu main.go / go.mod):
//
//	go run scripts/migrate_add_contact_fields.go
//
// Contra Railway sin copiar credenciales a mano:
//
//	railway run go run scripts/migrate_add_contact_fields.go
func main() {
	fmt.Println("╔═══════════════════════════════════════════════════════════════╗")
	fmt.Println("║   MIGRACIÓN: nombre/apellido/celular en appointments           ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════════╝")
	fmt.Println()

	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}

	db.Connect()
	defer db.DB.Close()

	tableExists, err := tableExists("appointments")
	if err != nil {
		log.Fatalf("Error revisando si la tabla appointments existe: %v", err)
	}

	if !tableExists {
		fmt.Println("La tabla appointments no existe todavía. Se creará completa.")
		fmt.Print("¿Continuar? (escribe 'SI' para continuar): ")
		if !confirmar() {
			fmt.Println("Migración cancelada.")
			return
		}

		createSQL := `CREATE TABLE appointments (
			id         BIGINT AUTO_INCREMENT PRIMARY KEY,
			appt_date  DATE NOT NULL,
			appt_time  VARCHAR(10) NOT NULL,
			nombre     VARCHAR(100) NOT NULL,
			apellido   VARCHAR(100) NOT NULL,
			celular    VARCHAR(20) NOT NULL,
			status     VARCHAR(20) NOT NULL DEFAULT 'pendiente',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`
		if _, err := db.DB.Exec(createSQL); err != nil {
			log.Fatalf("Error creando la tabla appointments: %v", err)
		}
		fmt.Println("✅ Tabla appointments creada con nombre/apellido/celular incluidos.")
		return
	}

	fmt.Println("La tabla appointments ya existe. Revisando columnas...")
	fmt.Println()

	columns := []struct {
		name string
		ddl  string
	}{
		{"nombre", "ALTER TABLE appointments ADD COLUMN nombre VARCHAR(100) NOT NULL DEFAULT '' AFTER appt_time"},
		{"apellido", "ALTER TABLE appointments ADD COLUMN apellido VARCHAR(100) NOT NULL DEFAULT '' AFTER nombre"},
		{"celular", "ALTER TABLE appointments ADD COLUMN celular VARCHAR(20) NOT NULL DEFAULT '' AFTER apellido"},
	}

	var faltantes []struct {
		name string
		ddl  string
	}
	for _, col := range columns {
		exists, err := columnExists("appointments", col.name)
		if err != nil {
			log.Fatalf("Error revisando la columna %s: %v", col.name, err)
		}
		if exists {
			fmt.Printf("  ✅ %-10s ya existe\n", col.name)
			continue
		}
		fmt.Printf("  ⬜ %-10s falta\n", col.name)
		faltantes = append(faltantes, col)
	}
	fmt.Println()

	if len(faltantes) == 0 {
		fmt.Println("✅ No hay nada que migrar — las 3 columnas ya existen.")
		return
	}

	fmt.Printf("Se van a agregar %d columna(s).\n", len(faltantes))
	fmt.Print("¿Continuar? (escribe 'SI' para continuar): ")
	if !confirmar() {
		fmt.Println("Migración cancelada.")
		return
	}

	added := 0
	for _, col := range faltantes {
		if _, err := db.DB.Exec(col.ddl); err != nil {
			log.Fatalf("Error agregando la columna %s: %v", col.name, err)
		}
		fmt.Printf("  ✅ columna %s agregada\n", col.name)
		added++
	}

	fmt.Println()
	fmt.Printf("✅ LISTO — %d columna(s) agregada(s).\n", added)
	fmt.Println("   Reinicia el servidor Go con: go run main.go")
}

func confirmar() bool {
	reader := bufio.NewReader(os.Stdin)
	confirm, _ := reader.ReadString('\n')
	return strings.TrimSpace(strings.ToUpper(confirm)) == "SI"
}

func tableExists(table string) (bool, error) {
	var cnt int
	err := db.DB.QueryRow(
		`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
		table,
	).Scan(&cnt)
	if err != nil {
		return false, err
	}
	return cnt > 0, nil
}

func columnExists(table, column string) (bool, error) {
	var cnt int
	err := db.DB.QueryRow(
		`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
		table, column,
	).Scan(&cnt)
	if err != nil {
		return false, err
	}
	return cnt > 0, nil
}
