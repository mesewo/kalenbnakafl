-- name: CreateVolunteerApplication :exec
INSERT INTO volunteer_applications (user_id, skills, availability, message)
VALUES (sqlc.arg(user_id), sqlc.arg(skills), sqlc.arg(availability), sqlc.arg(message));

-- name: GetMyVolunteerApplication :one
SELECT id, user_id, skills, availability, message, status, reviewed_by, reviewed_at, created_at
FROM volunteer_applications WHERE user_id = sqlc.arg(user_id);

-- name: ListVolunteerApplications :many
SELECT va.id, va.user_id, u.name, u.email, va.skills, va.availability, va.message, va.status,
       va.reviewed_at, COALESCE(reviewer.name, '') AS reviewer_name, va.created_at
FROM volunteer_applications va
JOIN users u ON u.id = va.user_id
LEFT JOIN users reviewer ON reviewer.id = va.reviewed_by
WHERE sqlc.narg(status)::text IS NULL OR va.status = sqlc.narg(status)
ORDER BY va.created_at DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountVolunteerApplications :one
SELECT count(*)::bigint FROM volunteer_applications
WHERE sqlc.narg(status)::text IS NULL OR status = sqlc.narg(status);

-- name: LockVolunteerApplication :one
SELECT id, user_id, status FROM volunteer_applications
WHERE id = sqlc.arg(id) FOR UPDATE;

-- name: ReviewVolunteerApplication :execrows
UPDATE volunteer_applications
SET status = sqlc.arg(status), reviewed_by = sqlc.arg(reviewed_by), reviewed_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id);

-- name: PromoteApplicantIfUser :execrows
UPDATE users SET role = 'volunteer', updated_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(user_id) AND role = 'user';

-- name: GetEventDate :one
SELECT event_date FROM events WHERE id = sqlc.arg(id);

-- name: CreateEventSignup :execrows
INSERT INTO event_signups (event_id, user_id)
SELECT e.id, sqlc.arg(user_id) FROM events e
WHERE e.id = sqlc.arg(event_id) AND e.event_date >= CURRENT_TIMESTAMP
ON CONFLICT (event_id, user_id) DO NOTHING;

-- name: DeleteEventSignup :execrows
DELETE FROM event_signups WHERE event_id = sqlc.arg(event_id) AND user_id = sqlc.arg(user_id);

-- name: ListMyEventSignups :many
SELECT e.id, COALESCE(en.title, am.title, '') AS title,
       COALESCE(en.description, am.description, '') AS description,
       e.event_date, e.ends_at, COALESCE(en.location, am.location, '') AS location, e.created_at
FROM event_signups s JOIN events e ON e.id = s.event_id
LEFT JOIN event_translations en ON en.event_id = e.id AND en.locale = 'en'
LEFT JOIN event_translations am ON am.event_id = e.id AND am.locale = 'am'
WHERE s.user_id = sqlc.arg(user_id)
ORDER BY e.event_date ASC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountMyEventSignups :one
SELECT count(*)::bigint FROM event_signups WHERE user_id = sqlc.arg(user_id);

-- name: ListEventAttendees :many
SELECT u.id, u.name, u.email, s.created_at
FROM event_signups s JOIN users u ON u.id = s.user_id
WHERE s.event_id = sqlc.arg(event_id)
ORDER BY s.created_at DESC
LIMIT sqlc.arg(page_size)::integer OFFSET sqlc.arg(row_offset)::integer;

-- name: CountEventAttendees :one
SELECT count(*)::bigint FROM event_signups WHERE event_id = sqlc.arg(event_id);
