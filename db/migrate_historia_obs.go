package db

import (
	"encoding/json"
	"log"
	"math"
	"strings"
)

// Historia clínica: campo de OBSERVACIONES (3 renglones).
//
// Se agrega UNA sola vez a las plantillas de historia clínica (kind = ”)
// que todavía no tengan un campo "observaciones": queda debajo de lo que
// ya tiene la hoja, a todo lo ancho. Si después lo mueven o lo borran en
// Plantilla de examen, no se vuelve a poner.
func EnsureHistoriaObservaciones() {
	var done string
	_ = DB.QueryRow("SELECT v FROM caja_config WHERE k = 'seed_hc_observaciones'").Scan(&done)
	if done == "1" {
		return
	}
	rows, err := DB.Query("SELECT id, canvas_h, elements FROM exam_templates WHERE kind = ''")
	if err != nil {
		log.Printf("historia clínica: observaciones: %v", err)
		return
	}
	type tpl struct {
		id      int64
		canvasH int
		raw     string
	}
	var list []tpl
	for rows.Next() {
		var t tpl
		if rows.Scan(&t.id, &t.canvasH, &t.raw) == nil {
			list = append(list, t)
		}
	}
	rows.Close()

	for _, t := range list {
		var els []map[string]any
		if json.Unmarshal([]byte(t.raw), &els) != nil || len(els) == 0 {
			continue
		}
		ya := false
		minX, maxRight, maxBottom := math.MaxFloat64, 0.0, 0.0
		fieldFS, labelFS := map[float64]int{}, map[float64]int{}
		for _, el := range els {
			if k, _ := el["fieldKey"].(string); strings.HasPrefix(strings.ToLower(k), "observaciones") {
				ya = true
			}
			x, _ := el["x"].(float64)
			y, _ := el["y"].(float64)
			w, _ := el["w"].(float64)
			h, _ := el["h"].(float64)
			if typ, _ := el["type"].(string); typ == "image" {
				// el logo no cuenta para el ancho de la hoja
			} else {
				minX = math.Min(minX, x)
				maxRight = math.Max(maxRight, x+w)
			}
			maxBottom = math.Max(maxBottom, y+h)
			if fs, ok := el["fontSize"].(float64); ok && el["type"] == "text" {
				if _, has := el["fieldKey"]; has {
					fieldFS[fs]++
				} else {
					labelFS[fs]++
				}
			}
		}
		if ya || minX == math.MaxFloat64 || maxRight-minX < 200 {
			continue
		}
		top := func(m map[float64]int, def float64) float64 {
			best, n := def, 0
			for k, v := range m {
				if v > n {
					best, n = k, v
				}
			}
			return best
		}
		ffs, lfs := top(fieldFS, 13), top(labelFS, 12)
		y0 := math.Round(maxBottom + 18)
		lblW := 136.0
		els = append(els,
			map[string]any{"id": "st_obs_hc", "type": "text", "x": minX, "y": y0, "w": lblW, "h": 22, "text": "OBSERVACIONES:", "fontSize": lfs, "align": "left"},
			map[string]any{"id": "f_obs_hc1", "type": "text", "x": minX + lblW, "y": y0, "w": maxRight - minX - lblW, "h": 22, "text": "", "fontSize": ffs, "fieldKey": "observaciones"},
			map[string]any{"id": "f_obs_hc2", "type": "text", "x": minX, "y": y0 + 32, "w": maxRight - minX, "h": 22, "text": "", "fontSize": ffs, "fieldKey": "observaciones2"},
			map[string]any{"id": "f_obs_hc3", "type": "text", "x": minX, "y": y0 + 64, "w": maxRight - minX, "h": 22, "text": "", "fontSize": ffs, "fieldKey": "observaciones3"},
		)
		b, err := json.Marshal(els)
		if err != nil {
			continue
		}
		h := t.canvasH
		if need := int(y0+64+22) + 30; need > h {
			h = need
		}
		if _, err := DB.Exec("UPDATE exam_templates SET elements = ?, canvas_h = ? WHERE id = ?", string(b), h, t.id); err != nil {
			log.Printf("historia clínica: observaciones (plantilla %d): %v", t.id, err)
			continue
		}
		log.Printf("historia clínica: plantilla %d — se agregó OBSERVACIONES (3 renglones)", t.id)
	}
	_, _ = DB.Exec("INSERT INTO caja_config (k, v) VALUES ('seed_hc_observaciones', '1') ON DUPLICATE KEY UPDATE v = '1'")
}
