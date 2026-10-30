package mediaimage

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"math"

	"github.com/HugoSmits86/nativewebp"
	xdraw "golang.org/x/image/draw"
)

const (
	maxWidth      = 10000
	maxHeight     = 10000
	maxPixelCount = 40000000
	maxInputBytes = 50 << 20
	jpegQuality   = 84
)

var ErrUnsupported = errors.New("unsupported or invalid image")
var ErrTooLarge = errors.New("image exceeds processing limits")

func init() {
	image.RegisterFormat("webp", "RIFF????WEBP", nativewebp.Decode, nativewebp.DecodeConfig)
}

type Variant struct {
	Width     int
	Height    int
	MediaType string
	Extension string
	Data      []byte
}

type Result struct {
	Width    int
	Height   int
	Variants map[int]Variant
}

func Process(source io.Reader, maxBytes int64) (Result, error) {
	if maxBytes <= 0 || maxBytes > maxInputBytes {
		maxBytes = maxInputBytes
	}
	data, err := io.ReadAll(io.LimitReader(source, maxBytes+1))
	if err != nil {
		return Result{}, fmt.Errorf("read image: %w", err)
	}
	if len(data) == 0 {
		return Result{}, ErrUnsupported
	}
	if int64(len(data)) > maxBytes {
		return Result{}, ErrTooLarge
	}

	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Result{}, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}
	if format != "jpeg" && format != "png" && format != "webp" {
		return Result{}, ErrUnsupported
	}
	if config.Width < 1 || config.Height < 1 || config.Width > maxWidth ||
		config.Height > maxHeight || int64(config.Width)*int64(config.Height) > maxPixelCount {
		return Result{}, ErrTooLarge
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || decodedFormat != format {
		if err == nil {
			err = errors.New("image format mismatch")
		}
		return Result{}, fmt.Errorf("%w: %v", ErrUnsupported, err)
	}

	decoded = orient(decoded, exifOrientation(data))
	bounds := decoded.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width > maxWidth || height > maxHeight || int64(width)*int64(height) > maxPixelCount {
		return Result{}, ErrTooLarge
	}
	result := Result{Width: width, Height: height, Variants: make(map[int]Variant, 3)}
	encodedByWidth := make(map[int]Variant, 3)
	for _, requestedWidth := range []int{480, 960, 1600} {
		variantWidth := min(requestedWidth, width)
		variant, exists := encodedByWidth[variantWidth]
		if !exists {
			variantHeight := max(1, int(math.Round(float64(height)*float64(variantWidth)/float64(width))))
			scaled := image.NewRGBA(image.Rect(0, 0, variantWidth, variantHeight))
			xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), decoded, bounds, xdraw.Over, nil)
			variant, err = encode(scaled, format)
			if err != nil {
				return Result{}, fmt.Errorf("encode image variant: %w", err)
			}
			variant.Width, variant.Height = variantWidth, variantHeight
			encodedByWidth[variantWidth] = variant
		}
		result.Variants[requestedWidth] = variant
	}
	return result, nil
}

func encode(img image.Image, format string) (Variant, error) {
	var out bytes.Buffer
	variant := Variant{}
	switch format {
	case "jpeg":
		variant.MediaType, variant.Extension = "image/jpeg", ".jpg"
		err := jpeg.Encode(&out, opaqueOnWhite(img), &jpeg.Options{Quality: jpegQuality})
		if err != nil {
			return Variant{}, err
		}
	case "png":
		variant.MediaType, variant.Extension = "image/png", ".png"
		err := png.Encode(&out, img)
		if err != nil {
			return Variant{}, err
		}
	case "webp":
		variant.MediaType, variant.Extension = "image/webp", ".webp"
		if err := nativewebp.Encode(&out, img, nil); err != nil {
			return Variant{}, err
		}
	}
	variant.Data = out.Bytes()
	return variant, nil
}

func opaqueOnWhite(src image.Image) image.Image {
	bounds := src.Bounds()
	dst := image.NewRGBA(bounds)
	draw := xdraw.Draw
	draw(dst, bounds, image.NewUniform(color.White), image.Point{}, xdraw.Src)
	draw(dst, bounds, src, bounds.Min, xdraw.Over)
	return dst
}

func exifOrientation(data []byte) int {
	switch {
	case len(data) >= 2 && data[0] == 0xff && data[1] == 0xd8:
		return jpegExifOrientation(data)
	case len(data) >= 8 && bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n")):
		return pngExifOrientation(data)
	case len(data) >= 12 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")):
		return webpExifOrientation(data)
	default:
		return 1
	}
}

func jpegExifOrientation(data []byte) int {
	for offset := 2; offset+4 <= len(data) && data[offset] == 0xff; {
		marker := data[offset+1]
		if marker == 0xda || marker == 0xd9 {
			break
		}
		segmentLength := int(data[offset+2])<<8 | int(data[offset+3])
		if segmentLength < 2 || offset+2+segmentLength > len(data) {
			break
		}
		payload := data[offset+4 : offset+2+segmentLength]
		if marker == 0xe1 {
			if orientation := orientationFromExifPayload(payload); orientation != 0 {
				return orientation
			}
		}
		offset += 2 + segmentLength
	}
	return 1
}

func pngExifOrientation(data []byte) int {
	for offset := 8; offset+12 <= len(data); {
		length := uint64(binary.BigEndian.Uint32(data[offset : offset+4]))
		start := offset + 8
		chunkType := data[offset+4 : offset+8]
		if length > uint64(len(data)-start-4) {
			return 1
		}
		end := start + int(length)
		if bytes.Equal(chunkType, []byte("eXIf")) {
			if orientation := orientationFromExifPayload(data[start:end]); orientation != 0 {
				return orientation
			}
		}
		offset = end + 4
		if bytes.Equal(chunkType, []byte("IEND")) {
			break
		}
	}
	return 1
}

func webpExifOrientation(data []byte) int {
	for offset := 12; offset+8 <= len(data); {
		length := uint64(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		start := offset + 8
		if length > uint64(len(data)-start) {
			return 1
		}
		end := start + int(length)
		if bytes.Equal(data[offset:offset+4], []byte("EXIF")) {
			if orientation := orientationFromExifPayload(data[start:end]); orientation != 0 {
				return orientation
			}
		}
		offset = end + int(length&1)
	}
	return 1
}

func orientationFromExifPayload(payload []byte) int {
	payload = bytes.TrimPrefix(payload, []byte("Exif\x00\x00"))
	return parseTIFFOrientation(payload)
}

func parseTIFFOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 0
	}
	littleEndian := bytes.Equal(tiff[:2], []byte("II"))
	if !littleEndian && !bytes.Equal(tiff[:2], []byte("MM")) {
		return 0
	}
	var order binary.ByteOrder = binary.BigEndian
	if littleEndian {
		order = binary.LittleEndian
	}
	if order.Uint16(tiff[2:4]) != 42 {
		return 0
	}
	offset := uint64(order.Uint32(tiff[4:8]))
	if offset+2 > uint64(len(tiff)) {
		return 0
	}
	count := int(order.Uint16(tiff[offset : offset+2]))
	start := offset + 2
	for index := 0; index < count; index++ {
		entry := start + uint64(index*12)
		if entry+12 > uint64(len(tiff)) {
			return 0
		}
		if order.Uint16(tiff[entry:entry+2]) != 0x0112 ||
			order.Uint16(tiff[entry+2:entry+4]) != 3 ||
			order.Uint32(tiff[entry+4:entry+8]) < 1 {
			continue
		}
		valueOffset := entry + 8
		if order.Uint32(tiff[entry+4:entry+8]) > 1 {
			valueOffset = uint64(order.Uint32(tiff[entry+8 : entry+12]))
		}
		if valueOffset+2 > uint64(len(tiff)) {
			return 0
		}
		orientation := int(order.Uint16(tiff[valueOffset : valueOffset+2]))
		if orientation >= 1 && orientation <= 8 {
			return orientation
		}
	}
	return 0
}

func orient(src image.Image, orientation int) image.Image {
	bounds := src.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	rotated := orientation >= 5 && orientation <= 8
	dstWidth, dstHeight := width, height
	if rotated {
		dstWidth, dstHeight = height, width
	}
	dst := image.NewRGBA(image.Rect(0, 0, dstWidth, dstHeight))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			var dx, dy int
			switch orientation {
			case 2:
				dx, dy = width-1-x, y
			case 3:
				dx, dy = width-1-x, height-1-y
			case 4:
				dx, dy = x, height-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = height-1-y, x
			case 7:
				dx, dy = height-1-y, width-1-x
			case 8:
				dx, dy = y, width-1-x
			default:
				dx, dy = x, y
			}
			dst.Set(dx, dy, src.At(bounds.Min.X+x, bounds.Min.Y+y))
		}
	}
	return dst
}
