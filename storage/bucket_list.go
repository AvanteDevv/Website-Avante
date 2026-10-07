package storage

// Funciones extra del bucket para Administración → Clarito: listar una
// "carpeta", saber si un archivo ya existe y su tamaño.
//
// En S3 (y en el bucket de Railway) no hay carpetas de verdad: todo es
// una lista plana de keys como "clarito/guardados/Octubre 2026/x.pdf".
// Las carpetas se arman con el "/" (Delimiter) al listar.

import (
	"context"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awshttp "github.com/aws/aws-sdk-go-v2/aws/transport/http"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ObjectInfo es un archivo dentro del bucket.
type ObjectInfo struct {
	Key      string    `json:"key"`
	Size     int64     `json:"size"`
	Modified time.Time `json:"modified"`
}

// Ready dice si ya se llamó Connect().
func Ready() bool { return client != nil }

// ListFolder regresa las subcarpetas (prefijos completos, terminan en "/")
// y los archivos que están directamente dentro de prefix.
func ListFolder(ctx context.Context, prefix string) (folders []string, files []ObjectInfo, err error) {
	folders = []string{}
	files = []ObjectInfo{}
	var token *string
	for i := 0; i < 50; i++ { // hasta 50 000 objetos por carpeta
		out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucketName),
			Prefix:            aws.String(prefix),
			Delimiter:         aws.String("/"),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, nil, err
		}
		for _, p := range out.CommonPrefixes {
			if p.Prefix != nil {
				folders = append(folders, *p.Prefix)
			}
		}
		for _, o := range out.Contents {
			files = append(files, objectInfo(o))
		}
		if out.IsTruncated == nil || !*out.IsTruncated || out.NextContinuationToken == nil {
			break
		}
		token = out.NextContinuationToken
	}
	return folders, files, nil
}

// CountPrefix cuenta los objetos bajo prefix (sin Delimiter), hasta max.
func CountPrefix(ctx context.Context, prefix string, max int) (int, error) {
	n := 0
	var token *string
	for n < max {
		out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucketName),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
			MaxKeys:           aws.Int32(1000),
		})
		if err != nil {
			return n, err
		}
		n += len(out.Contents)
		if out.IsTruncated == nil || !*out.IsTruncated || out.NextContinuationToken == nil {
			break
		}
		token = out.NextContinuationToken
	}
	if n > max {
		n = max
	}
	return n, nil
}

// ListPrefix regresa TODOS los archivos bajo prefix (incluye subcarpetas),
// hasta max. Se usa para renombrar o revisar si una carpeta está vacía.
func ListPrefix(ctx context.Context, prefix string, max int) ([]ObjectInfo, error) {
	files := []ObjectInfo{}
	var token *string
	for len(files) < max {
		out, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(bucketName),
			Prefix:            aws.String(prefix),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, err
		}
		for _, o := range out.Contents {
			files = append(files, objectInfo(o))
		}
		if out.IsTruncated == nil || !*out.IsTruncated || out.NextContinuationToken == nil {
			break
		}
		token = out.NextContinuationToken
	}
	if len(files) > max {
		files = files[:max]
	}
	return files, nil
}

// CopyKey copia un objeto a otra key. A diferencia de CopyObject, escapa
// la key de origen (necesario si tiene espacios, acentos o "ñ").
func CopyKey(ctx context.Context, sourceKey, destKey string) error {
	parts := strings.Split(sourceKey, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	_, err := client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(bucketName),
		CopySource: aws.String(bucketName + "/" + strings.Join(parts, "/")),
		Key:        aws.String(destKey),
	})
	return err
}

// StatObject regresa la info de un archivo, o (nil, nil) si no existe.
func StatObject(ctx context.Context, key string) (*ObjectInfo, error) {
	out, err := client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		if IsNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	info := &ObjectInfo{Key: key}
	if out.ContentLength != nil {
		info.Size = *out.ContentLength
	}
	if out.LastModified != nil {
		info.Modified = *out.LastModified
	}
	return info, nil
}

// IsNotFound dice si el error del bucket es "no existe".
func IsNotFound(err error) bool {
	if err == nil {
		return false
	}
	var nf *types.NotFound
	var nk *types.NoSuchKey
	if errors.As(err, &nf) || errors.As(err, &nk) {
		return true
	}
	var re *awshttp.ResponseError
	if errors.As(err, &re) && re.HTTPStatusCode() == 404 {
		return true
	}
	return strings.Contains(err.Error(), "StatusCode: 404")
}

func objectInfo(o types.Object) ObjectInfo {
	info := ObjectInfo{}
	if o.Key != nil {
		info.Key = *o.Key
	}
	if o.Size != nil {
		info.Size = *o.Size
	}
	if o.LastModified != nil {
		info.Modified = *o.LastModified
	}
	return info
}
