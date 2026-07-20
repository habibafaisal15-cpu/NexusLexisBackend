-- Combined view for monitoring all accounts (run once in pgAdmin Query Tool).
-- pgAdmin does not auto-refresh query results — press F5 or click Execute after each sign-up,
-- OR run `npm run db:watch-users` in a terminal for live updates.

CREATE OR REPLACE VIEW v_live_accounts AS
SELECT
  'auth_users'::text AS table_name,
  au.id,
  au.full_name AS display_name,
  au.email,
  au.role,
  au.auth_provider AS provider,
  au.created_at
FROM auth_users au
UNION ALL
SELECT
  'users'::text,
  u.id,
  u.username,
  u.email,
  u.role,
  'dashboard'::text,
  u.date_joined
FROM users u
ORDER BY created_at DESC NULLS LAST, id DESC;

-- Quick check:
-- SELECT * FROM v_live_accounts LIMIT 20;
