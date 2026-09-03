package models

// ⚠️ Ajusta "avante-optics" en el import de abajo para que coincida con
// el nombre del módulo en tu go.mod (mismo criterio que product.go).

import (
	"avante-optics/db"
)

// CarouselLogo es un logo de marca de la franja de scroll infinito de
// index.html (cat-strip / cat-track). A diferencia de BrandLogo (que
// sale del catálogo de productos, ver product.go), esta lista vive en
// su propia tabla porque el admin la arma a mano desde Elementor, en
// el orden que quiera, sin depender de qué productos existan.
type CarouselLogo struct {
	ID      int64  `json:"id"`
	LogoKey string `json:"logoKey"`
	LogoURL string `json:"logoUrl"`
	Brand   string `json:"brand"`
}

// GetCarouselLogos regresa la lista actual, en el orden guardado.
// Se usa tanto para precargar el panel de Elementor como para
// renderizar el cat-strip en la página de inicio (main.go, GET "/").
func GetCarouselLogos() ([]CarouselLogo, error) {
	rows, err := db.DB.Query(`
		SELECT id, logo_key, brand FROM carousel_logos ORDER BY position ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logos []CarouselLogo
	for rows.Next() {
		var l CarouselLogo
		if err := rows.Scan(&l.ID, &l.LogoKey, &l.Brand); err != nil {
			continue
		}
		l.LogoURL = "/media/carrusel/" + l.LogoKey
		logos = append(logos, l)
	}
	return logos, nil
}

// ReplaceCarouselLogos reemplaza TODA la lista por la nueva, en el
// orden dado (mismo criterio simple que ya usan el logo/fotos de
// producto en product.go: "lo que mandas ahora sustituye a lo que
// había"). Regresa los logo_key que YA NO quedaron en la lista nueva,
// para que el caller los borre del bucket.
func ReplaceCarouselLogos(items []CarouselLogo) ([]string, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var oldKeys []string
	oldRows, err := tx.Query(`SELECT logo_key FROM carousel_logos`)
	if err == nil {
		for oldRows.Next() {
			var k string
			if oldRows.Scan(&k) == nil {
				oldKeys = append(oldKeys, k)
			}
		}
		oldRows.Close()
	}

	if _, err := tx.Exec(`DELETE FROM carousel_logos`); err != nil {
		return nil, err
	}

	newKeySet := make(map[string]bool, len(items))
	for i, item := range items {
		if _, err := tx.Exec(`
			INSERT INTO carousel_logos (logo_key, brand, position) VALUES (?, ?, ?)
		`, item.LogoKey, item.Brand, i); err != nil {
			return nil, err
		}
		newKeySet[item.LogoKey] = true
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	var removedKeys []string
	for _, k := range oldKeys {
		if !newKeySet[k] {
			removedKeys = append(removedKeys, k)
		}
	}
	return removedKeys, nil
}

// BrandOfLogoKey regresa la marca (products.brand) dueña de un
// logo_key ya existente en el catálogo. Se usa al reutilizar un logo
// de marca en el carrusel: el form solo manda la key elegida (ver
// SaveCarouselLogos en handlers/admin/carousel.go), no el nombre —
// aquí se resuelve para guardarlo junto con la entrada del carrusel.
func BrandOfLogoKey(logoKey string) (string, error) {
	var brand string
	err := db.DB.QueryRow(`SELECT brand FROM products WHERE logo_key = ? LIMIT 1`, logoKey).Scan(&brand)
	return brand, err
}
