package handlers

import "avante-optics/db"

// ActiveAdImage regresa la URL (/media/ads/<archivo>) del anuncio que está
// vigente ahora mismo para esa posición ("main" | "side1" | "side2"), o ""
// si no hay ninguno activo en este momento (para que el template pueda
// mostrar un placeholder o esconder ese slot).
func ActiveAdImage(position string) string {
	var key string
	err := db.DB.QueryRow(`
		SELECT image_key FROM ads
		WHERE position = ? AND start_at <= NOW() AND end_at >= NOW()
		ORDER BY start_at DESC
		LIMIT 1
	`, position).Scan(&key)
	if err != nil || key == "" {
		return ""
	}
	return "/media/ads/" + key
}
