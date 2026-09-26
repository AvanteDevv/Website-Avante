package handlers

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
	"avante-optics/realtime"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Chat interno + avisos, del lado de quien los RECIBE (recepción,
// optometría y empleado). Todas estas rutas van detrás de
// RequireAdminAuth() + RequireRole(RoleReceptionist, RoleOptometrist,
// RoleEmployee) — ver main.go. La parte del admin (mandar avisos, crear
// grupos) vive en handlers/admin/comunicacion.go.

// Límites de texto.
const (
	maxChatMessageRunes = 4000
)

// CommsRoles son los roles que pueden entrar a /staff/* y /api/staff/*.
var CommsRoles = []string{RoleReceptionist, RoleOptometrist, RoleEmployee}

// currentStaff lee (rol, id) de la sesión que dejó RequireAdminAuth.
func currentStaff(c *gin.Context) models.StaffRef {
	roleVal, _ := c.Get("staff_role")
	idVal, _ := c.Get("staff_id")
	role, _ := roleVal.(string)
	id, _ := idVal.(int64)
	return models.StaffRef{Role: role, ID: id}
}

// CurrentStaff es la versión exportada, para handlers/admin.
func CurrentStaff(c *gin.Context) models.StaffRef { return currentStaff(c) }

/* =========================================================
   Páginas
   ========================================================= */

// StaffNotificationsPage — GET /staff/notificaciones
func StaffNotificationsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "staff-notificaciones.html", WithStaff(c, gin.H{
		"ActivePage": "staff-notificaciones",
	}))
}

// StaffChatPage — GET /staff/chat
func StaffChatPage(c *gin.Context) {
	c.HTML(http.StatusOK, "staff-chat.html", WithStaff(c, gin.H{
		"ActivePage": "staff-chat",
	}))
}

/* =========================================================
   Avisos (API)
   ========================================================= */

// ListMyAnnouncements — GET /api/staff/avisos?limit=10
// Responde {unread: n, items: [...]} — la campanita pide limit=8, la
// página completa sin límite.
func ListMyAnnouncements(c *gin.Context) {
	me := currentStaff(c)
	limit, _ := strconv.Atoi(c.Query("limit"))

	items, err := models.ListAnnouncementsFor(me.Role, me.ID, limit)
	if err != nil {
		log.Printf("staff.ListMyAnnouncements: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los avisos."})
		return
	}
	unread, err := models.CountUnreadAnnouncements(me.Role, me.ID)
	if err != nil {
		log.Printf("staff.ListMyAnnouncements count: %v", err)
	}
	c.JSON(http.StatusOK, gin.H{"unread": unread, "items": items})
}

// MarkMyAnnouncementRead — POST /api/staff/avisos/:id/leido
func MarkMyAnnouncementRead(c *gin.Context) {
	me := currentStaff(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Aviso inválido."})
		return
	}
	if err := models.MarkAnnouncementRead(id, me.Role, me.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo marcar como leído."})
		return
	}
	unread, _ := models.CountUnreadAnnouncements(me.Role, me.ID)
	// Las otras pestañas de la misma persona actualizan su contador.
	realtime.Default.SendTo([]string{me.Key()}, realtime.Event{
		Type: "aviso.leido", Data: gin.H{"id": id, "unread": unread},
	})
	c.JSON(http.StatusOK, gin.H{"unread": unread})
}

// MarkAllMyAnnouncementsRead — POST /api/staff/avisos/leer-todos
func MarkAllMyAnnouncementsRead(c *gin.Context) {
	me := currentStaff(c)
	if err := models.MarkAllAnnouncementsRead(me.Role, me.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron marcar como leídos."})
		return
	}
	realtime.Default.SendTo([]string{me.Key()}, realtime.Event{
		Type: "aviso.leido", Data: gin.H{"id": 0, "unread": 0},
	})
	c.JSON(http.StatusOK, gin.H{"unread": 0})
}

/* =========================================================
   Chat (API)
   ========================================================= */

// chatPerson es cómo se ve una persona en el chat.
type chatPerson struct {
	Key    string `json:"key"`
	Role   string `json:"role"`
	Name   string `json:"name"`
	Online bool   `json:"online"`
}

// chatConversation es una conversación ya "vestida" para el front:
// con título (nombre del otro en 1 a 1, nombre del grupo en grupos).
type chatConversation struct {
	ID          int64            `json:"id"`
	Kind        string           `json:"kind"`
	Title       string           `json:"title"`
	OtherKey    string           `json:"other_key,omitempty"`
	Members     []chatPerson     `json:"members"`
	LastMessage *chatMessageView `json:"last_message"`
	Unread      int              `json:"unread"`
	LastReadID  int64            `json:"last_read_id"`
}

type chatMessageView struct {
	models.ChatMessage
	SenderName string `json:"sender_name"`
	ClientID   string `json:"client_id,omitempty"`
}

const deletedUserName = "Usuario eliminado"

func personOf(dir map[string]models.StaffMember, ref models.StaffRef) chatPerson {
	k := ref.Key()
	p := chatPerson{Key: k, Role: ref.Role, Name: deletedUserName, Online: realtime.Default.IsOnline(k)}
	if m, ok := dir[k]; ok {
		p.Name = m.Name
	}
	return p
}

func messageView(dir map[string]models.StaffMember, m *models.ChatMessage, clientID string) *chatMessageView {
	if m == nil {
		return nil
	}
	name := deletedUserName
	if s, ok := dir[m.SenderKey]; ok {
		name = s.Name
	}
	return &chatMessageView{ChatMessage: *m, SenderName: name, ClientID: clientID}
}

// dressConversation arma la vista de una conversación para "viewer".
func dressConversation(dir map[string]models.StaffMember, s models.ConversationSummary, viewer models.StaffRef) chatConversation {
	out := chatConversation{
		ID: s.ID, Kind: s.Kind, Title: s.Name, Unread: s.Unread, LastReadID: s.LastReadID,
		LastMessage: messageView(dir, s.LastMessage, ""),
		Members:     make([]chatPerson, 0, len(s.Members)),
	}
	for _, m := range s.Members {
		out.Members = append(out.Members, personOf(dir, m))
	}
	if s.Kind == models.ConversationDirect {
		out.Title = deletedUserName
		for _, m := range s.Members {
			if m.Key() != viewer.Key() {
				p := personOf(dir, m)
				out.Title = p.Name
				out.OtherKey = p.Key
				break
			}
		}
	}
	if out.Title == "" {
		out.Title = "Grupo"
	}
	return out
}

// ChatBootstrap — GET /api/staff/chat
// Todo lo que la pantalla de chat necesita al abrir: quién soy, mis
// contactos (todo el staff con chat, menos yo) y mis conversaciones.
func ChatBootstrap(c *gin.Context) {
	me := currentStaff(c)
	dir, err := models.StaffDirectory()
	if err != nil {
		log.Printf("staff.ChatBootstrap directory: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el chat."})
		return
	}
	convs, err := models.ListConversationsFor(me.Role, me.ID)
	if err != nil {
		log.Printf("staff.ChatBootstrap conversations: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo cargar el chat."})
		return
	}

	contacts := make([]chatPerson, 0, len(dir))
	list, _ := models.ListCommsStaff()
	for _, m := range list {
		if m.Key == me.Key() {
			continue
		}
		contacts = append(contacts, chatPerson{Key: m.Key, Role: m.Role, Name: m.Name, Online: realtime.Default.IsOnline(m.Key)})
	}

	views := make([]chatConversation, 0, len(convs))
	for _, s := range convs {
		views = append(views, dressConversation(dir, s, me))
	}

	c.JSON(http.StatusOK, gin.H{
		"me":            personOf(dir, me),
		"contacts":      contacts,
		"conversations": views,
	})
}

type openDirectInput struct {
	Key string `json:"key" binding:"required"`
}

// parseStaffKey convierte "employee:3" en StaffRef.
func parseStaffKey(k string) (models.StaffRef, bool) {
	parts := strings.SplitN(k, ":", 2)
	if len(parts) != 2 {
		return models.StaffRef{}, false
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || id <= 0 || !models.IsCommsRole(parts[0]) {
		return models.StaffRef{}, false
	}
	return models.StaffRef{Role: parts[0], ID: id}, true
}

// OpenDirectChat — POST /api/staff/chat/directo {key}
// Abre (o crea) el chat 1 a 1 con esa persona.
func OpenDirectChat(c *gin.Context) {
	me := currentStaff(c)
	var input openDirectInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Contacto inválido."})
		return
	}
	other, ok := parseStaffKey(input.Key)
	if !ok || other.Key() == me.Key() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Contacto inválido."})
		return
	}
	if exists, err := models.StaffExists(other); err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese contacto ya no existe."})
		return
	}

	convID, created, err := models.GetOrCreateDirect(me, other)
	if err != nil {
		log.Printf("staff.OpenDirectChat: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo abrir el chat."})
		return
	}
	dir, _ := models.StaffDirectory()
	s, err := models.GetConversationFor(convID, me.Role, me.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo abrir el chat."})
		return
	}
	if created {
		if otherConv, err := models.GetConversationFor(convID, other.Role, other.ID); err == nil {
			realtime.Default.SendTo([]string{other.Key()}, realtime.Event{
				Type: "chat.conversation", Data: dressConversation(dir, *otherConv, other),
			})
		}
	}
	c.JSON(http.StatusOK, dressConversation(dir, *s, me))
}

// requireMember valida el :id y que quien pide sea miembro.
func requireMember(c *gin.Context) (int64, models.StaffRef, bool) {
	me := currentStaff(c)
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Conversación inválida."})
		return 0, me, false
	}
	ok, err := models.IsConversationMember(id, me.Role, me.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor."})
		return 0, me, false
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "No tienes acceso a esta conversación."})
		return 0, me, false
	}
	return id, me, true
}

// ListChatMessages — GET /api/staff/chat/conversaciones/:id/mensajes?antes=ID
func ListChatMessages(c *gin.Context) {
	convID, _, ok := requireMember(c)
	if !ok {
		return
	}
	before, _ := strconv.ParseInt(c.Query("antes"), 10, 64)
	msgs, err := models.ListMessages(convID, before, 50)
	if err != nil {
		log.Printf("staff.ListChatMessages: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudieron cargar los mensajes."})
		return
	}
	dir, _ := models.StaffDirectory()
	views := make([]*chatMessageView, 0, len(msgs))
	for i := range msgs {
		views = append(views, messageView(dir, &msgs[i], ""))
	}
	c.JSON(http.StatusOK, gin.H{"items": views, "has_more": len(msgs) == 50})
}

type sendMessageInput struct {
	Body     string `json:"body"`
	ClientID string `json:"client_id"`
}

// SendChatMessage — POST /api/staff/chat/conversaciones/:id/mensajes
// Guarda en MySQL y lo reparte en vivo a todos los miembros (incluidas
// las otras pestañas de quien lo mandó).
func SendChatMessage(c *gin.Context) {
	convID, me, ok := requireMember(c)
	if !ok {
		return
	}
	var input sendMessageInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mensaje inválido."})
		return
	}
	body := strings.TrimSpace(input.Body)
	if body == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El mensaje está vacío."})
		return
	}
	if utf8.RuneCountInString(body) > maxChatMessageRunes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El mensaje es demasiado largo."})
		return
	}
	if len(input.ClientID) > 64 {
		input.ClientID = ""
	}

	msg, err := models.CreateMessage(convID, me, body)
	if err != nil {
		log.Printf("staff.SendChatMessage: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo enviar el mensaje."})
		return
	}

	dir, _ := models.StaffDirectory()
	view := messageView(dir, msg, input.ClientID)

	members, err := models.ConversationMembers(convID)
	if err == nil {
		keys := make([]string, 0, len(members))
		for _, m := range members {
			keys = append(keys, m.Key())
		}
		realtime.Default.SendTo(keys, realtime.Event{Type: "chat.message", Data: view})
	}
	c.JSON(http.StatusCreated, view)
}

type markReadInput struct {
	Upto int64 `json:"upto"`
}

// MarkChatRead — POST /api/staff/chat/conversaciones/:id/leido {upto}
func MarkChatRead(c *gin.Context) {
	convID, me, ok := requireMember(c)
	if !ok {
		return
	}
	var input markReadInput
	_ = c.ShouldBindJSON(&input)
	if err := models.MarkConversationRead(convID, me.Role, me.ID, input.Upto); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No se pudo marcar como leído."})
		return
	}
	// Las otras pestañas de la misma persona limpian su contador.
	realtime.Default.SendTo([]string{me.Key()}, realtime.Event{
		Type: "chat.read", Data: gin.H{"conversation_id": convID, "upto": input.Upto},
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ChatUnreadCount — GET /api/staff/chat/no-leidos
// Total de mensajes sin leer (para el globito del link "Chat" en el
// sidebar, en cualquier página).
func ChatUnreadCount(c *gin.Context) {
	me := currentStaff(c)
	convs, err := models.ListConversationsFor(me.Role, me.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error del servidor."})
		return
	}
	total := 0
	for _, s := range convs {
		total += s.Unread
	}
	c.JSON(http.StatusOK, gin.H{"unread": total})
}

/* =========================================================
   Avisos en vivo que dispara el panel de admin
   (handlers/admin/comunicacion.go los llama)
   ========================================================= */

// NotifyConversationChanged le manda a cada persona su versión de la
// conversación (la ven aparecer/actualizarse en su lista de chats).
func NotifyConversationChanged(conversationID int64, to []models.StaffRef) {
	if len(to) == 0 {
		return
	}
	dir, err := models.StaffDirectory()
	if err != nil {
		return
	}
	for _, ref := range to {
		s, err := models.GetConversationFor(conversationID, ref.Role, ref.ID)
		if err != nil {
			continue
		}
		realtime.Default.SendTo([]string{ref.Key()}, realtime.Event{
			Type: "chat.conversation", Data: dressConversation(dir, *s, ref),
		})
	}
}

// NotifyConversationRemoved avisa que ya no pertenecen a esa
// conversación (los sacaron del grupo o el admin lo borró).
func NotifyConversationRemoved(conversationID int64, to []models.StaffRef) {
	keys := make([]string, 0, len(to))
	for _, r := range to {
		keys = append(keys, r.Key())
	}
	realtime.Default.SendTo(keys, realtime.Event{
		Type: "chat.conversation.removed", Data: gin.H{"id": conversationID},
	})
}

// NotifyAnnouncement hace sonar la campanita de los destinatarios.
func NotifyAnnouncement(a *models.Announcement, to []models.StaffRef) {
	keys := make([]string, 0, len(to))
	for _, r := range to {
		keys = append(keys, r.Key())
	}
	realtime.Default.SendTo(keys, realtime.Event{
		Type: "aviso.nuevo",
		Data: models.StaffAnnouncement{ID: a.ID, Title: a.Title, Body: a.Body, CreatedAt: a.CreatedAt},
	})
}
