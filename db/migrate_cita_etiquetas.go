package db

import "log"

// EnsureAppointmentTagsTable crea (si no existe) la tabla de etiquetas de
// cita: cómo llegó cada cita (vino sin cita, chequeo, teléfono, WhatsApp).
// Va aparte de la tabla de citas para no tocarla. Se llama al arrancar.
func EnsureAppointmentTagsTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS appointment_tags (
		appointment_id BIGINT       NOT NULL PRIMARY KEY,
		tag            VARCHAR(20)  NOT NULL,
		updated_by     VARCHAR(120) NOT NULL DEFAULT '',
		updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("citas: no se pudo crear la tabla appointment_tags: %v", err)
		return
	}
	log.Println("citas: tabla appointment_tags lista")
}
