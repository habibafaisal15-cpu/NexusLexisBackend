import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import bcrypt from 'bcryptjs';
import { pool, query } from './index.js';

const DEMO_PASSWORD = 'Client@123';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runSchema() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
}

export async function seedDatabase() {
  const clientEmail = process.env.DEMO_CLIENT_EMAIL || 'habibcorp@nexuslexis.law';

  const existing = await query('SELECT id, password FROM users WHERE LOWER(email) = LOWER($1)', [clientEmail]);
  if (existing.rows[0]) {
    // Fix legacy plain-text demo password
    if (existing.rows[0].password === 'demo-hash') {
      const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
      await query('UPDATE users SET password = $1 WHERE id = $2', [hash, existing.rows[0].id]);
      console.log(`Demo account password set to: ${DEMO_PASSWORD}`);
    }
    console.log('Database already seeded.');
    return existing.rows[0].id;
  }

  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Demo client
  const client = await query(
    `INSERT INTO users (username, email, password, role)
     VALUES ('Habib Corporate Solutions Ltd', $1, $2, 'client')
     RETURNING id`,
    [clientEmail, demoHash]
  );
  const clientId = client.rows[0].id;

  // VLO plans
  await query(`
    INSERT INTO vlo_plans (name, monthly_fee, document_reviews_per_month, consultations_per_month, support_channel, compliance_report, has_dedicated_lawyer)
    VALUES
      ('Starter', 15000, 5, 2, 'Email', 'Quarterly', FALSE),
      ('Growth', 45000, 15, 8, 'Priority Email', 'Monthly', TRUE),
      ('Enterprise', 120000, 40, 20, 'Dedicated Line', 'Weekly', TRUE)
  `);

  const growthPlan = await query(`SELECT id FROM vlo_plans WHERE name = 'Growth'`);
  await query(
    `INSERT INTO vlo_subscriptions (client_id, plan_id, status, start_date, next_billing_date, reviews_used_this_month, consultations_used_this_month)
     VALUES ($1, $2, 'active', CURRENT_DATE, '2026-08-01', 4, 1)`,
    [clientId, growthPlan.rows[0].id]
  );

  const subscription = await query(
    'SELECT id FROM vlo_subscriptions WHERE client_id = $1 LIMIT 1',
    [clientId]
  );

  // Service categories & services
  const cat = await query(
    `INSERT INTO service_categories (name, slug, description, display_order)
     VALUES ('Document Services', 'document-services', 'SECP and statutory document packages', 1)
     RETURNING id`
  );
  await query(
    `INSERT INTO services (category_id, name, slug, price, delivery_days, intake_schema) VALUES
     ($1, 'SECP Company Articles Draft', 'secp_incorporation', 12000, 5, '{}'),
     ($1, 'Tenancy Lease Contract', 'tenancy_agreement', 8000, 3, '{}')`,
    [cat.rows[0].id]
  );

  const services = await query('SELECT id, slug, name FROM services ORDER BY id');
  await query(
    `INSERT INTO service_orders (order_number, client_id, service_id, status, intake_form_data, expected_delivery) VALUES
     ('8910', $1, $2, 'completed', '{}', '2026-07-08'),
     ('5561', $1, $3, 'in_progress', '{}', '2026-07-09')`,
    [clientId, services.rows[0].id, services.rows[1].id]
  );

  // VLO matters
  await query(
    `INSERT INTO vlo_matters (subscription_id, title, description, status, lawyer_notes, completed_file) VALUES
     ($1, 'Joint Venture Vetting (TechCorp Partnership)',
      'Vetting of a joint venture agreement relating to shared data center facilities. Critical clauses focus on liability limit cap and dispute resolutions under arbitration.',
      'completed',
      'Opinion: The data localization clauses are compliant with draft regulations. We recommend reducing the liability cap under clause 14 to PKR 15 Million matching default indemnity bounds.',
      'JV_Vetting_Opinion_Signed.pdf'),
     ($1, 'Board Resolution Approval (FY26 Capital Allocations)',
      'Corporate validation for internal equity allocation structures. Involves foreign national director authorizations.',
      'under_review', NULL, NULL)`,
    [subscription.rows[0].id]
  );

  // Notifications
  await query(
    `INSERT INTO notifications (user_id, title, body, notification_type, link) VALUES
     ($1, 'Order Update', 'SECP incorporation draft reviewed by Advocate Mian Ali Raza.', 'order', '/account/orders'),
     ($1, 'VLO Update', 'New confidential advisory opinion filed under matter ledger.', 'vlo', '/account/vlo')`,
    [clientId]
  );

  // Invoices
  await query(
    `INSERT INTO invoices (client_id, invoice_number, category, amount, invoice_date) VALUES
     ($1, 'INV-2026-001', 'Growth Retainer Plan (Monthly Subscription)', 45000, '2026-07-01'),
     ($1, 'INV-2026-002', 'SECP Articles of Association Prep (Document Pack)', 12000, '2026-07-05')`,
    [clientId]
  );

  // Activities
  await query(
    `INSERT INTO client_activities (client_id, activity_type, lang_key, params, created_at) VALUES
     ($1, 'order', 'DocStarted', '{"doc":"SECP Incorporation Draft"}', '2026-07-08 12:00:00'),
     ($1, 'matter', 'UploadMatter', '{"title":"Joint Venture Vetting"}', '2026-07-07 10:00:00')`,
    [clientId]
  );

  console.log('Database seeded successfully.');
  return clientId;
}
