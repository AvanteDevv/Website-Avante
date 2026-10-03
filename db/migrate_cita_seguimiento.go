package db

import "log"

// EnsureAppointmentFollowupTable crea (si no existe) la tabla del
// seguimiento de cita: cuando el cliente ASISTIÓ, si compró algo y cada
// cuánto le toca su próxima revisión (3, 6 o 12 meses). Si no compró,
// no se le programa revisión. Va aparte de la tabla de citas para no
// tocarla. Se llama al arrancar.
func EnsureAppointmentFollowupTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS appointment_followups (
		appointment_id BIGINT       NOT NULL PRIMARY KEY,
		compro         TINYINT(1)   NOT NULL DEFAULT 0,
		revision_meses TINYINT      NULL,
		updated_by     VARCHAR(120) NOT NULL DEFAULT '',
		updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("citas: no se pudo crear la tabla appointment_followups: %v", err)
		return
	}
	log.Println("citas: tabla appointment_followups lista")
}
