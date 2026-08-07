// Package storage conecta con el Storage Bucket de Railway (compatible con S3)
// y expone funciones simples para subir, leer y borrar objetos.
//
// Requiere las variables de entorno:
//
//	BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_NAME
//
// (ver instrucciones al final para crearlas como Variable References en Railway)
package storage

import (
	"context"
	"io"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	client     *s3.Client
	bucketName string
)

// Connect inicializa el cliente S3 apuntando al bucket de Railway.
// Llamar una sola vez en main(), igual que db.Connect().
func Connect() {
	endpoint := os.Getenv("BUCKET_ENDPOINT")
	accessKey := os.Getenv("BUCKET_ACCESS_KEY_ID")
	secretKey := os.Getenv("BUCKET_SECRET_ACCESS_KEY")
	bucketName = os.Getenv("BUCKET_NAME")
	region := os.Getenv("BUCKET_REGION")
	if region == "" {
		region = "auto"
	}

	if endpoint == "" || accessKey == "" || secretKey == "" || bucketName == "" {
		log.Fatal("Faltan variables de entorno del bucket (BUCKET_ENDPOINT / BUCKET_ACCESS_KEY_ID / BUCKET_SECRET_ACCESS_KEY / BUCKET_NAME)")
	}

	cfg := aws.Config{
		Region:      region,
		Credentials: credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
	}

	client = s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		// Los buckets de Railway usan virtual-hosted style por defecto.
		// Si tu bucket es de los "antiguos" y el tab Credentials de Railway
		// dice "path-style", cambia esto a true.
		o.UsePathStyle = false
	})

	log.Println("Conectado al bucket de Railway correctamente.")
}

// UploadObject sube un archivo al bucket bajo la key indicada.
func UploadObject(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucketName),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	})
	return err
}

// GetObject regresa el cuerpo del objeto (el caller debe cerrarlo) y su content-type.
func GetObject(ctx context.Context, key string) (io.ReadCloser, string, error) {
	out, err := client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, "", err
	}
	contentType := "application/octet-stream"
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	return out.Body, contentType, nil
}

// DeleteObject borra un objeto del bucket. Se usa al eliminar o reemplazar un anuncio.
func DeleteObject(ctx context.Context, key string) error {
	_, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
	})
	return err
}
