package db

import "log"

// EnsureOptometristTables prepara lo que usan Examen de la vista e
// Historial clínico. Se llama al arrancar; no borra ni cambia datos.
//   - eye_exams.appointment_id: la cita de la que salió el examen (NULL
//     si fue sin cita). Sirve para "Citas de hoy" (terminado o no) y
//     para contar exámenes con cita contra sin cita.
//   - patient_antecedentes: antecedentes del paciente que no cambian en
//     cada examen (diabetes, hipertensión, cirugías, alergias, notas…).
//     patient_key es "u:<id de cuenta>" o "n:<nombre normalizado>".
func EnsureOptometristTables() {
	if err := addColumnIfMissing("eye_exams", "appointment_id", "BIGINT NULL AFTER user_id"); err != nil {
		log.Printf("optometría: columna eye_exams.appointment_id: %v", err)
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM information_schema.STATISTICS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'eye_exams' AND INDEX_NAME = 'idx_eye_exams_appt'`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec(`ALTER TABLE eye_exams ADD INDEX idx_eye_exams_appt (appointment_id)`); err != nil {
			log.Printf("optometría: índice appointment_id: %v", err)
		}
	}

	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS patient_antecedentes (
		patient_key  VARCHAR(190) NOT NULL PRIMARY KEY,
		patient_name VARCHAR(190) NOT NULL DEFAULT '',
		data         TEXT         NOT NULL,
		updated_by   VARCHAR(120) NOT NULL DEFAULT '',
		updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("optometría: no se pudo crear patient_antecedentes: %v", err)
		return
	}
	log.Println("optometría: eye_exams.appointment_id y patient_antecedentes listas")
}
