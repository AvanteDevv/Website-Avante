package db

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

// DB es la conexión global a MySQL. Se inicializa con Connect() en main.go.
var DB *sql.DB

// Connect abre la conexión a MySQL usando las variables de entorno de Railway.
// Soporta dos formas, según cómo las tengas copiadas desde Railway:
//  1. MYSQL_URL="mysql://usuario:password@host:puerto/nombre_db"
//  2. Variables sueltas: MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE
func Connect() {
	dsn := buildDSN()

	var err error
	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatalf("Error abriendo conexión a MySQL: %v", err)
	}

	DB.SetMaxOpenConns(10)
	DB.SetMaxIdleConns(5)

	if err := DB.Ping(); err != nil {
		log.Fatalf("No se pudo conectar a MySQL (Railway): %v", err)
	}

	log.Println("Conectado a MySQL (Railway) correctamente.")
}

func buildDSN() string {
	if raw := os.Getenv("MYSQL_URL"); raw != "" {
		return parseMySQLURL(raw)
	}

	host := os.Getenv("MYSQLHOST")
	port := os.Getenv("MYSQLPORT")
	user := os.Getenv("MYSQLUSER")
	pass := os.Getenv("MYSQLPASSWORD")
	name := os.Getenv("MYSQLDATABASE")

	if host == "" {
		log.Fatal("Faltan variables de entorno de MySQL: define MYSQL_URL o MYSQLHOST/MYSQLPORT/MYSQLUSER/MYSQLPASSWORD/MYSQLDATABASE")
	}
	if port == "" {
		port = "3306"
	}

	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&loc=Local",
		user, pass, host, port, name)
}

// parseMySQLURL convierte una URL tipo mysql://user:pass@host:port/dbname
// (como la que da Railway) al formato DSN que espera el driver de Go.
func parseMySQLURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		log.Fatalf("MYSQL_URL inválida: %v", err)
	}

	user := u.User.Username()
	pass, _ := u.User.Password()
	dbname := strings.TrimPrefix(u.Path, "/")

	return fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true&charset=utf8mb4&loc=Local",
		user, pass, u.Host, dbname)
}
