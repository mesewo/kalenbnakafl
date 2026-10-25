-- +goose Up
DROP INDEX posts_search_vector_idx;
ALTER TABLE posts DROP COLUMN search_vector;
ALTER TABLE posts DROP COLUMN title, DROP COLUMN content;
ALTER TABLE events DROP COLUMN title, DROP COLUMN description, DROP COLUMN location;
ALTER TABLE media DROP COLUMN title;

-- +goose Down
ALTER TABLE posts ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN content TEXT NOT NULL DEFAULT '';
UPDATE posts p SET
    title = COALESCE((SELECT title FROM post_translations WHERE post_id = p.id AND locale = 'en'),
                     (SELECT title FROM post_translations WHERE post_id = p.id ORDER BY locale LIMIT 1)),
    content = COALESCE((SELECT content FROM post_translations WHERE post_id = p.id AND locale = 'en'),
                       (SELECT content FROM post_translations WHERE post_id = p.id ORDER BY locale LIMIT 1));
ALTER TABLE posts ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, ''))
) STORED;
CREATE INDEX posts_search_vector_idx ON posts USING GIN(search_vector);

ALTER TABLE events ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN location TEXT NOT NULL DEFAULT '';
UPDATE events e SET
    title = COALESCE((SELECT title FROM event_translations WHERE event_id = e.id AND locale = 'en'),
                     (SELECT title FROM event_translations WHERE event_id = e.id ORDER BY locale LIMIT 1)),
    description = COALESCE((SELECT description FROM event_translations WHERE event_id = e.id AND locale = 'en'),
                            (SELECT description FROM event_translations WHERE event_id = e.id ORDER BY locale LIMIT 1)),
    location = COALESCE((SELECT location FROM event_translations WHERE event_id = e.id AND locale = 'en'),
                         (SELECT location FROM event_translations WHERE event_id = e.id ORDER BY locale LIMIT 1));

ALTER TABLE media ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT '';
UPDATE media m SET title = COALESCE((SELECT title FROM media_translations WHERE media_id = m.id AND locale = 'en'),
                                    (SELECT title FROM media_translations WHERE media_id = m.id ORDER BY locale LIMIT 1));
