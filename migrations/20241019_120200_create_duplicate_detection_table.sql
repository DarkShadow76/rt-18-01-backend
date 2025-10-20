-- Migration: Create duplicate detection table
-- Date: 2024-10-19 12:02:00
-- Description: Creates the duplicate detection table for tracking and managing invoice duplicates

-- Create duplicate detection table
CREATE TABLE IF NOT EXISTS invoice_duplicates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    original_invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    duplicate_invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    similarity_score DECIMAL(5,4) NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
    detection_method VARCHAR(50) NOT NULL CHECK (detection_method IN (
        'invoice_number', 'content_hash', 'fuzzy_match', 'combined'
    )),
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    detection_details JSONB NOT NULL DEFAULT '{}', -- Additional details about how duplicate was detected
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution VARCHAR(50) CHECK (resolution IN (
        'keep_original', 'keep_duplicate', 'merge', 'manual_review'
    )),
    resolution_metadata JSONB DEFAULT '{}', -- Details about how the duplicate was resolved
    resolved_by VARCHAR(255), -- User who resolved the duplicate
    
    -- Ensure we don't have duplicate entries for the same pair
    CONSTRAINT unique_duplicate_pair UNIQUE (original_invoice_id, duplicate_invoice_id),
    
    -- Ensure original and duplicate are different invoices
    CONSTRAINT different_invoices CHECK (original_invoice_id != duplicate_invoice_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_duplicates_original_invoice ON invoice_duplicates(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_duplicate_invoice ON invoice_duplicates(duplicate_invoice_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_detection_method ON invoice_duplicates(detection_method);
CREATE INDEX IF NOT EXISTS idx_duplicates_similarity_score ON invoice_duplicates(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_created_at ON invoice_duplicates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_unresolved ON invoice_duplicates(created_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_duplicates_resolution ON invoice_duplicates(resolution) WHERE resolution IS NOT NULL;

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_duplicates_original_created ON invoice_duplicates(original_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_method_score ON invoice_duplicates(detection_method, similarity_score DESC);

-- Add comments for documentation
COMMENT ON TABLE invoice_duplicates IS 'Table for tracking detected duplicate invoices and their resolution';
COMMENT ON COLUMN invoice_duplicates.id IS 'Unique identifier for the duplicate detection record';
COMMENT ON COLUMN invoice_duplicates.original_invoice_id IS 'Reference to the original (first) invoice';
COMMENT ON COLUMN invoice_duplicates.duplicate_invoice_id IS 'Reference to the duplicate (later) invoice';
COMMENT ON COLUMN invoice_duplicates.similarity_score IS 'Numerical score indicating how similar the invoices are (0-1)';
COMMENT ON COLUMN invoice_duplicates.detection_method IS 'Method used to detect the duplicate';
COMMENT ON COLUMN invoice_duplicates.confidence IS 'Confidence level in the duplicate detection (0-1)';
COMMENT ON COLUMN invoice_duplicates.detection_details IS 'JSON object with additional details about the detection';
COMMENT ON COLUMN invoice_duplicates.created_at IS 'When the duplicate was detected';
COMMENT ON COLUMN invoice_duplicates.resolved_at IS 'When the duplicate was resolved';
COMMENT ON COLUMN invoice_duplicates.resolution IS 'How the duplicate was resolved';
COMMENT ON COLUMN invoice_duplicates.resolution_metadata IS 'Additional details about the resolution';
COMMENT ON COLUMN invoice_duplicates.resolved_by IS 'User who resolved the duplicate';