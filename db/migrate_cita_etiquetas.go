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

// EnsureSitioWebTags pone la etiqueta automática "sitio_web" a las citas
// que hizo el cliente desde la página (origen = 'web') y que no tienen
// etiqueta. Las que recepción ya etiquetó (chequeo, WhatsApp…) se quedan
// como están. Va después de EnsureCitaOrigen; se llama al arrancar.
func EnsureSitioWebTags() {
	res, err := DB.Exec(`INSERT IGNORE INTO appointment_tags (appointment_id, tag, updated_by)
		SELECT id, 'sitio_web', 'Automático' FROM appointments WHERE origen = 'web'`)
	if err != nil {
		log.Printf("citas: no se pudo poner la etiqueta sitio_web: %v", err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("citas: %d citas de la página etiquetadas como sitio web", n)
	}
}
