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
type userRow struct {
	Name      string
	Email     string
	Phone     string
	CreatedAt time.Time
	Role      string // "cliente" | "admin"
	Initials  string
}

// Database renders the admin panel with real users pulled live from
// MySQL (users + admins tables), instead of example/mock data. Any new
// signup from /registro shows up here immediately — there's no cache in
// between, it reads straight from the DB on every request.
func Database(c *gin.Context) {
	rows, err := db.DB.Query(`
		SELECT name, email, COALESCE(phone, ''), created_at, 'cliente' AS role
		FROM users
		UNION ALL
		SELECT name, email, '' AS phone, created_at, 'admin' AS role
		FROM admins
		ORDER BY created_at DESC
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
	var totalClientes, totalAdmins, nuevosEsteMes int
	now := time.Now()

	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.Name, &u.Email, &u.Phone, &u.CreatedAt, &u.Role); err != nil {
			log.Printf("admin.Database: error scanning row: %v", err)
			continue
		}
		u.Initials = initials(u.Name)

		if u.Role == "admin" {
			totalAdmins++
		} else {
			totalClientes++
		}
		if u.CreatedAt.Year() == now.Year() && u.CreatedAt.Month() == now.Month() {
			nuevosEsteMes++
		}
		usuarios = append(usuarios, u)
	}

	c.HTML(http.StatusOK, "base-de-datos.html", gin.H{
		"ActivePage":    "admin-base-de-datos",
		"Usuarios":      usuarios,
		"TotalUsuarios": len(usuarios),
		"TotalClientes": totalClientes,
		"TotalAdmins":   totalAdmins,
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
