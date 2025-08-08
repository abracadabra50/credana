-- Add indexer state tracking table
CREATE TABLE IF NOT EXISTS indexer_state (
    id SERIAL PRIMARY KEY,
    program_id VARCHAR(44) NOT NULL UNIQUE, -- Solana program address (base58)
    last_processed_slot BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_indexer_state_program_id ON indexer_state(program_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_indexer_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_indexer_state_updated_at
    BEFORE UPDATE ON indexer_state
    FOR EACH ROW
    EXECUTE FUNCTION update_indexer_state_updated_at();

-- Insert initial state for our credit core program
INSERT INTO indexer_state (program_id, last_processed_slot) 
VALUES ('Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS', 0) 
ON CONFLICT (program_id) DO NOTHING; 