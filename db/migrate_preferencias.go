package db

import "log"

// Preferencias de cada persona del staff (por ahora: cómo y cuándo le
// avisa de las citas — sonido, volumen, minutos antes). Una fila por
// cuenta (rol + id); data es un JSON libre que arma el frontend.
func EnsureStaffPreferencesTable() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS staff_preferences (
		role       VARCHAR(30) NOT NULL,
		staff_id   BIGINT NOT NULL,
		data       LONGTEXT NOT NULL,
		updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		PRIMARY KEY (role, staff_id)
	) DEFAULT CHARSET=utf8mb4`); err != nil {
		log.Printf("preferencias de staff: %v", err)
		return
	}
	log.Println("preferencias de staff: tabla lista")
}
