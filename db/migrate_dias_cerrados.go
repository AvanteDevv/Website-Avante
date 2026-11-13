package db

import "log"

// EnsureAgendaClosedDaysTable crea (si no existe) la tabla de días
// cerrados: fechas sueltas en que la óptica no abre (día inhábil,
// inventario, un evento, etc.). Esos días no se pueden agendar y en los
// calendarios de los clientes salen como «Cerrado» con el motivo. Va
// aparte de "Días que se abre" (lunes a sábado), que es cada semana.
// Se llama al arrancar.
func EnsureAgendaClosedDaysTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS agenda_closed_days (
		fecha      DATE         NOT NULL PRIMARY KEY,
		motivo     VARCHAR(120) NOT NULL DEFAULT '',
		created_by VARCHAR(120) NOT NULL DEFAULT '',
		created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("citas: no se pudo crear la tabla agenda_closed_days: %v", err)
		return
	}
	log.Println("citas: tabla agenda_closed_days lista")
}
