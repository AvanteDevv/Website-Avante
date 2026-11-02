package db

import "log"

// EnsureInvColoresTable crea la paleta de colores de armazones (Inventario
// → Artículo → General). Es la lista para elegir con muestra; se pueden
// agregar colores nuevos desde el mismo formulario.
func EnsureInvColoresTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inv_colores (
		id     BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
		nombre VARCHAR(30) NOT NULL,
		hex    VARCHAR(7)  NOT NULL DEFAULT '#888888',
		orden  INT         NOT NULL DEFAULT 0,
		UNIQUE KEY uq_inv_color (nombre)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("inventario: no se pudo crear la tabla inv_colores: %v", err)
		return
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM inv_colores`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec(`INSERT INTO inv_colores (nombre, hex, orden) VALUES
			('Negro', '#1c1c22', 1), ('Carey', '#6e4a2a', 2), ('Café', '#7a5230', 3),
			('Dorado', '#c9a24b', 4), ('Plateado', '#b8bcc6', 5), ('Gris', '#7d8290', 6),
			('Blanco', '#f4f4f2', 7), ('Transparente', '#dfe8f3', 8), ('Rojo', '#c62828', 9),
			('Vino', '#7b1f3a', 10), ('Rosa', '#e88aa8', 11), ('Azul', '#1d4ed8', 12),
			('Azul marino', '#1f2a5c', 13), ('Verde', '#2e7d4f', 14), ('Morado', '#6b3fa0', 15),
			('Nude', '#d9b8a0', 16), ('Amarillo', '#e3b505', 17), ('Naranja', '#e3742a', 18)`); err != nil {
			log.Printf("inventario: no se pudo crear la paleta de colores: %v", err)
		}
	}
	log.Println("inventario: tabla inv_colores lista")

	// Materiales de armazón (misma idea que la paleta de colores).
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inv_materiales (
		id     BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
		nombre VARCHAR(30) NOT NULL,
		orden  INT         NOT NULL DEFAULT 0,
		UNIQUE KEY uq_inv_material (nombre)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("inventario: no se pudo crear la tabla inv_materiales: %v", err)
		return
	}
	if err := DB.QueryRow(`SELECT COUNT(*) FROM inv_materiales`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec(`INSERT INTO inv_materiales (nombre, orden) VALUES
			('Metal', 1), ('Acetato', 2), ('Pasta', 3), ('TR90', 4), ('Titanio', 5),
			('Acero inoxidable', 6), ('Aluminio', 7), ('Plástico', 8), ('Policarbonato', 9),
			('Madera', 10), ('Fibra de carbono', 11)`); err != nil {
			log.Printf("inventario: no se pudieron crear los materiales: %v", err)
		}
	}
	log.Println("inventario: tabla inv_materiales lista")
}
