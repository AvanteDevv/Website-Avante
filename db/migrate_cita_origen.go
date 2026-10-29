package db

import "log"

// EnsureCitaOrigen agrega appointments.origen: quién hizo la cita.
//   - "web": el cliente la agendó él solo desde la página (con su código
//     por WhatsApp).
//   - "recepcion": la agendó el personal desde el panel ("Crear cita").
//
// La primera vez que se agrega la columna, las citas que ya existían y
// que aparecen en la Bitácora como "Creó una cita para …" (mismo nombre,
// creada al mismo minuto) quedan como "recepcion"; las demás como "web".
// Se llama al arrancar.
func EnsureCitaOrigen() {
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'origen'`).Scan(&n); err != nil {
		log.Printf("citas: no se pudo revisar appointments.origen: %v", err)
		return
	}
	if n > 0 {
		return
	}
	if _, err := DB.Exec("ALTER TABLE appointments ADD COLUMN origen VARCHAR(12) NOT NULL DEFAULT 'web'"); err != nil {
		log.Printf("citas: no se pudo agregar appointments.origen: %v", err)
		return
	}
	res, err := DB.Exec(`UPDATE appointments a SET a.origen = 'recepcion'
		WHERE EXISTS (
			SELECT 1 FROM staff_activity_log l
			WHERE l.action = 'cita.crear' AND l.status_code < 400
			  AND ABS(TIMESTAMPDIFF(SECOND, l.created_at, a.created_at)) <= 120
			  AND CONVERT(l.description USING utf8mb4) LIKE CONCAT('%', CONVERT(TRIM(CONCAT(a.nombre, ' ', a.apellido)) USING utf8mb4), '%')
		)`)
	if err != nil {
		log.Printf("citas: origen de las citas anteriores (se quedan como web): %v", err)
	} else if c, _ := res.RowsAffected(); c > 0 {
		log.Printf("citas: %d citas anteriores marcadas como agendadas por recepción", c)
	}
	log.Println("citas: columna appointments.origen lista")
}
