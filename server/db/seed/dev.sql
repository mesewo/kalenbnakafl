WITH post AS (
    INSERT INTO posts (slug, published, published_at)
    VALUES ('welcome-to-kalen-benakafil', true, CURRENT_TIMESTAMP)
    ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
    RETURNING id
)
INSERT INTO post_translations (post_id, locale, title, content)
SELECT id, 'en', 'Welcome to Kalen Benakafil',
       'This is our first community note about building practical ways to participate.'
FROM post ON CONFLICT (post_id, locale) DO NOTHING;

WITH post AS (
    INSERT INTO posts (slug, published, published_at)
    VALUES ('upcoming-community-work', true, CURRENT_TIMESTAMP)
    ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
    RETURNING id
)
INSERT INTO post_translations (post_id, locale, title, content)
SELECT id, 'en', 'Upcoming community work',
       'Learn about upcoming events and how you can participate.'
FROM post ON CONFLICT (post_id, locale) DO NOTHING;

WITH event AS (
    INSERT INTO events (event_date)
    SELECT NOW() + INTERVAL '7 days'
    WHERE NOT EXISTS (SELECT 1 FROM event_translations WHERE title = 'Community cleanup drive')
    RETURNING id
)
INSERT INTO event_translations (event_id, locale, title, description, location)
SELECT id, 'en', 'Community cleanup drive',
       'Join neighbors in caring for a shared community space.', ''
FROM event;

WITH event AS (
    INSERT INTO events (event_date)
    SELECT NOW() + INTERVAL '14 days'
    WHERE NOT EXISTS (SELECT 1 FROM event_translations WHERE title = 'Volunteer orientation')
    RETURNING id
)
INSERT INTO event_translations (event_id, locale, title, description, location)
SELECT id, 'en', 'Volunteer orientation',
       'A practical welcome for people ready to get involved.', ''
FROM event;
