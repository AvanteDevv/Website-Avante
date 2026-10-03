package models

import (
	"database/sql"
	"sort"
	"strconv"
	"strings"
	"time"

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
	// SettingAgendaDays guarda qué días de la semana se dan citas, como
	// números separados por coma (0 = domingo … 6 = sábado), p. ej.
	// "1,2,3,4,5,6" = de lunes a sábado.
	SettingAgendaDays = "agenda_days"
)

// DefaultAgendaDays: de lunes a sábado (el domingo no se abre) hasta que
// el admin guarde otra cosa en "Horario de citas".
const DefaultAgendaDays = "1,2,3,4,5,6"

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

// parseAgendaDays convierte "1,2,3" en [1 2 3] (sin repetidos, en orden,
// solo 0–6). Si no queda ninguno válido regresa los días por defecto.
func parseAgendaDays(raw string) []int {
	seen := map[int]bool{}
	out := []int{}
	for _, part := range strings.Split(raw, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(part))
		if err != nil || n < 0 || n > 6 || seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	if len(out) == 0 && raw != DefaultAgendaDays {
		return parseAgendaDays(DefaultAgendaDays)
	}
	sort.Ints(out)
	return out
}

// GetAgendaDays regresa los días de la semana en que se dan citas
// (0 = domingo … 6 = sábado).
func GetAgendaDays() ([]int, error) {
	raw, err := GetSetting(SettingAgendaDays, DefaultAgendaDays)
	return parseAgendaDays(raw), err
}

// SetAgendaDays guarda los días en que se dan citas. Ignora valores
// fuera de 0–6 y repetidos.
func SetAgendaDays(days []int) error {
	parts := []string{}
	seen := map[int]bool{}
	for _, d := range days {
		if d < 0 || d > 6 || seen[d] {
			continue
		}
		seen[d] = true
		parts = append(parts, strconv.Itoa(d))
	}
	return SetSetting(SettingAgendaDays, strings.Join(parts, ","))
}

// IsAgendaDayOpen indica si ese día se dan citas según los días
// configurados. Si no se pudieran leer los días, no bloquea (true).
func IsAgendaDayOpen(date time.Time) bool {
	days, err := GetAgendaDays()
	if err != nil {
		return true
	}
	wd := int(date.Weekday())
	for _, d := range days {
		if d == wd {
			return true
		}
	}
	return false
}
