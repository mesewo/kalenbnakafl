package mediaimage

import (
	"bytes"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/HugoSmits86/nativewebp"
)

func TestProcessReencodesSupportedFormats(t *testing.T) {
	tests := []struct {
		name   string
		format string
		encode func(*bytes.Buffer) error
	}{
		{"jpeg", "jpeg", func(out *bytes.Buffer) error { return jpeg.Encode(out, testImage(800, 400), nil) }},
		{"png", "png", func(out *bytes.Buffer) error { return png.Encode(out, testImage(800, 400)) }},
		{"webp", "webp", func(out *bytes.Buffer) error { return encodeWebP(out, testImage(800, 400)) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var encoded bytes.Buffer
			if err := test.encode(&encoded); err != nil {
				t.Fatal(err)
			}
			result, err := Process(bytes.NewReader(encoded.Bytes()), 1<<20)
			if err != nil {
				t.Fatal(err)
			}
			if result.Width != 800 || result.Height != 400 {
				t.Fatalf("dimensions = %dx%d, want 800x400", result.Width, result.Height)
			}
			for _, target := range []int{480, 960, 1600} {
				variant := result.Variants[target]
				expectedWidth := min(target, 800)
				expectedHeight := expectedWidth / 2
				if variant.Width != expectedWidth || variant.Height != expectedHeight {
					t.Errorf("variant %d dimensions = %dx%d, want %dx%d", target, variant.Width, variant.Height, expectedWidth, expectedHeight)
				}
				if variant.MediaType == "" || len(variant.Data) == 0 {
					t.Errorf("variant %d not encoded", target)
				}
				if _, format, err := image.Decode(bytes.NewReader(variant.Data)); err != nil || format != test.format {
					t.Errorf("variant %d decode format=%q err=%v", target, format, err)
				}
			}
		})
	}
}

func TestProcessRejectsUnsupportedPolyglotAndDimensionBombs(t *testing.T) {
	var pngData bytes.Buffer
	if err := png.Encode(&pngData, testImage(1, 1)); err != nil {
		t.Fatal(err)
	}
	polyglot := append(append([]byte(nil), pngData.Bytes()...), []byte("MZ executable payload")...)
	result, err := Process(bytes.NewReader(polyglot), 1<<20)
	if err != nil {
		t.Fatalf("valid image with trailing content should be safely re-encoded: %v", err)
	}
	if bytes.Contains(result.Variants[480].Data, []byte("MZ executable payload")) {
		t.Fatal("re-encoded output retained trailing executable payload")
	}
	if _, err := Process(bytes.NewBufferString("<svg xmlns='http://www.w3.org/2000/svg'/>"), 1<<20); err == nil {
		t.Fatal("SVG was accepted")
	}
	if _, err := Process(bytes.NewReader(pngHeader(10001, 1)), 1<<20); err != ErrTooLarge {
		t.Fatalf("oversized dimensions error=%v, want %v", err, ErrTooLarge)
	}
}

func TestProcessRotatesAndStripsExifGPS(t *testing.T) {
	tests := []struct {
		name    string
		encode  func(*bytes.Buffer) error
		addExif func([]byte, []byte) []byte
	}{
		{"jpeg", func(out *bytes.Buffer) error { return jpeg.Encode(out, testImage(3, 2), nil) }, insertExif},
		{"png", func(out *bytes.Buffer) error { return png.Encode(out, testImage(3, 2)) }, insertPNGExif},
		{"webp", func(out *bytes.Buffer) error { return encodeWebP(out, testImage(3, 2)) }, insertWebPExif},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var encoded bytes.Buffer
			if err := test.encode(&encoded); err != nil {
				t.Fatal(err)
			}
			withExif := test.addExif(encoded.Bytes(), minimalExifOrientationGPS())
			result, err := Process(bytes.NewReader(withExif), 1<<20)
			if err != nil {
				t.Fatal(err)
			}
			if result.Width != 2 || result.Height != 3 {
				t.Fatalf("oriented dimensions = %dx%d, want 2x3", result.Width, result.Height)
			}
			for _, variant := range result.Variants {
				if bytes.Contains(variant.Data, []byte("Exif\x00\x00")) {
					t.Fatal("re-encoded image retained EXIF/GPS metadata")
				}
			}
		})
	}
}

func insertPNGExif(pngData, exifPayload []byte) []byte {
	tiff := bytes.TrimPrefix(exifPayload, []byte("Exif\x00\x00"))
	chunk := make([]byte, 8, 12+len(tiff))
	binary.BigEndian.PutUint32(chunk[:4], uint32(len(tiff)))
	copy(chunk[4:8], "eXIf")
	chunk = append(chunk, tiff...)
	checksumInput := append([]byte("eXIf"), tiff...)
	checksum := make([]byte, 4)
	binary.BigEndian.PutUint32(checksum, crc32.ChecksumIEEE(checksumInput))
	chunk = append(chunk, checksum...)
	result := append([]byte(nil), pngData[:33]...)
	result = append(result, chunk...)
	return append(result, pngData[33:]...)
}

func insertWebPExif(webpData, exifPayload []byte) []byte {
	chunk := make([]byte, 8, 8+len(exifPayload)+1)
	copy(chunk[:4], "EXIF")
	binary.LittleEndian.PutUint32(chunk[4:8], uint32(len(exifPayload)))
	chunk = append(chunk, exifPayload...)
	if len(exifPayload)%2 != 0 {
		chunk = append(chunk, 0)
	}
	result := append([]byte(nil), webpData...)
	result = append(result, chunk...)
	binary.LittleEndian.PutUint32(result[4:8], uint32(len(result)-8))
	return result
}

func testImage(width, height int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 100, A: 255})
		}
	}
	return img
}

func encodeWebP(out *bytes.Buffer, img image.Image) error {
	return nativewebp.Encode(out, img, nil)
}

func pngHeader(width, height int) []byte {
	out := make([]byte, 33)
	copy(out[:8], []byte("\x89PNG\r\n\x1a\n"))
	binary.BigEndian.PutUint32(out[8:12], 13)
	copy(out[12:16], "IHDR")
	binary.BigEndian.PutUint32(out[16:20], uint32(width))
	binary.BigEndian.PutUint32(out[20:24], uint32(height))
	out[24], out[25] = 8, 2
	binary.BigEndian.PutUint32(out[29:33], crc32.ChecksumIEEE(out[12:29]))
	return out
}

func insertExif(jpegData, exifPayload []byte) []byte {
	segment := []byte{0xff, 0xe1, byte((len(exifPayload) + 2) >> 8), byte(len(exifPayload) + 2)}
	segment = append(segment, exifPayload...)
	result := append([]byte(nil), jpegData[:2]...)
	result = append(result, segment...)
	return append(result, jpegData[2:]...)
}

func minimalExifOrientationGPS() []byte {
	tiff := make([]byte, 52)
	copy(tiff[:4], []byte("II*\x00"))
	binary.LittleEndian.PutUint32(tiff[4:8], 8)
	binary.LittleEndian.PutUint16(tiff[8:10], 2)
	binary.LittleEndian.PutUint16(tiff[10:12], 0x0112)
	binary.LittleEndian.PutUint16(tiff[12:14], 3)
	binary.LittleEndian.PutUint32(tiff[14:18], 1)
	binary.LittleEndian.PutUint16(tiff[18:20], 6)
	binary.LittleEndian.PutUint16(tiff[22:24], 0x8825)
	binary.LittleEndian.PutUint16(tiff[24:26], 4)
	binary.LittleEndian.PutUint32(tiff[26:30], 1)
	binary.LittleEndian.PutUint32(tiff[30:34], 38)
	binary.LittleEndian.PutUint32(tiff[34:38], 0)
	binary.LittleEndian.PutUint16(tiff[38:40], 1)
	binary.LittleEndian.PutUint16(tiff[40:42], 0)
	tiff[42], tiff[43] = 1, 2
	binary.LittleEndian.PutUint32(tiff[44:48], 4)
	tiff[48], tiff[49] = 2, 3
	return append([]byte("Exif\x00\x00"), tiff...)
}
