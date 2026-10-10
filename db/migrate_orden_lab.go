package db

import "log"

// Orden de laboratorio (la hoja que se manda al laboratorio):
//   - exam_templates.kind: '' = historia clínica / examen normal,
//     'laboratorio' = la plantilla de la orden. La de laboratorio nunca
//     es "la activa" del examen; se usa después de guardar la historia.
//   - lab_order_sheets: cada orden llenada, ligada a la historia clínica
//     de la que salió (exam_id). Va aparte de eye_exams para que no
//     cuente como examen en las estadísticas ni en el historial.
//   - Siembra la plantilla digitalizada "Orden de laboratorio" si no hay
//     ninguna (después se puede ajustar en Plantilla de examen).

func EnsureOrdenLabTables() {
	if err := addColumnIfMissing("exam_templates", "kind", "VARCHAR(20) NOT NULL DEFAULT ''"); err != nil {
		log.Printf("orden de laboratorio: columna exam_templates.kind: %v", err)
	}
	if _, err := DB.Exec(`CREATE TABLE IF NOT EXISTS lab_order_sheets (
		id              BIGINT AUTO_INCREMENT PRIMARY KEY,
		exam_id         BIGINT NULL,
		template_id     BIGINT NOT NULL,
		patient_name    VARCHAR(160) NOT NULL DEFAULT '',
		patient_phone   VARCHAR(40)  NOT NULL DEFAULT '',
		user_id         BIGINT NULL,
		data            LONGTEXT NOT NULL,
		created_by_role VARCHAR(30)  NOT NULL DEFAULT '',
		created_by_id   BIGINT NOT NULL DEFAULT 0,
		created_by_name VARCHAR(120) NOT NULL DEFAULT '',
		created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_lab_order_sheets_exam (exam_id),
		INDEX idx_lab_order_sheets_created (created_at)
	) DEFAULT CHARSET=utf8mb4`); err != nil {
		log.Printf("orden de laboratorio: tabla lab_order_sheets: %v", err)
		return
	}

	var n int
	if err := DB.QueryRow("SELECT COUNT(*) FROM exam_templates WHERE kind = 'laboratorio'").Scan(&n); err != nil {
		log.Printf("orden de laboratorio: revisar plantilla: %v", err)
		return
	}
	if n == 0 {
		if _, err := DB.Exec(
			"INSERT INTO exam_templates (name, canvas_w, canvas_h, elements, is_active, kind) VALUES (?, 816, 1056, ?, FALSE, 'laboratorio')",
			"Orden de laboratorio", ordenLabElements,
		); err != nil {
			log.Printf("orden de laboratorio: sembrar plantilla: %v", err)
			return
		}
		log.Println("orden de laboratorio: plantilla sembrada")
	}
	log.Println("orden de laboratorio: tablas listas")
}

// Plantilla digitalizada de la hoja de laboratorio de Avante Optics de
// Hermosillo (816×1056, mismo formato que arma Plantilla de examen).
// Los campos tipo "choice" son las opciones que en el papel se encierran
// (FRAME, CUT/UNCUT, material, tipo de lente, TINT).
const ordenLabElements = `[{"id": "lg", "type": "image", "x": 60, "y": 34, "w": 64, "h": 64, "src": "/static/images/avante-logo.png"}, {"id": "tt", "type": "title", "x": 136, "y": 40, "w": 360, "h": 30, "text": "AVANTE OPTICS DE HERMOSILLO", "fontSize": 21, "align": "left"}, {"id": "st_sub", "type": "text", "x": 136, "y": 72, "w": 240, "h": 20, "text": "ORDEN DE LABORATORIO", "fontSize": 12, "align": "left"}, {"id": "st_folio", "type": "text", "x": 60, "y": 112, "w": 34, "h": 22, "text": "Nº", "fontSize": 15, "align": "left"}, {"id": "f_folio", "type": "text", "x": 94, "y": 112, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "folio"}, {"id": "st_no", "type": "text", "x": 520, "y": 44, "w": 52, "h": 22, "text": "No.:", "fontSize": 13, "align": "left"}, {"id": "f_no", "type": "text", "x": 572, "y": 44, "w": 184, "h": 22, "text": "", "fontSize": 13, "fieldKey": "no_orden"}, {"id": "st_date", "type": "text", "x": 520, "y": 78, "w": 52, "h": 22, "text": "Date:", "fontSize": 13, "align": "left"}, {"id": "f_fecha", "type": "text", "x": 572, "y": 78, "w": 184, "h": 22, "text": "", "fontSize": 13, "fieldKey": "fecha"}, {"id": "st_acc", "type": "text", "x": 60, "y": 152, "w": 90, "h": 22, "text": "Account:", "fontSize": 13, "align": "left"}, {"id": "f_acc", "type": "text", "x": 150, "y": 152, "w": 606, "h": 22, "text": "", "fontSize": 13, "fieldKey": "cuenta"}, {"id": "st_pat", "type": "text", "x": 60, "y": 184, "w": 90, "h": 22, "text": "Patient:", "fontSize": 13, "align": "left"}, {"id": "f_pat", "type": "text", "x": 150, "y": 184, "w": 606, "h": 22, "text": "", "fontSize": 13, "fieldKey": "nombre"}, {"id": "st_si", "type": "text", "x": 60, "y": 216, "w": 170, "h": 22, "text": "Special Instructions:", "fontSize": 13, "align": "left"}, {"id": "f_si1", "type": "text", "x": 232, "y": 216, "w": 524, "h": 22, "text": "", "fontSize": 13, "fieldKey": "instrucciones"}, {"id": "f_si2", "type": "text", "x": 60, "y": 248, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "instrucciones2"}, {"id": "f_si3", "type": "text", "x": 60, "y": 280, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "instrucciones3"}, {"id": "rx", "type": "table", "x": 60, "y": 322, "w": 696, "h": 92, "rows": 2, "cols": 5, "headers": ["SPH", "CYL", "AXIS", "PRISM", "BASE"], "rowLabels": ["R", "L"], "cellPrefixes": ["", "", "", "", ""]}, {"id": "add", "type": "table", "x": 60, "y": 428, "w": 560, "h": 92, "rows": 2, "cols": 5, "headers": ["ADD", "SEG HEIGHT", "DECENTRATION", "PD DIST.", "PD NEAR"], "rowLabels": ["R", "L"], "cellPrefixes": ["", "", "", "", ""]}, {"id": "st_tint", "type": "text", "x": 634, "y": 428, "w": 122, "h": 20, "text": "TINT", "fontSize": 13, "align": "center"}, {"id": "c_tint", "type": "choice", "x": 634, "y": 452, "w": 122, "h": 66, "fieldKey": "tinte", "label": "Tint", "options": ["SOLID", "GRADIENT"], "fontSize": 13, "direction": "column"}, {"id": "frame", "type": "table", "x": 60, "y": 534, "w": 420, "h": 62, "rows": 1, "cols": 4, "headers": ["EYE SIZE", "DBL", "B", "ED"], "rowLabels": [""], "cellPrefixes": ["", "", "", ""]}, {"id": "st_frame", "type": "text", "x": 60, "y": 610, "w": 90, "h": 24, "text": "FRAME", "fontSize": 13, "align": "left"}, {"id": "c_frame", "type": "choice", "x": 150, "y": 610, "w": 330, "h": 24, "fieldKey": "armazon", "label": "Frame", "options": ["ZYL", "METAL", "RIMLESS"], "fontSize": 13}, {"id": "st_cut", "type": "text", "x": 60, "y": 644, "w": 90, "h": 24, "text": "LENS", "fontSize": 13, "align": "left"}, {"id": "c_cut", "type": "choice", "x": 150, "y": 644, "w": 330, "h": 24, "fieldKey": "corte", "label": "Cut / Uncut", "options": ["CUT", "UNCUT"], "fontSize": 13}, {"id": "st_mat", "type": "text", "x": 60, "y": 684, "w": 170, "h": 20, "text": "MATERIAL", "fontSize": 12, "align": "left"}, {"id": "c_mat", "type": "choice", "x": 60, "y": 706, "w": 170, "h": 186, "fieldKey": "material", "label": "Material", "options": ["CR-39", "HI-INDEX", "POLYCARB", "TRANSITIONS", "GLASS", "OTHER"], "fontSize": 13, "multi": true, "direction": "column"}, {"id": "st_type", "type": "text", "x": 246, "y": 684, "w": 234, "h": 20, "text": "LENS TYPE", "fontSize": 12, "align": "left"}, {"id": "c_type", "type": "choice", "x": 246, "y": 706, "w": 234, "h": 140, "fieldKey": "tipo_lente", "label": "Lens type", "options": ["FT 25", "FT 28", "FT 35", "7/25", "7/28", "8/35", "EXEC-BI", "EXECTRI", "PROG"], "fontSize": 13}, {"id": "st_other", "type": "text", "x": 246, "y": 860, "w": 64, "h": 22, "text": "OTHER", "fontSize": 13, "align": "left"}, {"id": "f_other", "type": "text", "x": 310, "y": 860, "w": 170, "h": 22, "text": "", "fontSize": 13, "fieldKey": "tipo_otro"}, {"id": "st_p_lenses", "type": "text", "x": 500, "y": 534, "w": 116, "h": 22, "text": "Lenses", "fontSize": 12, "align": "left"}, {"id": "f_p_lenses", "type": "text", "x": 616, "y": 534, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_lenses"}, {"id": "st_p_oversize", "type": "text", "x": 500, "y": 567, "w": 116, "h": 22, "text": "Oversize", "fontSize": 12, "align": "left"}, {"id": "f_p_oversize", "type": "text", "x": 616, "y": 567, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_oversize"}, {"id": "st_p_tint", "type": "text", "x": 500, "y": 600, "w": 116, "h": 22, "text": "Tint", "fontSize": 12, "align": "left"}, {"id": "f_p_tint", "type": "text", "x": 616, "y": 600, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_tint"}, {"id": "st_p_fac_scr", "type": "text", "x": 500, "y": 633, "w": 116, "h": 22, "text": "Fac SCR", "fontSize": 12, "align": "left"}, {"id": "f_p_fac_scr", "type": "text", "x": 616, "y": 633, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_fac_scr"}, {"id": "st_p_coat_uv", "type": "text", "x": 500, "y": 666, "w": 116, "h": 22, "text": "Coat/UV in Lab", "fontSize": 12, "align": "left"}, {"id": "f_p_coat_uv", "type": "text", "x": 616, "y": 666, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_coat_uv"}, {"id": "st_p_prism", "type": "text", "x": 500, "y": 699, "w": 116, "h": 22, "text": "Prism", "fontSize": 12, "align": "left"}, {"id": "f_p_prism", "type": "text", "x": 616, "y": 699, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_prism"}, {"id": "st_p_power", "type": "text", "x": 500, "y": 732, "w": 116, "h": 22, "text": "Power", "fontSize": 12, "align": "left"}, {"id": "f_p_power", "type": "text", "x": 616, "y": 732, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_power"}, {"id": "st_p_ar", "type": "text", "x": 500, "y": 765, "w": 116, "h": 22, "text": "AR Coat", "fontSize": 12, "align": "left"}, {"id": "f_p_ar", "type": "text", "x": 616, "y": 765, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_ar"}, {"id": "st_p_shipping", "type": "text", "x": 500, "y": 798, "w": 116, "h": 22, "text": "Shipping", "fontSize": 12, "align": "left"}, {"id": "f_p_shipping", "type": "text", "x": 616, "y": 798, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_shipping"}, {"id": "st_p_other", "type": "text", "x": 500, "y": 831, "w": 116, "h": 22, "text": "Other", "fontSize": 12, "align": "left"}, {"id": "f_p_other", "type": "text", "x": 616, "y": 831, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_other"}, {"id": "st_p_total", "type": "text", "x": 500, "y": 864, "w": 116, "h": 22, "text": "Total", "fontSize": 12, "align": "left"}, {"id": "f_p_total", "type": "text", "x": 616, "y": 864, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_total"}, {"id": "ln_foot", "type": "line", "x": 60, "y": 906, "w": 696, "h": 2}, {"id": "st_foot", "type": "text", "x": 60, "y": 914, "w": 696, "h": 30, "text": "These impact resistant lenses comply with F.D.A. Regulations, However Impact Resistent Lenses are neither unbreakable nor shatter proof.", "fontSize": 9, "align": "left"}]`
