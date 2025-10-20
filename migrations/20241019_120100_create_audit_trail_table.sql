-- Migration: Create audit trail table
-- Date: 2024-10-19 12:01:00
-- Description: Creates the audit trail table for tracking all changes to invoices

-- Create audit trail table
CREATE TABLE IF NOT EXISTS invoice_audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'created', 'updated', 'deleted', 'processed', 'failed', 
        'reprocessed', 'status_changed', 'duplicate_detected', 'validation_failed'
    )),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    user_id VARCHAR(255), -- Optional user identifier
    changes JSONB NOT NULL DEFAULT '{}', -- What changed (before/after values)
    metadata JSONB NOT NULL DEFAULT '{}', -- Additional context information
    correlation_id VARCHAR(255), -- For tracing related operations
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for efficient querying by invoice_id
CREATE INDEX IF NOT EXISTS idx_audit_trail_invoice_id ON invoice_audit_trail(invoice_id);

-- Create index for querying by timestamp
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON invoice_audit_trail(timestamp DESC);

-- Create index for querying by action
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON invoice_audit_trail(action);

-- Create index for querying by user_id
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON invoice_audit_trail(user_id) WHERE user_id IS NOT NULL;

-- Create index for querying by correlation_id
CREATE INDEX IF NOT EXISTS idx_audit_trail_correlation_id ON invoice_audit_trail(correlation_id) WHERE correlation_id IS NOT NULL;

-- Create composite index for common queries (invoice + timestamp)
CREATE INDEX IF NOT EXISTS idx_audit_trail_invoice_timestamp ON invoice_audit_trail(invoice_id, timestamp DESC);

-- Add comments for documentation
COMMENT ON TABLE invoice_audit_trail IS 'Audit trail for tracking all changes and operations on invoices';
COMMENT ON COLUMN invoice_audit_trail.id IS 'Unique identifier for the audit entry';
COMMENT ON COLUMN invoice_audit_trail.invoice_id IS 'Reference to the invoice being audited';
COMMENT ON COLUMN invoice_audit_trail.action IS 'Type of action performed on the invoice';
COMMENT ON COLUMN invoice_audit_trail.timestamp IS 'When the action occurred';
COMMENT ON COLUMN invoice_audit_trail.user_id IS 'Identifier of the user who performed the action';
COMMENT ON COLUMN invoice_audit_trail.changes IS 'JSON object containing before/after values of changed fields';
COMMENT ON COLUMN invoice_audit_trail.metadata IS 'Additional context information about the action';
COMMENT ON COLUMN invoice_audit_trail.correlation_id IS 'Correlation ID for tracing related operations';
COMMENT ON COLUMN invoice_audit_trail.created_at IS 'Timestamp when audit entry was created';