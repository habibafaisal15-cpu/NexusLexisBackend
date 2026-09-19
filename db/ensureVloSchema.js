import { query } from './index.js';

let readyPromise = null;

/** VLO schema hardening — NL-BE-VLO-001 */
export async function ensureVloSchema() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS vlo_plans (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL CHECK (name IN ('Starter', 'Growth', 'Enterprise')),
        monthly_fee DECIMAL(10, 2) NOT NULL,
        document_reviews_per_month INT NOT NULL,
        consultations_per_month INT NOT NULL,
        support_channel VARCHAR(50) NOT NULL,
        compliance_report VARCHAR(50) NOT NULL,
        has_dedicated_lawyer BOOLEAN DEFAULT FALSE
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS vlo_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id BIGINT NOT NULL REFERENCES vlo_plans(id) ON DELETE RESTRICT,
        assigned_lawyer_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'active'
          CHECK (status IN ('active', 'cancelled', 'paused', 'expired')),
        start_date DATE NOT NULL,
        next_billing_date DATE NOT NULL,
        reviews_used_this_month INT DEFAULT 0,
        consultations_used_this_month INT DEFAULT 0,
        matters_submitted_this_month INT DEFAULT 0,
        stripe_subscription_id VARCHAR(255)
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS vlo_matters (
        id BIGSERIAL PRIMARY KEY,
        subscription_id BIGINT NOT NULL REFERENCES vlo_subscriptions(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        file VARCHAR(500),
        status VARCHAR(20) DEFAULT 'received'
          CHECK (status IN ('received', 'under_review', 'completed')),
        lawyer_notes TEXT,
        completed_file VARCHAR(500),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`ALTER TABLE vlo_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
    await query(`ALTER TABLE vlo_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
    await query(`ALTER TABLE vlo_subscriptions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
    await query(`ALTER TABLE vlo_subscriptions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'manual_pending'`);

    await query(`ALTER TABLE vlo_matters ADD COLUMN IF NOT EXISTS file_name VARCHAR(255)`);
    await query(`ALTER TABLE vlo_matters ADD COLUMN IF NOT EXISTS file_mime VARCHAR(100)`);
    await query(`ALTER TABLE vlo_matters ADD COLUMN IF NOT EXISTS file_content_base64 TEXT`);
    await query(`ALTER TABLE vlo_matters ADD COLUMN IF NOT EXISTS completed_file_name VARCHAR(255)`);
    await query(`ALTER TABLE vlo_matters ADD COLUMN IF NOT EXISTS completed_file_mime VARCHAR(100)`);
    await query(`ALTER TABLE vlo_matters ADD COLUMN IF NOT EXISTS completed_file_content_base64 TEXT`);

    await query(`CREATE INDEX IF NOT EXISTS idx_vlo_subs_client ON vlo_subscriptions (client_id, status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vlo_subs_lawyer ON vlo_subscriptions (assigned_lawyer_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_vlo_matters_sub ON vlo_matters (subscription_id, status)`);

    // Catalog fees per Developer Guidelines (Starter 15k / Growth 30k / Enterprise 60k)
    const count = await query(`SELECT COUNT(*)::int AS n FROM vlo_plans`);
    if ((count.rows[0]?.n || 0) === 0) {
      await query(`
        INSERT INTO vlo_plans (
          name, monthly_fee, document_reviews_per_month, consultations_per_month,
          support_channel, compliance_report, has_dedicated_lawyer
        ) VALUES
          ('Starter', 15000, 5, 2, 'email', 'quarterly', FALSE),
          ('Growth', 30000, 15, 8, 'email_whatsapp', 'monthly', TRUE),
          ('Enterprise', 60000, -1, -1, 'whatsapp_dedicated', 'monthly', TRUE)
      `);
    } else {
      await query(`UPDATE vlo_plans SET monthly_fee = 15000, document_reviews_per_month = 5, consultations_per_month = 2,
        support_channel = 'email', compliance_report = 'quarterly', has_dedicated_lawyer = FALSE WHERE name = 'Starter'`);
      await query(`UPDATE vlo_plans SET monthly_fee = 30000, document_reviews_per_month = 15, consultations_per_month = 8,
        support_channel = 'email_whatsapp', compliance_report = 'monthly', has_dedicated_lawyer = TRUE WHERE name = 'Growth'`);
      await query(`UPDATE vlo_plans SET monthly_fee = 60000, document_reviews_per_month = -1, consultations_per_month = -1,
        support_channel = 'whatsapp_dedicated', compliance_report = 'monthly', has_dedicated_lawyer = TRUE WHERE name = 'Enterprise'`);
    }
  })().catch((err) => {
    readyPromise = null;
    throw err;
  });

  return readyPromise;
}
