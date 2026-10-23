-- +goose Up
ALTER TABLE media ADD COLUMN kind TEXT NOT NULL DEFAULT 'document';
UPDATE media SET kind = CASE
    WHEN lower(COALESCE(media_type, '')) LIKE 'image/%' THEN 'image'
    WHEN lower(COALESCE(media_type, '')) LIKE 'video/%' THEN 'video'
    WHEN lower(COALESCE(media_type, '')) LIKE 'audio/%' THEN 'audio'
    ELSE 'document'
END;
ALTER TABLE media ADD CONSTRAINT media_kind_check CHECK (kind IN ('image', 'video', 'audio', 'document'));
CREATE INDEX media_kind_created_at_idx ON media(kind, created_at DESC);

-- +goose Down
DROP INDEX media_kind_created_at_idx;
ALTER TABLE media DROP CONSTRAINT media_kind_check;
ALTER TABLE media DROP COLUMN kind;