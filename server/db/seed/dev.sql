INSERT INTO posts (title, content, published)
SELECT 'Welcome to Kalen Benakafil',
       'This is our first community note about building practical ways to participate.',
       true
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE title = 'Welcome to Kalen Benakafil');

INSERT INTO posts (title, content, published)
SELECT 'Upcoming community work',
       'Learn about upcoming events and how you can participate.',
       true
WHERE NOT EXISTS (SELECT 1 FROM posts WHERE title = 'Upcoming community work');

INSERT INTO events (title, description, event_date)
SELECT 'Community cleanup drive',
       'Join neighbors in caring for a shared community space.',
       NOW() + INTERVAL '7 days'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Community cleanup drive');

INSERT INTO events (title, description, event_date)
SELECT 'Volunteer orientation',
       'A practical welcome for people ready to get involved.',
       NOW() + INTERVAL '14 days'
WHERE NOT EXISTS (SELECT 1 FROM events WHERE title = 'Volunteer orientation');
