package main

import (
	"html/template"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"

	"avante-optics/auth"
	"avante-optics/db"
	"avante-optics/handlers"
)

// ⚠️ Ajusta "avante-optics" en los imports de arriba para que coincida con
// el nombre del módulo en tu go.mod (primera línea: "module xxxxx").

func loadTemplates() *template.Template {
	tmpl := template.Must(template.ParseGlob("templates/*.html"))
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
	// .env es opcional: en local lo usas para tus credenciales de Railway;
	// en producción (Railway/otro host) las variables ya vienen inyectadas
	// directo al entorno, así que si no hay .env no pasa nada.
	if err := godotenv.Load(); err != nil {
		log.Println("No se encontró .env — usando variables de entorno del sistema.")
	}

	db.Connect()
	defer db.DB.Close()

	auth.InitStore()

	router := gin.Default()

	router.SetHTMLTemplate(loadTemplates())
	router.Static("/static", "./static")
	router.Static("/css", "./static/css")
	router.Static("/js", "./static/js")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"ActivePage": "inicio",
		})
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

	// Vistas del panel de cliente (templates/client/*.html)
	router.GET("/dashboard", func(c *gin.Context) {
		c.HTML(http.StatusOK, "dashboard.html", gin.H{
			"ActivePage": "dashboard",
		})
	})
	router.GET("/mis-favoritos", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mis-favoritos.html", gin.H{
			"ActivePage": "mis-favoritos",
		})
	})
	router.GET("/mis-pedidos", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mis-pedidos.html", gin.H{
			"ActivePage": "mis-pedidos",
		})
	})
	router.GET("/mi-perfil", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mi-perfil.html", gin.H{
			"ActivePage": "mi-perfil",
		})
	})
	router.GET("/mis-citas", func(c *gin.Context) {
		c.HTML(http.StatusOK, "mis-citas.html", gin.H{
			"ActivePage": "mis-citas",
		})
	})
	router.GET("/configuracion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "configuracion.html", gin.H{
			"ActivePage": "configuracion",
		})
	})

	// Vistas del panel de administrador (templates/admin/*.html) — todas
	// protegidas por RequireAdminAuth, salvo el login mismo.
	router.GET("/admin/iniciar-sesion", func(c *gin.Context) {
		c.HTML(http.StatusOK, "admin-login.html", gin.H{
			"ActivePage": "admin-iniciar-sesion",
		})
	})

	adminGroup := router.Group("/admin", handlers.RequireAdminAuth())
	{
		adminGroup.GET("/base-de-datos", func(c *gin.Context) {
			c.HTML(http.StatusOK, "base-de-datos.html", gin.H{
				"ActivePage": "admin-base-de-datos",
			})
		})
	}

	// API de autenticación — llamadas desde iniciar-sesion.js / registro.js
	api := router.Group("/api")
	{
		api.POST("/registro", handlers.Register)
		api.POST("/iniciar-sesion", handlers.Login)
		api.POST("/admin/iniciar-sesion", handlers.AdminLogin)
	}
	router.GET("/logout", handlers.Logout)
	router.GET("/admin/logout", handlers.AdminLogout)

	// Tienda en línea (templates/ecommerce/*.html)
	router.GET("/eccomerce", func(c *gin.Context) {
		c.HTML(http.StatusOK, "ecommerce.html", gin.H{
			"ActivePage": "tienda",
		})
	})
	router.GET("/eccomerce/:producto", func(c *gin.Context) {
		c.HTML(http.StatusOK, "detalle-producto.html", gin.H{
			"ActivePage": "tienda",
			"Producto":   c.Param("producto"),
		})
	})

	// Páginas sueltas (templates/pages/*.html)
	router.GET("/blog", func(c *gin.Context) {
		c.HTML(http.StatusOK, "blog.html", gin.H{
			"ActivePage": "blog",
		})
	})
	router.GET("/agendar", func(c *gin.Context) {
		c.HTML(http.StatusOK, "agendar.html", gin.H{
			"ActivePage": "agendar",
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Servidor corriendo en http://localhost:%s\n", port)
	router.Run(":" + port)
}
