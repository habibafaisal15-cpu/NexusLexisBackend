import { query } from './index.js';
import { seedLibraryCatalog } from './librarySeed.js';

/** Optional catalog rows only — no demo users, orders, or notifications. */
export async function seedDatabase() {
  const plans = await query('SELECT COUNT(*)::int AS count FROM vlo_plans');
  if (plans.rows[0]?.count === 0) {
    await query(`
      INSERT INTO vlo_plans (name, monthly_fee, document_reviews_per_month, consultations_per_month, support_channel, compliance_report, has_dedicated_lawyer)
      VALUES
        ('Starter', 15000, 5, 2, 'email', 'quarterly', FALSE),
        ('Growth', 30000, 15, 8, 'email_whatsapp', 'monthly', TRUE),
        ('Enterprise', 60000, -1, -1, 'whatsapp_dedicated', 'monthly', TRUE)
    `);
    console.log('VLO plan catalog seeded.');
  }

  await seedLibraryCatalog();
}
