package db

import "log"

// EnsureTicketTemplateTable crea (si no existe) la tabla donde se guarda
// la plantilla del ticket que se imprime en la ticketera (recepción →
// Plantillas). Se llama una vez al arrancar, junto a EnsureActivityTable.
//
// Una fila por tipo de ticket ("venta" por ahora; después pueden
// sumarse "abono", "garantía", etc.). La plantilla va como JSON.
func EnsureTicketTemplateTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS ticket_templates (
		kind        VARCHAR(32)  NOT NULL PRIMARY KEY,
		data        MEDIUMTEXT   NOT NULL,
		updated_by  VARCHAR(120) NOT NULL DEFAULT '',
		updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("tickets: no se pudo crear la tabla ticket_templates: %v", err)
		return
	}
	log.Println("tickets: tabla ticket_templates lista")
}
