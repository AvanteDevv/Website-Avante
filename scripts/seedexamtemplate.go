package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/joho/godotenv"

	"avante-optics/db"
	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida
// con el nombre del módulo en tu go.mod (primera línea: "module xxxxx").
//
// Script de un solo uso: crea la plantilla "Historia clínica" —
// réplica del formato de papel que ya usan en la óptica — y la deja
// activada de una vez, para no tener que armar ~35 elementos a mano
// en el editor visual.
//
// Uso (parado en la raíz del repo, donde está tu main.go / go.mod):
//
//	go run scripts/seedexamtemplate.go
//
// Contra Railway sin copiar credenciales a mano:
//
//	railway run go run scripts/seedexamtemplate.go
//
// Corriéndolo dos veces crea una plantilla duplicada (no hay
// restricción de nombre único) — si eso pasa, entra a
// /optometrist/plantilla-examen y borra la que sobre desde la lista
// de la izquierda.
//
// El logo queda apuntando a /static/images/avante-logo.png (la misma
// ruta que ya usa tu navbar público) — si esa imagen no existe todavía
// en esa ruta exacta, el logo simplemente no se va a ver hasta que la
// subas ahí, pero el resto de la plantilla funciona igual.

type element struct {
	ID            string   `json:"id"`
	Type          string   `json:"type"`
	X             int      `json:"x"`
	Y             int      `json:"y"`
	W             int      `json:"w"`
	H             int      `json:"h"`
	Text          string   `json:"text,omitempty"`
	FontSize      int      `json:"fontSize,omitempty"`
	FieldKey      string   `json:"fieldKey,omitempty"`
	Src           string   `json:"src,omitempty"`
	Headers       []string `json:"headers,omitempty"`
	RowLabels     []string `json:"rowLabels,omitempty"`
	CellPrefixes  []string `json:"cellPrefixes,omitempty"`
	Rows          int      `json:"rows,omitempty"`
	Cols          int      `json:"cols,omitempty"`
}

func label(id string, x, y, w, h, fontSize int, text string) element {
	return element{ID: id, Type: "text", X: x, Y: y, W: w, H: h, FontSize: fontSize, Text: text}
}
func field(id string, x, y, w, h, fontSize int, fieldKey string) element {
	return element{ID: id, Type: "text", X: x, Y: y, W: w, H: h, FontSize: fontSize, FieldKey: fieldKey}
}
func title(id string, x, y, w, h, fontSize int, text string) element {
	return element{ID: id, Type: "title", X: x, Y: y, W: w, H: h, FontSize: fontSize, Text: text}
}
func table(id string, x, y, w, h, rows, cols int, rowLabels []string, headers ...string) element {
	return element{ID: id, Type: "table", X: x, Y: y, W: w, H: h, Rows: rows, Cols: cols, Headers: headers, RowLabels: rowLabels}
}
func tableWithPrefixes(id string, x, y, w, h, rows, cols int, rowLabels, cellPrefixes []string, headers ...string) element {
	return element{ID: id, Type: "table", X: x, Y: y, W: w, H: h, Rows: rows, Cols: cols, Headers: headers, RowLabels: rowLabels, CellPrefixes: cellPrefixes}
}

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}
	db.Connect()
	defer db.DB.Close()

	els := []element{
		{ID: "logo", Type: "image", X: 40, Y: 30, W: 70, H: 70, Src: "/static/images/avante-logo.png"},
		title("titulo", 160, 40, 420, 36, 26, "HISTORIA CLÍNICA"),

		label("l_fecha", 160, 92, 55, 22, 12, "FECHA"),
		field("f_fecha", 220, 92, 145, 22, 12, "fecha"),
		label("l_tel", 380, 92, 40, 22, 12, "TEL"),
		field("f_tel", 425, 92, 175, 22, 12, "telefono"),

		label("l_nombre", 40, 127, 75, 22, 12, "NOMBRE"),
		field("f_nombre", 120, 127, 650, 22, 12, "nombre"),

		label("l_molestias", 40, 157, 165, 22, 12, "MOLESTIAS OCULARES"),
		field("f_molestias", 210, 157, 560, 22, 12, "molestias_oculares"),

		label("l_dolor", 40, 184, 145, 22, 12, "DOLOR DE CABEZA"),
		field("f_dolor", 190, 184, 130, 22, 12, "dolor_cabeza"),
		label("l_cuando", 330, 184, 70, 22, 12, "CUANDO"),
		field("f_cuando", 405, 184, 365, 22, 12, "cuando"),

		label("l_lloran", 40, 211, 155, 22, 12, "SUS OJOS LE LLORAN"),
		field("f_lloran", 200, 211, 190, 22, 12, "ojos_lloran"),
		label("l_arden", 400, 211, 75, 22, 12, "LE ARDEN"),
		field("f_arden", 480, 211, 290, 22, 12, "ojos_arden"),

		label("l_comezon", 40, 238, 80, 22, 12, "COMEZON"),
		field("f_comezon", 125, 238, 140, 22, 12, "comezon"),
		label("l_legana", 280, 238, 65, 22, 12, "LEGAÑA"),
		field("f_legana", 350, 238, 130, 22, 12, "legana"),
		label("l_luz", 495, 238, 165, 22, 12, "MOLESTIAS A LA LUZ"),
		field("f_luz", 665, 238, 115, 22, 12, "molestias_luz"),

		label("l_solar", 40, 265, 160, 22, 12, "SOLAR O ARTIFICIAL"),
		field("f_solar", 205, 265, 300, 22, 12, "solar_artificial"),

		label("l_enfermedades", 40, 293, 310, 22, 10, "ENFERMEDADES QUE PADEZCA QUE PUEDAN AFECTAR SU VISTA"),
		field("f_enfermedades", 360, 293, 420, 22, 12, "enfermedades"),

		label("l_ultimo", 40, 321, 290, 22, 10, "HACE CUANTO SE HIZO EL ULTIMO EXAMEN DE LA VISTA"),
		field("f_ultimo", 340, 321, 440, 22, 12, "ultimo_examen"),
		label("l_recomendaron", 40, 347, 170, 22, 12, "QUE LE RECOMENDARON"),
		field("f_recomendaron", 215, 347, 565, 22, 12, "recomendaron"),

		label("l_resultados", 40, 386, 175, 22, 12, "QUE RESULTADOS OBTUVO"),
		field("f_resultados", 220, 386, 430, 22, 12, "resultados"),
		label("l_edad", 660, 386, 45, 22, 12, "EDAD"),
		field("f_edad", 710, 386, 70, 22, 12, "edad"),

		label("l_ocupacion", 40, 413, 90, 22, 12, "OCUPACIÓN"),
		field("f_ocupacion", 135, 413, 250, 22, 12, "ocupacion"),
		label("l_pasatiempo", 400, 413, 100, 22, 12, "PASATIEMPO"),
		field("f_pasatiempo", 505, 413, 275, 22, 12, "pasatiempo"),

		title("t_agudeza", 300, 448, 220, 24, 16, "AGUDEZA VISUAL"),
		tableWithPrefixes("tb_agudeza", 40, 478, 380, 100, 3, 3, []string{"OD", "OI", "AO"}, []string{"20/", "20/", "20/"}, "S/C", "A/E", "C/C"),
		table("tb_queratometria", 440, 478, 340, 100, 3, 1, []string{"OD", "OI", "OBS"}, "Queratometría"),

		title("t_rxant", 340, 596, 160, 22, 15, "RX ANTERIOR"),
		table("tb_rxant", 40, 622, 740, 75, 2, 6, []string{"OD", "OI"}, "ESF", "CIL", "EJE", "ADD", "DI", "OBSERVACIONES"),

		title("t_rxact", 345, 715, 150, 22, 15, "RX ACTUAL"),
		table("tb_rxact", 40, 741, 740, 75, 2, 7, []string{"OD", "OI"}, "ESF", "CIL", "EJE", "ADD", "DI", "ALT/OBL", "AV"),

		title("t_rxlc", 290, 834, 260, 22, 15, "RX DE LENTE DE CONTACTO"),
		table("tb_rxlc", 40, 860, 740, 75, 2, 6, []string{"OD", "OI"}, "ESF", "CIL", "EJE", "C.B.", "DIAM", "TIPO L/C"),

		label("l_diagnostico", 40, 953, 155, 22, 12, "DIAGNOSTICO/OBS:"),
		field("f_diagnostico", 200, 953, 580, 22, 12, "diagnostico"),

		label("l_arm", 40, 990, 165, 22, 12, "ARM. RECOMENDADO"),
		field("f_arm", 210, 990, 570, 22, 12, "arm_recomendado"),

		label("l_cristal", 40, 1020, 140, 22, 12, "TIPO DE CRISTAL"),
		field("f_cristal", 185, 1020, 595, 22, 12, "tipo_cristal"),
	}

	elementsJSON, err := json.Marshal(els)
	if err != nil {
		log.Fatalf("Error armando el JSON de elementos: %v", err)
	}

	t, err := models.CreateExamTemplate("Historia clínica — Avante Optics", 816, 1056, elementsJSON)
	if err != nil {
		log.Fatalf("Error creando la plantilla: %v", err)
	}

	if err := models.SetActiveExamTemplate(t.ID); err != nil {
		log.Fatalf("La plantilla se creó (id=%d) pero no se pudo activar: %v", t.ID, err)
	}

	fmt.Printf("Plantilla \"%s\" creada y activada ✓  id=%d\n", t.Name, t.ID)
	fmt.Println("Entra a /optometrist/plantilla-examen para subir el logo real y ajustar lo que haga falta.")
}