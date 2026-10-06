package db

import "log"

// EnsureInventoryUsersTable crea la tabla de las cuentas de Inventario
// (como employees, receptionists… cada rol de staff tiene su tabla) y,
// si todavía no existe, la cuenta inicial:
//
//	correo:     inventario@avanteoptics.mx
//	contraseña: la que se acordó (aquí solo va su hash bcrypt, nunca el
//	            texto). Si después se cambia en la base, esto ya no la toca.
//
// Se llama al arrancar; no borra ni cambia cuentas existentes.
func EnsureInventoryUsersTable() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inventory_users (
		id            BIGINT AUTO_INCREMENT PRIMARY KEY,
		name          VARCHAR(120) NOT NULL,
		email         VARCHAR(190) NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_inventory_users_email (email)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("inventario: no se pudo crear la tabla inventory_users: %v", err)
		return
	}
	const (
		email = "inventario@avanteoptics.mx"
		hash  = "$2a$10$Af2Wljd.FQ2KiKqbjKftn.87sgxn97P9w67ScyGazDB8iDrsutYya"
	)
	res, err := DB.Exec("INSERT IGNORE INTO inventory_users (name, email, password_hash) VALUES (?, ?, ?)", "Inventario", email, hash)
	if err != nil {
		log.Printf("inventario: no se pudo crear la cuenta %s: %v", email, err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("inventario: cuenta %s creada", email)
	}
}
