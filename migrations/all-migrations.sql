-- Complete Database Migration Script
-- This file contains all migrations in order for easy execution in Supabase SQL editor
-- Run this script to set up the complete database schema

-- ============================================================================
-- Migration 1: Create enhanced invoices table
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create invoices table with enhanced structure
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(255) NOT NULL,
    bill_to TEXT NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed', 'duplicate')),
    processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    last_processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}',
    duplicate_of UUID REFERENCES invoices(id) ON DELETE SET NULL,
    content_hash VARCHAR(64), -- SHA-256 hash for duplicate detection
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on row updates
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration 2: Create audit trail table
-- ============================================================================

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

-- ============================================================================
-- Migration 3: Create duplicate detection table
-- ============================================================================

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

-- ============================================================================
-- Migration 4: Create all performance indexes
-- ============================================================================

-- Invoices table indexes
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_total_amount ON invoices(total_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_updated_at ON invoices(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_last_processed_at ON invoices(last_processed_at DESC) WHERE last_processed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_content_hash ON invoices(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_duplicate_of ON invoices(duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to_status ON invoices(bill_to, status);
CREATE INDEX IF NOT EXISTS idx_invoices_processing_attempts ON invoices(processing_attempts) WHERE processing_attempts > 0;
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to_gin ON invoices USING gin(to_tsvector('english', bill_to));
CREATE INDEX IF NOT EXISTS idx_invoices_failed_status ON invoices(created_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_invoices_processing_status ON invoices(created_at DESC) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_invoices_completed_status ON invoices(created_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_invoices_duplicate_status ON invoices(created_at DESC) WHERE status = 'duplicate';
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_range ON invoices(due_date, status, total_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_created_date_range ON invoices(created_at, status, total_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_metadata_gin ON invoices USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_invoices_original_filename ON invoices USING gin((metadata->'originalFileName'));
CREATE INDEX IF NOT EXISTS idx_invoices_processing_time ON invoices((metadata->>'processingTimeMs')::numeric) WHERE metadata ? 'processingTimeMs';
CREATE INDEX IF NOT EXISTS idx_invoices_extraction_confidence ON invoices((metadata->>'extractionConfidence')::numeric) WHERE metadata ? 'extractionConfidence';
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_invoice_number ON invoices(invoice_number) WHERE status NOT IN ('failed', 'duplicate');
CREATE INDEX IF NOT EXISTS idx_invoices_cleanup ON invoices(created_at, status) WHERE status IN ('failed', 'completed');
CREATE INDEX IF NOT EXISTS idx_invoices_performance_monitoring ON invoices(last_processed_at, processing_attempts, status) WHERE last_processed_at IS NOT NULL;

-- Audit trail indexes
CREATE INDEX IF NOT EXISTS idx_audit_trail_invoice_id ON invoice_audit_trail(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON invoice_audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON invoice_audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON invoice_audit_trail(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_trail_correlation_id ON invoice_audit_trail(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_trail_invoice_timestamp ON invoice_audit_trail(invoice_id, timestamp DESC);

-- Duplicate detection indexes
CREATE INDEX IF NOT EXISTS idx_duplicates_original_invoice ON invoice_duplicates(original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_duplicate_invoice ON invoice_duplicates(duplicate_invoice_id);
CREATE INDEX IF NOT EXISTS idx_duplicates_detection_method ON invoice_duplicates(detection_method);
CREATE INDEX IF NOT EXISTS idx_duplicates_similarity_score ON invoice_duplicates(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_created_at ON invoice_duplicates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_unresolved ON invoice_duplicates(created_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_duplicates_resolution ON invoice_duplicates(resolution) WHERE resolution IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_duplicates_original_created ON invoice_duplicates(original_invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_method_score ON invoice_duplicates(detection_method, similarity_score DESC);

-- ============================================================================
-- Add table comments for documentation
-- ============================================================================

COMMENT ON TABLE invoices IS 'Main table for storing invoice data with enhanced tracking and metadata';
COMMENT ON TABLE invoice_audit_trail IS 'Audit trail for tracking all changes and operations on invoices';
COMMENT ON TABLE invoice_duplicates IS 'Table for tracking detected duplicate invoices and their resolution';

-- ============================================================================
-- Migration tracking table (optional - for tracking which migrations have been applied)
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    checksum VARCHAR(64)
);

-- Record that all migrations have been applied
INSERT INTO schema_migrations (filename) VALUES 
    ('20241019_120000_create_invoices_table.sql'),
    ('20241019_120100_create_audit_trail_table.sql'),
    ('20241019_120200_create_duplicate_detection_table.sql'),
    ('20241019_120300_create_indexes.sql')
ON CONFLICT (filename) DO NOTHING;

-- ============================================================================
-- Verification queries (run these to verify the migration was successful)
-- ============================================================================

-- Uncomment these to verify the migration
-- SELECT 'Invoices table created' as status, count(*) as row_count FROM invoices;
-- SELECT 'Audit trail table created' as status, count(*) as row_count FROM invoice_audit_trail;
-- SELECT 'Duplicates table created' as status, count(*) as row_count FROM invoice_duplicates;
-- SELECT 'Migrations tracked' as status, count(*) as migration_count FROM schema_migrations;

-- Show all indexes on invoices table
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'invoices' ORDER BY indexname;