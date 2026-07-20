import { query } from './index.js';

import { ensureLawyerProfile, ensureCaProfile } from './professionalRepository.js';



export async function seedProfessionalDemoData() {

  if (process.env.SEED_DEMO !== 'true') {

    return;

  }

  const lawyerUser = await query(

    `SELECT id FROM users WHERE LOWER(email) = 'lawyer@nexuslexis.law' AND is_active = TRUE`

  ).then((r) => r.rows[0]);



  const clientUser = await query(

    `SELECT id FROM users WHERE LOWER(email) = 'client@nexuslexis.law' AND is_active = TRUE`

  ).then((r) => r.rows[0]);



  const caUser = await query(

    `SELECT id FROM users WHERE LOWER(email) = 'ca@nexuslexis.law' AND is_active = TRUE`

  ).then((r) => r.rows[0]);



  if (lawyerUser) {

    const profile = await ensureLawyerProfile(lawyerUser.id);



    const existingSub = await query(

      'SELECT id FROM lawyer_subscriptions WHERE lawyer_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingSub.rows[0]) {

      await query(

        `INSERT INTO lawyer_subscriptions (lawyer_id, tier, status, start_date, next_billing, monthly_fee)

         VALUES ($1, 'gold', 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 12000)`,

        [profile.id]

      );

    }



    if (clientUser) {

      const existingAppt = await query(

        'SELECT id FROM appointments WHERE lawyer_prof_id = $1 LIMIT 1',

        [profile.id]

      );

      if (!existingAppt.rows[0]) {

        await query(

          `INSERT INTO appointments (client_id, lawyer_prof_id, appointment_date, appointment_time, mode, status)

           VALUES ($1, $2, CURRENT_DATE + INTERVAL '3 days', '10:00', 'online', 'pending'),

                  ($1, $2, CURRENT_DATE + INTERVAL '7 days', '14:30', 'inperson', 'confirmed')`,

          [clientUser.id, profile.id]

        );

      }



      const service = await query('SELECT id FROM services ORDER BY id LIMIT 1');

      if (service.rows[0]) {

        const existingOrder = await query(

          'SELECT id FROM service_orders WHERE assigned_prof_id = $1 LIMIT 1',

          [lawyerUser.id]

        );

        if (!existingOrder.rows[0]) {

          await query(

            `INSERT INTO service_orders (order_number, client_id, service_id, assigned_prof_id, status, intake_form_data, expected_delivery, milestone)

             VALUES ('LAW-1001', $1, $2, $3, 'in_progress', '{"matter":"Contract review"}', CURRENT_DATE + INTERVAL '5 days', 'Drafting in Progress')`,

            [clientUser.id, service.rows[0].id, lawyerUser.id]

          );

        }

      }



      await query(

        `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)

         SELECT $1, 'New Enquiry', 'A client requested a consultation slot.', 'appointment', '/account/appointments', 'lawyer'

         WHERE NOT EXISTS (

           SELECT 1 FROM notifications WHERE user_id = $1 AND notification_type = 'appointment' AND audience = 'lawyer'

         )`,

        [lawyerUser.id]

      );

    }

  }



  if (caUser && clientUser) {

    const profile = await ensureCaProfile(caUser.id);



    await query(

      `UPDATE ca_profiles SET membership_tier = 'gold', icap_membership_no = 'ICAP-2024-001',

        service_areas = 'Corporate Tax, Auditing, Income Tax', short_bio = 'FCA with 10+ years experience.',

        online_fee = 4000, inperson_fee = 6000

       WHERE id = $1`,

      [profile.id]

    );



    const existingSub = await query(

      'SELECT id FROM ca_subscriptions WHERE ca_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingSub.rows[0]) {

      await query(

        `INSERT INTO ca_subscriptions (ca_id, tier, status, start_date, next_billing, monthly_fee)

         VALUES ($1, 'gold', 'active', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 8000)`,

        [profile.id]

      );

    }



    const existingAppt = await query(

      'SELECT id FROM ca_appointments WHERE ca_prof_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingAppt.rows[0]) {

      await query(

        `INSERT INTO ca_appointments (client_id, ca_prof_id, appointment_date, appointment_time, mode, status, topic)

         VALUES ($1, $2, CURRENT_DATE + INTERVAL '4 days', '11:00', 'online', 'pending', 'Tax planning review'),

                ($1, $2, CURRENT_DATE + INTERVAL '10 days', '15:00', 'inperson', 'confirmed', 'Annual audit prep')`,

        [clientUser.id, profile.id]

      );

    }



    const service = await query('SELECT id FROM services ORDER BY id LIMIT 1');

    if (service.rows[0]) {

      const existingOrder = await query(

        'SELECT id FROM service_orders WHERE assigned_prof_id = $1 LIMIT 1',

        [caUser.id]

      );

      if (!existingOrder.rows[0]) {

        await query(

          `INSERT INTO service_orders (order_number, client_id, service_id, assigned_prof_id, status, intake_form_data, expected_delivery, milestone)

           VALUES ('CA-2001', $1, $2, $3, 'in_progress', '{"company":"Habib Corp","service":"Tax Advisory"}', CURRENT_DATE + INTERVAL '8 days', 'Documents Verified')`,

          [clientUser.id, service.rows[0].id, caUser.id]

        );

      }

    }



    const existingTax = await query(

      'SELECT id FROM ca_tax_profiles WHERE ca_prof_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingTax.rows[0]) {

      await query(

        `INSERT INTO ca_tax_profiles (ca_prof_id, client_id, business_name, client_email, ntn, secp_registration, tax_status, filing_count, tax_year)

         VALUES ($1, $2, 'Habib Corp', 'client@nexuslexis.law', '1234567-8', 'SECP-2020-001', 'In Progress', 3, '2026'),

                ($1, $2, 'TechVentures Ltd', 'client@nexuslexis.law', '9876543-2', 'SECP-2019-042', 'Filed', 5, '2026')`,

        [profile.id, clientUser.id]

      );

    }



    const existingDeadline = await query(

      'SELECT id FROM ca_compliance_deadlines WHERE ca_prof_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingDeadline.rows[0]) {

      await query(

        `INSERT INTO ca_compliance_deadlines (ca_prof_id, client_name, title, due_date, status)

         VALUES ($1, 'Habib Corp', 'FBR Annual Return', CURRENT_DATE + INTERVAL '45 days', 'Upcoming'),

                ($1, 'TechVentures Ltd', 'SECP Filing', CURRENT_DATE + INTERVAL '12 days', 'Due Soon')`,

        [profile.id]

      );

    }



    const existingRetainer = await query(

      'SELECT id FROM ca_retainers WHERE ca_prof_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingRetainer.rows[0]) {

      const retainer = await query(

        `INSERT INTO ca_retainers (ca_prof_id, client_id, company_name, plan, billing_cycle, status, monthly_fee)

         VALUES ($1, $2, 'Habib Corp', 'Growth Retainer', 'Monthly', 'Active', 45000)

         RETURNING id`,

        [profile.id, clientUser.id]

      );

      const retainerId = retainer.rows[0].id;

      await query(

        `INSERT INTO ca_retainer_tasks (retainer_id, title, due_date, frequency, completed)

         VALUES ($1, 'Prepare Q3 tax summary', CURRENT_DATE + INTERVAL '14 days', 'Quarterly', FALSE),

                ($1, 'File FBR challan', CURRENT_DATE + INTERVAL '28 days', 'Monthly', FALSE)`,

        [retainerId]

      );

      await query(

        `INSERT INTO ca_retainers (ca_prof_id, client_id, company_name, plan, billing_cycle, status, monthly_fee)

         VALUES ($1, $2, 'Retail Partners', 'Starter', 'Monthly', 'Active', 15000)`,

        [profile.id, clientUser.id]

      );

    }



    const existingFolder = await query(

      'SELECT id FROM ca_document_folders WHERE ca_prof_id = $1 LIMIT 1',

      [profile.id]

    );

    if (!existingFolder.rows[0]) {

      const folder1 = await query(

        `INSERT INTO ca_document_folders (ca_prof_id, category, client_name, storage_bytes)

         VALUES ($1, 'Profit & Loss', 'Habib Corp', 52428800)

         RETURNING id`,

        [profile.id]

      );

      await query(

        `INSERT INTO ca_documents (folder_id, name, status)

         VALUES ($1, 'FY26 P&L Draft.pdf', 'Pending Signature'),

                ($1, 'Q2 Revenue Summary.xlsx', 'Ready')`,

        [folder1.rows[0].id]

      );

      const folder2 = await query(

        `INSERT INTO ca_document_folders (ca_prof_id, category, client_name, storage_bytes)

         VALUES ($1, 'Balance Sheet', 'TechVentures Ltd', 31457280)

         RETURNING id`,

        [profile.id]

      );

      await query(

        `INSERT INTO ca_documents (folder_id, name, status)

         VALUES ($1, 'FY25 Balance Sheet.pdf', 'Ready')`,

        [folder2.rows[0].id]

      );

    }



    await query(

      `INSERT INTO notifications (user_id, title, body, notification_type, link, audience)

       SELECT $1, 'Compliance Reminder', 'FBR filing deadline approaching for Habib Corp.', 'compliance', '/account/compliance', 'ca'

       WHERE NOT EXISTS (

         SELECT 1 FROM notifications WHERE user_id = $1 AND notification_type = 'compliance' AND audience = 'ca'

       )`,

      [caUser.id]

    );

  }

}

