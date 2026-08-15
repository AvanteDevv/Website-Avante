package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"avante-optics/auth"
	"avante-optics/db"
	"avante-optics/handlers"
	adminHandlers "avante-optics/handlers/admin"
	"avante-optics/models"
	"avante-optics/storage"
)

// ⚠️ Adjust "avante-optics" in the imports above to match the module name
// declared in your go.mod (first line: "module xxxxx").

// spanishMonths maps month number (1-12) to its Spanish name, so we don't
// need an external localization package just for this.
var spanishMonths = [...]string{
	"enero", "febrero", "marzo", "abril", "mayo", "junio",
	"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
}

// spanishDate formats a date as "4 de agosto de 2026", used in templates
// via {{fechaEs .CreatedAt}}.
func spanishDate(t time.Time) string {
	return fmt.Sprintf("%d de %s de %d", t.Day(), spanishMonths[t.Month()-1], t.Year())
}

// spanishDateTime formats a date+time as "4 ago 2026, 14:30", used in
// templates via {{fechaHoraEs .StartAt}}.
func spanishDateTime(t time.Time) string {
	if t.IsZero() {
		return "—"
	}
	mesCorto := spanishMonths[t.Month()-1][:3]
	return fmt.Sprintf("%d %s %d, %02d:%02d", t.Day(), mesCorto, t.Year(), t.Hour(), t.Minute())
}

// storeProduct es la forma que espera el JS de la tienda pública
// (index.js / ecommerce.js / detalle-producto.js) para cada tarjeta —
// name/brand/price/icon/desc tal cual ya usaban con los datos de
// ejemplo, más "images" con la imagen real subida en el panel de admin
// (se repite en las 3 posiciones del carrusel si solo hay una).
type storeProduct struct {
	Name     string   `json:"name"`
	Brand    string   `json:"brand"`
	Price    string   `json:"price"`
	OldPrice string   `json:"oldPrice,omitempty"`
	Expires  string   `json:"expires,omitempty"`
	Icon     string   `json:"icon"`
	Badge    string   `json:"badge,omitempty"`
	Desc     string   `json:"desc,omitempty"`
	Images   []string `json:"images"`
	LogoURL  string   `json:"logoUrl,omitempty"`
}

// productNewBadgeWindow es cuánto tiempo después de agregado un producto
// sigue mostrándose como "Nuevo" automáticamente (si el admin no le puso
// una etiqueta manual). Ajusta este valor si quieres que dure más o menos.
const productNewBadgeWindow = 30 * 24 * time.Hour

// buildStoreProductsJSON arma window.AVANTE_PRODUCTS para inyectarlo en
// el <script> de index.html/ecommerce.html/detalle-producto.html ANTES
// de que carguen sus respectivos JS — así el render de esos archivos
// (que asume que PRODUCTS ya existe de forma síncrona) no tiene que
// cambiar de estructura, solo leer esta variable si viene con datos.
func buildStoreProductsJSON() template.JS {
	products, err := models.GetAllProducts()
	if err != nil {
		return template.JS("[]")
	}

	out := make([]storeProduct, 0, len(products))
	for _, p := range products {
		sp := storeProduct{
			Name:    p.Title,
			Brand:   p.Brand,
			Price:   fmt.Sprintf("$%.2f", p.Price),
			Icon:    p.Icon,
			Badge:   p.Badge,
			Desc:    p.Description,
			Images:  p.Images,
			LogoURL: p.LogoURL,
		}
		if p.OldPrice > 0 {
			sp.OldPrice = fmt.Sprintf("$%.2f", p.OldPrice)
		}
		if !p.PromoEndsAt.IsZero() {
			sp.Expires = p.PromoEndsAt.Format(time.RFC3339)
		}

		// Si el admin no escribió una etiqueta a mano, se autocompleta:
		// primero "Promoción" si tiene precio anterior (ya es la señal de
		// que está en descuento — no hace falta un campo aparte para
		// marcarlo), y si no, "Nuevo" mientras esté dentro de la ventana
		// de días recién agregado.
		if sp.Badge == "" {
			switch {
			case p.OldPrice > 0:
				sp.Badge = "Promoción"
			case time.Since(p.CreatedAt) <= productNewBadgeWindow:
				sp.Badge = "Nuevo"
			}
		}

		out = append(out, sp)
	}

	b, err := json.Marshal(out)
	if err != nil {
		return template.JS("[]")
	}
	return template.JS(b)
}

func loadTemplates() *template.Template {
	funcs := template.FuncMap{
		"fechaEs":     spanishDate,
		"fechaHoraEs": spanishDateTime,
		"safeHTML": func(s string) template.HTML {
			return template.HTML(s)
		},
	}
	tmpl := template.Must(template.New("base").Funcs(funcs).ParseGlob("templates/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/partials/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/auth/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/client/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/admin/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/auth-admin/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/ecommerce/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/pages/*.html"))
	return tmpl
}

func main() {
	// .env is optional: locally you use it for your Railway credentials;
	// in production (Railway/another host) the variables are already injected
	// directly into the environment, so if there is no .env, nothing happens.
	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}

	db.Connect()
	defer db.DB.Close()

	storage.Connect()

	auth.InitStore()

	router := gin.Default()

	router.SetHTMLTemplate(loadTemplates())
	router.Static("/static", "./static")
	router.Static("/css", "./static/css")
	router.Static("/js", "./static/js")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", handlers.WithUser(c, gin.H{
			"ActivePage":   "inicio",
			"AdMainURL":    handlers.ActiveAdImage("main"),
			"AdSide1URL":   handlers.ActiveAdImage("side1"),
			"AdSide2URL":   handlers.ActiveAdImage("side2"),
			"ProductsJSON": buildStoreProductsJSON(),
		}))
	})

	router.GET("/iniciar-sesion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "iniciar-sesion.html", gin.H{
			"ActivePage": "iniciar-sesion",
		})
	})

	router.GET("/registro", func(c *gin.Context) {
		c.HTML(http.StatusOK, "registro.html", gin.H{
			"ActivePage": "registro",
		})
	})

	// Client panel views (templates/client/*.html) — protegidas: sin
	// sesión de cliente, RequireAuth() manda a /iniciar-sesion.
	clientGroup := router.Group("/", handlers.RequireAuth())
	{
		clientGroup.GET("/dashboard", func(c *gin.Context) {
			c.HTML(http.StatusOK, "dashboard.html", handlers.WithUser(c, gin.H{
				"ActivePage": "dashboard",
			}))
		})
		clientGroup.GET("/mis-favoritos", func(c *gin.Context) {
			c.HTML(http.StatusOK, "mis-favoritos.html", handlers.WithUser(c, gin.H{
				"ActivePage": "mis-favoritos",
			}))
		})
		clientGroup.GET("/mis-pedidos", func(c *gin.Context) {
			c.HTML(http.StatusOK, "mis-pedidos.html", handlers.WithUser(c, gin.H{
				"ActivePage": "mis-pedidos",
			}))
		})
		clientGroup.GET("/mi-perfil", func(c *gin.Context) {
			c.HTML(http.StatusOK, "mi-perfil.html", handlers.WithUser(c, gin.H{
				"ActivePage": "mi-perfil",
			}))
		})
		clientGroup.GET("/mis-citas", func(c *gin.Context) {
			c.HTML(http.StatusOK, "mis-citas.html", handlers.WithUser(c, gin.H{
				"ActivePage": "mis-citas",
			}))
		})
		clientGroup.GET("/configuracion", func(c *gin.Context) {
			c.HTML(http.StatusOK, "ajustes.html", handlers.WithUser(c, gin.H{
				"ActivePage": "configuracion",
			}))
		})
	}

	// Admin panel views (templates/admin/*.html) — all of them
	// protected by RequireAdminAuth, except the login itself.
	router.GET("/admin/iniciar-sesion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "admin-login.html", gin.H{
			"ActivePage": "admin-iniciar-sesion",
		})
	})

	adminGroup := router.Group("/admin", handlers.RequireAdminAuth())
	{
		adminGroup.GET("/base-de-datos", adminHandlers.Database)
		adminGroup.GET("/productos", adminHandlers.Products)
		adminGroup.GET("/anuncios", adminHandlers.Ads)
		adminGroup.GET("/elementor", func(c *gin.Context) {
			c.HTML(http.StatusOK, "elementor.html", gin.H{
				"ActivePage": "admin-elementor",
			})
		})
		adminGroup.GET("/automatizaciones", func(c *gin.Context) {
			c.HTML(http.StatusOK, "automatizaciones.html", gin.H{
				"ActivePage": "admin-automatizaciones",
			})
		})
		adminGroup.GET("/blogs", adminHandlers.Blogs)
		adminGroup.GET("/blogs/nuevo", adminHandlers.NewBlogForm)
		adminGroup.GET("/blogs/:id/editar", adminHandlers.EditBlogForm)
		adminGroup.GET("/citas", adminHandlers.Appointments)
		adminGroup.PATCH("/citas/:id/estado", adminHandlers.UpdateAppointmentStatus)
		adminGroup.DELETE("/citas/:id", adminHandlers.DeleteAppointment)
		adminGroup.GET("/configuracion", adminHandlers.Settings)
		adminGroup.POST("/configuracion/horarios", adminHandlers.UpdateAgendaHours)
		adminGroup.GET("/pedidos", func(c *gin.Context) {
			c.HTML(http.StatusOK, "pedidos.html", gin.H{
				"ActivePage": "admin-pedidos",
			})
		})
	}

	// Auth API — called from iniciar-sesion.js / registro.js
	api := router.Group("/api")
	{
		api.POST("/registro", handlers.Register)
		api.POST("/iniciar-sesion", handlers.Login)
		api.POST("/admin/iniciar-sesion", handlers.AdminLogin)
		api.POST("/agendar", handlers.CreateAppointment)
		api.POST("/agendar/codigo", handlers.SendVerificationCode)
		api.POST("/agendar/verificar", handlers.VerifyCode)
		api.GET("/horarios/ocupadas", handlers.GetOccupiedHours)
		api.GET("/horarios", handlers.GetAgendaHours)
		api.POST("/pedidos", handlers.CreatePedido)
	}

	// Admin JSON API — called from pedidos.js to fill the Pedidos table
	apiAdmin := router.Group("/api/admin", handlers.RequireAdminAuth())
	{
		apiAdmin.GET("/pedidos", adminHandlers.ListOrders)
		apiAdmin.PATCH("/pedidos/:id/estado", adminHandlers.UpdateOrderStatus)
		apiAdmin.DELETE("/pedidos/:id", adminHandlers.DeleteOrder)
		apiAdmin.GET("/estados", adminHandlers.ListStatusOptions)
		apiAdmin.POST("/estados", adminHandlers.CreateStatusOption)
		apiAdmin.PUT("/estados/:id", adminHandlers.UpdateStatusOption)
		apiAdmin.DELETE("/estados/:id", adminHandlers.DeleteStatusOption)
		apiAdmin.GET("/pedidos/configuracion", adminHandlers.GetOrderSettings)
		apiAdmin.PUT("/pedidos/configuracion", adminHandlers.UpdateOrderSettingsHandler)
		apiAdmin.POST("/usuarios", adminHandlers.CreateUser)
		apiAdmin.PUT("/usuarios/:id", adminHandlers.UpdateUser)
		apiAdmin.DELETE("/usuarios/:id", adminHandlers.DeleteUser)
		apiAdmin.POST("/anuncios", adminHandlers.CreateAd)
		apiAdmin.PUT("/anuncios/:id", adminHandlers.UpdateAd)
		apiAdmin.DELETE("/anuncios/:id", adminHandlers.DeleteAd)
		apiAdmin.GET("/marcas", adminHandlers.ListBrands)
		apiAdmin.POST("/productos", adminHandlers.CreateProduct)
		apiAdmin.PUT("/productos/:id", adminHandlers.UpdateProduct)
		apiAdmin.DELETE("/productos/:id", adminHandlers.DeleteProduct)
		apiAdmin.POST("/blogs", adminHandlers.CreateBlog)
		apiAdmin.PUT("/blogs/:id", adminHandlers.UpdateBlog)
		apiAdmin.DELETE("/blogs/:id", adminHandlers.DeleteBlog)
		apiAdmin.POST("/blog-categorias", adminHandlers.CreateBlogCategory)
		apiAdmin.DELETE("/blog-categorias/:id", adminHandlers.DeleteBlogCategory)
		apiAdmin.POST("/blog-etiquetas", adminHandlers.CreateBlogTag)
		apiAdmin.DELETE("/blog-etiquetas/:id", adminHandlers.DeleteBlogTag)
	}

	// Client JSON API — llamada desde index.js / ecommerce.js (el corazón
	// de favoritos) y mis-favoritos.js. Necesita sesión de cliente
	// (cookie), por eso RequireAuthAPI() y no RequireAuth(): un fetch()
	// necesita un 401 en JSON, no un redirect 302.
	apiClient := router.Group("/api", handlers.RequireAuthAPI())
	{
		apiClient.GET("/favorites", handlers.GetFavorites)
		apiClient.POST("/favorites", handlers.AddFavorite)
		apiClient.DELETE("/favorites/:productId", handlers.DeleteFavorite)
	}

	router.GET("/media/blog/:key", handlers.ServeBlogImage)
	router.GET("/media/promos/:key", handlers.ServeAdImage)
	router.GET("/media/productos/*key", handlers.ServeProductImage)
	router.GET("/media/logos/*key", handlers.ServeLogoImage)
	router.GET("/media/hero/:key", handlers.ServeHeroVideo)
	router.GET("/logout", handlers.Logout)
	router.GET("/admin/logout", handlers.AdminLogout)

	// Online store (templates/ecommerce/*.html)
	router.GET("/eccomerce", func(c *gin.Context) {
		c.HTML(http.StatusOK, "ecommerce.html", handlers.WithUser(c, gin.H{
			"ActivePage":   "tienda",
			"ProductsJSON": buildStoreProductsJSON(),
		}))
	})
	router.GET("/eccomerce/:producto", func(c *gin.Context) {
		c.HTML(http.StatusOK, "detalle-producto.html", handlers.WithUser(c, gin.H{
			"ActivePage":   "tienda",
			"Producto":     c.Param("producto"),
			"ProductsJSON": buildStoreProductsJSON(),
		}))
	})

	// Standalone pages (templates/pages/*.html)
	router.GET("/blog", handlers.BlogList)
	router.GET("/blog/:id", handlers.BlogDetail)
	router.GET("/agendar", func(c *gin.Context) {
		c.HTML(http.StatusOK, "agendar.html", handlers.WithUser(c, gin.H{
			"ActivePage": "agendar",
		}))
	})
	router.GET("/carrito", func(c *gin.Context) {
		c.HTML(http.StatusOK, "carrito.html", handlers.WithUser(c, gin.H{
			"ActivePage": "carrito",
		}))
	})
	router.GET("/pasarela-de-pagos", func(c *gin.Context) {
		c.HTML(http.StatusOK, "pasarela-de-pagos.html", handlers.WithUser(c, gin.H{
			"ActivePage": "pasarela-de-pagos",
		}))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Servidor corriendo en http://localhost:%s\n", port)
	router.Run(":" + port)
}
