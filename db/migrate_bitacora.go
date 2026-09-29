package db

import "log"

// EnsureActivityTable crea (si no existe) la tabla de la bitácora del
// staff. Se llama una vez al arrancar, justo después de Connect() en
// main.go — así no hay que correr SQL a mano en Railway.
//
// Es seguro en cada arranque: CREATE TABLE IF NOT EXISTS no toca la
// tabla si ya existe ni borra datos.
func EnsureActivityTable() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS staff_activity_log (
		id          BIGINT AUTO_INCREMENT PRIMARY KEY,
		staff_role  VARCHAR(32)  NOT NULL,
		staff_id    BIGINT       NOT NULL,
		staff_name  VARCHAR(120) NOT NULL DEFAULT '',
		kind        VARCHAR(16)  NOT NULL,
		action      VARCHAR(64)  NOT NULL DEFAULT '',
		description VARCHAR(500) NOT NULL,
		context     VARCHAR(300) NOT NULL DEFAULT '',
		page        VARCHAR(255) NOT NULL DEFAULT '',
		method      VARCHAR(8)   NOT NULL DEFAULT '',
		path        VARCHAR(255) NOT NULL DEFAULT '',
		status_code SMALLINT     NOT NULL DEFAULT 0,
		details     TEXT         NULL,
		ip          VARCHAR(45)  NOT NULL DEFAULT '',
		user_agent  VARCHAR(255) NOT NULL DEFAULT '',
		created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		INDEX idx_activity_created (created_at),
		INDEX idx_activity_staff (staff_role, staff_id, created_at),
		INDEX idx_activity_kind (kind, created_at)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("bitacora: no se pudo crear la tabla staff_activity_log: %v", err)
		return
	}
	log.Println("bitacora: tabla staff_activity_log lista")
}