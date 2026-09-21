package admin

import (
	"bytes"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
)

// logoCropPadding es el margen que se deja alrededor del contenido real
// detectado (8%, mismo criterio que se usó a mano al recortar los logos
// de TOUS/MaxMara/TOM FORD/GUESS).
const logoCropPadding = 0.08

// contentBBox regresa el rectángulo que envuelve el "contenido real" de
// la imagen (lo que NO es transparente ni blanco/casi blanco), para
// poder recortar el espacio en blanco/transparente que algunos logos
// traen de fábrica y que hace que se vean de tamaños muy distintos en
// el carrusel aunque el CSS ya les ponga la misma altura.
func contentBBox(img *image.RGBA) (image.Rectangle, bool) {
	b := img.Bounds()
	minX, minY := b.Max.X, b.Max.Y
	maxX, maxY := b.Min.X, b.Min.Y
	found := false

	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, a := img.At(x, y).RGBA()
			var isBackground bool
			switch {
			case a < 0x1000:
				// Pixel prácticamente transparente.
				isBackground = true
			default:
				// img.At regresa color premultiplicado por alpha — hay
				// que "despremultiplicar" antes de comparar contra
				// blanco, si no un blanco semi-transparente se lee
				// como oscuro y se cuenta como contenido por error.
				rr := r * 0xffff / a
				gg := g * 0xffff / a
				bb := bl * 0xffff / a
				isBackground = rr > 0xf000 && gg > 0xf000 && bb > 0xf000
			}
			if !isBackground {
				found = true
				if x < minX {
					minX = x
				}
				if x > maxX {
					maxX = x
				}
				if y < minY {
					minY = y
				}
				if y > maxY {
					maxY = y
				}
			}
		}
	}

	if !found {
		return b, false
	}
	return image.Rect(minX, minY, maxX+1, maxY+1), true
}

// expandWithPadding agranda bbox un porcentaje de su propio ancho/alto
// (logoCropPadding) y lo recorta para que nunca se salga de bounds.
func expandWithPadding(bbox, bounds image.Rectangle, padding float64) image.Rectangle {
	padX := int(float64(bbox.Dx()) * padding)
	padY := int(float64(bbox.Dy()) * padding)
	r := image.Rect(bbox.Min.X-padX, bbox.Min.Y-padY, bbox.Max.X+padX, bbox.Max.Y+padY)
	return r.Intersect(bounds)
}

// autoCropLogoContent recorta el espacio en blanco/transparente interno
// de un logo recién subido, dejando solo el contenido real + 8% de
// margen — mismo resultado que el recorte manual que se hizo antes con
// PIL para TOUS/MaxMara/TOM FORD/GUESS, pero automático en cada subida.
//
// Soporta PNG y JPG/JPEG (los dos formatos más comunes para logos). Si
// el formato no se puede decodificar (p. ej. WEBP, que la librería
// estándar de Go no soporta sin una dependencia extra), o si algo falla
// al procesar, regresa los bytes originales sin tocar — la subida NUNCA
// se rompe por esto, en el peor caso el logo simplemente no se recorta.
//
// Siempre regresa PNG cuando sí logra recortar (para no perder la
// transparencia si el original la traía).
func autoCropLogoContent(data []byte, ext string) (out []byte, outExt string, err error) {
	var src image.Image
	switch ext {
	case ".png":
		src, err = png.Decode(bytes.NewReader(data))
	case ".jpg", ".jpeg":
		src, err = jpeg.Decode(bytes.NewReader(data))
	default:
		return data, ext, nil
	}
	if err != nil {
		return data, ext, err
	}

	b := src.Bounds()
	rgba := image.NewRGBA(b)
	draw.Draw(rgba, b, src, b.Min, draw.Src)

	bbox, found := contentBBox(rgba)
	if !found {
		// Imagen vacía o de un solo color — no hay nada que recortar.
		return data, ext, nil
	}

	padded := expandWithPadding(bbox, b, logoCropPadding)
	if padded == b {
		// Ya no traía espacio de sobra — se deja igual (evita
		// reencodear sin necesidad).
		return data, ext, nil
	}

	// Se normaliza el origen a (0,0): SubImage conserva el offset
	// original del rectángulo recortado, y algunos lectores de imagen
	// no lo manejan bien al reencodear.
	cropped := image.NewRGBA(image.Rect(0, 0, padded.Dx(), padded.Dy()))
	draw.Draw(cropped, cropped.Bounds(), rgba, padded.Min, draw.Src)

	var buf bytes.Buffer
	if err := png.Encode(&buf, cropped); err != nil {
		return data, ext, err
	}
	return buf.Bytes(), ".png", nil
}
