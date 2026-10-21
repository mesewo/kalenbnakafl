-- name: ListVolunteers :many
SELECT u.id, u.name, u.email, u.role, u.created_at,
       COALESCE(SUM(vc.hours), 0)::numeric AS total_hours
FROM users AS u
LEFT JOIN volunteer_contributions AS vc ON vc.volunteer_id = u.id
WHERE u.role = 'volunteer'
GROUP BY u.id
ORDER BY u.name;

-- name: AddVolunteerContribution :exec
INSERT INTO volunteer_contributions
    (volunteer_id, hours, notes, contribution_date, created_by)
SELECT sqlc.arg(volunteer_id), sqlc.arg(hours)::numeric, sqlc.arg(notes),
       COALESCE(NULLIF(sqlc.arg(contribution_date)::text, '')::date, CURRENT_DATE),
       sqlc.arg(created_by)
FROM users
WHERE id = sqlc.arg(volunteer_id) AND role = 'volunteer';
