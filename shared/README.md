# Shared backend utilities

Cross-service code used by `auth_backend/` and `backend/` (not imported by `mainsite/`).

| Path | Purpose |
|------|---------|
| `lib/asyncHandler.js` | Express async route wrapper |
| `validation/email.js` | Signup email format, disposable-domain, and MX checks |

Import from services with relative paths, e.g. `../../shared/lib/asyncHandler.js`.
