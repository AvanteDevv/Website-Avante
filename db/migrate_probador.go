package db

import "log"

// EnsureProbadorTables crea (si no existe) la tabla de estilos del
// probador virtual (Elementor → Ecommerce). Cada estilo es una categoría
// de armazón (Redondo, Aviador…) con su imagen PNG frontal sin fondo.
// Los 4 de siempre (base = 1) se dibujan con código mientras no tengan
// imagen; los que se agregan después siempre llevan imagen.
func EnsureProbadorTables() {
	_, err := DB.Exec(`CREATE TABLE IF NOT EXISTS tryon_estilos (
		id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
		slug       VARCHAR(60)  NOT NULL,
		nombre     VARCHAR(60)  NOT NULL,
		image_key  VARCHAR(200) NOT NULL DEFAULT '',
		base       TINYINT(1)   NOT NULL DEFAULT 0,
		orden      INT          NOT NULL DEFAULT 0,
		created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_tryon_slug (slug)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`)
	if err != nil {
		log.Printf("probador: no se pudo crear la tabla tryon_estilos: %v", err)
		return
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM tryon_estilos`).Scan(&n); err == nil && n == 0 {
		if _, err := DB.Exec(`INSERT INTO tryon_estilos (slug, nombre, base, orden) VALUES
			('clasico', 'Clásico', 1, 1), ('redondo', 'Redondo', 1, 2),
			('aviador', 'Aviador', 1, 3), ('cateye', 'Cat-eye', 1, 4)`); err != nil {
			log.Printf("probador: no se pudieron crear los estilos iniciales: %v", err)
		}
	}
	log.Println("probador: tabla tryon_estilos lista")
}
