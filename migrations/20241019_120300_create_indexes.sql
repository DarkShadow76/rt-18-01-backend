-- Migration: Create performance indexes for invoices table
-- Date: 2024-10-19 12:03:00
-- Description: Creates indexes on the invoices table for optimal query performance

-- Primary indexes for common queries
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_total_amount ON invoices(total_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_updated_at ON invoices(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_last_processed_at ON invoices(last_processed_at DESC) WHERE last_processed_at IS NOT NULL;

-- Indexes for duplicate detection
CREATE INDEX IF NOT EXISTS idx_invoices_content_hash ON invoices(content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_duplicate_of ON invoices(duplicate_of) WHERE duplicate_of IS NOT NULL;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_invoices_status_created ON invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to_status ON invoices(bill_to, status);
CREATE INDEX IF NOT EXISTS idx_invoices_processing_attempts ON invoices(processing_attempts) WHERE processing_attempts > 0;

-- Text search index for bill_to field (using GIN for better text search performance)
CREATE INDEX IF NOT EXISTS idx_invoices_bill_to_gin ON invoices USING gin(to_tsvector('english', bill_to));

-- Partial indexes for specific status queries (more efficient for filtered queries)
CREATE INDEX IF NOT EXISTS idx_invoices_failed_status ON invoices(created_at DESC) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_invoices_processing_status ON invoices(created_at DESC) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_invoices_completed_status ON invoices(created_at DESC) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_invoices_duplicate_status ON invoices(created_at DESC) WHERE status = 'duplicate';

-- Index for date range queries (common for reporting)
CREATE INDEX IF NOT EXISTS idx_invoices_due_date_range ON invoices(due_date, status, total_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_created_date_range ON invoices(created_at, status, total_amount);

-- JSONB indexes for metadata queries (using GIN for JSONB operations)
CREATE INDEX IF NOT EXISTS idx_invoices_metadata_gin ON invoices USING gin(metadata);

-- Specific JSONB path indexes for commonly queried metadata fields
CREATE INDEX IF NOT EXISTS idx_invoices_original_filename ON invoices USING gin((metadata->'originalFileName'));
CREATE INDEX IF NOT EXISTS idx_invoices_processing_time ON invoices((metadata->>'processingTimeMs')::numeric) WHERE metadata ? 'processingTimeMs';
CREATE INDEX IF NOT EXISTS idx_invoices_extraction_confidence ON invoices((metadata->>'extractionConfidence')::numeric) WHERE metadata ? 'extractionConfidence';

-- Unique constraint on invoice_number for business rule enforcement
-- Note: This allows for duplicate invoice numbers across different statuses if needed
-- If strict uniqueness is required, remove the WHERE clause
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_invoice_number 
ON invoices(invoice_number) 
WHERE status NOT IN ('failed', 'duplicate');

-- Index for cleanup operations (finding old records)
CREATE INDEX IF NOT EXISTS idx_invoices_cleanup ON invoices(created_at, status) WHERE status IN ('failed', 'completed');

-- Performance monitoring index (for tracking processing performance)
CREATE INDEX IF NOT EXISTS idx_invoices_performance_monitoring 
ON invoices(last_processed_at, processing_attempts, status) 
WHERE last_processed_at IS NOT NULL;