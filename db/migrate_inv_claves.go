package db

import "log"

// EnsureInvClavesPromo prepara lo del inventario para la clave automática
// de armazones y los precios / promociones por grupo:
//
//   - inv_colores.codigo: el código de 2 dígitos del "Catálogo de colores"
//     de la tienda (Negro 01, Café 02…; en la hoja vienen como 0001). Es la
//     última parte de la clave (ARZL-GUE-2702-07). El catálogo se carga UNA
//     vez (marca seed_colores_codigo en caja_config); los colores que no
//     están en él reciben el siguiente código libre (28, 29…), cada arranque.
//   - inv_materiales.identificador: ARMT (metal) o ARZL (pasta), la primera
//     parte de la clave; se elige al crear el material.
//   - inventory_items.marca: la marca del armazón (3 primeras letras en la
//     clave).
//   - inventory_items.promo_pct: % de descuento de promoción; el Punto de
//     venta lo pone solo al agregar el artículo a la venta.
//   - inv_reglas: "mismo precio" o "promoción" para una categoría o un
//     material que también se aplica a los artículos que se den de alta
//     después.
func EnsureInvClavesPromo() {
	if err := addColumnIfMissing("inv_colores", "codigo", "VARCHAR(4) NOT NULL DEFAULT '' AFTER hex"); err != nil {
		log.Printf("inventario: no se pudo agregar inv_colores.codigo: %v", err)
		return
	}
	if err := addColumnIfMissing("inventory_items", "promo_pct", "DECIMAL(5,2) NOT NULL DEFAULT 0"); err != nil {
		log.Printf("inventario: no se pudo agregar inventory_items.promo_pct: %v", err)
	}
	if err := addColumnIfMissing("inventory_items", "marca", "VARCHAR(60) NOT NULL DEFAULT '' AFTER descripcion"); err != nil {
		log.Printf("inventario: no se pudo agregar inventory_items.marca: %v", err)
	}
	if err := addColumnIfMissing("inv_materiales", "identificador", "VARCHAR(4) NOT NULL DEFAULT ''"); err != nil {
		log.Printf("inventario: no se pudo agregar inv_materiales.identificador: %v", err)
	}
	// Materiales que ya estaban: los metálicos son ARMT, los demás ARZL.
	_, _ = DB.Exec(`UPDATE inv_materiales SET identificador =
		CASE WHEN LOWER(nombre) REGEXP 'metal|titan|acero|alumin|inox|monel|memoria' THEN 'ARMT' ELSE 'ARZL' END
		WHERE identificador = ''`)
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS inv_reglas (
		id         BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
		tipo       VARCHAR(10)   NOT NULL,
		campo      VARCHAR(12)   NOT NULL,
		valor      VARCHAR(60)   NOT NULL,
		monto      DECIMAL(10,2) NOT NULL DEFAULT 0,
		usuario    VARCHAR(120)  NOT NULL DEFAULT '',
		created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uq_inv_regla (tipo, campo, valor)
	) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`); err != nil {
		log.Printf("inventario: no se pudo crear inv_reglas: %v", err)
	}

	var done string
	_ = DB.QueryRow("SELECT v FROM caja_config WHERE k = 'seed_colores_codigo'").Scan(&done)
	if done != "1" {
		seedColorCatalog()
		_, _ = DB.Exec("INSERT INTO caja_config (k, v) VALUES ('seed_colores_codigo', '1') ON DUPLICATE KEY UPDATE v = '1'")
	}
	twoDigitColorCodes()
	fillColorCodes()
	log.Println("inventario: códigos de color, promociones y reglas listos")
}

// Catálogo de colores de la tienda (hoja impresa). alias = cómo se llamaba
// ese color en la paleta antes (Dorado = Oro, Plateado = Plata): se le pone
// el código al que ya existe en vez de duplicarlo.
var colorCatalog = []struct {
	codigo, nombre, hex string
	alias               []string
}{
	{"01", "Negro", "#1c1c22", nil},
	{"02", "Café", "#7a5230", nil},
	{"03", "Oro", "#c9a24b", []string{"Dorado"}},
	{"04", "Plata", "#b8bcc6", []string{"Plateado"}},
	{"05", "Gris", "#7d8290", nil},
	{"06", "Azul", "#1d4ed8", nil},
	{"07", "Rojo", "#c62828", nil},
	{"08", "Craquelado", "#8c7b66", nil},
	{"09", "Carey", "#6e4a2a", nil},
	{"10", "Metal", "#9ea3ab", nil},
	{"11", "Verde", "#2e7d4f", nil},
	{"12", "Varios", "#9b8fd1", nil},
	{"13", "Violeta", "#7f4fc9", nil},
	{"14", "Miel", "#c98a2b", nil},
	{"15", "Vino", "#7b1f3a", nil},
	{"16", "Amarillo", "#e3b505", nil},
	{"17", "Naranja", "#e3742a", nil},
	{"18", "Blanco", "#f4f4f2", nil},
	{"19", "Rosa", "#e88aa8", nil},
	{"20", "Bronce", "#a8703a", nil},
	{"21", "Cobre", "#b8653a", nil},
	{"22", "Perla", "#ece6da", nil},
	{"23", "Morado", "#6b3fa0", nil},
	{"24", "Turquesa", "#1fb5ad", nil},
	{"25", "Verde G15", "#4f5a3a", nil},
	{"26", "Lila", "#c3a6e0", nil},
	{"27", "Transparente", "#dfe8f3", []string{"Tranparente"}},
}

func seedColorCatalog() {
	var orden int
	_ = DB.QueryRow(`SELECT COALESCE(MAX(orden), 0) FROM inv_colores`).Scan(&orden)
	for _, c := range colorCatalog {
		names := append([]string{c.nombre}, c.alias...)
		var id int64
		for _, n := range names {
			if err := DB.QueryRow(`SELECT id FROM inv_colores WHERE LOWER(nombre) = LOWER(?) LIMIT 1`, n).Scan(&id); err == nil {
				break
			}
		}
		if id > 0 {
			_, _ = DB.Exec(`UPDATE inv_colores SET codigo = ? WHERE id = ?`, c.codigo, id)
			continue
		}
		orden++
		if _, err := DB.Exec(`INSERT INTO inv_colores (nombre, hex, codigo, orden) VALUES (?, ?, ?, ?)`, c.nombre, c.hex, c.codigo, orden); err != nil {
			log.Printf("inventario: no se pudo agregar el color %s: %v", c.nombre, err)
		}
	}
}

// twoDigitColorCodes: los códigos de color pasaron de 4 dígitos (0007) a 2
// (07). Se recortan los que ya estaban y, una sola vez, también las claves
// de armazón que ya se habían armado con 4 (ARZL-GUE-2702-0007 → …-07).
func twoDigitColorCodes() {
	_, _ = DB.Exec(`UPDATE inv_colores SET codigo = LPAD(CAST(codigo AS UNSIGNED), 2, '0')
		WHERE LENGTH(codigo) = 4 AND CAST(codigo AS UNSIGNED) < 100`)
	var done string
	_ = DB.QueryRow("SELECT v FROM caja_config WHERE k = 'clave_color_2dig'").Scan(&done)
	if done == "1" {
		return
	}
	rows, err := DB.Query(`SELECT id, clave FROM inventory_items WHERE clave REGEXP '^(ARMT|ARZL)-[A-Z0-9]{3}-[A-Z0-9.]+-00[0-9]{2}$'`)
	if err != nil {
		return
	}
	type fix struct {
		id    int64
		clave string
	}
	var list []fix
	for rows.Next() {
		var f fix
		if rows.Scan(&f.id, &f.clave) == nil {
			list = append(list, f)
		}
	}
	rows.Close()
	for _, f := range list {
		nueva := f.clave[:len(f.clave)-4] + f.clave[len(f.clave)-2:]
		// Si ya hay otro artículo con la clave corta, se deja como estaba.
		if _, err := DB.Exec(`UPDATE inventory_items SET clave = ? WHERE id = ?`, nueva, f.id); err != nil {
			log.Printf("inventario: no se pudo acortar la clave %s: %v", f.clave, err)
		}
	}
	_, _ = DB.Exec("INSERT INTO caja_config (k, v) VALUES ('clave_color_2dig', '1') ON DUPLICATE KEY UPDATE v = '1'")
}

// fillColorCodes le da el siguiente código libre a los colores sin código
// (los que no están en el catálogo impreso: Azul marino, Nude…).
func fillColorCodes() {
	rows, err := DB.Query(`SELECT id FROM inv_colores WHERE codigo = '' ORDER BY orden, id`)
	if err != nil {
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	for _, id := range ids {
		code := NextColorCode()
		if code == "" {
			return
		}
		_, _ = DB.Exec(`UPDATE inv_colores SET codigo = ? WHERE id = ?`, code, id)
	}
}

// NextColorCode: el siguiente código de color libre ("28"…; de 100 en
// adelante ya son 3 dígitos).
func NextColorCode() string {
	var max int
	if err := DB.QueryRow(`SELECT COALESCE(MAX(CAST(codigo AS UNSIGNED)), 0) FROM inv_colores WHERE codigo <> ''`).Scan(&max); err != nil {
		return ""
	}
	n := max + 1
	if n < 28 {
		n = 28
	}
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
