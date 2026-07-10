-- NexusLexis PostgreSQL Schema (cleaned from DATABASE OPTIMIZATION doc)
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- MODULE 1: CORE USER & AUTHENTICATION (Django-compatible)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('client', 'lawyer', 'ca', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    is_staff BOOLEAN DEFAULT FALSE,
    is_superuser BOOLEAN DEFAULT FALSE,
    date_joined TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_active_auth ON users(email) WHERE is_active IS TRUE;

-- MODULE 2: PROFESSIONAL PROFILES
CREATE TABLE IF NOT EXISTS lawyer_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    photo VARCHAR(500),
    cnic VARCHAR(15) UNIQUE NOT NULL,
    bar_council_name VARCHAR(255) NOT NULL,
    bar_council_num VARCHAR(100) NOT NULL,
    verification_stat VARCHAR(20) DEFAULT 'pending' CHECK (verification_stat IN ('pending', 'verified', 'rejected')),
    membership_tier VARCHAR(20) DEFAULT 'basic' CHECK (membership_tier IN ('basic', 'standard', 'gold', 'premium')),
    city VARCHAR(100) NOT NULL,
    practice_area VARCHAR(100),
    language VARCHAR(20) DEFAULT 'English',
    short_bio VARCHAR(150),
    full_bio TEXT,
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
    cnic VARCHAR(15) UNIQUE NOT NULL,
    qualification VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    fees DECIMAL(10, 2) NOT NULL,
    verification_stat VARCHAR(20) DEFAULT 'pending' CHECK (verification_stat IN ('pending', 'verified', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_ca_verified_lookup ON ca_profiles (city) WHERE verification_stat = 'verified';

CREATE TABLE IF NOT EXISTS practice_areas (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL
);

-- MODULE 3: SERVICE CATALOG & ORDERS
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
    status VARCHAR(30) DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'processing', 'in_progress', 'completed', 'cancelled')),
    intake_form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    completed_file VARCHAR(500),
    expected_delivery TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_orders_active_pipeline
    ON service_orders (status) WHERE status IN ('processing', 'in_progress');

-- MODULE 4: APPOINTMENTS
CREATE TABLE IF NOT EXISTS appointments (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lawyer_prof_id BIGINT NOT NULL REFERENCES lawyer_profiles(id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    mode VARCHAR(20) CHECK (mode IN ('online', 'inperson')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    meeting_link VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_appointments_slots_lookup
    ON appointments (lawyer_prof_id, appointment_date, appointment_time);

-- MODULE 5: VLO CORPORATE RETAINERS
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
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'paused', 'expired')),
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
    status VARCHAR(20) DEFAULT 'received' CHECK (status IN ('received', 'under_review', 'completed')),
    lawyer_notes TEXT,
    completed_file VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- MODULE 6: COMMUNICATIONS & AUDIT
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

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE is_read IS FALSE;

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

-- Dashboard support tables
CREATE TABLE IF NOT EXISTS invoices (
    id BIGSERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    invoice_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
