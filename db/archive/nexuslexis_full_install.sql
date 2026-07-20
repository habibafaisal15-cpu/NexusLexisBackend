-- =============================================================================
-- NEXUS LEXIS — FULL POSTGRESQL INSTALL (copy-paste ALL of this in pgAdmin)
-- Database: nexuslexis
-- WARNING: This DELETES all existing tables and data, then recreates everything.
-- =============================================================================

DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- CORE USERS
-- =============================================================================

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('client', 'lawyer', 'ca', 'admin')),
    active_role VARCHAR(20) DEFAULT 'client',
    is_active BOOLEAN DEFAULT TRUE,
    is_staff BOOLEAN DEFAULT FALSE,
    is_superuser BOOLEAN DEFAULT FALSE,
    date_joined TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_active_auth ON users(email) WHERE is_active IS TRUE;

CREATE TABLE auth_users (
    id BIGSERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('client', 'lawyer', 'ca', 'admin')),
    auth_provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local', 'google')),
    google_id VARCHAR(255) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);
CREATE INDEX idx_auth_users_email ON auth_users (LOWER(email));
CREATE INDEX idx_auth_users_role ON auth_users (role) WHERE is_active IS TRUE;

-- =============================================================================
-- SIGNUP OTP / EMAIL VERIFICATION TOKENS
-- otp_code          = 6-digit code emailed to user
-- verification_token = one-time token after OTP verified (used at register)
-- =============================================================================

CREATE TABLE signup_otps (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    verification_token VARCHAR(64),
    verification_token_expires_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,
    send_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_signup_otps_email ON signup_otps (LOWER(email));
CREATE INDEX idx_signup_otps_token ON signup_otps (verification_token)
    WHERE verification_token IS NOT NULL;

CREATE OR REPLACE FUNCTION generate_signup_temp_token()
RETURNS VARCHAR(6)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN LPAD((FLOOR(RANDOM() * 1000000))::INT::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION create_signup_otp_record(p_email TEXT, p_ttl_minutes INT DEFAULT 10)
RETURNS TABLE(
    rec_id BIGINT,
    rec_email TEXT,
    temp_token VARCHAR(6),
    rec_expires_at TIMESTAMPTZ,
    rec_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized TEXT;
  v_token VARCHAR(6);
BEGIN
  v_normalized := LOWER(TRIM(p_email));
  UPDATE signup_otps
  SET expires_at = NOW()
  WHERE LOWER(signup_otps.email) = v_normalized
    AND verified_at IS NULL
    AND expires_at > NOW();
  v_token := generate_signup_temp_token();
  RETURN QUERY
  INSERT INTO signup_otps (email, otp_code, expires_at)
  VALUES (v_normalized, v_token, NOW() + (p_ttl_minutes || ' minutes')::interval)
  RETURNING signup_otps.id::BIGINT, signup_otps.email::TEXT, signup_otps.otp_code::VARCHAR(6),
            signup_otps.expires_at::TIMESTAMPTZ, signup_otps.created_at::TIMESTAMPTZ;
END;
$$;

CREATE OR REPLACE FUNCTION issue_signup_verification_token(p_otp_id BIGINT, p_token_ttl_minutes INT DEFAULT 30)
RETURNS TABLE(
    rec_email TEXT,
    registration_token VARCHAR(64),
    token_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE signup_otps
  SET verified_at = NOW(),
      verification_token = encode(gen_random_bytes(32), 'hex'),
      verification_token_expires_at = NOW() + (p_token_ttl_minutes || ' minutes')::interval
  WHERE id = p_otp_id
    AND verified_at IS NULL
    AND expires_at > NOW()
  RETURNING signup_otps.email::TEXT, signup_otps.verification_token::VARCHAR(64),
            signup_otps.verification_token_expires_at::TIMESTAMPTZ;
END;
$$;

-- =============================================================================
-- PROFILES
-- =============================================================================

CREATE TABLE client_profiles (
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

CREATE TABLE lawyer_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    photo VARCHAR(500),
    cnic VARCHAR(15) UNIQUE NOT NULL,
    bar_council_name VARCHAR(255) NOT NULL,
    bar_council_num VARCHAR(100) NOT NULL,
    verification_stat VARCHAR(20) DEFAULT 'pending' CHECK (verification_stat IN ('pending', 'verified', 'rejected')),
    verification_submitted_at TIMESTAMPTZ,
    verification_review_deadline TIMESTAMPTZ,
    membership_tier VARCHAR(20) DEFAULT 'basic' CHECK (membership_tier IN ('basic', 'standard', 'gold', 'premium')),
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
CREATE INDEX idx_lawyers_marketplace_search ON lawyer_profiles (city, verification_stat, membership_tier DESC) WHERE is_suspended IS FALSE;

CREATE TABLE ca_profiles (
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
    verification_stat VARCHAR(20) DEFAULT 'pending' CHECK (verification_stat IN ('pending', 'verified', 'rejected')),
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
CREATE INDEX idx_ca_verified_lookup ON ca_profiles (city) WHERE verification_stat = 'verified';

-- =============================================================================
-- PLATFORM TABLES
-- =============================================================================

CREATE TABLE practice_areas (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE client_activities (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type VARCHAR(30) NOT NULL,
    lang_key VARCHAR(50) NOT NULL,
    params JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_client_activities_recent ON client_activities (client_id, created_at DESC);

CREATE TABLE service_categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    display_order INT DEFAULT 0
);

CREATE TABLE services (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    delivery_days INT NOT NULL,
    intake_schema JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_services_schema_gin ON services USING GIN (intake_schema);

CREATE TABLE service_orders (
    id BIGSERIAL PRIMARY KEY,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    assigned_prof_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'processing', 'in_progress', 'completed', 'cancelled')),
    intake_form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_file VARCHAR(500),
    milestone VARCHAR(100),
    expected_delivery TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);
CREATE INDEX idx_orders_active_pipeline ON service_orders (status) WHERE status IN ('processing', 'in_progress');

CREATE TABLE appointments (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lawyer_prof_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    mode VARCHAR(20) CHECK (mode IN ('online', 'inperson')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    meeting_link VARCHAR(500)
);
CREATE INDEX idx_appointments_slots_lookup ON appointments (lawyer_prof_id, appointment_date, appointment_time);

CREATE TABLE ca_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    ca_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    next_billing DATE NOT NULL,
    monthly_fee DECIMAL(10, 2) NOT NULL
);

CREATE TABLE ca_appointments (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    mode VARCHAR(20) CHECK (mode IN ('online', 'inperson')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    meeting_link VARCHAR(500),
    topic VARCHAR(255)
);
CREATE INDEX idx_ca_appointments_lookup ON ca_appointments (ca_prof_id, appointment_date, appointment_time);

CREATE TABLE ca_tax_profiles (
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

CREATE TABLE ca_tax_challans (
    id BIGSERIAL PRIMARY KEY,
    tax_profile_id BIGINT NOT NULL REFERENCES ca_tax_profiles(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    original_name VARCHAR(255),
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ca_compliance_deadlines (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    client_name VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(50) DEFAULT 'Upcoming'
);

CREATE TABLE ca_retainers (
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

CREATE TABLE ca_retainer_tasks (
    id BIGSERIAL PRIMARY KEY,
    retainer_id BIGINT NOT NULL REFERENCES ca_retainers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    due_date DATE,
    frequency VARCHAR(50),
    completed BOOLEAN DEFAULT FALSE
);

CREATE TABLE ca_document_folders (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    client_name VARCHAR(255),
    storage_bytes BIGINT DEFAULT 0
);

CREATE TABLE ca_documents (
    id BIGSERIAL PRIMARY KEY,
    folder_id BIGINT NOT NULL REFERENCES ca_document_folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
    status VARCHAR(50) DEFAULT 'Ready',
    esign_session_id VARCHAR(255)
);

CREATE TABLE ca_team_members (
    id BIGSERIAL PRIMARY KEY,
    ca_prof_id BIGINT NOT NULL REFERENCES ca_profiles(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(100) DEFAULT 'Junior CA',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vlo_plans (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL CHECK (name IN ('Starter', 'Growth', 'Enterprise')),
    monthly_fee DECIMAL(10, 2) NOT NULL,
    document_reviews_per_month INT NOT NULL,
    consultations_per_month INT NOT NULL,
    support_channel VARCHAR(50) NOT NULL,
    compliance_report VARCHAR(50) NOT NULL,
    has_dedicated_lawyer BOOLEAN DEFAULT FALSE
);

CREATE TABLE vlo_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id BIGINT NOT NULL REFERENCES vlo_plans(id) ON DELETE RESTRICT,
    assigned_lawyer_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'paused', 'expired')),
    start_date DATE NOT NULL,
    next_billing_date DATE NOT NULL,
    reviews_used_this_month INT DEFAULT 0,
    consultations_used_this_month INT DEFAULT 0,
    matters_submitted_this_month INT DEFAULT 0,
    stripe_subscription_id VARCHAR(255)
);

CREATE TABLE vlo_matters (
    id BIGSERIAL PRIMARY KEY,
    subscription_id BIGINT NOT NULL REFERENCES vlo_subscriptions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    file VARCHAR(500),
    status VARCHAR(20) DEFAULT 'received' CHECK (status IN ('received', 'under_review', 'completed')),
    lawyer_notes TEXT,
    completed_file VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lawyer_reviews (
    id BIGSERIAL PRIMARY KEY,
    lawyer_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reviews_lawyer_approved ON lawyer_reviews (lawyer_id, created_at DESC) WHERE is_approved IS TRUE;

CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    notification_type VARCHAR(30) NOT NULL DEFAULT 'general',
    is_read BOOLEAN DEFAULT FALSE,
    link VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE is_read IS FALSE;

CREATE TABLE lex_ai_chat_logs (
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
CREATE INDEX idx_lex_session ON lex_ai_chat_logs (session_id);

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    thread_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    file VARCHAR(500),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_messages_thread_stream ON messages (thread_id, created_at DESC) INCLUDE (is_read);

CREATE TABLE lawyer_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    lawyer_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    next_billing DATE NOT NULL,
    stripe_sub_id VARCHAR(255),
    monthly_fee DECIMAL(10, 2) NOT NULL
);

CREATE TABLE invoices (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    invoice_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- VERIFY INSTALL — lists all tables
-- =============================================================================

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- =============================================================================
-- VIEW TOKENS (run anytime after signup OTP is sent)
-- =============================================================================

SELECT
  id,
  email,
  otp_code,
  expires_at,
  verified_at,
  verification_token,
  verification_token_expires_at,
  attempts,
  created_at
FROM signup_otps
ORDER BY created_at DESC
LIMIT 50;

-- =============================================================================
-- VIEW USERS (login accounts)
-- =============================================================================

SELECT
  id,
  full_name,
  email,
  phone,
  role,
  auth_provider,
  is_active,
  created_at,
  last_login_at
FROM auth_users
ORDER BY created_at DESC;

-- =============================================================================
-- VIEW DASHBOARD USERS + PROFILES
-- =============================================================================

SELECT
  u.id,
  u.username,
  u.email,
  u.phone,
  u.role,
  u.active_role,
  u.is_active,
  u.date_joined,
  au.full_name,
  au.last_login_at,
  cp.city AS client_city,
  lp.full_name AS lawyer_name,
  lp.verification_stat AS lawyer_status,
  ca.full_name AS ca_name,
  ca.verification_stat AS ca_status
FROM users u
LEFT JOIN auth_users au ON LOWER(au.email) = LOWER(u.email)
LEFT JOIN client_profiles cp ON cp.user_id = u.id
LEFT JOIN lawyer_profiles lp ON lp.user_id = u.id
LEFT JOIN ca_profiles ca ON ca.user_id = u.id
ORDER BY u.date_joined DESC;
