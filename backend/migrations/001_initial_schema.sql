-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE kyc_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
CREATE TYPE card_status AS ENUM ('active', 'frozen', 'cancelled');
CREATE TYPE card_event_type AS ENUM ('authorization_request', 'authorization_approved', 'authorization_declined', 'capture', 'refund', 'void');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'expired');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(44) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    kyc_status kyc_status DEFAULT 'pending',
    kyc_provider_id VARCHAR(255),
    kyc_verified_at TIMESTAMPTZ,
    stripe_customer_id VARCHAR(255),
    stripe_cardholder_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_kyc_status ON users(kyc_status);

-- User positions (cached from blockchain)
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collateral_amount DECIMAL(20,9) NOT NULL DEFAULT 0,
    debt_usdc DECIMAL(20,6) NOT NULL DEFAULT 0,
    health_factor DECIMAL(10,4),
    ltv_ratio DECIMAL(5,4),
    credit_limit DECIMAL(20,6) NOT NULL DEFAULT 0,
    available_credit DECIMAL(20,6) NOT NULL DEFAULT 0,
    liquidation_price DECIMAL(20,6),
    last_sync_slot BIGINT,
    last_sync_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE INDEX idx_positions_user ON positions(user_id);
CREATE INDEX idx_positions_health_factor ON positions(health_factor);

-- Cards table
CREATE TABLE cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_card_id VARCHAR(255) UNIQUE NOT NULL,
    last_four VARCHAR(4),
    brand VARCHAR(50),
    exp_month INTEGER,
    exp_year INTEGER,
    status card_status DEFAULT 'active',
    is_virtual BOOLEAN DEFAULT true,
    spending_limit_daily DECIMAL(20,6),
    spending_limit_monthly DECIMAL(20,6),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cards_user ON cards(user_id);
CREATE INDEX idx_cards_stripe_id ON cards(stripe_card_id);
CREATE INDEX idx_cards_status ON cards(status);

-- Card events (authorization, capture, etc)
CREATE TABLE card_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    stripe_event_id VARCHAR(255) UNIQUE,
    type card_event_type NOT NULL,
    amount DECIMAL(20,6) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    merchant_name VARCHAR(255),
    merchant_category VARCHAR(255),
    merchant_country VARCHAR(2),
    status transaction_status DEFAULT 'pending',
    health_factor_at_auth DECIMAL(10,4),
    approved BOOLEAN,
    decline_reason VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
) PARTITION BY RANGE (created_at);

-- Create monthly partitions for card_events
CREATE TABLE card_events_2024_01 PARTITION OF card_events
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE card_events_2024_02 PARTITION OF card_events
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- Add more partitions as needed

CREATE INDEX idx_card_events_user_created ON card_events(user_id, created_at DESC);
CREATE INDEX idx_card_events_card ON card_events(card_id);
CREATE INDEX idx_card_events_type ON card_events(type);
CREATE INDEX idx_card_events_stripe_id ON card_events(stripe_event_id);

-- Blockchain transactions
CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    signature VARCHAR(128) UNIQUE NOT NULL,
    instruction_type VARCHAR(50) NOT NULL,
    status transaction_status DEFAULT 'pending',
    slot BIGINT,
    block_time TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    priority_fee_lamports BIGINT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_blockchain_tx_user ON blockchain_transactions(user_id);
CREATE INDEX idx_blockchain_tx_signature ON blockchain_transactions(signature);
CREATE INDEX idx_blockchain_tx_status ON blockchain_transactions(status);
CREATE INDEX idx_blockchain_tx_type ON blockchain_transactions(instruction_type);

-- Ledger entries for reconciliation
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_type VARCHAR(50) NOT NULL, -- 'debt_increase', 'repayment', 'liquidation', etc
    amount_usdc DECIMAL(20,6) NOT NULL,
    balance_before DECIMAL(20,6),
    balance_after DECIMAL(20,6),
    reference_type VARCHAR(50), -- 'card_event', 'blockchain_tx', etc
    reference_id UUID,
    blockchain_signature VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ledger_user_created ON ledger_entries(user_id, created_at DESC);
CREATE INDEX idx_ledger_type ON ledger_entries(entry_type);
CREATE INDEX idx_ledger_reference ON ledger_entries(reference_type, reference_id);

-- Points system tables
CREATE TABLE points_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'spending', 'referral', 'achievement', etc
    amount INTEGER NOT NULL,
    multiplier DECIMAL(3,2) DEFAULT 1.0,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_points_tx_user_created ON points_transactions(user_id, created_at DESC);
CREATE INDEX idx_points_tx_type ON points_transactions(type);

CREATE TABLE points_balances (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_earned BIGINT DEFAULT 0,
    total_spent BIGINT DEFAULT 0,
    current_balance BIGINT DEFAULT 0,
    tier INTEGER DEFAULT 1,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL,
    points_awarded INTEGER,
    earned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_achievements_user ON user_achievements(user_id);

-- Referrals table
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    referee_card_activated BOOLEAN DEFAULT false,
    referee_first_purchase BOOLEAN DEFAULT false,
    points_awarded_referrer INTEGER DEFAULT 0,
    points_awarded_referee INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referee_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_status ON referrals(status);

-- Audit log for compliance
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- Create update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_points_balances_updated_at BEFORE UPDATE ON points_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create materialized view for user stats
CREATE MATERIALIZED VIEW user_stats AS
SELECT 
    u.id as user_id,
    u.wallet_address,
    p.collateral_amount,
    p.debt_usdc,
    p.health_factor,
    p.credit_limit,
    COUNT(DISTINCT c.id) as card_count,
    COUNT(DISTINCT ce.id) FILTER (WHERE ce.type = 'capture' AND ce.created_at > CURRENT_DATE - INTERVAL '30 days') as monthly_transactions,
    SUM(ce.amount) FILTER (WHERE ce.type = 'capture' AND ce.created_at > CURRENT_DATE - INTERVAL '30 days') as monthly_spending,
    pb.current_balance as points_balance,
    pb.tier as points_tier
FROM users u
LEFT JOIN positions p ON u.id = p.user_id
LEFT JOIN cards c ON u.id = c.user_id AND c.status = 'active'
LEFT JOIN card_events ce ON u.id = ce.user_id
LEFT JOIN points_balances pb ON u.id = pb.user_id
GROUP BY u.id, u.wallet_address, p.collateral_amount, p.debt_usdc, 
         p.health_factor, p.credit_limit, pb.current_balance, pb.tier;

CREATE INDEX idx_user_stats_user ON user_stats(user_id);

-- Create index for refreshing materialized view
CREATE INDEX idx_positions_updated ON positions(updated_at);

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user accounts with KYC and card issuing information';
COMMENT ON TABLE positions IS 'Cached on-chain position data for fast authorization';
COMMENT ON TABLE card_events IS 'All card transaction events partitioned by month';
COMMENT ON TABLE ledger_entries IS 'Double-entry bookkeeping for reconciliation';
COMMENT ON TABLE points_transactions IS 'Points earning and spending history';
COMMENT ON COLUMN positions.health_factor IS 'Cached health factor for sub-500ms auth decisions';
COMMENT ON COLUMN card_events.health_factor_at_auth IS 'Health factor snapshot at authorization time';

-- Note: Achievement definitions would be managed in application code
-- The user_achievements table tracks which achievements users have earned 