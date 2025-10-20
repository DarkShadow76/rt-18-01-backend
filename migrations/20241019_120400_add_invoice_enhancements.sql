-- Migration: Add enhancements to existing invoices table
-- Date: 2024-10-19 12:04:00
-- Description: Adds new columns and constraints to existing invoices table for enhanced functionality

-- This migration is designed to work with an existing invoices table
-- It adds the enhanced columns if they don't already exist

-- Add status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'status') THEN
        ALTER TABLE invoices ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'uploaded';
        ALTER TABLE invoices ADD CONSTRAINT check_invoice_status CHECK (status IN ('uploaded', 'processing', 'completed', 'failed', 'duplicate'));
    END IF;
END $$;

-- Add processing_attempts column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'processing_attempts') THEN
        ALTER TABLE invoices ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE invoices ADD CONSTRAINT check_processing_attempts CHECK (processing_attempts >= 0);
    END IF;
END $$;

-- Add last_processed_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'last_processed_at') THEN
        ALTER TABLE invoices ADD COLUMN last_processed_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add metadata column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'metadata') THEN
        ALTER TABLE invoices ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
    END IF;
END $$;

-- Add duplicate_of column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'duplicate_of') THEN
        ALTER TABLE invoices ADD COLUMN duplicate_of UUID;
        -- Add foreign key constraint after column creation
        ALTER TABLE invoices ADD CONSTRAINT fk_invoices_duplicate_of 
            FOREIGN KEY (duplicate_of) REFERENCES invoices(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add content_hash column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'content_hash') THEN
        ALTER TABLE invoices ADD COLUMN content_hash VARCHAR(64);
    END IF;
END $$;

-- Add created_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'created_at') THEN
        ALTER TABLE invoices ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'updated_at') THEN
        ALTER TABLE invoices ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
END $$;

-- Ensure total_amount has proper constraints
DO $$ 
BEGIN
    -- Drop existing constraint if it exists with different name
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE table_name = 'invoices' AND constraint_type = 'CHECK' 
               AND constraint_name != 'check_total_amount_positive') THEN
        -- This is a simplified approach - in production you might want to be more specific
        ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_total_amount_check;
    END IF;
    
    -- Add the constraint with our preferred name
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
                   WHERE table_name = 'invoices' AND constraint_name = 'check_total_amount_positive') THEN
        ALTER TABLE invoices ADD CONSTRAINT check_total_amount_positive CHECK (total_amount >= 0);
    END IF;
END $$;

-- Create or replace the updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to have proper default values for new columns
UPDATE invoices 
SET 
    status = COALESCE(status, 'completed'),
    processing_attempts = COALESCE(processing_attempts, 1),
    metadata = COALESCE(metadata, '{}'),
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE 
    status IS NULL 
    OR processing_attempts IS NULL 
    OR metadata IS NULL 
    OR created_at IS NULL 
    OR updated_at IS NULL;

-- Add comments to new columns
COMMENT ON COLUMN invoices.status IS 'Current processing status of the invoice';
COMMENT ON COLUMN invoices.processing_attempts IS 'Number of times processing has been attempted';
COMMENT ON COLUMN invoices.last_processed_at IS 'Timestamp of last processing attempt';
COMMENT ON COLUMN invoices.metadata IS 'JSON metadata including file info, processing details, etc.';
COMMENT ON COLUMN invoices.duplicate_of IS 'Reference to original invoice if this is a duplicate';
COMMENT ON COLUMN invoices.content_hash IS 'Content hash for duplicate detection';
COMMENT ON COLUMN invoices.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN invoices.updated_at IS 'Timestamp when record was last updated';