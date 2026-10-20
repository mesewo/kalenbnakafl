-- +goose Up
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user'
        CHECK (role IN ('admin', 'editor', 'user', 'volunteer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE INDEX idx_users_role ON users(role);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_posts_published_created ON posts(published, created_at DESC);

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_date ON events(event_date);

CREATE TABLE media (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    media_type VARCHAR(100),
    original_name VARCHAR(255),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE volunteer_contributions (
    id SERIAL PRIMARY KEY,
    volunteer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hours NUMERIC(8, 2) NOT NULL CHECK (hours > 0),
    notes TEXT NOT NULL DEFAULT '',
    contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_contributions_volunteer
    ON volunteer_contributions(volunteer_id, contribution_date DESC);

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_active
    ON refresh_tokens(token_hash, expires_at) WHERE revoked_at IS NULL;

-- +goose Down
DROP INDEX idx_refresh_tokens_active;
DROP INDEX idx_refresh_tokens_user;
DROP TABLE refresh_tokens;
DROP INDEX idx_contributions_volunteer;
DROP TABLE volunteer_contributions;
DROP TABLE contacts;
DROP TABLE media;
DROP INDEX idx_events_date;
DROP TABLE events;
DROP INDEX idx_posts_published_created;
DROP TABLE posts;
DROP INDEX idx_users_role;
DROP INDEX users_email_lower_key;
DROP TABLE users;
