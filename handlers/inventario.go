package handlers

import (
	"errors"
	"log"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"avante-optics/models"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod.
//
// Panel de Inventario (páginas en /inventario/…, API en /api/inventario/…):
//
//	GET    /api/inventario/articulos               catálogo completo
//	POST   /api/inventario/articulos               agregar artículo
//	PUT    /api/inventario/articulos/:id           editar artículo (no cambia la existencia)
//	DELETE /api/inventario/articulos/:id           eliminar (solo con existencia 0)
//	POST   /api/inventario/articulos/:id/ajustar   entrada / salida / fijar existencia
//	GET    /api/inventario/departamentos           departamentos con sus categorías
//	POST   /api/inventario/departamentos           nuevo departamento
//	PUT    /api/inventario/departamentos/:id       renombrar
//	DELETE /api/inventario/departamentos/:id       borrar (sin artículos)
//	POST   /api/inventario/categorias              nueva categoría
//	PUT    /api/inventario/categorias/:id          editar categoría
//	DELETE /api/inventario/categorias/:id          borrar (sin artículos)
//	GET    /api/inventario/ajustes?desde=&hasta=   folios de ajuste
//	GET    /api/inventario/ajustes/:id             un ajuste con sus artículos
//	POST   /api/inventario/ajustes                 aplicar inventario físico
//	GET    /api/inventario/movimientos?item=&desde=&hasta=&tipo=&q=   kárdex

var (
	invClaveRe = regexp.MustCompile(`^[A-Z0-9][A-Z0-9./-]*$`)
	invFechaRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	invUnidad  = map[string]bool{"PZA": true, "CAJA": true, "PAR": true, "JGO": true, "PAQ": true, "SERV": true, "ML": true, "KIT": true}
)

func invUser(c *gin.Context) string {
	v, _ := c.Get("staff_name")
	s, _ := v.(string)
	return s
}

// invCanCost: solo el admin ve y captura el precio de compra (costo).
// La cuenta de Inventario da de alta y ajusta artículos, pero el costo lo
// pone el admin.
func invCanCost(c *gin.Context) bool {
	v, _ := c.Get("staff_role")
	r, _ := v.(string)
	return r == RoleAdmin
}

// invHideCost borra el costo de lo que se le manda a quien no es admin.
func invHideCost(c *gin.Context, items ...*models.InvArticulo) {
	if invCanCost(c) {
		return
	}
	for _, a := range items {
		if a != nil {
			a.PrecioCompra = 0
		}
	}
}

// invPage arma una página del panel. Se usa en dos lugares con la misma
// plantilla:
//   - /inventario/…        cuenta de Inventario (su propio sidebar)
//   - /admin/inventario/…  el admin, dentro de su panel (sidebar de admin
//     y pestañas arriba para moverse entre las 4 secciones)
func invPage(file, tab string, admin bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		data := gin.H{"InvTab": tab, "CanCost": invCanCost(c)}
		if admin {
			data["Panel"] = "admin"
			data["ActivePage"] = "admin-inventario"
			data["InvBase"] = "/admin/inventario"
		} else {
			data["Panel"] = "inventario"
			data["ActivePage"] = "inv-" + tab
			data["InvBase"] = "/inventario"
		}
		c.HTML(http.StatusOK, file, WithStaff(c, data))
	}
}

// Páginas del panel de Inventario (cuenta de Inventario).
var (
	InventarioArticulosPage     = invPage("articulos-inventario.html", "articulos", false)
	InventarioDepartamentosPage = invPage("departamentos-inventario.html", "departamentos", false)
	InventarioAjustesPage       = invPage("ajustes-inventario.html", "ajustes", false)
	InventarioMovimientosPage   = invPage("movimientos-inventario.html", "movimientos", false)
)

// Las mismas páginas dentro del panel del admin (Admin → Inventario).
var (
	AdminInventarioArticulosPage     = invPage("articulos-inventario.html", "articulos", true)
	AdminInventarioDepartamentosPage = invPage("departamentos-inventario.html", "departamentos", true)
	AdminInventarioAjustesPage       = invPage("ajustes-inventario.html", "ajustes", true)
	AdminInventarioMovimientosPage   = invPage("movimientos-inventario.html", "movimientos", true)
)

func invID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Identificador inválido."})
		return 0, false
	}
	return id, true
}

func invFail(c *gin.Context, where string, err error, msg string) {
	log.Printf("inventario.%s: %v", where, err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": msg})
}

/* ---------------- artículos ---------------- */

// InvListArticulos — GET /api/inventario/articulos
func InvListArticulos(c *gin.Context) {
	items, err := models.ListInvArticulos()
	if err != nil {
		invFail(c, "ListArticulos", err, "No se pudo cargar el inventario.")
		return
	}
	deps, err := models.ListInvDepartamentos()
	if err != nil {
		invFail(c, "ListArticulos.deps", err, "No se pudieron cargar los departamentos.")
		return
	}
	for i := range items {
		invHideCost(c, &items[i])
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "departamentos": deps, "can_cost": invCanCost(c)})
}

type invArticuloBody struct {
	Clave          string  `json:"clave"`
	ClaveAlterna   string  `json:"clave_alterna"`
	Descripcion    string  `json:"descripcion"`
	DepartamentoID int64   `json:"departamento_id"`
	CategoriaID    int64   `json:"categoria_id"`
	UnidadCompra   string  `json:"unidad_compra"`
	UnidadVenta    string  `json:"unidad_venta"`
	Factor         float64 `json:"factor"`
	Servicio       bool    `json:"servicio"`
	IVA            bool    `json:"iva"`
	PrecioCompra   float64 `json:"precio_compra"`
	Precio1        float64 `json:"precio_1"`
	Precio2        float64 `json:"precio_2"`
	Precio3        float64 `json:"precio_3"`
	Precio4        float64 `json:"precio_4"`
	Mayoreo2       int     `json:"mayoreo_2"`
	Mayoreo3       int     `json:"mayoreo_3"`
	Mayoreo4       int     `json:"mayoreo_4"`
	Existencia     int     `json:"existencia"`
	Minimo         int     `json:"minimo"`
	Maximo         int     `json:"maximo"`
	Localizacion   string  `json:"localizacion"`
}

func invMoneyOK(vs ...float64) bool {
	for _, v := range vs {
		if v < 0 || v > 9999999 || math.IsNaN(v) {
			return false
		}
	}
	return true
}

// bindInvArticulo lee y valida el artículo. Si algo está mal ya respondió.
func bindInvArticulo(c *gin.Context) (models.InvArticulo, bool) {
	var b invArticuloBody
	if err := c.ShouldBindJSON(&b); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return models.InvArticulo{}, false
	}
	bad := func(msg string) (models.InvArticulo, bool) {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return models.InvArticulo{}, false
	}
	b.Clave = models.NormalizeInventoryClave(b.Clave)
	b.ClaveAlterna = models.NormalizeInventoryClave(b.ClaveAlterna)
	b.Descripcion = strings.Join(strings.Fields(b.Descripcion), " ")
	b.UnidadCompra = strings.ToUpper(strings.TrimSpace(b.UnidadCompra))
	b.UnidadVenta = strings.ToUpper(strings.TrimSpace(b.UnidadVenta))
	b.Localizacion = strings.ToUpper(strings.Join(strings.Fields(b.Localizacion), " "))
	if b.UnidadCompra == "" {
		b.UnidadCompra = "PZA"
	}
	if b.UnidadVenta == "" {
		b.UnidadVenta = "PZA"
	}
	if b.Factor <= 0 {
		b.Factor = 1
	}
	switch {
	case b.Clave == "":
		return bad("Escribe la clave del artículo.")
	case len([]rune(b.Clave)) > 60 || !invClaveRe.MatchString(b.Clave):
		return bad("La clave solo puede llevar letras, números, guiones (-), puntos (.) y diagonales (/).")
	case b.ClaveAlterna != "" && (len([]rune(b.ClaveAlterna)) > 60 || !invClaveRe.MatchString(b.ClaveAlterna)):
		return bad("La clave alterna solo puede llevar letras, números, guiones, puntos y diagonales.")
	case b.Descripcion == "":
		return bad("Escribe la descripción del artículo.")
	case len([]rune(b.Descripcion)) > 200:
		return bad("La descripción es muy larga (máximo 200 caracteres).")
	case !invUnidad[b.UnidadCompra] || !invUnidad[b.UnidadVenta]:
		return bad("Elige una unidad de compra y de venta válida.")
	case b.Factor > 10000:
		return bad("Revisa el factor.")
	case !invMoneyOK(b.PrecioCompra, b.Precio1, b.Precio2, b.Precio3, b.Precio4):
		return bad("Revisa los precios: no pueden ser negativos.")
	case b.Mayoreo2 < 0 || b.Mayoreo3 < 0 || b.Mayoreo4 < 0:
		return bad("Las unidades de mayoreo no pueden ser negativas.")
	case b.Existencia < 0 || b.Existencia > 1000000:
		return bad("Revisa la existencia inicial.")
	case b.Minimo < 0 || b.Maximo < 0:
		return bad("El inventario mínimo y máximo no pueden ser negativos.")
	case b.Maximo > 0 && b.Minimo > b.Maximo:
		return bad("El inventario mínimo no puede ser mayor que el máximo.")
	case len([]rune(b.Localizacion)) > 60:
		return bad("La localización es muy larga (máximo 60 caracteres).")
	}
	return models.InvArticulo{
		Clave: b.Clave, ClaveAlterna: b.ClaveAlterna, Descripcion: b.Descripcion,
		DepartamentoID: b.DepartamentoID, CategoriaID: b.CategoriaID,
		UnidadCompra: b.UnidadCompra, UnidadVenta: b.UnidadVenta, Factor: b.Factor,
		Servicio: b.Servicio, IVA: b.IVA,
		PrecioCompra: b.PrecioCompra, Precio1: b.Precio1, Precio2: b.Precio2, Precio3: b.Precio3, Precio4: b.Precio4,
		Mayoreo2: b.Mayoreo2, Mayoreo3: b.Mayoreo3, Mayoreo4: b.Mayoreo4,
		Existencia: b.Existencia, Minimo: b.Minimo, Maximo: b.Maximo, Localizacion: b.Localizacion,
	}, true
}

func invArticuloErr(c *gin.Context, where string, err error, clave string) {
	switch {
	case errors.Is(err, models.ErrInventoryClaveTaken):
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe un artículo con la clave " + clave + "."})
	case errors.Is(err, models.ErrInventoryNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese artículo ya no existe."})
	case errors.Is(err, models.ErrInvDepNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ese departamento ya no existe."})
	case errors.Is(err, models.ErrInvCatNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Esa categoría ya no existe."})
	case strings.Contains(err.Error(), "categoría no es del departamento"), strings.Contains(err.Error(), "servicio"):
		c.JSON(http.StatusBadRequest, gin.H{"error": strings.ToUpper(err.Error()[:1]) + err.Error()[1:] + "."})
	default:
		invFail(c, where, err, "No se pudo guardar el artículo.")
	}
}

// InvCreateArticulo — POST /api/inventario/articulos
func InvCreateArticulo(c *gin.Context) {
	a, ok := bindInvArticulo(c)
	if !ok {
		return
	}
	if !invCanCost(c) {
		a.PrecioCompra = 0 // el costo lo pone el admin
	}
	item, err := models.CreateInvArticulo(a, invUser(c))
	if err != nil {
		invArticuloErr(c, "CreateArticulo", err, a.Clave)
		return
	}
	invHideCost(c, item)
	c.JSON(http.StatusCreated, gin.H{"item": item})
}

// InvUpdateArticulo — PUT /api/inventario/articulos/:id
func InvUpdateArticulo(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	a, ok := bindInvArticulo(c)
	if !ok {
		return
	}
	a.ID = id
	item, err := models.UpdateInvArticulo(a, !invCanCost(c))
	if err != nil {
		invArticuloErr(c, "UpdateArticulo", err, a.Clave)
		return
	}
	invHideCost(c, item)
	c.JSON(http.StatusOK, gin.H{"item": item})
}

// InvDeleteArticulo — DELETE /api/inventario/articulos/:id
func InvDeleteArticulo(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	err := models.DeleteInvArticulo(id)
	switch {
	case errors.Is(err, models.ErrInventoryNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese artículo ya no existe."})
	case errors.Is(err, models.ErrInvTieneExistencia):
		c.JSON(http.StatusConflict, gin.H{"error": "Solo se pueden eliminar artículos con existencia 0. Primero haz una salida con Ajustar."})
	case err != nil:
		invFail(c, "DeleteArticulo", err, "No se pudo eliminar el artículo.")
	default:
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// InvAjustarArticulo — POST /api/inventario/articulos/:id/ajustar
// {modo: "entrada"|"salida"|"fijar", cantidad, comentario}
func InvAjustarArticulo(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	var in struct {
		Modo       string `json:"modo"`
		Cantidad   int    `json:"cantidad"`
		Comentario string `json:"comentario"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	in.Comentario = strings.Join(strings.Fields(in.Comentario), " ")
	switch {
	case in.Modo != "entrada" && in.Modo != "salida" && in.Modo != "fijar":
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige si es entrada, salida o fijar existencia."})
		return
	case in.Modo != "fijar" && in.Cantidad <= 0:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe cuántas piezas."})
		return
	case in.Cantidad < 0 || in.Cantidad > 1000000:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa la cantidad."})
		return
	case len([]rune(in.Comentario)) > 250:
		c.JSON(http.StatusBadRequest, gin.H{"error": "El comentario es muy largo."})
		return
	}
	r, err := models.AjustarInvArticulo(id, in.Modo, in.Cantidad, in.Comentario, invUser(c))
	switch {
	case errors.Is(err, models.ErrInventoryNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese artículo ya no existe."})
	case errors.Is(err, models.ErrInvServicio):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Los servicios no llevan existencia."})
	case errors.Is(err, models.ErrInvSinExistencia):
		c.JSON(http.StatusConflict, gin.H{"error": "No puedes sacar más piezas de las que hay (" + strings.TrimPrefix(err.Error(), models.ErrInvSinExistencia.Error()+": ") + ")."})
	case err != nil:
		invFail(c, "AjustarArticulo", err, "No se pudo hacer el ajuste.")
	default:
		invHideCost(c, r.Articulo)
		c.JSON(http.StatusOK, gin.H{"ajuste": r})
	}
}

/* ---------------- departamentos y categorías ---------------- */

// InvListDepartamentos — GET /api/inventario/departamentos
func InvListDepartamentos(c *gin.Context) {
	deps, err := models.ListInvDepartamentos()
	if err != nil {
		invFail(c, "ListDepartamentos", err, "No se pudieron cargar los departamentos.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"departamentos": deps})
}

func invNombre(c *gin.Context, what string) (string, bool) {
	var in struct {
		Nombre string `json:"nombre"`
	}
	_ = c.ShouldBindJSON(&in)
	n := models.NormalizeInvNombre(in.Nombre)
	if n == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe el nombre del " + what + "."})
		return "", false
	}
	if len([]rune(n)) > 60 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El nombre es muy largo (máximo 60 caracteres)."})
		return "", false
	}
	return n, true
}

// InvCreateDepartamento — POST /api/inventario/departamentos {nombre}
func InvCreateDepartamento(c *gin.Context) {
	n, ok := invNombre(c, "departamento")
	if !ok {
		return
	}
	id, err := models.CreateInvDepartamento(n)
	if errors.Is(err, models.ErrInvDepDuplicado) {
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe el departamento " + n + "."})
		return
	}
	if err != nil {
		invFail(c, "CreateDepartamento", err, "No se pudo guardar el departamento.")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "nombre": n})
}

// InvRenameDepartamento — PUT /api/inventario/departamentos/:id {nombre}
func InvRenameDepartamento(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	n, ok := invNombre(c, "departamento")
	if !ok {
		return
	}
	err := models.RenameInvDepartamento(id, n)
	switch {
	case errors.Is(err, models.ErrInvDepDuplicado):
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe el departamento " + n + "."})
	case errors.Is(err, models.ErrInvDepNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese departamento ya no existe."})
	case err != nil:
		invFail(c, "RenameDepartamento", err, "No se pudo guardar el departamento.")
	default:
		c.JSON(http.StatusOK, gin.H{"id": id, "nombre": n})
	}
}

// InvDeleteDepartamento — DELETE /api/inventario/departamentos/:id
func InvDeleteDepartamento(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	err := models.DeleteInvDepartamento(id)
	switch {
	case errors.Is(err, models.ErrInvDepEnUso):
		c.JSON(http.StatusConflict, gin.H{"error": "No se puede borrar: hay artículos en este departamento. Muévelos a otro primero."})
	case errors.Is(err, models.ErrInvDepNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Ese departamento ya no existe."})
	case err != nil:
		invFail(c, "DeleteDepartamento", err, "No se pudo borrar el departamento.")
	default:
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

func bindInvCategoria(c *gin.Context) (models.InvCategoria, bool) {
	var in struct {
		DepartamentoID int64   `json:"departamento_id"`
		Nombre         string  `json:"nombre"`
		Comision       float64 `json:"comision"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return models.InvCategoria{}, false
	}
	n := models.NormalizeInvNombre(in.Nombre)
	switch {
	case in.DepartamentoID <= 0:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Elige el departamento."})
		return models.InvCategoria{}, false
	case n == "":
		c.JSON(http.StatusBadRequest, gin.H{"error": "Escribe el nombre de la categoría."})
		return models.InvCategoria{}, false
	case len([]rune(n)) > 60:
		c.JSON(http.StatusBadRequest, gin.H{"error": "El nombre es muy largo (máximo 60 caracteres)."})
		return models.InvCategoria{}, false
	case in.Comision < 0 || in.Comision > 100:
		c.JSON(http.StatusBadRequest, gin.H{"error": "La comisión va de 0 a 100 %."})
		return models.InvCategoria{}, false
	}
	return models.InvCategoria{DepartamentoID: in.DepartamentoID, Nombre: n, Comision: in.Comision}, true
}

func invCategoriaErr(c *gin.Context, where string, err error, nombre string) {
	switch {
	case errors.Is(err, models.ErrInvCatDuplicada):
		c.JSON(http.StatusConflict, gin.H{"error": "Ya existe la categoría " + nombre + " en ese departamento."})
	case errors.Is(err, models.ErrInvDepNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ese departamento ya no existe."})
	case errors.Is(err, models.ErrInvCatNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa categoría ya no existe."})
	default:
		invFail(c, where, err, "No se pudo guardar la categoría.")
	}
}

// InvCreateCategoria — POST /api/inventario/categorias {departamento_id, nombre, comision}
func InvCreateCategoria(c *gin.Context) {
	cat, ok := bindInvCategoria(c)
	if !ok {
		return
	}
	id, err := models.CreateInvCategoria(cat)
	if err != nil {
		invCategoriaErr(c, "CreateCategoria", err, cat.Nombre)
		return
	}
	cat.ID = id
	c.JSON(http.StatusCreated, gin.H{"categoria": cat})
}

// InvUpdateCategoria — PUT /api/inventario/categorias/:id
func InvUpdateCategoria(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	cat, ok := bindInvCategoria(c)
	if !ok {
		return
	}
	cat.ID = id
	if err := models.UpdateInvCategoria(cat); err != nil {
		invCategoriaErr(c, "UpdateCategoria", err, cat.Nombre)
		return
	}
	c.JSON(http.StatusOK, gin.H{"categoria": cat})
}

// InvDeleteCategoria — DELETE /api/inventario/categorias/:id
func InvDeleteCategoria(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	err := models.DeleteInvCategoria(id)
	switch {
	case errors.Is(err, models.ErrInvCatEnUso):
		c.JSON(http.StatusConflict, gin.H{"error": "No se puede borrar: hay artículos en esta categoría. Cámbialos de categoría primero."})
	case errors.Is(err, models.ErrInvCatNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Esa categoría ya no existe."})
	case err != nil:
		invFail(c, "DeleteCategoria", err, "No se pudo borrar la categoría.")
	default:
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

/* ---------------- ajustes (inventario físico) ---------------- */

func invRango(c *gin.Context) (string, string, bool) {
	desde, hasta := c.Query("desde"), c.Query("hasta")
	if desde == "" {
		desde = models.PosToday()
	}
	if hasta == "" {
		hasta = desde
	}
	if !invFechaRe.MatchString(desde) || !invFechaRe.MatchString(hasta) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fechas inválidas."})
		return "", "", false
	}
	if desde > hasta {
		desde, hasta = hasta, desde
	}
	return desde, hasta, true
}

// InvListAjustes — GET /api/inventario/ajustes?desde=&hasta=
func InvListAjustes(c *gin.Context) {
	desde, hasta, ok := invRango(c)
	if !ok {
		return
	}
	items, err := models.ListInvAjustes(desde, hasta)
	if err != nil {
		invFail(c, "ListAjustes", err, "No se pudieron cargar los ajustes.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "desde": desde, "hasta": hasta, "hoy": models.PosToday()})
}

// InvGetAjuste — GET /api/inventario/ajustes/:id
func InvGetAjuste(c *gin.Context) {
	id, ok := invID(c)
	if !ok {
		return
	}
	d, err := models.GetInvAjuste(id)
	if errors.Is(err, models.ErrInvAjusteNotFound) {
		c.JSON(http.StatusNotFound, gin.H{"error": "No existe el ajuste " + strconv.FormatInt(id, 10) + "."})
		return
	}
	if err != nil {
		invFail(c, "GetAjuste", err, "No se pudo cargar el ajuste.")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ajuste": d})
}

// InvAplicarAjuste — POST /api/inventario/ajustes
// {comentario, lineas: [{item_id, contado}]}
func InvAplicarAjuste(c *gin.Context) {
	var in struct {
		Comentario string             `json:"comentario"`
		Lineas     []models.InvConteo `json:"lineas"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Datos inválidos."})
		return
	}
	in.Comentario = strings.Join(strings.Fields(in.Comentario), " ")
	if len(in.Lineas) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Agrega al menos un artículo al conteo."})
		return
	}
	if len(in.Lineas) > 3000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Son demasiados artículos para un solo ajuste (máximo 3000)."})
		return
	}
	if len([]rune(in.Comentario)) > 250 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "El comentario es muy largo."})
		return
	}
	for _, l := range in.Lineas {
		if l.ItemID <= 0 || l.Contado < 0 || l.Contado > 1000000 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Revisa las cantidades contadas (no pueden ser negativas)."})
			return
		}
	}
	r, err := models.AplicarInventarioFisico(in.Lineas, in.Comentario, invUser(c))
	if err != nil {
		if strings.Contains(err.Error(), "quítalo") {
			c.JSON(http.StatusBadRequest, gin.H{"error": strings.ToUpper(err.Error()[:1]) + err.Error()[1:] + "."})
			return
		}
		invFail(c, "AplicarAjuste", err, "No se pudo aplicar el ajuste.")
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ajuste": r})
}

/* ---------------- kárdex ---------------- */

// InvListMovimientos — GET /api/inventario/movimientos?item=&desde=&hasta=&tipo=&q=
func InvListMovimientos(c *gin.Context) {
	f := models.InvMovFilter{Tipo: c.Query("tipo"), Q: strings.TrimSpace(c.Query("q"))}
	if s := c.Query("item"); s != "" {
		id, err := strconv.ParseInt(s, 10, 64)
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Artículo inválido."})
			return
		}
		f.ItemID = id
	}
	switch f.Tipo {
	case "", models.InvMovInicial, models.InvMovEntrada, models.InvMovSalida, models.InvMovAjuste, models.InvMovVenta:
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tipo de movimiento inválido."})
		return
	}
	if c.Query("desde") != "" || c.Query("hasta") != "" {
		d, h, ok := invRango(c)
		if !ok {
			return
		}
		f.Desde, f.Hasta = d, h
	}
	items, tot, err := models.ListInvMovimientos(f, 1000)
	if err != nil {
		invFail(c, "ListMovimientos", err, "No se pudieron cargar los movimientos.")
		return
	}
	resp := gin.H{"items": items, "totales": tot, "hoy": models.PosToday()}
	if f.ItemID > 0 {
		if a, err := models.GetInvArticulo(f.ItemID); err == nil {
			invHideCost(c, a)
			resp["articulo"] = a
		}
	}
	c.JSON(http.StatusOK, resp)
}
