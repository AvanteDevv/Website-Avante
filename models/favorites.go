package models

import (
	"time"

	"avante-optics/db"
)

// ⚠️ Ajusta "avante-optics" en el import de arriba para que coincida con
// el nombre del módulo en tu go.mod, igual que en users.go.
//
// Antes de usar este archivo, corre favorites_table.sql contra tu base.

// Favorite representa una fila de la tabla `favorites`: un producto que
// un cliente guardó desde el Home o la Tienda. ProductID es el mismo id
// que ya arma el frontend ("index-0", "eccomerce-3", etc.) — no hay
// tabla de catálogo real todavía, así que se guarda el nombre/precio/
// marca "planos" tal como se ven en el momento de guardarlos.
type Favorite struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"-"`
	ProductID string    `json:"product_id"`
	Name      string    `json:"name"`
	Brand     string    `json:"brand,omitempty"`
	Price     string    `json:"price"`
	OldPrice  string    `json:"old_price,omitempty"`
	Icon      string    `json:"icon,omitempty"`
	Image     string    `json:"image,omitempty"`
	Badge     string    `json:"badge,omitempty"`
	URL       string    `json:"url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// GetFavoritesByUser devuelve todos los favoritos de un usuario, más
// recientes primero.
func GetFavoritesByUser(userID int64) ([]Favorite, error) {
	rows, err := db.DB.Query(
		`SELECT id, user_id, product_id, name, brand, price, old_price, icon, image, badge, url, created_at
		 FROM favorites WHERE user_id = ? ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	favorites := []Favorite{}
	for rows.Next() {
		var f Favorite
		if err := rows.Scan(&f.ID, &f.UserID, &f.ProductID, &f.Name, &f.Brand, &f.Price, &f.OldPrice, &f.Icon, &f.Image, &f.Badge, &f.URL, &f.CreatedAt); err != nil {
			return nil, err
		}
		favorites = append(favorites, f)
	}
	return favorites, rows.Err()
}

// AddFavorite guarda un producto como favorito de un usuario. Es idempotente:
// si ya existe ese product_id para ese usuario (UNIQUE user_id+product_id),
// no lo duplica ni truena — actualiza esa fila con los datos que llegaron
// ahora (nombre, precio, imagen, etc.), por si cambiaron desde la última
// vez que se guardó.
func AddFavorite(userID int64, f Favorite) (*Favorite, error) {
	_, err := db.DB.Exec(
		`INSERT INTO favorites (user_id, product_id, name, brand, price, old_price, icon, image, badge, url)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE
		   name = VALUES(name), brand = VALUES(brand), price = VALUES(price),
		   old_price = VALUES(old_price), icon = VALUES(icon), image = VALUES(image),
		   badge = VALUES(badge), url = VALUES(url)`,
		userID, f.ProductID, f.Name, f.Brand, f.Price, f.OldPrice, f.Icon, f.Image, f.Badge, f.URL,
	)
	if err != nil {
		return nil, err
	}

	var saved Favorite
	err = db.DB.QueryRow(
		`SELECT id, user_id, product_id, name, brand, price, old_price, icon, image, badge, url, created_at
		 FROM favorites WHERE user_id = ? AND product_id = ?`,
		userID, f.ProductID,
	).Scan(&saved.ID, &saved.UserID, &saved.ProductID, &saved.Name, &saved.Brand, &saved.Price, &saved.OldPrice, &saved.Icon, &saved.Image, &saved.Badge, &saved.URL, &saved.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

// RemoveFavorite quita un producto de los favoritos de un usuario. No es
// un error si no existía (DELETE simplemente afecta 0 filas).
func RemoveFavorite(userID int64, productID string) error {
	_, err := db.DB.Exec(
		"DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
		userID, productID,
	)
	return err
}
