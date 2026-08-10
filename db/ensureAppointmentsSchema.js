import { query } from './index.js';

let readyPromise = null;

export async function ensureAppointmentsSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_notes TEXT`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'consultation'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS category_id VARCHAR(100)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS category_label VARCHAR(255)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS subject VARCHAR(500)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_area VARCHAR(255)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS matter_note TEXT`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS language VARCHAR(50)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_city VARCHAR(100)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS response_note TEXT`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS delivered_order_number VARCHAR(100)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS brief JSONB NOT NULL DEFAULT '{}'::jsonb`);

    try {
      await query(`ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_mode_check`);
      await query(`
        ALTER TABLE appointments
        ADD CONSTRAINT appointments_mode_check
        CHECK (mode IN ('online', 'inperson', 'document', 'video', 'audio', 'chat'))
      `);
    } catch (err) {
      console.warn('[appointments-schema] mode check:', err.message);
    }

    try {
      await query(`ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check`);
      await query(`
        ALTER TABLE appointments
        ADD CONSTRAINT appointments_status_check
        CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'))
      `);
    } catch (err) {
      console.warn('[appointments-schema] status check:', err.message);
    }

    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_availability (
        lawyer_prof_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        slots JSONB NOT NULL DEFAULT '["10:00","11:30","14:00","16:00"]'::jsonb,
        PRIMARY KEY (lawyer_prof_id, weekday)
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS lawyer_availability_overrides (
        lawyer_prof_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
        override_date DATE NOT NULL,
        slots JSONB NOT NULL DEFAULT '[]'::jsonb,
        PRIMARY KEY (lawyer_prof_id, override_date)
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_source ON appointments (source)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_delivered ON appointments (delivered_order_number)`);
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
