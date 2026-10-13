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
//   - Garantía (tercer documento): la "Solicitud de reparación"
//     digitalizada, kind = 'garantia'. Se guarda en la misma tabla con
//     lab_order_sheets.kind = 'garantia' (para contar las del mes).

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
	if err := addColumnIfMissing("lab_order_sheets", "kind", "VARCHAR(20) NOT NULL DEFAULT 'laboratorio' AFTER id"); err != nil {
		log.Printf("garantías: columna lab_order_sheets.kind: %v", err)
	}
	seedKindTemplate("garantia", "Garantía / Solicitud de reparación", garantiaElements)

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

// seedKindTemplate crea la plantilla de ese tipo si todavía no hay ninguna.
func seedKindTemplate(kind, name, elements string) {
	var n int
	if err := DB.QueryRow("SELECT COUNT(*) FROM exam_templates WHERE kind = ?", kind).Scan(&n); err != nil {
		log.Printf("plantilla %s: %v", kind, err)
		return
	}
	if n > 0 {
		return
	}
	if _, err := DB.Exec(
		"INSERT INTO exam_templates (name, canvas_w, canvas_h, elements, is_active, kind) VALUES (?, 816, 1056, ?, FALSE, ?)",
		name, elements, kind,
	); err != nil {
		log.Printf("plantilla %s: sembrar: %v", kind, err)
		return
	}
	log.Printf("plantilla %s sembrada", kind)
}

// Plantilla digitalizada de la hoja de laboratorio de Avante Optics de
// Hermosillo (816×1056, mismo formato que arma Plantilla de examen).
// Los campos tipo "choice" son las opciones que en el papel se encierran
// (FRAME, CUT/UNCUT, material, tipo de lente, TINT).
const ordenLabElements = `[{"id": "lg", "type": "image", "x": 60, "y": 34, "w": 64, "h": 64, "src": "/static/images/avante-logo.png"}, {"id": "tt", "type": "title", "x": 136, "y": 40, "w": 360, "h": 30, "text": "AVANTE OPTICS DE HERMOSILLO", "fontSize": 21, "align": "left"}, {"id": "st_sub", "type": "text", "x": 136, "y": 72, "w": 240, "h": 20, "text": "ORDEN DE LABORATORIO", "fontSize": 12, "align": "left"}, {"id": "st_folio", "type": "text", "x": 60, "y": 112, "w": 34, "h": 22, "text": "Nº", "fontSize": 15, "align": "left"}, {"id": "f_folio", "type": "text", "x": 94, "y": 112, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "folio"}, {"id": "st_no", "type": "text", "x": 520, "y": 44, "w": 52, "h": 22, "text": "No.:", "fontSize": 13, "align": "left"}, {"id": "f_no", "type": "text", "x": 572, "y": 44, "w": 184, "h": 22, "text": "", "fontSize": 13, "fieldKey": "no_orden"}, {"id": "st_date", "type": "text", "x": 520, "y": 78, "w": 52, "h": 22, "text": "Date:", "fontSize": 13, "align": "left"}, {"id": "f_fecha", "type": "text", "x": 572, "y": 78, "w": 184, "h": 22, "text": "", "fontSize": 13, "fieldKey": "fecha"}, {"id": "st_acc", "type": "text", "x": 60, "y": 152, "w": 90, "h": 22, "text": "Account:", "fontSize": 13, "align": "left"}, {"id": "f_acc", "type": "text", "x": 150, "y": 152, "w": 606, "h": 22, "text": "", "fontSize": 13, "fieldKey": "cuenta"}, {"id": "st_pat", "type": "text", "x": 60, "y": 184, "w": 90, "h": 22, "text": "Patient:", "fontSize": 13, "align": "left"}, {"id": "f_pat", "type": "text", "x": 150, "y": 184, "w": 606, "h": 22, "text": "", "fontSize": 13, "fieldKey": "nombre"}, {"id": "st_si", "type": "text", "x": 60, "y": 216, "w": 170, "h": 22, "text": "Special Instructions:", "fontSize": 13, "align": "left"}, {"id": "f_si1", "type": "text", "x": 232, "y": 216, "w": 524, "h": 22, "text": "", "fontSize": 13, "fieldKey": "instrucciones"}, {"id": "f_si2", "type": "text", "x": 60, "y": 248, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "instrucciones2"}, {"id": "f_si3", "type": "text", "x": 60, "y": 280, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "instrucciones3"}, {"id": "rx", "type": "table", "x": 60, "y": 322, "w": 696, "h": 92, "rows": 2, "cols": 5, "headers": ["SPH", "CYL", "AXIS", "PRISM", "BASE"], "rowLabels": ["R", "L"], "cellPrefixes": ["", "", "", "", ""]}, {"id": "add", "type": "table", "x": 60, "y": 428, "w": 560, "h": 92, "rows": 2, "cols": 5, "headers": ["ADD", "SEG HEIGHT", "DECENTRATION", "PD DIST.", "PD NEAR"], "rowLabels": ["R", "L"], "cellPrefixes": ["", "", "", "", ""]}, {"id": "st_tint", "type": "text", "x": 634, "y": 428, "w": 122, "h": 20, "text": "TINT", "fontSize": 13, "align": "center"}, {"id": "c_tint", "type": "choice", "x": 634, "y": 452, "w": 122, "h": 66, "fieldKey": "tinte", "label": "Tint", "options": ["SOLID", "GRADIENT"], "fontSize": 13, "direction": "column"}, {"id": "frame", "type": "table", "x": 60, "y": 534, "w": 420, "h": 62, "rows": 1, "cols": 4, "headers": ["EYE SIZE", "DBL", "B", "ED"], "rowLabels": [""], "cellPrefixes": ["", "", "", ""]}, {"id": "st_frame", "type": "text", "x": 60, "y": 610, "w": 90, "h": 24, "text": "FRAME", "fontSize": 13, "align": "left"}, {"id": "c_frame", "type": "choice", "x": 150, "y": 610, "w": 330, "h": 24, "fieldKey": "armazon", "label": "Frame", "options": ["ZYL", "METAL", "RIMLESS"], "fontSize": 13}, {"id": "st_cut", "type": "text", "x": 60, "y": 644, "w": 90, "h": 24, "text": "LENS", "fontSize": 13, "align": "left"}, {"id": "c_cut", "type": "choice", "x": 150, "y": 644, "w": 330, "h": 24, "fieldKey": "corte", "label": "Cut / Uncut", "options": ["CUT", "UNCUT"], "fontSize": 13}, {"id": "st_mat", "type": "text", "x": 60, "y": 684, "w": 170, "h": 20, "text": "MATERIAL", "fontSize": 12, "align": "left"}, {"id": "c_mat", "type": "choice", "x": 60, "y": 706, "w": 170, "h": 186, "fieldKey": "material", "label": "Material", "options": ["CR-39", "HI-INDEX", "POLYCARB", "TRANSITIONS", "GLASS", "OTHER"], "fontSize": 13, "multi": true, "direction": "column"}, {"id": "st_type", "type": "text", "x": 246, "y": 684, "w": 234, "h": 20, "text": "LENS TYPE", "fontSize": 12, "align": "left"}, {"id": "c_type", "type": "choice", "x": 246, "y": 706, "w": 234, "h": 140, "fieldKey": "tipo_lente", "label": "Lens type", "options": ["FT 25", "FT 28", "FT 35", "7/25", "7/28", "8/35", "EXEC-BI", "EXECTRI", "PROG"], "fontSize": 13}, {"id": "st_other", "type": "text", "x": 246, "y": 860, "w": 64, "h": 22, "text": "OTHER", "fontSize": 13, "align": "left"}, {"id": "f_other", "type": "text", "x": 310, "y": 860, "w": 170, "h": 22, "text": "", "fontSize": 13, "fieldKey": "tipo_otro"}, {"id": "st_p_lenses", "type": "text", "x": 500, "y": 534, "w": 116, "h": 22, "text": "Lenses", "fontSize": 12, "align": "left"}, {"id": "f_p_lenses", "type": "text", "x": 616, "y": 534, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_lenses"}, {"id": "st_p_oversize", "type": "text", "x": 500, "y": 567, "w": 116, "h": 22, "text": "Oversize", "fontSize": 12, "align": "left"}, {"id": "f_p_oversize", "type": "text", "x": 616, "y": 567, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_oversize"}, {"id": "st_p_tint", "type": "text", "x": 500, "y": 600, "w": 116, "h": 22, "text": "Tint", "fontSize": 12, "align": "left"}, {"id": "f_p_tint", "type": "text", "x": 616, "y": 600, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_tint"}, {"id": "st_p_fac_scr", "type": "text", "x": 500, "y": 633, "w": 116, "h": 22, "text": "Fac SCR", "fontSize": 12, "align": "left"}, {"id": "f_p_fac_scr", "type": "text", "x": 616, "y": 633, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_fac_scr"}, {"id": "st_p_coat_uv", "type": "text", "x": 500, "y": 666, "w": 116, "h": 22, "text": "Coat/UV in Lab", "fontSize": 12, "align": "left"}, {"id": "f_p_coat_uv", "type": "text", "x": 616, "y": 666, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_coat_uv"}, {"id": "st_p_prism", "type": "text", "x": 500, "y": 699, "w": 116, "h": 22, "text": "Prism", "fontSize": 12, "align": "left"}, {"id": "f_p_prism", "type": "text", "x": 616, "y": 699, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_prism"}, {"id": "st_p_power", "type": "text", "x": 500, "y": 732, "w": 116, "h": 22, "text": "Power", "fontSize": 12, "align": "left"}, {"id": "f_p_power", "type": "text", "x": 616, "y": 732, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_power"}, {"id": "st_p_ar", "type": "text", "x": 500, "y": 765, "w": 116, "h": 22, "text": "AR Coat", "fontSize": 12, "align": "left"}, {"id": "f_p_ar", "type": "text", "x": 616, "y": 765, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_ar"}, {"id": "st_p_shipping", "type": "text", "x": 500, "y": 798, "w": 116, "h": 22, "text": "Shipping", "fontSize": 12, "align": "left"}, {"id": "f_p_shipping", "type": "text", "x": 616, "y": 798, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_shipping"}, {"id": "st_p_other", "type": "text", "x": 500, "y": 831, "w": 116, "h": 22, "text": "Other", "fontSize": 12, "align": "left"}, {"id": "f_p_other", "type": "text", "x": 616, "y": 831, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_other"}, {"id": "st_p_total", "type": "text", "x": 500, "y": 864, "w": 116, "h": 22, "text": "Total", "fontSize": 12, "align": "left"}, {"id": "f_p_total", "type": "text", "x": 616, "y": 864, "w": 140, "h": 22, "text": "", "fontSize": 13, "fieldKey": "p_total"}, {"id": "ln_foot", "type": "line", "x": 60, "y": 906, "w": 696, "h": 2}, {"id": "st_foot", "type": "text", "x": 60, "y": 914, "w": 696, "h": 30, "text": "These impact resistant lenses comply with F.D.A. Regulations, However Impact Resistent Lenses are neither unbreakable nor shatter proof.", "fontSize": 9, "align": "left"}]`

// "Solicitud de reparación" de Avante Optics de Hermosillo, digitalizada.
// A mano le escribían "garantía"; aquí el TIPO se marca (GARANTÍA o
// REPARACIÓN) y las marcadas como GARANTÍA cuentan en el indicador.
const garantiaElements = `[{"id": "lg", "type": "image", "x": 60, "y": 36, "w": 64, "h": 64, "src": "/static/images/avante-logo.png"}, {"id": "tt", "type": "title", "x": 136, "y": 36, "w": 400, "h": 28, "text": "AVANTE OPTICS DE HERMOSILLO", "fontSize": 19, "align": "left"}, {"id": "tt2", "type": "title", "x": 136, "y": 66, "w": 400, "h": 28, "text": "SOLICITUD DE REPARACIÓN", "fontSize": 18, "align": "left"}, {"id": "st_dir1", "type": "text", "x": 136, "y": 98, "w": 420, "h": 16, "text": "LUIS DONALDO COLOSIO No.69 E/ GUERRERO Y GARMENDIA COL. CENTRO", "fontSize": 9, "align": "left"}, {"id": "st_dir2", "type": "text", "x": 136, "y": 114, "w": 420, "h": 16, "text": "C.P. 83000 HERMOSILLO, SONORA  TEL. (662) 213-17-92  ·  avanteopticsdehermosillo@prodigy.net.mx", "fontSize": 9, "align": "left"}, {"id": "st_folio", "type": "text", "x": 588, "y": 40, "w": 34, "h": 22, "text": "Nº", "fontSize": 15, "align": "left"}, {"id": "f_folio", "type": "text", "x": 622, "y": 40, "w": 134, "h": 22, "text": "", "fontSize": 13, "fieldKey": "folio"}, {"id": "st_tipo", "type": "text", "x": 588, "y": 74, "w": 168, "h": 18, "text": "TIPO", "fontSize": 11, "align": "center"}, {"id": "c_tipo", "type": "choice", "x": 588, "y": 94, "w": 168, "h": 46, "fieldKey": "tipo", "label": "Tipo", "options": ["GARANTÍA", "REPARACIÓN"], "fontSize": 13, "direction": "column"}, {"id": "ln1", "type": "line", "x": 60, "y": 148, "w": 696, "h": 2}, {"id": "st_datos", "type": "text", "x": 60, "y": 156, "w": 696, "h": 20, "text": "DATOS DEL CLIENTE", "fontSize": 13, "align": "center"}, {"id": "st_nom", "type": "text", "x": 60, "y": 188, "w": 80, "h": 22, "text": "NOMBRE:", "fontSize": 12, "align": "left"}, {"id": "f_nom", "type": "text", "x": 140, "y": 188, "w": 616, "h": 22, "text": "", "fontSize": 13, "fieldKey": "nombre"}, {"id": "st_dir", "type": "text", "x": 60, "y": 220, "w": 90, "h": 22, "text": "DIRECCIÓN:", "fontSize": 12, "align": "left"}, {"id": "f_dir", "type": "text", "x": 150, "y": 220, "w": 366, "h": 22, "text": "", "fontSize": 13, "fieldKey": "direccion"}, {"id": "st_fecha", "type": "text", "x": 528, "y": 220, "w": 60, "h": 22, "text": "FECHA:", "fontSize": 12, "align": "left"}, {"id": "f_fecha", "type": "text", "x": 588, "y": 220, "w": 168, "h": 22, "text": "", "fontSize": 13, "fieldKey": "fecha"}, {"id": "st_mail", "type": "text", "x": 60, "y": 252, "w": 130, "h": 22, "text": "E-MAIL O CORREO:", "fontSize": 12, "align": "left"}, {"id": "f_mail", "type": "text", "x": 190, "y": 252, "w": 326, "h": 22, "text": "", "fontSize": 13, "fieldKey": "correo"}, {"id": "st_tel", "type": "text", "x": 528, "y": 252, "w": 40, "h": 22, "text": "TEL.:", "fontSize": 12, "align": "left"}, {"id": "f_tel", "type": "text", "x": 568, "y": 252, "w": 188, "h": 22, "text": "", "fontSize": 13, "fieldKey": "telefono"}, {"id": "st_conv", "type": "text", "x": 60, "y": 284, "w": 400, "h": 22, "text": "CLIENTE GENERAL O CONVENIO (NOMBRE DE EMPRESA):", "fontSize": 12, "align": "left"}, {"id": "f_conv", "type": "text", "x": 60, "y": 310, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "convenio"}, {"id": "st_req", "type": "text", "x": 60, "y": 344, "w": 696, "h": 20, "text": "REQUISITO PRESENTAR COMPROBANTE DE COMPRA PARA GARANTÍA", "fontSize": 12, "align": "center"}, {"id": "st_comp", "type": "text", "x": 60, "y": 372, "w": 210, "h": 24, "text": "COMPROBANTE DE COMPRA:", "fontSize": 12, "align": "left"}, {"id": "c_comp", "type": "choice", "x": 270, "y": 372, "w": 330, "h": 24, "fieldKey": "comprobante", "label": "Comprobante de compra", "options": ["PRESENTADO", "NO PRESENTADO"], "fontSize": 13}, {"id": "ln2", "type": "line", "x": 60, "y": 408, "w": 696, "h": 2}, {"id": "st_avante", "type": "text", "x": 60, "y": 416, "w": 696, "h": 20, "text": "PARA SER LLENADO POR AVANTE", "fontSize": 13, "align": "center"}, {"id": "st_rec", "type": "text", "x": 60, "y": 438, "w": 696, "h": 20, "text": "AL RECIBIR SE IDENTIFICAN RAYADURAS O DESPERFECTOS DONDE SE INDICA", "fontSize": 11, "align": "center"}, {"id": "img_lentes", "type": "image", "x": 248, "y": 462, "w": 320, "h": 112, "src": "/static/images/lentes-garantia.svg"}, {"id": "st_desp", "type": "text", "x": 60, "y": 584, "w": 190, "h": 22, "text": "RAYADURAS / DESPERFECTOS:", "fontSize": 12, "align": "left"}, {"id": "f_desp", "type": "text", "x": 250, "y": 584, "w": 506, "h": 22, "text": "", "fontSize": 13, "fieldKey": "desperfectos"}, {"id": "st_serv", "type": "text", "x": 60, "y": 620, "w": 696, "h": 22, "text": "SERVICIO DE REPARACIÓN SOLICITADO Y CARACTERÍSTICAS DEL LENTE:", "fontSize": 12, "align": "left"}, {"id": "f_serv1", "type": "text", "x": 60, "y": 646, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "servicio"}, {"id": "f_serv2", "type": "text", "x": 60, "y": 678, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "servicio2"}, {"id": "f_serv3", "type": "text", "x": 60, "y": 710, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "servicio3"}, {"id": "st_obs", "type": "text", "x": 60, "y": 748, "w": 150, "h": 22, "text": "OBSERVACIONES:", "fontSize": 12, "align": "left"}, {"id": "f_obs1", "type": "text", "x": 60, "y": 778, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "observaciones"}, {"id": "f_obs2", "type": "text", "x": 60, "y": 810, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "observaciones2"}, {"id": "f_obs3", "type": "text", "x": 60, "y": 842, "w": 696, "h": 22, "text": "", "fontSize": 13, "fieldKey": "observaciones3"}, {"id": "st_costo", "type": "text", "x": 528, "y": 748, "w": 70, "h": 22, "text": "COSTO $", "fontSize": 12, "align": "left"}, {"id": "f_costo", "type": "text", "x": 598, "y": 748, "w": 158, "h": 22, "text": "", "fontSize": 13, "fieldKey": "costo"}, {"id": "ln_firma", "type": "line", "x": 60, "y": 926, "w": 320, "h": 2}, {"id": "st_firma", "type": "text", "x": 60, "y": 932, "w": 320, "h": 30, "text": "ENTIENDO, ACEPTO Y ASUMO LOS RIESGOS Y CONDICIONES DE REPARACIÓN", "fontSize": 9, "align": "center"}, {"id": "f_recibido", "type": "text", "x": 436, "y": 902, "w": 320, "h": 22, "text": "", "fontSize": 13, "fieldKey": "recibido_por"}, {"id": "st_recibido", "type": "text", "x": 436, "y": 932, "w": 320, "h": 20, "text": "RECIBIDO EN AVANTE POR", "fontSize": 10, "align": "center"}, {"id": "st_nota", "type": "text", "x": 60, "y": 976, "w": 696, "h": 22, "text": "NOTA: PARA RECOGER SU LENTE, INDISPENSABLE PRESENTAR ESTE COMPROBANTE", "fontSize": 11, "align": "center"}]`
