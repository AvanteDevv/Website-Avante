package models

import (
	"database/sql"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requires a MySQL table. Run this once against your database:
//
//	CREATE TABLE settings (
//	  `key` VARCHAR(50) PRIMARY KEY,
//	  value VARCHAR(255) NOT NULL
//	);
//
// A simple key-value table, not just for agenda hours — any other
// site-wide setting the admin panel grows later can live here too.

const (
	// SettingAgendaOpen / SettingAgendaClose store the daily opening and
	// closing time for "Agenda tu cita" bookings, as "HH:MM" (24h).
	SettingAgendaOpen  = "agenda_open_time"
	SettingAgendaClose = "agenda_close_time"
)

// Defaults used until an admin saves something in Configuración —
// open 9:00 AM, close 4:30 PM.
const (
	DefaultAgendaOpen  = "09:00"
	DefaultAgendaClose = "16:30"
)

// GetSetting reads one key from the settings table, or returns fallback
// if it hasn't been saved yet.
func GetSetting(key, fallback string) (string, error) {
	var value string
	err := db.DB.QueryRow("SELECT value FROM settings WHERE `key` = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return fallback, nil
	}
	if err != nil {
		return fallback, err
	}
	return value, nil
}

// SetSetting creates or updates one key in the settings table.
func SetSetting(key, value string) error {
	_, err := db.DB.Exec(
		"INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
		key, value,
	)
	return err
}

// GetAgendaHours returns the configured opening/closing time for
// bookings, falling back to the defaults if nothing has been saved yet.
// Used by both the public booking widget and the admin Configuración
// page.
func GetAgendaHours() (open string, close string, err error) {
	open, err = GetSetting(SettingAgendaOpen, DefaultAgendaOpen)
	if err != nil {
		return
	}
	close, err = GetSetting(SettingAgendaClose, DefaultAgendaClose)
	return
}

// SetAgendaHours saves the opening/closing time for bookings.
func SetAgendaHours(open, close string) error {
	if err := SetSetting(SettingAgendaOpen, open); err != nil {
		return err
	}
	return SetSetting(SettingAgendaClose, close)
}
