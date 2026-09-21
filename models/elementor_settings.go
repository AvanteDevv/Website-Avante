package models

// ⚠️ Ajusta "avante-optics" en el import de abajo para que coincida con
// el nombre del módulo en tu go.mod (mismo criterio que carousel.go).
//
// Este archivo persiste TODO lo que edita el panel Elementor salvo el
// carrusel de marcas (que ya vive en carousel.go): los textos y video
// del Hero, botones, redes sociales, FAQ y los toggles de visibilidad
// (navbar / secciones del index).
//
// ⚠️ Requiere estas dos tablas nuevas — no existían antes, créalas con
// tu migrador de siempre:
//
//	CREATE TABLE site_settings (
//	    id                       INTEGER PRIMARY KEY,
//	    titulo                   TEXT NOT NULL DEFAULT '',
//	    titulo_destacado         TEXT NOT NULL DEFAULT '',
//	    subtitulo                TEXT NOT NULL DEFAULT '',
//	    btn_principal_texto      TEXT NOT NULL DEFAULT '',
//	    btn_principal_link       TEXT NOT NULL DEFAULT '',
//	    btn_secundario_texto     TEXT NOT NULL DEFAULT '',
//	    btn_secundario_link      TEXT NOT NULL DEFAULT '',
//	    facebook                 TEXT NOT NULL DEFAULT '',
//	    instagram                TEXT NOT NULL DEFAULT '',
//	    whatsapp                 TEXT NOT NULL DEFAULT '',
//	    video_key                TEXT NOT NULL DEFAULT '',
//	    ocultar_nav_tienda       BOOLEAN NOT NULL DEFAULT 0,
//	    ocultar_seccion_promos   BOOLEAN NOT NULL DEFAULT 0,
//	    ocultar_seccion_anuncios BOOLEAN NOT NULL DEFAULT 0,
//	    ocultar_seccion_tienda   BOOLEAN NOT NULL DEFAULT 0
//	);
//
//	CREATE TABLE faq_items (
//	    id       INTEGER PRIMARY KEY AUTOINCREMENT,
//	    question TEXT NOT NULL,
//	    answer   TEXT NOT NULL,
//	    position INTEGER NOT NULL
//	);
//
// site_settings siempre tiene una sola fila (id=1) — el sitio es de una
// sola tienda, no hace falta más.

import (
	"database/sql"

	"avante-optics/db"
)

// siteSettingsRowID es el id fijo de la única fila de site_settings.
const siteSettingsRowID = 1

// ElementorSettings agrupa el contenido editable del Hero de index.html
// más los toggles de visibilidad de navbar/secciones.
type ElementorSettings struct {
	Titulo             string `json:"titulo"`
	TituloDestacado    string `json:"tituloDestacado"`
	Subtitulo          string `json:"subtitulo"`
	BtnPrincipalTexto  string `json:"btnPrincipalTexto"`
	BtnPrincipalLink   string `json:"btnPrincipalLink"`
	BtnSecundarioTexto string `json:"btnSecundarioTexto"`
	BtnSecundarioLink  string `json:"btnSecundarioLink"`
	Facebook           string `json:"facebook"`
	Instagram          string `json:"instagram"`
	Whatsapp           string `json:"whatsapp"`
	VideoKey           string `json:"videoKey"`
	VideoURL           string `json:"videoUrl"`

	// Visibilidad — navbar
	OcultarNavTienda bool `json:"ocultarNavTienda"`

	// Visibilidad — secciones del index
	OcultarSeccionPromos   bool `json:"ocultarSeccionPromos"`
	OcultarSeccionAnuncios bool `json:"ocultarSeccionAnuncios"`
	OcultarSeccionTienda   bool `json:"ocultarSeccionTienda"`

	FAQ []FaqItem `json:"faq"`
}

// FaqItem es una pregunta de la sección "Preguntas frecuentes" del
// index, en el orden en que debe mostrarse (mismo criterio que
// CarouselLogo: el admin la arma a mano, position guarda el orden).
type FaqItem struct {
	ID       int64  `json:"id"`
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// GetElementorSettings regresa el contenido actual del Hero + toggles,
// para precargar el panel de Elementor y para que main.go (GET "/")
// renderice el index con estos valores. Si todavía no se ha guardado
// nada (site_settings vacía), regresa una struct en ceros sin error,
// para que el caller pueda mostrar los valores de ejemplo que ya trae
// el HTML en vez de tronar.
func GetElementorSettings() (ElementorSettings, error) {
	var s ElementorSettings
	err := db.DB.QueryRow(`
		SELECT titulo, titulo_destacado, subtitulo,
		       btn_principal_texto, btn_principal_link,
		       btn_secundario_texto, btn_secundario_link,
		       facebook, instagram, whatsapp, video_key,
		       ocultar_nav_tienda, ocultar_seccion_promos,
		       ocultar_seccion_anuncios, ocultar_seccion_tienda
		FROM site_settings WHERE id = ?
	`, siteSettingsRowID).Scan(
		&s.Titulo, &s.TituloDestacado, &s.Subtitulo,
		&s.BtnPrincipalTexto, &s.BtnPrincipalLink,
		&s.BtnSecundarioTexto, &s.BtnSecundarioLink,
		&s.Facebook, &s.Instagram, &s.Whatsapp, &s.VideoKey,
		&s.OcultarNavTienda, &s.OcultarSeccionPromos,
		&s.OcultarSeccionAnuncios, &s.OcultarSeccionTienda,
	)
	if err != nil && err != sql.ErrNoRows {
		return ElementorSettings{}, err
	}
	if s.VideoKey != "" {
		s.VideoURL = "/media/hero/" + s.VideoKey
	}

	faq, err := GetFaqItems()
	if err != nil {
		return ElementorSettings{}, err
	}
	s.FAQ = faq
	return s, nil
}

// SaveElementorSettings guarda (upsert) la única fila de site_settings.
// videoKey puede venir vacío para "no tocar el video actual" — el
// caller (handler) decide si sube uno nuevo antes de llamar aquí; si
// sí subió uno, manda el nuevo key y este función lo sobreescribe.
func SaveElementorSettings(s ElementorSettings, videoKey string) error {
	res, err := db.DB.Exec(`
		UPDATE site_settings SET
			titulo = ?, titulo_destacado = ?, subtitulo = ?,
			btn_principal_texto = ?, btn_principal_link = ?,
			btn_secundario_texto = ?, btn_secundario_link = ?,
			facebook = ?, instagram = ?, whatsapp = ?,
			video_key = CASE WHEN ? <> '' THEN ? ELSE video_key END,
			ocultar_nav_tienda = ?, ocultar_seccion_promos = ?,
			ocultar_seccion_anuncios = ?, ocultar_seccion_tienda = ?
		WHERE id = ?
	`,
		s.Titulo, s.TituloDestacado, s.Subtitulo,
		s.BtnPrincipalTexto, s.BtnPrincipalLink,
		s.BtnSecundarioTexto, s.BtnSecundarioLink,
		s.Facebook, s.Instagram, s.Whatsapp,
		videoKey, videoKey,
		s.OcultarNavTienda, s.OcultarSeccionPromos,
		s.OcultarSeccionAnuncios, s.OcultarSeccionTienda,
		siteSettingsRowID,
	)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected > 0 {
		return nil
	}

	// Todavía no existe la fila (primera vez que se guarda Elementor
	// en este sitio) — se inserta con id fijo.
	_, err = db.DB.Exec(`
		INSERT INTO site_settings (
			id, titulo, titulo_destacado, subtitulo,
			btn_principal_texto, btn_principal_link,
			btn_secundario_texto, btn_secundario_link,
			facebook, instagram, whatsapp, video_key,
			ocultar_nav_tienda, ocultar_seccion_promos,
			ocultar_seccion_anuncios, ocultar_seccion_tienda
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		siteSettingsRowID,
		s.Titulo, s.TituloDestacado, s.Subtitulo,
		s.BtnPrincipalTexto, s.BtnPrincipalLink,
		s.BtnSecundarioTexto, s.BtnSecundarioLink,
		s.Facebook, s.Instagram, s.Whatsapp, videoKey,
		s.OcultarNavTienda, s.OcultarSeccionPromos,
		s.OcultarSeccionAnuncios, s.OcultarSeccionTienda,
	)
	return err
}

// CurrentHeroVideoKey regresa el video_key guardado actualmente, para
// que el handler sepa qué borrar del bucket cuando se sube uno nuevo
// (mismo criterio best-effort que ReplaceCarouselLogos con los logos
// que ya no quedaron en la lista). Si todavía no hay fila o no hay
// video guardado, regresa "" sin error.
func CurrentHeroVideoKey() (string, error) {
	var key string
	err := db.DB.QueryRow(`SELECT video_key FROM site_settings WHERE id = ?`, siteSettingsRowID).Scan(&key)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return key, err
}

// GetFaqItems regresa las preguntas frecuentes en el orden guardado.
func GetFaqItems() ([]FaqItem, error) {
	rows, err := db.DB.Query(`SELECT id, question, answer FROM faq_items ORDER BY position ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []FaqItem
	for rows.Next() {
		var f FaqItem
		if err := rows.Scan(&f.ID, &f.Question, &f.Answer); err != nil {
			continue
		}
		items = append(items, f)
	}
	return items, nil
}

// ReplaceFaqItems reemplaza TODA la lista de preguntas frecuentes por
// la nueva, en el orden dado (mismo criterio simple que
// ReplaceCarouselLogos: "lo que mandas ahora sustituye a lo que
// había").
func ReplaceFaqItems(items []FaqItem) error {
	tx, err := db.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM faq_items`); err != nil {
		return err
	}
	for i, item := range items {
		if _, err := tx.Exec(`
			INSERT INTO faq_items (question, answer, position) VALUES (?, ?, ?)
		`, item.Question, item.Answer, i); err != nil {
			return err
		}
	}
	return tx.Commit()
}
