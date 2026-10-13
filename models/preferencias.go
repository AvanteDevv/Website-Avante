package models

import (
	"database/sql"
	"encoding/json"
	"errors"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Preferencias de cada cuenta del staff (Configuración): un JSON libre,
// p. ej. {"avisosCita": {"enabled": true, "sound": "campana", ...}}.

// GetStaffPreferences regresa el JSON guardado ({} si todavía no hay).
func GetStaffPreferences(role string, id int64) (json.RawMessage, error) {
	var raw []byte
	err := db.DB.QueryRow("SELECT data FROM staff_preferences WHERE role = ? AND staff_id = ?", role, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) || len(raw) == 0 {
		return json.RawMessage(`{}`), nil
	}
	if err != nil {
		return nil, err
	}
	return json.RawMessage(raw), nil
}

// SaveStaffPreferences reemplaza las preferencias de esa cuenta.
func SaveStaffPreferences(role string, id int64, data json.RawMessage) error {
	_, err := db.DB.Exec(
		"INSERT INTO staff_preferences (role, staff_id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
		role, id, []byte(data),
	)
	return err
}
