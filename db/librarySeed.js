import { query } from './index.js';
import { LIBRARY_CATEGORIES } from '../data/libraryCatalog.js';

/** Seed document library catalog into service_categories + services (idempotent). */
export async function seedLibraryCatalog() {
  for (const category of LIBRARY_CATEGORIES) {
    const catResult = await query(
      `INSERT INTO service_categories (name, slug, description, icon, display_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         icon = EXCLUDED.icon,
         display_order = EXCLUDED.display_order
       RETURNING id`,
      [category.name, category.slug, category.description, category.icon, category.displayOrder]
    );

    const categoryId = catResult.rows[0].id;

    for (const template of category.templates) {
      await query(
        `INSERT INTO services (category_id, name, slug, price, delivery_days, intake_schema)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (slug) DO UPDATE SET
           category_id = EXCLUDED.category_id,
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           delivery_days = EXCLUDED.delivery_days,
           intake_schema = EXCLUDED.intake_schema`,
        [
          categoryId,
          template.name,
          template.slug,
          template.price,
          template.deliveryDays,
          JSON.stringify({
            summary: { type: 'textarea', label: 'Brief / instructions', required: true },
            category: category.name,
          }),
        ]
      );
    }
  }
}
