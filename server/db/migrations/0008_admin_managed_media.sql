-- +goose Up
ALTER TABLE media
    ADD COLUMN width INTEGER,
    ADD COLUMN height INTEGER,
    ADD COLUMN decorative BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN variant_480_path VARCHAR(500),
    ADD COLUMN variant_960_path VARCHAR(500),
    ADD COLUMN variant_1600_path VARCHAR(500);
ALTER TABLE media ADD CONSTRAINT media_dimensions_check
    CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));
ALTER TABLE media_translations
    ADD COLUMN alt_text TEXT NOT NULL DEFAULT '';
UPDATE media_translations SET alt_text = title WHERE alt_text = '';

ALTER TABLE events ADD COLUMN cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
CREATE INDEX events_cover_media_id_idx ON events(cover_media_id) WHERE cover_media_id IS NOT NULL;

CREATE TABLE post_media_references (
    post_id INTEGER NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    PRIMARY KEY (post_id, locale, media_id),
    FOREIGN KEY (post_id, locale) REFERENCES post_translations(post_id, locale) ON DELETE CASCADE
);
CREATE INDEX post_media_references_media_idx ON post_media_references(media_id);

CREATE TABLE home_slides (
    id SERIAL PRIMARY KEY,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    link TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX home_slides_active_order_idx ON home_slides(active, sort_order, id);
CREATE TABLE home_slide_translations (
    slide_id INTEGER NOT NULL REFERENCES home_slides(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    caption TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (slide_id, locale)
);

CREATE TABLE site_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    logo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    favicon_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    social_image_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO site_settings (id) VALUES (1);
CREATE TABLE site_setting_translations (
    settings_id SMALLINT NOT NULL REFERENCES site_settings(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    site_name TEXT NOT NULL DEFAULT '',
    tagline TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (settings_id, locale)
);

CREATE TABLE site_blocks (
    id SERIAL PRIMARY KEY,
    page TEXT NOT NULL,
    block_key TEXT NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (page, block_key)
);
CREATE TABLE site_block_translations (
    block_id INTEGER NOT NULL REFERENCES site_blocks(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    text TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (block_id, locale)
);

CREATE TABLE about_images (
    id SERIAL PRIMARY KEY,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX about_images_sort_order_idx ON about_images(sort_order, id);
CREATE TABLE about_image_translations (
    image_id INTEGER NOT NULL REFERENCES about_images(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    caption TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (image_id, locale)
);

-- +goose Down
DROP TABLE about_image_translations;
DROP TABLE about_images;
DROP TABLE site_block_translations;
DROP TABLE site_blocks;
DROP TABLE site_setting_translations;
DROP TABLE site_settings;
DROP TABLE home_slide_translations;
DROP TABLE home_slides;
DROP INDEX post_media_references_media_idx;
DROP TABLE post_media_references;
DROP INDEX events_cover_media_id_idx;
ALTER TABLE events DROP COLUMN cover_media_id;
ALTER TABLE media_translations DROP COLUMN alt_text;
ALTER TABLE media DROP CONSTRAINT media_dimensions_check;
ALTER TABLE media
    DROP COLUMN variant_1600_path,
    DROP COLUMN variant_960_path,
    DROP COLUMN variant_480_path,
    DROP COLUMN decorative,
    DROP COLUMN height,
    DROP COLUMN width;
