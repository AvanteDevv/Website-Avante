package db

import (
	"encoding/json"
	"log"
	"strings"
)

// Editar documentos de optometría (historia clínica, orden de laboratorio
// y garantía/reparación): quién y cuándo editó por última vez.
//
// También actualiza la plantilla de la ORDEN DE LABORATORIO: la columna de
// la derecha (Lenses, Oversize, Tint, Fac SCR, Coat/UV in Lab, Prism,
// Power, AR Coat, Shipping, Other) eran solo etiquetas; ahora son opciones
// que se encierran al tocarlas (como MATERIAL o LENS TYPE), alineadas con
// su campo de importe. "Total" se queda como etiqueta.
func EnsureDocEditColumns() {
	for _, t := range []string{"eye_exams", "lab_order_sheets"} {
		if err := addColumnIfMissing(t, "updated_at", "DATETIME NULL"); err != nil {
			log.Printf("editar documentos: %s.updated_at: %v", t, err)
		}
		if err := addColumnIfMissing(t, "updated_by_name", "VARCHAR(120) NULL"); err != nil {
			log.Printf("editar documentos: %s.updated_by_name: %v", t, err)
		}
	}
	upgradeLabExtrasColumn()
}

// Etiquetas de la columna de precios que ahora se pueden encerrar.
var labExtrasLabels = []string{"lenses", "oversize", "tint", "fac_scr", "coat_uv", "prism", "power", "ar", "shipping", "other"}

// labExtrasChoice: el elemento nuevo (una opción por renglón, cada 33 px,
// a la misma altura que su campo de importe).
func labExtrasChoice(x, y float64, opts []string, fontSize float64) map[string]any {
	o := make([]any, len(opts))
	for i, v := range opts {
		o[i] = v
	}
	return map[string]any{
		"id": "c_extras", "type": "choice", "x": x, "y": y - 5, "w": 116, "h": float64(len(opts))*33 + 2,
		"fieldKey": "extras", "label": "Lenses / Oversize / Tint…", "options": o,
		"fontSize": fontSize, "multi": true, "direction": "column", "pitch": 33,
	}
}

func upgradeLabExtrasColumn() {
	rows, err := DB.Query("SELECT id, elements FROM exam_templates WHERE kind = 'laboratorio'")
	if err != nil {
		log.Printf("orden de laboratorio: revisar columna de extras: %v", err)
		return
	}
	type tpl struct {
		id  int64
		raw string
	}
	var list []tpl
	for rows.Next() {
		var t tpl
		if rows.Scan(&t.id, &t.raw) == nil {
			list = append(list, t)
		}
	}
	rows.Close()
	for _, t := range list {
		if strings.Contains(t.raw, `"c_extras"`) {
			continue // ya está
		}
		var els []map[string]any
		if json.Unmarshal([]byte(t.raw), &els) != nil {
			continue
		}
		// Busca las etiquetas viejas (st_p_lenses … st_p_other) en el orden del papel.
		var found []map[string]any
		idx := map[string]bool{}
		for _, key := range labExtrasLabels {
			for _, el := range els {
				if el["id"] == "st_p_"+key && el["type"] == "text" {
					found = append(found, el)
					idx["st_p_"+key] = true
				}
			}
		}
		if len(found) < 2 {
			continue // la plantilla se modificó a mano: no se toca
		}
		opts := make([]string, 0, len(found))
		for _, el := range found {
			s, _ := el["text"].(string)
			opts = append(opts, s)
		}
		x, _ := found[0]["x"].(float64)
		y, _ := found[0]["y"].(float64)
		fs, _ := found[0]["fontSize"].(float64)
		if fs == 0 {
			fs = 12
		}
		out := make([]map[string]any, 0, len(els))
		inserted := false
		for _, el := range els {
			id, _ := el["id"].(string)
			if idx[id] {
				if !inserted {
					out = append(out, labExtrasChoice(x, y, opts, fs))
					inserted = true
				}
				continue
			}
			out = append(out, el)
		}
		b, err := json.Marshal(out)
		if err != nil {
			continue
		}
		if _, err := DB.Exec("UPDATE exam_templates SET elements = ? WHERE id = ?", string(b), t.id); err != nil {
			log.Printf("orden de laboratorio: actualizar columna de extras (plantilla %d): %v", t.id, err)
			continue
		}
		log.Printf("orden de laboratorio: plantilla %d — la columna Lenses/Oversize/… ahora se puede encerrar", t.id)
	}
}
