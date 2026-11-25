package models

import (
	"regexp"
	"sort"
	"strings"

	"avante-optics/db"
)

// VENTAS POR MATERIAL (reporte PDF de Ventas): cuántas piezas e importe
// se vendieron de cada identificador (ARMT metal / ARZL pasta) y
// subidentificador (ACETATO, TR90…) del material del armazón.
//
// El material de cada artículo es el primero que tiene; su identificador
// y subidentificador salen de la lista de materiales. Si el material ya
// no está en la lista, el identificador se toma de la clave (ARMT-… /
// ARZL-…). Lo que no tiene material (micas, estuches, servicios) no entra.

type PosVentaMaterial struct {
	Identificador    string  `json:"identificador"`
	Subidentificador string  `json:"subidentificador"`
	Piezas           int     `json:"piezas"`
	Importe          float64 `json:"importe"`
	Ventas           int     `json:"ventas"` // tickets distintos
}

var claveIdentRe = regexp.MustCompile(`^(ARMT|ARZL)-`)

func ListPosVentasPorMaterial(desde, hasta string) ([]PosVentaMaterial, error) {
	where := []string{"s.cancelada = 0", "i.materiales IS NOT NULL", "i.materiales <> ''"}
	args := []interface{}{}
	if desde != "" {
		where = append(where, "s.created_at >= ?")
		args = append(args, desde)
	}
	if hasta != "" {
		where = append(where, "s.created_at < DATE_ADD(?, INTERVAL 1 DAY)")
		args = append(args, hasta)
	}
	rows, err := db.DB.Query(`SELECT s.id, it.cantidad, it.importe, i.materiales, COALESCE(i.clave, it.clave, '')
		FROM pos_sale_items it
		JOIN pos_sales s ON s.id = it.sale_id
		JOIN inventory_items i ON i.id = it.inventory_id
		WHERE `+strings.Join(where, " AND "), args...)
	if err != nil {
		return nil, err
	}
	type line struct {
		sale    int64
		cant    int
		importe float64
		mat     string
		clave   string
	}
	var lines []line
	for rows.Next() {
		var l line
		var mats string
		if err := rows.Scan(&l.sale, &l.cant, &l.importe, &mats, &l.clave); err != nil {
			rows.Close()
			return nil, err
		}
		if ms := splitColores(mats); len(ms) > 0 {
			l.mat = ms[0]
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	mats, _ := ListInvMateriales()
	byName := map[string]InvMaterial{}
	for _, m := range mats {
		byName[strings.ToLower(m.Nombre)] = m
	}
	agg := map[string]*PosVentaMaterial{}
	tickets := map[string]map[int64]bool{}
	for _, l := range lines {
		if l.mat == "" {
			continue
		}
		m, ok := byName[strings.ToLower(l.mat)]
		ident, sub := m.Identificador, m.Subidentificador
		if !ok || ident == "" {
			if x := claveIdentRe.FindStringSubmatch(strings.ToUpper(l.clave)); x != nil {
				ident = x[1]
			}
		}
		if ident == "" {
			ident = "—"
		}
		if sub == "" {
			sub = "Sin subidentificador"
		}
		k := ident + "|" + sub
		if agg[k] == nil {
			agg[k] = &PosVentaMaterial{Identificador: ident, Subidentificador: sub}
			tickets[k] = map[int64]bool{}
		}
		agg[k].Piezas += l.cant
		agg[k].Importe += l.importe
		tickets[k][l.sale] = true
	}
	out := make([]PosVentaMaterial, 0, len(agg))
	for k, v := range agg {
		v.Importe = round2(v.Importe)
		v.Ventas = len(tickets[k])
		out = append(out, *v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Piezas != out[j].Piezas {
			return out[i].Piezas > out[j].Piezas
		}
		return out[i].Importe > out[j].Importe
	})
	return out, nil
}
