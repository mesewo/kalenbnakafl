-- +goose Up
ALTER TABLE contacts RENAME TO contact_messages;
ALTER TABLE contact_messages
    ADD COLUMN status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'read', 'replied')),
    ADD COLUMN handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN handled_at TIMESTAMPTZ;
CREATE INDEX contact_messages_status_created_at_idx
    ON contact_messages(status, created_at DESC);

-- +goose Down
DROP INDEX contact_messages_status_created_at_idx;
ALTER TABLE contact_messages
    DROP COLUMN handled_at,
    DROP COLUMN handled_by,
    DROP COLUMN status;
ALTER TABLE contact_messages RENAME TO contacts;