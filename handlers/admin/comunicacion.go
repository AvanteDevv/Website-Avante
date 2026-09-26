package admin

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"avante-optics/handlers"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Panel "Comunicación" del admin: mandar avisos (a todos, por rol o a
// personas específicas) y administrar los grupos de chat. Solo el admin
// entra aquí (onlyAdmin en main.go). El admin NO chatea — solo arma los
// grupos; quienes platican son recepción, optometría y empleados.

const (
	maxAnnouncementTitle = 150
	maxAnnouncementBody  = 2000
	maxGroupName         = 80
)

// Communication — GET /admin/comunicacion
func Communication(c *gin.Context) {
	c.HTML(http.StatusOK, "comunicacion.html", handlers.WithStaff(c, gin.H{
		"ActivePage": "admin-comunicacion",
	}))
}

// CommsDirectory — GET /api/admin/comunicacion/directorio
// Todo el staff que puede recibir avisos / estar en grupos.
func CommsDirectory(c *gin.Context) {
	list, err := models.ListCommsStaff()
	if err != nil {
		log.Printf("admin.CommsDirectory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el directorio."})
		return
	}
	if list == nil {
		list = []models.StaffMember{}
	}
	c.JSON(http.StatusOK, gin.H{"items": list})
}

/* =========================================================
   Avisos
   ========================================================= */

// ListAnnouncements — GET /api/admin/avisos
func ListAnnouncements(c *gin.Context) {
	items, err := models.ListAnnouncementsAdmin()
	if err != nil {
		log.Printf("admin.ListAnnouncements: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los avisos."})
		return
	}
	if items == nil {
		items = []models.Announcement{}
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type createAnnouncementInput struct {
	Title      string            `json:"title"`
	Body       string            `json:"body"`
	Audience   string            `json:"audience"`   // all | role | selected
	Role       string            `json:"role"`       // si audience = role
	Recipients []models.StaffRef `json:"recipients"` // si audience = selected
}

// CreateAnnouncement — POST /api/admin/avisos
func CreateAnnouncement(c *gin.Context) {
	var input createAnnouncementInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	title := strings.TrimSpace(input.Title)
	body := strings.TrimSpace(input.Body)
	if title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe un título."})
		return
	}
	if utf8.RuneCountInString(title) > maxAnnouncementTitle {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El título es demasiado largo (máx. 150 caracteres)."})
		return
	}
	if utf8.RuneCountInString(body) > maxAnnouncementBody {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El mensaje es demasiado largo (máx. 2000 caracteres)."})
		return
	}
	switch input.Audience {
	case models.AudienceAll, models.AudienceSelected:
	case models.AudienceRole:
		if !models.IsCommsRole(input.Role) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Elige un rol."})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige a quién va dirigido."})
		return
	}

	recipients, err := models.ResolveAudience(input.Audience, input.Role, input.Recipients)
	if err != nil {
		log.Printf("admin.CreateAnnouncement resolve: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo enviar el aviso."})
		return
	}
	if len(recipients) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No hay nadie a quién enviarle este aviso."})
		return
	}

	me := handlers.CurrentStaff(c)
	a, err := models.CreateAnnouncement(title, body, input.Audience, input.Role, me.ID, recipients)
	if err != nil {
		log.Printf("admin.CreateAnnouncement: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo enviar el aviso."})
		return
	}
	handlers.NotifyAnnouncement(a, recipients)
	c.JSON(http.StatusCreated, a)
}

// AnnouncementReaders — GET /api/admin/avisos/:id/lecturas
// Quién lo recibió y si ya lo leyó.
func AnnouncementReaders(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Aviso inválido."})
		return
	}
	readers, err := models.ListAnnouncementReaders(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el detalle."})
		return
	}
	dir, _ := models.StaffDirectory()
	type row struct {
		models.AnnouncementReader
		Name string `json:"name"`
	}
	out := make([]row, 0, len(readers))
	for _, r := range readers {
		name := "Usuario eliminado"
		if m, ok := dir[r.Key()]; ok {
			name = m.Name
		}
		out = append(out, row{AnnouncementReader: r, Name: name})
	}
	c.JSON(http.StatusOK, gin.H{"items": out})
}

// DeleteAnnouncement — DELETE /api/admin/avisos/:id
func DeleteAnnouncement(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Aviso inválido."})
		return
	}
	if err := models.DeleteAnnouncement(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el aviso."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Aviso eliminado."})
}

/* =========================================================
   Grupos de chat
   ========================================================= */

// ListChatGroups — GET /api/admin/chat/grupos
func ListChatGroups(c *gin.Context) {
	groups, err := models.ListGroups()
	if err != nil {
		log.Printf("admin.ListChatGroups: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los grupos."})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": groups})
}

type groupInput struct {
	Name    string            `json:"name"`
	Members []models.StaffRef `json:"members"`
}

// validGroupInput limpia y valida nombre + miembros (que existan).
func validGroupInput(c *gin.Context) (string, []models.StaffRef, bool) {
	var input groupInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return "", nil, false
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe el nombre del grupo."})
		return "", nil, false
	}
	if utf8.RuneCountInString(name) > maxGroupName {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El nombre es demasiado largo (máx. 80 caracteres)."})
		return "", nil, false
	}
	dir, err := models.StaffDirectory()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor."})
		return "", nil, false
	}
	var members []models.StaffRef
	seen := map[string]bool{}
	for _, m := range input.Members {
		k := m.Key()
		if _, ok := dir[k]; ok && !seen[k] {
			seen[k] = true
			members = append(members, m)
		}
	}
	if len(members) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Un grupo necesita al menos 2 integrantes."})
		return "", nil, false
	}
	return name, members, true
}

// CreateChatGroup — POST /api/admin/chat/grupos
func CreateChatGroup(c *gin.Context) {
	name, members, ok := validGroupInput(c)
	if !ok {
		return
	}
	id, err := models.CreateGroup(name, members)
	if err != nil {
		log.Printf("admin.CreateChatGroup: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo crear el grupo."})
		return
	}
	handlers.NotifyConversationChanged(id, members)
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// UpdateChatGroup — PUT /api/admin/chat/grupos/:id
func UpdateChatGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Grupo inválido."})
		return
	}
	name, members, ok := validGroupInput(c)
	if !ok {
		return
	}
	_, removed, err := models.UpdateGroup(id, name, members)
	if errors.Is(err, models.ErrConversationNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese grupo ya no existe."})
		return
	}
	if err != nil {
		log.Printf("admin.UpdateChatGroup: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo guardar el grupo."})
		return
	}
	// Todos los que quedan reciben el grupo actualizado (nombre nuevo,
	// integrantes nuevos); los que salieron lo ven desaparecer.
	handlers.NotifyConversationChanged(id, members)
	handlers.NotifyConversationRemoved(id, removed)
	c.JSON(http.StatusOK, gin.H{"message": "Grupo actualizado."})
}

// DeleteChatGroup — DELETE /api/admin/chat/grupos/:id
func DeleteChatGroup(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Grupo inválido."})
		return
	}
	members, err := models.DeleteGroup(id)
	if errors.Is(err, models.ErrConversationNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese grupo ya no existe."})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo eliminar el grupo."})
		return
	}
	handlers.NotifyConversationRemoved(id, members)
	c.JSON(http.StatusOK, gin.H{"message": "Grupo eliminado."})
}
