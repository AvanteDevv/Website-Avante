package handlers

import (
	"time"

	"avante-optics/db"
)

// ActiveAdImage regresa la URL (/media/ads/<archivo>) del anuncio que está
// vigente ahora mismo para esa posición ("main" | "side1" | "side2"), o ""
// si no hay ninguno activo en este momento (para que el template pueda
// mostrar un placeholder o esconder ese slot).
//
// Se manda time.Now() como parámetro (en vez de usar NOW() de MySQL) para
// no depender del huso horario configurado en el servidor de base de datos.
func ActiveAdImage(position string) string {
	now := time.Now()
	var key string
	err := db.DB.QueryRow(`
		SELECT image_key FROM ads
		WHERE position = ? AND start_at <= ? AND end_at >= ?
		ORDER BY start_at DESC
		LIMIT 1
	`, position, now, now).Scan(&key)
	if err != nil || key == "" {
		return ""
	}
	return "/media/promos/" + key
}
