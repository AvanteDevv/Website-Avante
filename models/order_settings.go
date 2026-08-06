package models

import (
	"fmt"

	"avante-optics/db"
)

// ⚠️ Adjust "avante-optics" in the import above to match the module name
// declared in your go.mod (first line: "module xxxxx").
//
// Requires a MySQL table with exactly one row (id = 1). Run this once
// against your database:
//
//	CREATE TABLE order_settings (
//	  id          INT PRIMARY KEY,
//	  code_prefix VARCHAR(10) NOT NULL DEFAULT 'AVT',
//	  next_number INT NOT NULL DEFAULT 10489
//	);
//
//	INSERT INTO order_settings (id, code_prefix, next_number) VALUES (1, 'AVT', 10489);

// OrderSettings controls how order codes are generated — e.g. prefix
// "AVT" + next_number 10489 produces "AVT-10489", then the counter
// advances to 10490 for the following order. Editable from the
// "Configurar estados" panel.
type OrderSettings struct {
	CodePrefix string `json:"codePrefix"`
	NextNumber int    `json:"nextNumber"`
}

// GetOrderSettings returns the single settings row.
func GetOrderSettings() (*OrderSettings, error) {
	var s OrderSettings
	err := db.DB.QueryRow("SELECT code_prefix, next_number FROM order_settings WHERE id = 1").
		Scan(&s.CodePrefix, &s.NextNumber)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// UpdateOrderSettings changes the prefix and/or the next order number.
func UpdateOrderSettings(prefix string, nextNumber int) error {
	_, err := db.DB.Exec("UPDATE order_settings SET code_prefix = ?, next_number = ? WHERE id = 1", prefix, nextNumber)
	return err
}

// nextOrderCode reads the current settings, builds the code for a new
// order, and advances the counter. Called from CreateOrder.
func nextOrderCode() (string, error) {
	settings, err := GetOrderSettings()
	if err != nil {
		return "", err
	}

	code := fmt.Sprintf("%s-%05d", settings.CodePrefix, settings.NextNumber)

	if _, err := db.DB.Exec("UPDATE order_settings SET next_number = next_number + 1 WHERE id = 1"); err != nil {
		return "", err
	}

	return code, nil
}
