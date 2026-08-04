package main

import (
	"html/template"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// loadTemplates arma un único *template.Template con las páginas que viven
// directo en templates/ (index.html, y luego blog.html, eccomerce.html...)
// más los partials (templates/partials/*.html, como navbar.html) para que
// {{template "navbar" .}} funcione dentro de cualquier página.
//
// Si ya tienes páginas de admin en templates/admin/*.html y también quieres
// cargarlas con este mismo Engine, agrega aquí:
//
//	tmpl = template.Must(tmpl.ParseGlob("templates/admin/*.html"))
func loadTemplates() *template.Template {
	tmpl := template.Must(template.ParseGlob("templates/*.html"))
	tmpl = template.Must(tmpl.ParseGlob("templates/partials/*.html"))
	return tmpl
}

func main() {
	router := gin.Default()

	router.SetHTMLTemplate(loadTemplates())
	router.Static("/static", "./static")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"ActivePage": "inicio",
		})
	})

	// Cuando existan tienda.html / blog.html directo en templates/, se
	// agregan aquí de la misma forma, pasando el ActivePage que
	// corresponda para que el navbar marque el link activo:
	//
	// router.GET("/tienda", func(c *gin.Context) {
	// 	c.HTML(http.StatusOK, "eccomerce.html", gin.H{"ActivePage": "tienda"})
	// })
	// router.GET("/blog", func(c *gin.Context) {
	// 	c.HTML(http.StatusOK, "blog.html", gin.H{"ActivePage": "blog"})
	// })

	log.Println("Servidor corriendo en http://localhost:8080")
	router.Run(":8080")
}
