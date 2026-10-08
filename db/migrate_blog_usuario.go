package db

import "log"

// EnsureBlogUsersTable crea la tabla de las cuentas del Blog (cada rol de
// staff tiene su tabla, igual que inventory_users) y, si todavía no
// existe, la cuenta inicial:
//
//	correo:     blogger@avanteoptics.mx
//	contraseña: la que se acordó (aquí solo va su hash bcrypt, nunca el
//	            texto). Si después se cambia en la base, esto ya no la toca.
//
// Esa cuenta entra por el mismo login de staff y solo ve Blog.
// Se llama al arrancar; no borra ni cambia cuentas existentes.
func EnsureBlogUsersTable() {
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS blog_users (
		id            BIGINT AUTO_INCREMENT PRIMARY KEY,
		name          VARCHAR(120) NOT NULL,
		email         VARCHAR(190) NOT NULL,
		password_hash VARCHAR(255) NOT NULL,
		created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_blog_users_email (email)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("blog: no se pudo crear la tabla blog_users: %v", err)
		return
	}
	const (
		email = "blogger@avanteoptics.mx"
		hash  = "$2a$10$lyMFzqsPHWp2AcPzXlLCSeu.Tj.2WcM3wlA/e6oTtbuCiUylX4M7q"
	)
	res, err := DB.Exec("INSERT IGNORE INTO blog_users (name, email, password_hash) VALUES (?, ?, ?)", "Blog", email, hash)
	if err != nil {
		log.Printf("blog: no se pudo crear la cuenta %s: %v", email, err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("blog: cuenta %s creada", email)
	}
}
