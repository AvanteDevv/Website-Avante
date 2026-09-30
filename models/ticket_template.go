package models

import (
	"database/sql"
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.

// TicketTemplate es la plantilla del ticket que se imprime en la
// ticketera. Data es el JSON tal cual lo arma la página de Plantillas
// (static/js/receptionist/ticket-render.js sabe leerlo).
type TicketTemplate struct {
	Kind      string    `json:"kind"`
	Data      string    `json:"-"`
	UpdatedBy string    `json:"updated_by"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetTicketTemplate regresa la plantilla guardada de ese tipo, o nil si
// todavía no se ha guardado ninguna (la página usa el formato de SICAR).
func GetTicketTemplate(kind string) (*TicketTemplate, error) {
	var t TicketTemplate
	err := db.DB.QueryRow(
		"SELECT kind, data, updated_by, updated_at FROM ticket_templates WHERE kind = ?", kind,
	).Scan(&t.Kind, &t.Data, &t.UpdatedBy, &t.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// SaveTicketTemplate crea o reemplaza la plantilla de ese tipo.
func SaveTicketTemplate(kind, data, updatedBy string) (*TicketTemplate, error) {
	_, err := db.DB.Exec(
		`INSERT INTO ticket_templates (kind, data, updated_by) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE data = VALUES(data), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
		kind, data, updatedBy,
	)
	if err != nil {
		return nil, err
	}
	return GetTicketTemplate(kind)
}
