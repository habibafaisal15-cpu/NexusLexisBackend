-- ============================================================================
-- ADMIN QUERIES — run manually in pgAdmin / psql (NOT on app startup)
-- Replace email in single-user section as needed.
-- ============================================================================

-- All registrations (new signups appear here automatically via POST /api/auth/register)
SELECT
    au.id              AS auth_user_id,
    au.full_name,
    au.email,
    au.phone,
    au.role            AS auth_role,
    au.created_at      AS signed_up_at,
    u.id               AS dashboard_user_id,
    u.username,
    u.role             AS dashboard_role,
    u.active_role,
    cp.city            AS client_city,
    cp.address         AS client_address,
    cp.cnic            AS client_cnic,
    lp.verification_stat AS lawyer_status,
    cap.verification_stat AS ca_status
FROM auth_users au
JOIN users u ON LOWER(u.email) = LOWER(au.email)
LEFT JOIN client_profiles cp ON cp.user_id = u.id
LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id
LEFT JOIN ca_profiles cap ON cap.user_id = u.id
ORDER BY au.created_at DESC;

-- Notifications for all users (new welcome + action notifications appear automatically)
SELECT
    n.id,
    u.email,
    u.username,
    n.title,
    n.body,
    n.notification_type,
    n.is_read,
    n.link,
    n.created_at
FROM notifications n
JOIN users u ON u.id = n.user_id
ORDER BY n.created_at DESC;

-- Single user lookup (replace email)
-- SELECT * FROM auth_users WHERE email = 'habiba.faisal15@gmail.com';
-- SELECT * FROM users WHERE email = 'habiba.faisal15@gmail.com';
-- SELECT * FROM client_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'habiba.faisal15@gmail.com');
-- SELECT * FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = 'habiba.faisal15@gmail.com');
-- SELECT * FROM client_activities WHERE client_id = (SELECT id FROM users WHERE email = 'habiba.faisal15@gmail.com');
