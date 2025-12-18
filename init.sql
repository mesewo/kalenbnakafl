-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    event_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create media table
CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    media_type VARCHAR(50),
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create seed data
INSERT INTO users (name, email, password, role) VALUES 
('Admin User', 'admin@kalenbenakafil.org', '$2a$10$QeKhl6pH2J5QU.QVW.cB6ebvVM0FlpeDaw4f4czPqjQAXRianxjsm', 'admin'),
('Editor User', 'editor@kalenbenakafil.org', '$2a$10$QeKhl6pH2J5QU.QVW.cB6ebvVM0FlpeDaw4f4czPqjQAXRianxjsm', 'editor'),
('Member User', 'member@kalenbenakafil.org', '$2a$10$QeKhl6pH2J5QU.QVW.cB6ebvVM0FlpeDaw4f4czPqjQAXRianxjsm', 'user'),
('Volunteer User', 'volunteer@kalenbenakafil.org', '$2a$10$QeKhl6pH2J5QU.QVW.cB6ebvVM0FlpeDaw4f4czPqjQAXRianxjsm', 'volunteer')
ON CONFLICT (email) DO NOTHING;

-- Insert sample posts
INSERT INTO posts (title, content, author_id, published) VALUES
('Welcome to Kalen Benakafil', 'This is our first blog post about community initiatives.', 1, true),
('Upcoming Events', 'Learn about our upcoming community events and how you can participate.', 2, true)
ON CONFLICT DO NOTHING;

-- Insert sample events
INSERT INTO events (title, description, event_date) VALUES
('Community Cleanup Drive', 'Join us in cleaning up our community spaces.', NOW() + INTERVAL '7 days'),
('Volunteer Training Workshop', 'Training session for new volunteers interested in helping our cause.', NOW() + INTERVAL '14 days')
ON CONFLICT DO NOTHING;
