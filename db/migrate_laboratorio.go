package db

import "log"

// EnsureLaboratorioTables prepara lo del panel de Laboratorio:
//   - lab_users: cuentas del laboratorio (cada rol de staff tiene su
//     tabla). Si no existe, se crea la cuenta inicial:
//     correo:     eleazar@avanteoptics.mx
//     contraseña: la que se acordó (aquí solo va su hash bcrypt).
//     Si después se cambia en la base, esto ya no la toca.
//   - orders.inventory_id: el artículo de inventario del trabajo
//     (NULL en los pedidos de la tienda en línea).
//   - orders.lab_notes: notas del laboratorio para ese trabajo.
//   - order_status_history: quién cambió el estado de cada pedido y
//     cuándo (laboratorio o admin).
//
// Se llama al arrancar; no borra ni cambia datos.
func EnsureLaboratorioTables() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS lab_users (
		id            BIGINT AUTO_INCREMENT PRIMARY KEY,
		name          VARCHAR(120) NOT NULL,
		email         VARCHAR(190) NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_lab_users_email (email)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("laboratorio: no se pudo crear la tabla lab_users: %v", err)
	} else {
		const (
			email = "eleazar@avanteoptics.mx"
			hash  = "$2a$10$WvpmWuA5OvVF3sQqXOjOoecmGlTe.vnvCioj4pPvrgCGCm27HqqLC"
		)
		res, err := DB.Exec("INSERT IGNORE INTO lab_users (name, email, password_hash) VALUES (?, ?, ?)", "Eleazar", email, hash)
		if err != nil {
			log.Printf("laboratorio: no se pudo crear la cuenta %s: %v", email, err)
		} else if n, _ := res.RowsAffected(); n > 0 {
			log.Printf("laboratorio: cuenta %s creada", email)
		}
	}

	if err := addColumnIfMissing("orders", "inventory_id", "BIGINT NULL"); err != nil {
		log.Printf("laboratorio: columna orders.inventory_id: %v", err)
	}
	if err := addColumnIfMissing("orders", "lab_notes", "VARCHAR(500) NOT NULL DEFAULT ''"); err != nil {
		log.Printf("laboratorio: columna orders.lab_notes: %v", err)
	}

	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS order_status_history (
		id           BIGINT AUTO_INCREMENT PRIMARY KEY,
		order_id     BIGINT       NOT NULL,
		status       VARCHAR(60)  NOT NULL,
		changed_by   VARCHAR(120) NOT NULL DEFAULT '',
		changed_role VARCHAR(30)  NOT NULL DEFAULT '',
		created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_osh_order (order_id, created_at)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("laboratorio: no se pudo crear order_status_history: %v", err)
		return
	}
	log.Println("laboratorio: lab_users, orders.inventory_id/lab_notes y order_status_history listas")
}
