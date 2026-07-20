-- Purge demo / seed data. Keeps table structure. Real signups via the website are untouched
-- unless they use demo emails listed below.

BEGIN;

DELETE FROM messages;
DELETE FROM lawyer_reviews;
DELETE FROM appointments;
DELETE FROM ca_appointments;
DELETE FROM service_orders;
DELETE FROM vlo_matters;
DELETE FROM vlo_subscriptions;
DELETE FROM invoices;
DELETE FROM client_activities;
DELETE FROM notifications;
DELETE FROM lawyer_subscriptions;
DELETE FROM lex_ai_chat_logs;

DELETE FROM ca_compliance_deadlines;
DELETE FROM ca_retainer_tasks;
DELETE FROM ca_retainers;
DELETE FROM ca_tax_profiles;
DELETE FROM ca_document_folders;
DELETE FROM ca_subscriptions;

DELETE FROM ca_profiles
WHERE user_id IN (SELECT id FROM users WHERE email ILIKE ANY (ARRAY[
  '%@nexuslexis.law', 'habibcorp@nexuslexis.law'
]));

DELETE FROM lawyer_profiles
WHERE user_id IN (SELECT id FROM users WHERE email ILIKE ANY (ARRAY[
  '%@nexuslexis.law', 'habibcorp@nexuslexis.law'
]));

DELETE FROM client_profiles
WHERE user_id IN (SELECT id FROM users WHERE email ILIKE ANY (ARRAY[
  '%@nexuslexis.law', 'habibcorp@nexuslexis.law'
]));

DELETE FROM users
WHERE email ILIKE ANY (ARRAY[
  'client@nexuslexis.law',
  'lawyer@nexuslexis.law',
  'ca@nexuslexis.law',
  'admin@nexuslexis.law',
  'habibcorp@nexuslexis.law'
]);

DELETE FROM auth_users
WHERE email ILIKE ANY (ARRAY[
  'client@nexuslexis.law',
  'lawyer@nexuslexis.law',
  'ca@nexuslexis.law',
  'admin@nexuslexis.law',
  'habibcorp@nexuslexis.law'
]);

DELETE FROM services;
DELETE FROM service_categories;

COMMIT;

-- Also reset local JSON store used for lawyer cases / CA file caches (run separately via CLI if needed)
