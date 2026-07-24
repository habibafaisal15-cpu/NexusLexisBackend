import { query } from './index.js';
import { seedLibraryCatalog } from './librarySeed.js';

/** Optional catalog rows only — no demo users, orders, or notifications. */
export async function seedDatabase() {
  const plans = await query('SELECT COUNT(*)::int AS count FROM vlo_plans');
  if (plans.rows[0]?.count === 0) {
    await query(`
      INSERT INTO vlo_plans (name, monthly_fee, document_reviews_per_month, consultations_per_month, support_channel, compliance_report, has_dedicated_lawyer)
      VALUES
        ('Starter', 15000, 5, 2, 'Email', 'Quarterly', FALSE),
        ('Growth', 45000, 15, 8, 'Priority Email', 'Monthly', TRUE),
        ('Enterprise', 120000, 40, 20, 'Dedicated Line', 'Weekly', TRUE)
    `);
    console.log('VLO plan catalog seeded.');
  }

  await seedLibraryCatalog();
}
