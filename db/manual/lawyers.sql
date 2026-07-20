-- ============================================================
-- NexusLexis: Remove demo lawyers & add real lawyer profiles
-- Run against database: nexuslexis
-- ============================================================

BEGIN;

-- 1) Remove demo lawyer accounts and orphaned profiles
DELETE FROM messages
WHERE sender_id IN (SELECT id FROM users WHERE role = 'lawyer')
   OR recipient_id IN (SELECT id FROM users WHERE role = 'lawyer');

DELETE FROM users
WHERE role = 'lawyer';

DELETE FROM lawyer_profiles
WHERE user_id NOT IN (SELECT id FROM users);

COMMIT;

-- ============================================================
-- 2) Add a verified lawyer (appears on Search Lawyer page)
--    Required for marketplace: verification_stat = 'verified'
-- ============================================================

BEGIN;

WITH new_lawyer AS (
    INSERT INTO users (username, email, password, role)
    VALUES (
        'Mian Ali Raza',
        'mali@yourfirm.com',
        '$2a$10$replace_with_bcrypt_hash',
        'lawyer'
    )
    RETURNING id
)
INSERT INTO lawyer_profiles (
    user_id,
    full_name,
    photo,
    cnic,
    bar_council_name,
    bar_council_num,
    verification_stat,
    membership_tier,
    city,
    practice_area,
    language,
    full_bio,
    online_fee,
    inperson_fee
)
SELECT
    id,
    'Adv. Mian Ali Raza',
    'https://your-cdn.com/lawyers/mian-ali-raza.jpg',
    '35201-1234567-1',
    'Punjab Bar Council',
    'PBC-12345',
    'verified',
    'gold',
    'Lahore',
    'Corporate law',
    'English',
    'Advocate High Court specializing in corporate restructuring, SECP filings, and tax litigation.',
    4500.00,
    8000.00
FROM new_lawyer;

COMMIT;

-- ============================================================
-- 3) Add another lawyer (example)
-- ============================================================

BEGIN;

WITH new_lawyer AS (
    INSERT INTO users (username, email, password, role)
    VALUES (
        'Aisha Chaudhry',
        'aisha@yourfirm.com',
        '$2a$10$replace_with_bcrypt_hash',
        'lawyer'
    )
    RETURNING id
)
INSERT INTO lawyer_profiles (
    user_id,
    full_name,
    photo,
    cnic,
    bar_council_name,
    bar_council_num,
    verification_stat,
    membership_tier,
    city,
    practice_area,
    language,
    full_bio,
    online_fee,
    inperson_fee
)
SELECT
    id,
    'Adv. Aisha Chaudhry',
    'https://your-cdn.com/lawyers/aisha-chaudhry.jpg',
    '35201-2345678-2',
    'Islamabad Bar Council',
    'IBC-67890',
    'verified',
    'standard',
    'Islamabad',
    'Intellectual property',
    'English',
    'IP specialist for trademark, copyright, and patent matters under IPO Pakistan regulations.',
    3500.00,
    6000.00
FROM new_lawyer;

COMMIT;

-- ============================================================
-- 4) Verify lawyers visible in marketplace
-- ============================================================

SELECT
    lp.id,
    lp.full_name,
    lp.city,
    lp.practice_area,
    lp.language,
    lp.verification_stat,
    lp.online_fee,
    lp.inperson_fee
FROM lawyer_profiles lp
JOIN users u ON u.id = lp.user_id
WHERE lp.verification_stat = 'verified'
  AND lp.is_suspended = FALSE
ORDER BY lp.id;
