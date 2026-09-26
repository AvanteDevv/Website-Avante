package models

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Comunicación interna del staff: avisos del admin + chat (1 a 1 y
// grupos). Requiere las tablas de migrations/2026-09-25_chat_avisos.sql.
//
// Como cada rol vive en su propia tabla (receptionists, optometrists,
// employees), el mismo id numérico se repite entre roles. Por eso aquí
// una persona SIEMPRE se identifica con el par (rol, id) — nunca con el
// id solo. StaffKey() lo convierte en "employee:3" para usarlo como
// llave en mapas y en el hub de WebSocket.

// Roles que participan en chat y reciben avisos. El admin queda fuera
// a propósito: manda avisos y crea grupos, pero no chatea.
var CommsRoles = []string{"receptionist", "optometrist", "employee"}

// IsCommsRole indica si el rol participa en chat/avisos.
func IsCommsRole(role string) bool {
	for _, r := range CommsRoles {
		if r == role {
			return true
		}
	}
	return false
}

// StaffRef identifica a una persona del staff.
type StaffRef struct {
	Role string `json:"role"`
	ID   int64  `json:"id"`
}

func (r StaffRef) Key() string { return StaffKey(r.Role, r.ID) }

// StaffKey arma la llave única "rol:id".
func StaffKey(role string, id int64) string {
	return role + ":" + strconv.FormatInt(id, 10)
}

// StaffMember es una persona del directorio (para elegir contactos,
// destinatarios de avisos o miembros de grupos).
type StaffMember struct {
	Role  string `json:"role"`
	ID    int64  `json:"id"`
	Key   string `json:"key"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// ErrNotMember se devuelve cuando alguien intenta leer/escribir en una
// conversación de la que no es miembro.
var ErrNotMember = errors.New("no eres miembro de esta conversación")

// ErrConversationNotFound se devuelve cuando el id no existe.
var ErrConversationNotFound = errors.New("conversación no encontrada")

// ListCommsStaff devuelve todo el staff que participa en chat/avisos
// (recepción + optometría + empleados), ordenado por nombre.
func ListCommsStaff() ([]StaffMember, error) {
	rows, err := db.DB.Query(`
		SELECT 'receptionist' AS role, id, name, email FROM receptionists
		UNION ALL
		SELECT 'optometrist' AS role, id, name, email FROM optometrists
		UNION ALL
		SELECT 'employee' AS role, id, name, email FROM employees
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []StaffMember
	for rows.Next() {
		var m StaffMember
		if err := rows.Scan(&m.Role, &m.ID, &m.Name, &m.Email); err != nil {
			return nil, err
		}
		m.Key = StaffKey(m.Role, m.ID)
		out = append(out, m)
	}
	return out, rows.Err()
}

// StaffDirectory es ListCommsStaff indexado por llave "rol:id".
func StaffDirectory() (map[string]StaffMember, error) {
	list, err := ListCommsStaff()
	if err != nil {
		return nil, err
	}
	dir := make(map[string]StaffMember, len(list))
	for _, m := range list {
		dir[m.Key] = m
	}
	return dir, nil
}

// StaffExists valida que (rol, id) sea una cuenta real de staff con chat.
func StaffExists(ref StaffRef) (bool, error) {
	var table string
	switch ref.Role {
	case "receptionist":
		table = "receptionists"
	case "optometrist":
		table = "optometrists"
	case "employee":
		table = "employees"
	default:
		return false, nil
	}
	var n int
	err := db.DB.QueryRow("SELECT COUNT(*) FROM "+table+" WHERE id = ?", ref.ID).Scan(&n)
	return n > 0, err
}

// PurgeStaffComms quita a una persona de todos los grupos/chats y de los
// destinatarios de avisos — se llama al eliminar su cuenta desde "Base
// de datos". Sus mensajes viejos se quedan (se muestran como "Usuario
// eliminado") para no romper el historial de los demás.
func PurgeStaffComms(role string, id int64) error {
	if _, err := db.DB.Exec("DELETE FROM chat_members WHERE staff_role = ? AND staff_id = ?", role, id); err != nil {
		return err
	}
	_, err := db.DB.Exec("DELETE FROM staff_announcement_recipients WHERE staff_role = ? AND staff_id = ?", role, id)
	return err
}

// dedupeRefs quita repetidos y cualquier rol que no participe en comms.
func dedupeRefs(refs []StaffRef) []StaffRef {
	seen := make(map[string]bool, len(refs))
	out := make([]StaffRef, 0, len(refs))
	for _, r := range refs {
		if !IsCommsRole(r.Role) || r.ID <= 0 {
			continue
		}
		k := r.Key()
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, r)
	}
	return out
}

// placeholders devuelve "?, ?, ?" para n valores.
func placeholders(n int) string {
	if n <= 0 {
		return ""
	}
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}

/* =========================================================
   AVISOS (admin -> staff)
   ========================================================= */

// Audiencias posibles de un aviso.
const (
	AudienceAll      = "all"      // todo el staff con comms
	AudienceRole     = "role"     // un rol completo (AudienceRole guarda cuál)
	AudienceSelected = "selected" // personas específicas
)

// Announcement es un aviso visto desde el admin (con conteo de lecturas).
type Announcement struct {
	ID           int64     `json:"id"`
	Title        string    `json:"title"`
	Body         string    `json:"body"`
	Audience     string    `json:"audience"`
	AudienceRole string    `json:"audience_role,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	Recipients   int       `json:"recipients"`
	ReadCount    int       `json:"read_count"`
}

// StaffAnnouncement es un aviso visto por quien lo recibe.
type StaffAnnouncement struct {
	ID        int64      `json:"id"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"created_at"`
	ReadAt    *time.Time `json:"read_at"`
}

// ResolveAudience convierte la audiencia elegida en el admin en la lista
// concreta de destinatarios. Se "congela" al enviar: si mañana das de
// alta a un empleado nuevo, no le aparecen avisos viejos.
func ResolveAudience(audience, role string, selected []StaffRef) ([]StaffRef, error) {
	switch audience {
	case AudienceAll, AudienceRole:
		list, err := ListCommsStaff()
		if err != nil {
			return nil, err
		}
		var out []StaffRef
		for _, m := range list {
			if audience == AudienceRole && m.Role != role {
				continue
			}
			out = append(out, StaffRef{Role: m.Role, ID: m.ID})
		}
		return out, nil
	case AudienceSelected:
		dir, err := StaffDirectory()
		if err != nil {
			return nil, err
		}
		var out []StaffRef
		for _, r := range dedupeRefs(selected) {
			if _, ok := dir[r.Key()]; ok {
				out = append(out, r)
			}
		}
		return out, nil
	}
	return nil, fmt.Errorf("audiencia inválida: %q", audience)
}

// CreateAnnouncement guarda el aviso y una fila por destinatario (con
// read_at NULL = no leído), todo en una transacción.
func CreateAnnouncement(title, body, audience, audienceRole string, adminID int64, recipients []StaffRef) (*Announcement, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var roleVal any
	if audience == AudienceRole {
		roleVal = audienceRole
	}
	res, err := tx.Exec(
		"INSERT INTO staff_announcements (title, body, audience, audience_role, created_by_admin_id) VALUES (?, ?, ?, ?, ?)",
		title, body, audience, roleVal, adminID,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	// Insert en lotes de 200 para no armar un query gigante.
	const batch = 200
	for start := 0; start < len(recipients); start += batch {
		end := start + batch
		if end > len(recipients) {
			end = len(recipients)
		}
		chunk := recipients[start:end]
		args := make([]any, 0, len(chunk)*3)
		vals := make([]string, 0, len(chunk))
		for _, r := range chunk {
			vals = append(vals, "(?, ?, ?)")
			args = append(args, id, r.Role, r.ID)
		}
		if _, err := tx.Exec(
			"INSERT INTO staff_announcement_recipients (announcement_id, staff_role, staff_id) VALUES "+strings.Join(vals, ", "),
			args...,
		); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	a := &Announcement{
		ID: id, Title: title, Body: body, Audience: audience,
		CreatedAt: time.Now(), Recipients: len(recipients),
	}
	if audience == AudienceRole {
		a.AudienceRole = audienceRole
	}
	return a, nil
}

// ListAnnouncementsAdmin devuelve los avisos enviados, más recientes
// primero, con cuántos lo recibieron y cuántos ya lo leyeron.
func ListAnnouncementsAdmin() ([]Announcement, error) {
	rows, err := db.DB.Query(`
		SELECT a.id, a.title, a.body, a.audience, COALESCE(a.audience_role, ''), a.created_at,
		       COUNT(r.staff_id) AS recipients,
		       COUNT(r.read_at) AS read_count
		FROM staff_announcements a
		LEFT JOIN staff_announcement_recipients r ON r.announcement_id = a.id
		GROUP BY a.id, a.title, a.body, a.audience, a.audience_role, a.created_at
		ORDER BY a.created_at DESC, a.id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Announcement
	for rows.Next() {
		var a Announcement
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.Audience, &a.AudienceRole, &a.CreatedAt, &a.Recipients, &a.ReadCount); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// AnnouncementReaders devuelve quién recibió un aviso y si ya lo leyó
// (para el detalle en el panel de admin).
type AnnouncementReader struct {
	StaffRef
	ReadAt *time.Time `json:"read_at"`
}

func ListAnnouncementReaders(announcementID int64) ([]AnnouncementReader, error) {
	rows, err := db.DB.Query(
		"SELECT staff_role, staff_id, read_at FROM staff_announcement_recipients WHERE announcement_id = ?",
		announcementID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AnnouncementReader
	for rows.Next() {
		var r AnnouncementReader
		var readAt sql.NullTime
		if err := rows.Scan(&r.Role, &r.ID, &readAt); err != nil {
			return nil, err
		}
		if readAt.Valid {
			t := readAt.Time
			r.ReadAt = &t
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// DeleteAnnouncement borra el aviso (los destinatarios se van por
// ON DELETE CASCADE).
func DeleteAnnouncement(id int64) error {
	_, err := db.DB.Exec("DELETE FROM staff_announcements WHERE id = ?", id)
	return err
}

// ListAnnouncementsFor devuelve los avisos de una persona, más
// recientes primero. limit <= 0 = sin límite.
func ListAnnouncementsFor(role string, id int64, limit int) ([]StaffAnnouncement, error) {
	q := `
		SELECT a.id, a.title, a.body, a.created_at, r.read_at
		FROM staff_announcement_recipients r
		JOIN staff_announcements a ON a.id = r.announcement_id
		WHERE r.staff_role = ? AND r.staff_id = ?
		ORDER BY a.created_at DESC, a.id DESC`
	args := []any{role, id}
	if limit > 0 {
		q += " LIMIT ?"
		args = append(args, limit)
	}
	rows, err := db.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []StaffAnnouncement{}
	for rows.Next() {
		var a StaffAnnouncement
		var readAt sql.NullTime
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.CreatedAt, &readAt); err != nil {
			return nil, err
		}
		if readAt.Valid {
			t := readAt.Time
			a.ReadAt = &t
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// CountUnreadAnnouncements es el número del contador de la campanita.
func CountUnreadAnnouncements(role string, id int64) (int, error) {
	var n int
	err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM staff_announcement_recipients WHERE staff_role = ? AND staff_id = ? AND read_at IS NULL",
		role, id,
	).Scan(&n)
	return n, err
}

// MarkAnnouncementRead marca un aviso como leído (solo si es suyo).
func MarkAnnouncementRead(announcementID int64, role string, id int64) error {
	_, err := db.DB.Exec(
		"UPDATE staff_announcement_recipients SET read_at = NOW() WHERE announcement_id = ? AND staff_role = ? AND staff_id = ? AND read_at IS NULL",
		announcementID, role, id,
	)
	return err
}

// MarkAllAnnouncementsRead marca todos sus avisos como leídos.
func MarkAllAnnouncementsRead(role string, id int64) error {
	_, err := db.DB.Exec(
		"UPDATE staff_announcement_recipients SET read_at = NOW() WHERE staff_role = ? AND staff_id = ? AND read_at IS NULL",
		role, id,
	)
	return err
}

/* =========================================================
   CHAT (1 a 1 y grupos)
   ========================================================= */

// Tipos de conversación.
const (
	ConversationDirect = "direct"
	ConversationGroup  = "group"
)

// ChatMessage es un mensaje.
type ChatMessage struct {
	ID             int64     `json:"id"`
	ConversationID int64     `json:"conversation_id"`
	SenderRole     string    `json:"sender_role"`
	SenderID       int64     `json:"sender_id"`
	SenderKey      string    `json:"sender_key"`
	Body           string    `json:"body"`
	CreatedAt      time.Time `json:"created_at"`
}

// ConversationSummary es una fila de la lista de chats.
type ConversationSummary struct {
	ID          int64        `json:"id"`
	Kind        string       `json:"kind"`
	Name        string       `json:"name"`
	Members     []StaffRef   `json:"members"`
	LastMessage *ChatMessage `json:"last_message"`
	Unread      int          `json:"unread"`
	LastReadID  int64        `json:"last_read_id"`
	CreatedAt   time.Time    `json:"created_at"`
}

// ChatGroup es un grupo visto desde el admin.
type ChatGroup struct {
	ID        int64      `json:"id"`
	Name      string     `json:"name"`
	Members   []StaffRef `json:"members"`
	CreatedAt time.Time  `json:"created_at"`
}

// directKey arma la llave única de un chat 1 a 1 — siempre en el mismo
// orden, así (A,B) y (B,A) son el mismo chat.
func directKey(a, b StaffRef) string {
	ka, kb := a.Key(), b.Key()
	if ka > kb {
		ka, kb = kb, ka
	}
	return ka + "|" + kb
}

// IsConversationMember indica si (rol, id) es miembro de la conversación.
func IsConversationMember(conversationID int64, role string, id int64) (bool, error) {
	var n int
	err := db.DB.QueryRow(
		"SELECT COUNT(*) FROM chat_members WHERE conversation_id = ? AND staff_role = ? AND staff_id = ?",
		conversationID, role, id,
	).Scan(&n)
	return n > 0, err
}

// ConversationMembers devuelve los miembros de una conversación.
func ConversationMembers(conversationID int64) ([]StaffRef, error) {
	m, err := membersFor([]int64{conversationID})
	if err != nil {
		return nil, err
	}
	return m[conversationID], nil
}

func membersFor(ids []int64) (map[int64][]StaffRef, error) {
	out := make(map[int64][]StaffRef, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := db.DB.Query(
		"SELECT conversation_id, staff_role, staff_id FROM chat_members WHERE conversation_id IN ("+placeholders(len(ids))+") ORDER BY joined_at, staff_role, staff_id",
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int64
		var r StaffRef
		if err := rows.Scan(&cid, &r.Role, &r.ID); err != nil {
			return nil, err
		}
		out[cid] = append(out[cid], r)
	}
	return out, rows.Err()
}

// ListConversationsFor devuelve los chats de una persona, el más
// reciente arriba, con el último mensaje y cuántos no ha leído.
func ListConversationsFor(role string, id int64) ([]ConversationSummary, error) {
	rows, err := db.DB.Query(`
		SELECT c.id, c.kind, COALESCE(c.name, ''), c.created_at, m.last_read_message_id,
		       (SELECT COUNT(*) FROM chat_messages x
		         WHERE x.conversation_id = c.id
		           AND x.id > m.last_read_message_id
		           AND NOT (x.sender_role = ? AND x.sender_id = ?)) AS unread,
		       lm.id, lm.sender_role, lm.sender_id, lm.body, lm.created_at
		FROM chat_members m
		JOIN chat_conversations c ON c.id = m.conversation_id
		LEFT JOIN chat_messages lm
		       ON lm.id = (SELECT MAX(id) FROM chat_messages WHERE conversation_id = c.id)
		WHERE m.staff_role = ? AND m.staff_id = ?
		ORDER BY COALESCE(lm.created_at, c.created_at) DESC, c.id DESC
	`, role, id, role, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ConversationSummary{}
	var ids []int64
	for rows.Next() {
		var s ConversationSummary
		var lmID, lmSenderID sql.NullInt64
		var lmRole, lmBody sql.NullString
		var lmAt sql.NullTime
		if err := rows.Scan(&s.ID, &s.Kind, &s.Name, &s.CreatedAt, &s.LastReadID, &s.Unread,
			&lmID, &lmRole, &lmSenderID, &lmBody, &lmAt); err != nil {
			return nil, err
		}
		if lmID.Valid {
			s.LastMessage = &ChatMessage{
				ID: lmID.Int64, ConversationID: s.ID,
				SenderRole: lmRole.String, SenderID: lmSenderID.Int64,
				SenderKey: StaffKey(lmRole.String, lmSenderID.Int64),
				Body:      lmBody.String, CreatedAt: lmAt.Time,
			}
		}
		out = append(out, s)
		ids = append(ids, s.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	members, err := membersFor(ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Members = members[out[i].ID]
	}
	return out, nil
}

// GetConversationFor devuelve UNA conversación como la ve esa persona
// (misma forma que en la lista). ErrNotMember si no es suya.
func GetConversationFor(conversationID int64, role string, id int64) (*ConversationSummary, error) {
	list, err := ListConversationsFor(role, id)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].ID == conversationID {
			return &list[i], nil
		}
	}
	return nil, ErrNotMember
}

// GetOrCreateDirect devuelve el chat 1 a 1 entre a y b; si no existe lo
// crea. created indica si se acaba de crear (para avisarle al otro por
// WebSocket que tiene un chat nuevo).
func GetOrCreateDirect(a, b StaffRef) (conversationID int64, created bool, err error) {
	key := directKey(a, b)

	err = db.DB.QueryRow("SELECT id FROM chat_conversations WHERE direct_key = ?", key).Scan(&conversationID)
	if err == nil {
		return conversationID, false, nil
	}
	if err != sql.ErrNoRows {
		return 0, false, err
	}

	tx, err := db.DB.Begin()
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO chat_conversations (kind, direct_key) VALUES (?, ?)", ConversationDirect, key)
	if err != nil {
		// Carrera: los dos le dieron "nuevo chat" al mismo tiempo y el
		// otro ganó el UNIQUE(direct_key) — se usa el que ya existe.
		tx.Rollback()
		if e2 := db.DB.QueryRow("SELECT id FROM chat_conversations WHERE direct_key = ?", key).Scan(&conversationID); e2 == nil {
			return conversationID, false, nil
		}
		return 0, false, err
	}
	conversationID, err = res.LastInsertId()
	if err != nil {
		return 0, false, err
	}
	if _, err := tx.Exec(
		"INSERT INTO chat_members (conversation_id, staff_role, staff_id) VALUES (?, ?, ?), (?, ?, ?)",
		conversationID, a.Role, a.ID, conversationID, b.Role, b.ID,
	); err != nil {
		return 0, false, err
	}
	if err := tx.Commit(); err != nil {
		return 0, false, err
	}
	return conversationID, true, nil
}

// ListMessages devuelve hasta `limit` mensajes de la conversación en
// orden cronológico. Si beforeID > 0, trae los anteriores a ese id
// (para "cargar mensajes anteriores" al hacer scroll hacia arriba).
func ListMessages(conversationID, beforeID int64, limit int) ([]ChatMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	q := "SELECT id, conversation_id, sender_role, sender_id, body, created_at FROM chat_messages WHERE conversation_id = ?"
	args := []any{conversationID}
	if beforeID > 0 {
		q += " AND id < ?"
		args = append(args, beforeID)
	}
	q += " ORDER BY id DESC LIMIT ?"
	args = append(args, limit)

	rows, err := db.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ChatMessage{}
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderRole, &m.SenderID, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.SenderKey = StaffKey(m.SenderRole, m.SenderID)
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Vienen del más nuevo al más viejo — se voltean para pintarlos
	// de arriba hacia abajo.
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, nil
}

// CreateMessage guarda un mensaje y deja la conversación como leída
// hasta ese mensaje para quien lo mandó.
func CreateMessage(conversationID int64, sender StaffRef, body string) (*ChatMessage, error) {
	res, err := db.DB.Exec(
		"INSERT INTO chat_messages (conversation_id, sender_role, sender_id, body) VALUES (?, ?, ?, ?)",
		conversationID, sender.Role, sender.ID, body,
	)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	_ = MarkConversationRead(conversationID, sender.Role, sender.ID, id)

	return &ChatMessage{
		ID: id, ConversationID: conversationID,
		SenderRole: sender.Role, SenderID: sender.ID, SenderKey: sender.Key(),
		Body: body, CreatedAt: time.Now(),
	}, nil
}

// MarkConversationRead mueve el "leído hasta" de esa persona. Nunca lo
// mueve hacia atrás. uptoID <= 0 = hasta el último mensaje.
func MarkConversationRead(conversationID int64, role string, id int64, uptoID int64) error {
	if uptoID <= 0 {
		if err := db.DB.QueryRow(
			"SELECT COALESCE(MAX(id), 0) FROM chat_messages WHERE conversation_id = ?", conversationID,
		).Scan(&uptoID); err != nil {
			return err
		}
	}
	_, err := db.DB.Exec(
		"UPDATE chat_members SET last_read_message_id = GREATEST(last_read_message_id, ?) WHERE conversation_id = ? AND staff_role = ? AND staff_id = ?",
		uptoID, conversationID, role, id,
	)
	return err
}

/* ---------- Grupos (solo el admin los crea/edita) ---------- */

// ListGroups devuelve todos los grupos con sus miembros.
func ListGroups() ([]ChatGroup, error) {
	rows, err := db.DB.Query(
		"SELECT id, COALESCE(name, ''), created_at FROM chat_conversations WHERE kind = ? ORDER BY name",
		ConversationGroup,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ChatGroup{}
	var ids []int64
	for rows.Next() {
		var g ChatGroup
		if err := rows.Scan(&g.ID, &g.Name, &g.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
		ids = append(ids, g.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	members, err := membersFor(ids)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].Members = members[out[i].ID]
		if out[i].Members == nil {
			out[i].Members = []StaffRef{}
		}
	}
	return out, nil
}

// CreateGroup crea un grupo con esos miembros.
func CreateGroup(name string, members []StaffRef) (int64, error) {
	members = dedupeRefs(members)
	tx, err := db.DB.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	res, err := tx.Exec("INSERT INTO chat_conversations (kind, name) VALUES (?, ?)", ConversationGroup, strings.TrimSpace(name))
	if err != nil {
		return 0, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	if err := insertMembers(tx, id, members); err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

// UpdateGroup cambia nombre y miembros. Devuelve quién entró y quién
// salió (para avisarles en vivo). A los que se quedan se les conserva su
// "leído hasta".
func UpdateGroup(id int64, name string, members []StaffRef) (added, removed []StaffRef, err error) {
	var kind string
	if err := db.DB.QueryRow("SELECT kind FROM chat_conversations WHERE id = ?", id).Scan(&kind); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil, ErrConversationNotFound
		}
		return nil, nil, err
	}
	if kind != ConversationGroup {
		return nil, nil, ErrConversationNotFound
	}

	current, err := ConversationMembers(id)
	if err != nil {
		return nil, nil, err
	}
	members = dedupeRefs(members)
	want := make(map[string]StaffRef, len(members))
	for _, m := range members {
		want[m.Key()] = m
	}
	have := make(map[string]StaffRef, len(current))
	for _, m := range current {
		have[m.Key()] = m
	}
	for k, m := range want {
		if _, ok := have[k]; !ok {
			added = append(added, m)
		}
	}
	for k, m := range have {
		if _, ok := want[k]; !ok {
			removed = append(removed, m)
		}
	}

	tx, err := db.DB.Begin()
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE chat_conversations SET name = ? WHERE id = ?", strings.TrimSpace(name), id); err != nil {
		return nil, nil, err
	}
	for _, m := range removed {
		if _, err := tx.Exec("DELETE FROM chat_members WHERE conversation_id = ? AND staff_role = ? AND staff_id = ?", id, m.Role, m.ID); err != nil {
			return nil, nil, err
		}
	}
	if err := insertMembers(tx, id, added); err != nil {
		return nil, nil, err
	}
	return added, removed, tx.Commit()
}

// DeleteGroup borra el grupo (miembros y mensajes se van por CASCADE).
// Devuelve quiénes eran miembros para avisarles.
func DeleteGroup(id int64) ([]StaffRef, error) {
	members, err := ConversationMembers(id)
	if err != nil {
		return nil, err
	}
	res, err := db.DB.Exec("DELETE FROM chat_conversations WHERE id = ? AND kind = ?", id, ConversationGroup)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrConversationNotFound
	}
	return members, nil
}

func insertMembers(tx *sql.Tx, conversationID int64, members []StaffRef) error {
	if len(members) == 0 {
		return nil
	}
	// Los que entran a un grupo con historial empiezan "al día": no les
	// aparecen como no leídos todos los mensajes viejos.
	var lastID int64
	if err := tx.QueryRow("SELECT COALESCE(MAX(id), 0) FROM chat_messages WHERE conversation_id = ?", conversationID).Scan(&lastID); err != nil {
		return err
	}
	vals := make([]string, 0, len(members))
	args := make([]any, 0, len(members)*4)
	for _, m := range members {
		vals = append(vals, "(?, ?, ?, ?)")
		args = append(args, conversationID, m.Role, m.ID, lastID)
	}
	_, err := tx.Exec(
		"INSERT IGNORE INTO chat_members (conversation_id, staff_role, staff_id, last_read_message_id) VALUES "+strings.Join(vals, ", "),
		args...,
	)
	return err
}
