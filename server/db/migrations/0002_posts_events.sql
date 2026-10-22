-- +goose Up
ALTER TABLE posts ADD COLUMN slug TEXT;
ALTER TABLE posts ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, ''))
) STORED;

UPDATE posts SET published_at = COALESCE(updated_at, created_at) WHERE published = true;

-- +goose StatementBegin
DO $$
DECLARE
    post_row RECORD;
    base_slug TEXT;
    candidate TEXT;
    suffix INTEGER;
BEGIN
    FOR post_row IN SELECT id, title FROM posts ORDER BY id LOOP
        base_slug := trim(both '-' from left(regexp_replace(lower(post_row.title), '[^a-z0-9]+', '-', 'g'), 88));
        IF base_slug = '' THEN
            base_slug := 'post-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
        END IF;
        candidate := base_slug;
        suffix := 2;
        WHILE EXISTS (SELECT 1 FROM posts WHERE slug = candidate) LOOP
            candidate := left(base_slug, 96 - length(suffix::text)) || '-' || suffix::text;
            suffix := suffix + 1;
        END LOOP;
        UPDATE posts SET slug = candidate WHERE id = post_row.id;
    END LOOP;
END $$;
-- +goose StatementEnd

ALTER TABLE posts ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX posts_slug_key ON posts(slug);
CREATE INDEX posts_search_vector_idx ON posts USING GIN(search_vector);

ALTER TABLE events ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN ends_at TIMESTAMPTZ;
ALTER TABLE events ADD CONSTRAINT events_ends_after_start CHECK (ends_at IS NULL OR ends_at > event_date);

-- +goose Down
ALTER TABLE events DROP CONSTRAINT events_ends_after_start;
ALTER TABLE events DROP COLUMN ends_at;
ALTER TABLE events DROP COLUMN location;
DROP INDEX posts_search_vector_idx;
DROP INDEX posts_slug_key;
ALTER TABLE posts DROP COLUMN search_vector;
ALTER TABLE posts DROP COLUMN cover_media_id;
ALTER TABLE posts DROP COLUMN published_at;
ALTER TABLE posts DROP COLUMN slug;