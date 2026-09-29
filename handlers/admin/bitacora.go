package admin

import (
	"log"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"avante-optics/handlers"
	"avante-optics/models"
	"avante-optics/realtime"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Bitácora (solo admin): qué hizo cada persona del staff vigilado.
// La lógica de qué se guarda vive en handlers/activity_log.go.

// Bitacora — GET /admin/bitacora
func Bitacora(c *gin.Context) {
	c.HTML(http.StatusOK, "bitacora.html", handlers.WithStaff(c, gin.H{
		"ActivePage": "admin-bitacora",
	}))
}

// parseBitacoraFilter lee los filtros comunes de la URL.
//
//	?persona=receptionist:3   una persona (vacío = todas)
//	?tipo=accion              accion | clic | vista | busqueda | sesion
//	?desde=…&hasta=…          RFC3339 (el navegador manda el inicio y el
//	                          fin del día en SU hora local)
//	?q=texto
func parseBitacoraFilter(c *gin.Context) models.ActivityFilter {
	f := models.ActivityFilter{Roles: handlers.TrackedRolesList()}
	if p := c.Query("persona"); p != "" {
		if i := strings.Index(p, ":"); i > 0 {
			if id, err := strconv.ParseInt(p[i+1:], 10, 64); err == nil {
				f.Role, f.StaffID = p[:i], id
			}
		}
	}
	if t := c.Query("tipo"); models.IsActivityKind(t) {
		f.Kind = t
	}
	if d, err := time.Parse(time.RFC3339, c.Query("desde")); err == nil {
		f.From = &d
	}
	if d, err := time.Parse(time.RFC3339, c.Query("hasta")); err == nil {
		f.To = &d
	}
	f.Query = strings.TrimSpace(c.Query("q"))
	if len([]rune(f.Query)) > 100 {
		f.Query = string([]rune(f.Query)[:100])
	}
	return f
}

// ListBitacora — GET /api/admin/bitacora
//
//	?antes_id=123    página siguiente ("Cargar más")
//	?despues_id=456  solo lo nuevo (modo "En vivo")
func ListBitacora(c *gin.Context) {
	f := parseBitacoraFilter(c)
	f.BeforeID, _ = strconv.ParseInt(c.Query("antes_id"), 10, 64)
	f.AfterID, _ = strconv.ParseInt(c.Query("despues_id"), 10, 64)
	f.Limit, _ = strconv.Atoi(c.Query("limit"))

	items, hasMore, err := models.ListActivities(f)
	if err != nil {
		log.Printf("admin.ListBitacora: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar la bitácora. ¿Ya creaste la tabla staff_activity_log?"})
		return
	}
	if items == nil {
		items = []models.ActivityEntry{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "has_more": hasMore})
}

// BitacoraPeople — GET /api/admin/bitacora/personas
// Todas las personas de los roles vigilados (aunque no hayan hecho nada
// en el periodo) con su resumen y si están en línea ahora.
func BitacoraPeople(c *gin.Context) {
	f := parseBitacoraFilter(c)
	stats, err := models.ActivityStatsByPerson(f)
	if err != nil {
		log.Printf("admin.BitacoraPeople: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el resumen. ¿Ya creaste la tabla staff_activity_log?"})
		return
	}

	staff, err := models.ListCommsStaff()
	if err != nil {
		log.Printf("admin.BitacoraPeople: directorio: %v", err)
	}
	out := []models.ActivityPersonStats{}
	seen := map[string]bool{}
	for _, m := range staff {
		if !handlers.IsTrackedRole(m.Role) {
			continue
		}
		s := models.ActivityPersonStats{Role: m.Role, ID: m.ID, Key: m.Key, Name: m.Name, Email: m.Email}
		if st, ok := stats[m.Key]; ok {
			s = *st
			s.Name, s.Email = m.Name, m.Email
		}
		s.Online = realtime.Default.IsOnline(m.Key)
		out = append(out, s)
		seen[m.Key] = true
	}
	// Cuentas ya eliminadas que sí tienen actividad en el periodo.
	for k, st := range stats {
		if !seen[k] {
			s := *st
			if s.Name == "" {
				s.Name = "Usuario eliminado"
			}
			out = append(out, s)
		}
	}

	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if (a.LastAt == nil) != (b.LastAt == nil) {
			return a.LastAt != nil
		}
		if a.LastAt != nil && !a.LastAt.Equal(*b.LastAt) {
			return a.LastAt.After(*b.LastAt)
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})

	var tot models.ActivityPersonStats
	for _, s := range out {
		tot.Total += s.Total
		tot.Actions += s.Actions
		tot.Clicks += s.Clicks
		tot.Views += s.Views
		tot.Searches += s.Searches
		tot.Failed += s.Failed
	}
	c.JSON(http.StatusOK, gin.H{"items": out, "totals": tot})
}