-- ============================================================================
-- NexusLexis PostgreSQL — FULL SCHEMA FOR LIVE REGISTRATION
-- Database: nexuslexis
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Run: psql -U postgres -d nexuslexis -f backend/db/full_schema_live.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ============================================================================
-- MODULE 1: CORE USERS (dashboard)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'client'
        CHECK (role IN ('client', 'lawyer', 'ca', 'admin')),
    active_role VARCHAR(20) DEFAULT 'client',
    is_active BOOLEAN DEFAULT TRUE,
    is_staff BOOLEAN DEFAULT FALSE,
    is_superuser BOOLEAN DEFAULT FALSE,
    date_joined TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_active_auth
    ON users(email) WHERE is_active IS TRUE;

-- ============================================================================
-- MODULE 1B: AUTH USERS (signup/login — REQUIRED for new registrations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('client', 'lawyer', 'ca', 'admin')),
    auth_provider VARCHAR(20) NOT NULL DEFAULT 'local'
        CHECK (auth_provider IN ('local', 'google')),
    google_id VARCHAR(255) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users (role) WHERE is_active IS TRUE;

-- ============================================================================
-- MODULE 2: CLIENT / LAWYER / CA PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cnic VARCHAR(15),
    address TEXT,
    city VARCHAR(100),
    profile_photo VARCHAR(500),
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lawyer_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    photo VARCHAR(500),
    cnic VARCHAR(15) UNIQUE NOT NULL,
    bar_council_name VARCHAR(255) NOT NULL,
    bar_council_num VARCHAR(100) NOT NULL,
    verification_stat VARCHAR(20) DEFAULT 'pending'
        CHECK (verification_stat IN ('pending', 'verified', 'rejected')),
    verification_submitted_at TIMESTAMPTZ,
    verification_review_deadline TIMESTAMPTZ,
    membership_tier VARCHAR(20) DEFAULT 'basic'
        CHECK (membership_tier IN ('basic', 'standard', 'gold', 'premium')),
    city VARCHAR(100) NOT NULL,
    practice_area VARCHAR(100),
    language VARCHAR(20) DEFAULT 'English',
    short_bio VARCHAR(150),
    full_bio TEXT,
    office_address TEXT,
    languages TEXT,
    practice_areas TEXT,
    consultation_mode VARCHAR(20) DEFAULT 'Both',
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    online_fee DECIMAL(10, 2) NOT NULL,
    inperson_fee DECIMAL(10, 2) NOT NULL,
    monthly_enquiry INT DEFAULT 0,
    monthly_lex_ai INT DEFAULT 0,
    is_suspended BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_lawyers_marketplace_search
    ON lawyer_profiles (city, verification_stat, membership_tier DESC)
    WHERE is_suspended IS FALSE;

CREATE TABLE IF NOT EXISTS ca_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    photo VARCHAR(500),
    cnic VARCHAR(15) UNIQUE NOT NULL,
    icap_membership_no VARCHAR(100),
    qualification VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    service_areas TEXT,
    availability TEXT,
    documents JSONB NOT NULL DEFAULT '{}'::jsonb,
    fees DECIMAL(10, 2) NOT NULL,
    verification_stat VARCHAR(20) DEFAULT 'pending'
        CHECK (verification_stat IN ('pending', 'verified', 'rejected')),
    verification_submitted_at TIMESTAMPTZ,
    verification_review_deadline TIMESTAMPTZ,
    membership_tier VARCHAR(20) DEFAULT 'basic',
    short_bio VARCHAR(150),
    full_bio TEXT,
    office_address TEXT,
    online_fee DECIMAL(10, 2),
    inperson_fee DECIMAL(10, 2),
    monthly_leads INT DEFAULT 0,
    is_suspended BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_ca_verified_lookup
    ON ca_profiles (city) WHERE verification_stat = 'verified';

CREATE TABLE IF NOT EXISTS practice_areas (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS client_activities (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(30) NOT NULL,
    lang_key VARCHAR(50) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_activities_recent
    ON client_activities (client_id, created_at DESC);

-- ============================================================================
-- MODULE 3: SERVICE CATALOG & ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    display_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    delivery_days INT NOT NULL,
    intake_schema JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_services_schema_gin ON services USING GIN (intake_schema);

CREATE TABLE IF NOT EXISTS service_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    assigned_prof_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'pending_payment'
        CHECK (status IN ('pending_payment', 'processing', 'in_progress', 'completed', 'cancelled')),
    intake_form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_file VARCHAR(500),
    milestone VARCHAR(100),
    expected_delivery TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_orders_active_pipeline
    ON service_orders (status) WHERE status IN ('processing', 'in_progress');

-- ============================================================================
-- MODULE 4: APPOINTMENTS (LAWYER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lawyer_prof_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    mode VARCHAR(20) CHECK (mode IN ('online', 'inperson')),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    meeting_link VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_appointments_slots_lookup
    ON appointments (lawyer_prof_id, appointment_date, appointment_time);

-- ============================================================================
-- MODULE 4B: CA DASHBOARD
-- ============================================================================

CREATE TABLE IF NOT EXISTS ca_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    ca_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    next_billing DATE NOT NULL,
    monthly_fee DECIMAL(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS ca_appointments (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    mode VARCHAR(20) CHECK (mode IN ('online', 'inperson')),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    meeting_link VARCHAR(500),
    topic VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_ca_appointments_lookup
    ON ca_appointments (ca_prof_id, appointment_date, appointment_time);

CREATE TABLE IF NOT EXISTS ca_tax_profiles (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    business_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255),
    ntn VARCHAR(50),
    secp_registration VARCHAR(100),
    tax_status VARCHAR(50) DEFAULT 'Active',
    filing_count INT DEFAULT 0,
    tax_year VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ca_tax_challans (
    id BIGSERIAL PRIMARY KEY,
    tax_profile_id BIGINT NOT NULL REFERENCES ca_tax_profiles(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    original_name VARCHAR(255),
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ca_compliance_deadlines (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    client_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Upcoming'
);

CREATE TABLE IF NOT EXISTS ca_retainers (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    company_name VARCHAR(255) NOT NULL,
    plan VARCHAR(100),
    billing_cycle VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active',
    monthly_fee DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ca_retainer_tasks (
    id BIGSERIAL PRIMARY KEY,
    retainer_id BIGINT NOT NULL REFERENCES ca_retainers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    due_date DATE,
    frequency VARCHAR(50),
    completed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS ca_document_folders (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    client_name VARCHAR(255),
    storage_bytes BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ca_documents (
    id BIGSERIAL PRIMARY KEY,
    folder_id BIGINT NOT NULL REFERENCES ca_document_folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'Ready',
    esign_session_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS ca_team_members (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(100) DEFAULT 'Junior CA',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MODULE 5: VLO CORPORATE RETAINERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS vlo_plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL CHECK (name IN ('Starter', 'Growth', 'Enterprise')),
    monthly_fee DECIMAL(10, 2) NOT NULL,
    document_reviews_per_month INT NOT NULL,
    consultations_per_month INT NOT NULL,
    support_channel VARCHAR(50) NOT NULL,
    compliance_report VARCHAR(50) NOT NULL,
    has_dedicated_lawyer BOOLEAN DEFAULT FALSE
);

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
);

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
);

-- ============================================================================
-- MODULE 6: COMMUNICATIONS, BILLING & AUDIT
-- ============================================================================

CREATE TABLE IF NOT EXISTS lawyer_reviews (
    id BIGSERIAL PRIMARY KEY,
    lawyer_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_lawyer_approved
    ON lawyer_reviews (lawyer_id, created_at DESC) WHERE is_approved IS TRUE;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    notification_type VARCHAR(30) NOT NULL DEFAULT 'general',
    is_read BOOLEAN DEFAULT FALSE,
    link VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON notifications (user_id) WHERE is_read IS FALSE;

CREATE TABLE IF NOT EXISTS lex_ai_chat_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    question TEXT NOT NULL,
    response TEXT NOT NULL,
    detected_lang VARCHAR(10) NOT NULL,
    lawyer_tier VARCHAR(20),
    referral_shown BOOLEAN DEFAULT FALSE,
    is_flagged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lex_session ON lex_ai_chat_logs (session_id);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    file VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_stream
    ON messages (thread_id, created_at DESC) INCLUDE (is_read);

CREATE TABLE IF NOT EXISTS lawyer_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    lawyer_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    next_billing DATE NOT NULL,
    stripe_sub_id VARCHAR(255),
    monthly_fee DECIMAL(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    invoice_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- MIGRATION PATCHES (if you already ran an older script)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_role VARCHAR(20) DEFAULT 'client';
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS practice_area VARCHAR(100);
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'English';
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS languages TEXT;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS practice_areas TEXT;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS consultation_mode VARCHAR(20) DEFAULT 'Both';
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE lawyer_profiles ADD COLUMN IF NOT EXISTS verification_review_deadline TIMESTAMPTZ;

ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS photo VARCHAR(500);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS icap_membership_no VARCHAR(100);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS service_areas TEXT;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS availability TEXT;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS verification_review_deadline TIMESTAMPTZ;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS membership_tier VARCHAR(20) DEFAULT 'basic';
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS short_bio VARCHAR(150);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS full_bio TEXT;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS office_address TEXT;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS online_fee DECIMAL(10, 2);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS inperson_fee DECIMAL(10, 2);
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS monthly_leads INT DEFAULT 0;
ALTER TABLE ca_profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;

ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS milestone VARCHAR(100);

-- ============================================================================
-- DIAGNOSTIC QUERIES (run manually — not part of schema migration)
-- New users are added automatically on signup; no need to re-run schema per user
-- ============================================================================

-- VIEW ALL NEW REGISTRATIONS
-- SELECT
--     au.id              AS auth_user_id,
--     au.full_name,
--     au.email,
--     au.phone,
--     au.role            AS auth_role,
--     au.created_at      AS signed_up_at,
--     u.id               AS dashboard_user_id,
--     u.username,
--     u.role             AS dashboard_role,
--     u.active_role,
--     cp.city            AS client_city,
--     cp.address         AS client_address,
--     cp.cnic            AS client_cnic,
--     lp.verification_stat AS lawyer_status,
--     cap.verification_stat AS ca_status
-- FROM auth_users au
-- JOIN users u ON LOWER(u.email) = LOWER(au.email)
-- LEFT JOIN client_profiles cp ON cp.user_id = u.id
-- LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id
-- LEFT JOIN ca_profiles cap ON cap.user_id = u.id
-- ORDER BY au.created_at DESC;

-- VIEW ALL NOTIFICATIONS
-- SELECT
--     n.id,
--     u.email,
--     u.username,
--     n.title,
--     n.body,
--     n.notification_type,
--     n.is_read,
--     n.link,
--     n.created_at
-- FROM notifications n
-- JOIN users u ON u.id = n.user_id
-- ORDER BY n.created_at DESC;

-- VIEW ONE USER (replace email)
-- SELECT * FROM auth_users WHERE email = 'your@email.com';
-- SELECT * FROM users WHERE email = 'your@email.com';
-- SELECT * FROM client_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
-- SELECT * FROM lawyer_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
-- SELECT * FROM ca_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
-- SELECT * FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
-- SELECT * FROM client_activities WHERE client_id = (SELECT id FROM users WHERE email = 'your@email.com');

-- LIST ALL CA TABLES
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'ca_%' ORDER BY table_name;
