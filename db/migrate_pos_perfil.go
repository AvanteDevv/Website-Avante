package db

import "log"

// EnsurePosClientePerfil agrega a los clientes del Punto de venta los
// datos de su perfil (los mismos de Clarito+): correo, fecha de
// nacimiento, dirección, particular o empresa (y cuál), pasatiempo y
// profesión. La "clave" del cliente ahora es su folio de miembro
// Clarito+ (vacía = no es miembro).
func EnsurePosClientePerfil() {
	cols := []struct{ col, ddl string }{
		{"correo", "VARCHAR(160) NOT NULL DEFAULT ''"},
		{"nacimiento", "VARCHAR(10) NOT NULL DEFAULT ''"},
		{"direccion", "VARCHAR(255) NOT NULL DEFAULT ''"},
		{"tipo", "VARCHAR(10) NOT NULL DEFAULT 'Particular'"},
		{"empresa", "VARCHAR(120) NOT NULL DEFAULT ''"},
		{"pasatiempo", "VARCHAR(120) NOT NULL DEFAULT ''"},
		{"profesion", "VARCHAR(120) NOT NULL DEFAULT ''"},
	}
	for _, c := range cols {
		if err := addColumnIfMissing("pos_clients", c.col, c.ddl); err != nil {
			log.Printf("pos: no se pudo agregar pos_clients.%s: %v", c.col, err)
		}
	}
	// De qué cita vino la venta (para marcar en Citas que compró).
	if err := addColumnIfMissing("pos_sales", "cita_id", "BIGINT NULL"); err != nil {
		log.Printf("pos: no se pudo agregar pos_sales.cita_id: %v", err)
	}
	log.Println("pos: perfil de clientes listo")
}
