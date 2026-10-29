-- name: ListMedia :many
SELECT m.id, m.file_path, COALESCE(m.media_type, '') AS media_type,
       COALESCE(m.original_name, '') AS original_name,
       COALESCE(m.size_bytes, 0) AS size_bytes, m.kind, m.created_at,
       en.title AS en_title, en.alt_text AS en_alt_text,
       am.title AS am_title, am.alt_text AS am_alt_text,
       COALESCE(m.width, 0) AS width, COALESCE(m.height, 0) AS height,
       m.decorative
FROM media m
LEFT JOIN media_translations en ON en.media_id = m.id AND en.locale = 'en'
LEFT JOIN media_translations am ON am.media_id = m.id AND am.locale = 'am'
WHERE (sqlc.narg(kind)::text IS NULL OR m.kind = sqlc.narg(kind)::text)
  AND m.kind = 'image'
  AND (
      sqlc.arg(staff)::boolean OR
      EXISTS (SELECT 1 FROM posts p WHERE p.cover_media_id = m.id AND p.published) OR
      EXISTS (SELECT 1 FROM post_media_references pmr
              JOIN posts p ON p.id = pmr.post_id
              WHERE pmr.media_id = m.id AND p.published) OR
      EXISTS (SELECT 1 FROM events e WHERE e.cover_media_id = m.id) OR
      EXISTS (SELECT 1 FROM home_slides hs WHERE hs.media_id = m.id AND hs.active) OR
      EXISTS (SELECT 1 FROM about_images ai WHERE ai.media_id = m.id) OR
      EXISTS (SELECT 1 FROM site_settings s
              WHERE s.logo_media_id = m.id OR s.favicon_media_id = m.id OR s.social_image_media_id = m.id)
  )
ORDER BY m.created_at DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountMedia :one
SELECT count(*)::bigint FROM media
WHERE (sqlc.narg(kind)::text IS NULL OR kind = sqlc.narg(kind)::text)
  AND kind = 'image'
  AND (
      sqlc.arg(staff)::boolean OR
      EXISTS (SELECT 1 FROM posts p WHERE p.cover_media_id = media.id AND p.published) OR
      EXISTS (SELECT 1 FROM post_media_references pmr
              JOIN posts p ON p.id = pmr.post_id
              WHERE pmr.media_id = media.id AND p.published) OR
      EXISTS (SELECT 1 FROM events e WHERE e.cover_media_id = media.id) OR
      EXISTS (SELECT 1 FROM home_slides hs WHERE hs.media_id = media.id AND hs.active) OR
      EXISTS (SELECT 1 FROM about_images ai WHERE ai.media_id = media.id) OR
      EXISTS (SELECT 1 FROM site_settings s
              WHERE s.logo_media_id = media.id OR s.favicon_media_id = media.id OR s.social_image_media_id = media.id)
  );

-- name: CreateMedia :one
INSERT INTO media (file_path, media_type, original_name, size_bytes, kind, uploaded_by)
VALUES (sqlc.arg(file_path), sqlc.narg(media_type),
        sqlc.narg(original_name), sqlc.arg(size_bytes), sqlc.arg(kind), sqlc.narg(uploaded_by))
RETURNING id;

-- name: CreateImageMedia :one
INSERT INTO media (
    file_path, media_type, original_name, size_bytes, kind, uploaded_by,
    width, height, decorative, variant_480_path, variant_960_path, variant_1600_path
)
VALUES (
    sqlc.arg(file_path), sqlc.arg(media_type), sqlc.narg(original_name),
    sqlc.arg(size_bytes), 'image', sqlc.narg(uploaded_by),
    sqlc.arg(width), sqlc.arg(height), sqlc.arg(decorative),
    sqlc.arg(variant_480_path), sqlc.arg(variant_960_path), sqlc.arg(variant_1600_path)
)
RETURNING id;

-- name: UpsertMediaTranslation :exec
INSERT INTO media_translations(media_id, locale, title, alt_text)
VALUES (sqlc.arg(media_id), sqlc.arg(locale), sqlc.arg(title), sqlc.arg(alt_text))
ON CONFLICT (media_id, locale) DO UPDATE SET title = EXCLUDED.title, alt_text = EXCLUDED.alt_text;

-- name: GetMediaFilePath :one
SELECT file_path FROM media WHERE id = sqlc.arg(id);

-- name: DeleteMedia :execrows
DELETE FROM media WHERE id = sqlc.arg(id);

-- name: GetMediaVariant :one
SELECT
    COALESCE(CASE sqlc.arg(width)::integer
        WHEN 480 THEN m.variant_480_path
        WHEN 960 THEN m.variant_960_path
        WHEN 1600 THEN m.variant_1600_path
    END, m.file_path) AS storage_path,
    COALESCE(m.media_type, 'application/octet-stream') AS media_type,
    (
        sqlc.arg(staff)::boolean OR
        EXISTS (SELECT 1 FROM posts p WHERE p.cover_media_id = m.id AND p.published) OR
        EXISTS (SELECT 1 FROM post_media_references pmr
                JOIN posts p ON p.id = pmr.post_id
                WHERE pmr.media_id = m.id AND p.published) OR
        EXISTS (SELECT 1 FROM events e WHERE e.cover_media_id = m.id) OR
        EXISTS (SELECT 1 FROM home_slides hs WHERE hs.media_id = m.id AND hs.active) OR
        EXISTS (SELECT 1 FROM about_images ai WHERE ai.media_id = m.id) OR
        EXISTS (SELECT 1 FROM site_settings s
                WHERE s.logo_media_id = m.id OR s.favicon_media_id = m.id OR s.social_image_media_id = m.id)
    ) AS is_public
FROM media m
WHERE m.id = sqlc.arg(id) AND m.kind = 'image';

-- name: ListMediaUsages :many
SELECT 'post_cover'::text AS usage_type, p.id AS reference_id, p.slug AS label
FROM posts p WHERE p.cover_media_id = sqlc.arg(id)
UNION ALL
SELECT 'post_inline'::text, p.id, p.slug
FROM posts p
JOIN post_media_references pmr ON pmr.post_id = p.id
WHERE pmr.media_id = sqlc.arg(id)
UNION ALL
SELECT 'event_cover'::text, e.id, COALESCE(en.title, am.title, 'Event ' || e.id::text)
FROM events e
LEFT JOIN event_translations en ON en.event_id = e.id AND en.locale = 'en'
LEFT JOIN event_translations am ON am.event_id = e.id AND am.locale = 'am'
WHERE e.cover_media_id = sqlc.arg(id)
UNION ALL
SELECT 'home_slide'::text, hs.id, 'Home slide ' || hs.id::text
FROM home_slides hs WHERE hs.media_id = sqlc.arg(id)
UNION ALL
SELECT 'about_image'::text, ai.id, 'About image ' || ai.id::text
FROM about_images ai WHERE ai.media_id = sqlc.arg(id)
UNION ALL
SELECT 'site_setting'::text, s.id,
       CASE
           WHEN s.logo_media_id = sqlc.arg(id) THEN 'logo'
           WHEN s.favicon_media_id = sqlc.arg(id) THEN 'favicon'
           ELSE 'social image'
       END
FROM site_settings s
WHERE s.logo_media_id = sqlc.arg(id) OR s.favicon_media_id = sqlc.arg(id) OR s.social_image_media_id = sqlc.arg(id)
ORDER BY usage_type, reference_id;
