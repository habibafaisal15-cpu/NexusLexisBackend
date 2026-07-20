# Database layout

## Canonical schema

- **`full_schema.sql`** — Single source of truth for PostgreSQL DDL (dashboard + auth + OTP). Applied automatically on server startup via `schema.js` and by `cli/migrate.js`.

## Runtime modules

| File | Purpose |
|------|---------|
| `index.js` | Connection pool |
| `schema.js` | Applies `full_schema.sql` + notification audience backfills |
| `seed.js` | VLO plan catalog seed (no demo users) |
| `repository.js` | Client dashboard queries |
| `professionalRepository.js` | Lawyer/CA professional features |
| `professionalSeed.js` | Professional demo data |
| `auth.js` | Legacy v2 auth helpers used by main API |

## CLI (`cli/`)

```bash
npm run db:migrate              # from backend/ — schema + catalog seed
npm run db:purge-demo           # from repo root — remove demo rows
node db/cli/list-lawyers.js     # from backend/
node db/cli/restore-demo-client.js
node db/cli/remove-demo-lawyers.js
```

## Manual SQL (`manual/`)

Run with `psql` when needed; not applied on startup.

- `purge_demo_data.sql` — used by `cli/purgeDemo.js`
- `admin_queries.sql` — ad-hoc admin inspection
- `lawyers.sql` — lawyer seed snippets

## Archive (`archive/`)

Older exports and superseded schema files kept for reference only.
