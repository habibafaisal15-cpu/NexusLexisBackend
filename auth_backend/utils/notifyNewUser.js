import { query } from '../db/index.js';

/** Push instant notification for dev tools (e.g. watch-users.js). Non-fatal if it fails. */
export async function notifyNewUser({ email, role, source = 'signup' }) {
  try {
    await query(`SELECT pg_notify('nexuslexis_new_user', $1)`, [
      JSON.stringify({ email, role, source, at: new Date().toISOString() }),
    ]);
  } catch {
    // ignore — signup must not fail because NOTIFY failed
  }
}
