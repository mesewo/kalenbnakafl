-- +goose Up
CREATE TABLE post_translations (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (post_id, locale)
);
INSERT INTO post_translations(post_id, locale, title, content)
SELECT id, 'en', title, content FROM posts;

CREATE TABLE event_translations (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (event_id, locale)
);
INSERT INTO event_translations(event_id, locale, title, description, location)
SELECT id, 'en', title, description, location FROM events;

CREATE TABLE media_translations (
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    locale TEXT NOT NULL CHECK (locale IN ('en', 'am')),
    title TEXT NOT NULL,
    PRIMARY KEY (media_id, locale)
);
INSERT INTO media_translations(media_id, locale, title)
SELECT id, 'en', title FROM media;

CREATE TABLE post_search (
    post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    search_vector TSVECTOR NOT NULL
);
INSERT INTO post_search(post_id, search_vector)
SELECT p.id, to_tsvector('simple', COALESCE(string_agg(t.title || ' ' || t.content, ' '), ''))
FROM posts p LEFT JOIN post_translations t ON t.post_id = p.id
GROUP BY p.id;
CREATE INDEX post_search_vector_idx ON post_search USING GIN(search_vector);

-- +goose StatementBegin
CREATE FUNCTION refresh_post_search() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_id INTEGER;
    value TSVECTOR;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_id := OLD.post_id;
        IF EXISTS (SELECT 1 FROM posts WHERE id = target_id)
           AND EXISTS (SELECT 1 FROM post_translations WHERE post_id = target_id) THEN
            SELECT to_tsvector('simple', COALESCE(string_agg(title || ' ' || content, ' '), ''))
            INTO value FROM post_translations WHERE post_id = target_id;
            UPDATE post_search SET search_vector = value WHERE post_id = target_id;
        ELSE
            DELETE FROM post_search WHERE post_id = target_id;
        END IF;
        RETURN NULL;
    END IF;

    target_id := NEW.post_id;
    SELECT to_tsvector('simple', COALESCE(string_agg(title || ' ' || content, ' '), ''))
    INTO value FROM post_translations WHERE post_id = target_id;
    INSERT INTO post_search(post_id, search_vector)
    VALUES (target_id, COALESCE(value, to_tsvector('simple', '')))
    ON CONFLICT (post_id) DO UPDATE SET search_vector = EXCLUDED.search_vector;

    IF TG_OP = 'UPDATE' AND OLD.post_id <> NEW.post_id THEN
        IF EXISTS (SELECT 1 FROM post_translations WHERE post_id = OLD.post_id) THEN
            SELECT to_tsvector('simple', string_agg(title || ' ' || content, ' '))
            INTO value FROM post_translations WHERE post_id = OLD.post_id;
            UPDATE post_search SET search_vector = value WHERE post_id = OLD.post_id;
        ELSE
            DELETE FROM post_search WHERE post_id = OLD.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER post_translation_search_sync
AFTER INSERT OR UPDATE OR DELETE ON post_translations
FOR EACH ROW EXECUTE FUNCTION refresh_post_search();

-- +goose Down
DROP TRIGGER post_translation_search_sync ON post_translations;
DROP FUNCTION refresh_post_search();
DROP INDEX post_search_vector_idx;
DROP TABLE post_search;
DROP TABLE media_translations;
DROP TABLE event_translations;
DROP TABLE post_translations;
