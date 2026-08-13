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
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);

    // NL-BE-ADMIN-OVERSIGHT-001
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS fee DECIMAL(12, 2)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'PKR'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INT`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'pending'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(120)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS refund_status VARCHAR(30) DEFAULT 'none'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS remittance_status VARCHAR(30) DEFAULT 'not_applicable'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(40) DEFAULT 'assigned'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reassignment_required BOOLEAN DEFAULT FALSE`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reassignment_reason VARCHAR(80)`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS original_professional JSONB`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meeting_status VARCHAR(30) DEFAULT 'scheduled'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS join_status VARCHAR(30) DEFAULT 'not_started'`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS acceptance_window_hours INT DEFAULT 24`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS acceptance_deadline TIMESTAMPTZ`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS timeline JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS audit JSONB NOT NULL DEFAULT '[]'::jsonb`);

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
        CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show', 'in_progress'))
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
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_payment ON appointments (payment_status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_assignment ON appointments (assignment_status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (appointment_date DESC)`);

    // Backfill defaults for existing rows
    await query(`
      UPDATE appointments
      SET assigned_at = COALESCE(assigned_at, created_at, CURRENT_TIMESTAMP),
          assignment_status = COALESCE(NULLIF(assignment_status, ''), 'assigned'),
          payment_status = COALESCE(NULLIF(payment_status, ''), 'pending'),
          refund_status = COALESCE(NULLIF(refund_status, ''), 'none'),
          remittance_status = COALESCE(NULLIF(remittance_status, ''), 'not_applicable'),
          meeting_status = COALESCE(NULLIF(meeting_status, ''), 'scheduled'),
          join_status = COALESCE(NULLIF(join_status, ''), 'not_started'),
          acceptance_window_hours = COALESCE(acceptance_window_hours, 24),
          currency = COALESCE(NULLIF(currency, ''), 'PKR'),
          timeline = COALESCE(timeline, '[]'::jsonb),
          audit = COALESCE(audit, '[]'::jsonb)
      WHERE assignment_status IS NULL
         OR payment_status IS NULL
         OR timeline IS NULL
    `);
    await query(`
      UPDATE appointments
      SET acceptance_deadline = COALESCE(
            acceptance_deadline,
            COALESCE(assigned_at, created_at, CURRENT_TIMESTAMP)
              + (COALESCE(acceptance_window_hours, 24) || ' hours')::interval
          )
      WHERE acceptance_deadline IS NULL AND status = 'pending'
    `);
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
