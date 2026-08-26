package admin

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// userRow represents one row in the "Base de datos" admin panel, whether
// it comes from the `users` table (clients) or the `admins` table.
//
// ID is the row's id WITHIN ITS OWN TABLE — a cliente with ID 3 and an
// admin with ID 3 are two different people. The template uses Role
// alongside ID (data-role + data-user-id) so any action wired from the
// row menu can route to the right endpoint/table.
type userRow struct {
	ID        int64
	Name      string
	Email     string
	Phone     string
	CreatedAt time.Time
	Role      string // "cliente" | "admin" | "optometrist" | "receptionist"
	Initials  string
	// DividerLabel viene vacío casi siempre. Se llena solo en la
	// primera fila de una sección nueva ("Empleados" al pasar de
	// admins a optometristas/recepcionistas, "Clientes" al pasar de
	// staff a clientes) — el template pinta ahí una fila separadora,
	// para que la tabla se vea como varias secciones sin dejar de
	// ser un solo <table>.
	DividerLabel string
}

// Database renders the admin panel with real users pulled live from
// MySQL (users + admins tables), instead of example/mock data. Any new
// signup from /registro shows up here immediately — there's no cache in
// between, it reads straight from the DB on every request.
func Database(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT id, name, email, COALESCE(phone, ''), created_at, 'cliente' AS role
		FROM users
		UNION ALL
		SELECT id, name, email, '' AS phone, created_at, 'admin' AS role
		FROM admins
		UNION ALL
		SELECT id, name, email, '' AS phone, created_at, 'optometrist' AS role
		FROM optometrists
		UNION ALL
		SELECT id, name, email, '' AS phone, created_at, 'receptionist' AS role
		FROM receptionists
		ORDER BY
			CASE
				WHEN role = 'admin' THEN 0
				WHEN role IN ('optometrist', 'receptionist') THEN 1
				ELSE 2
			END,
			created_at DESC
	`)
	if err != nil {
		log.Printf("admin.Database: error querying users: %v", err)
		c.HTML(http.StatusOK, "base-de-datos.html", gin.H{
			"ActivePage": "admin-base-de-datos",
			"DBError":    "No se pudieron cargar los usuarios en este momento.",
		})
		return
	}
	defer rows.Close()

	var usuarios []userRow
	var totalClientes, totalStaff, nuevosEsteMes int
	now := time.Now()

	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Phone, &u.CreatedAt, &u.Role); err != nil {
			log.Printf("admin.Database: error scanning row: %v", err)
			continue
		}
		u.Initials = initials(u.Name)

		if u.Role == "cliente" {
			totalClientes++
		} else {
			totalStaff++
		}
		if u.CreatedAt.Year() == now.Year() && u.CreatedAt.Month() == now.Month() {
			nuevosEsteMes++
		}
		usuarios = append(usuarios, u)
	}

	// Con el ORDER BY de arriba, las filas ya vienen agrupadas:
	// admins -> optometristas/recepcionistas -> clientes. Aquí solo se
	// marca la PRIMERA fila de cada sección nueva con su etiqueta.
	sectionOf := func(role string) string {
		switch role {
		case "admin":
			return "Administradores"
		case "optometrist", "receptionist":
			return "Empleados"
		default:
			return "Clientes"
		}
	}
	var prevSection string
	for i := range usuarios {
		section := sectionOf(usuarios[i].Role)
		if i > 0 && section != prevSection {
			usuarios[i].DividerLabel = section
		}
		prevSection = section
	}

	c.HTML(http.StatusOK, "base-de-datos.html", gin.H{
		"ActivePage":    "admin-base-de-datos",
		"Usuarios":      usuarios,
		"TotalUsuarios": len(usuarios),
		"TotalClientes": totalClientes,
		"TotalStaff":    totalStaff,
		"NuevosEsteMes": nuevosEsteMes,
	})
}

// initials extracts 1-2 letters from a full name for the row's circular
// avatar — e.g. "MG" for "María González".
func initials(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "?"
	}
	parts := strings.Fields(name)
	first := []rune(parts[0])
	if len(parts) == 1 {
		if len(first) >= 2 {
			return strings.ToUpper(string(first[:2]))
		}
		return strings.ToUpper(string(first))
	}
	last := []rune(parts[len(parts)-1])
	return strings.ToUpper(string(first[0]) + string(last[0]))
}
