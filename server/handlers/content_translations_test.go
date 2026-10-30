package handlers

import (
	"testing"

	"kalenbnakafl/models"
)

func TestValidMediaTranslationsRequiresBilingualAltTextUnlessDecorative(t *testing.T) {
	tests := []struct {
		name         string
		translations map[string]*models.MediaTranslation
		decorative   bool
		wantValid    bool
	}{
		{
			name: "bilingual alt text",
			translations: map[string]*models.MediaTranslation{
				"en": {AltText: "A community event"},
				"am": {AltText: "የማኅበረሰብ ዝግጅት"},
			},
			wantValid: true,
		},
		{
			name: "missing language",
			translations: map[string]*models.MediaTranslation{
				"en": {AltText: "A community event"},
			},
		},
		{
			name: "empty alt text",
			translations: map[string]*models.MediaTranslation{
				"en": {AltText: "A community event"},
				"am": {AltText: ""},
			},
		},
		{name: "decorative image may omit translations", decorative: true, wantValid: true},
		{
			name: "decorative image may provide one translated title",
			translations: map[string]*models.MediaTranslation{
				"en": {Title: "Background"},
			},
			decorative: true,
			wantValid:  true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, got := validMediaTranslations(test.translations, test.decorative)
			if got != test.wantValid {
				t.Fatalf("validMediaTranslations()=%v want %v", got, test.wantValid)
			}
		})
	}
}
