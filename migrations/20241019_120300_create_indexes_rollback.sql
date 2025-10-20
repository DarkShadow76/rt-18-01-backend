-- Rollback: Drop performance indexes for invoices table
-- Date: 2024-10-19 12:03:00
-- Description: Rollback script for create_indexes migration

-- Drop all indexes created in the forward migration
DROP INDEX IF EXISTS idx_invoices_invoice_number;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoices_due_date;
DROP INDEX IF EXISTS idx_invoices_total_amount;
DROP INDEX IF EXISTS idx_invoices_created_at;
DROP INDEX IF EXISTS idx_invoices_updated_at;
DROP INDEX IF EXISTS idx_invoices_last_processed_at;

-- Drop duplicate detection indexes
DROP INDEX IF EXISTS idx_invoices_content_hash;
DROP INDEX IF EXISTS idx_invoices_duplicate_of;

-- Drop composite indexes
DROP INDEX IF EXISTS idx_invoices_status_created;
DROP INDEX IF EXISTS idx_invoices_status_due_date;
DROP INDEX IF EXISTS idx_invoices_bill_to_status;
DROP INDEX IF EXISTS idx_invoices_processing_attempts;

-- Drop text search index
DROP INDEX IF EXISTS idx_invoices_bill_to_gin;

-- Drop partial indexes
DROP INDEX IF EXISTS idx_invoices_failed_status;
DROP INDEX IF EXISTS idx_invoices_processing_status;
DROP INDEX IF EXISTS idx_invoices_completed_status;
DROP INDEX IF EXISTS idx_invoices_duplicate_status;

-- Drop date range indexes
DROP INDEX IF EXISTS idx_invoices_due_date_range;
DROP INDEX IF EXISTS idx_invoices_created_date_range;

-- Drop JSONB indexes
DROP INDEX IF EXISTS idx_invoices_metadata_gin;
DROP INDEX IF EXISTS idx_invoices_original_filename;
DROP INDEX IF EXISTS idx_invoices_processing_time;
DROP INDEX IF EXISTS idx_invoices_extraction_confidence;

-- Drop unique constraint
DROP INDEX IF EXISTS idx_invoices_unique_invoice_number;

-- Drop utility indexes
DROP INDEX IF EXISTS idx_invoices_cleanup;
DROP INDEX IF EXISTS idx_invoices_performance_monitoring;