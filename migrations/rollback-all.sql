-- Complete Database Rollback Script
-- This file contains all rollback operations in reverse order
-- WARNING: This will destroy all data in the invoice-related tables!
-- Use with extreme caution in production environments

-- ============================================================================
-- Rollback Migration 4: Drop all performance indexes
-- ============================================================================

-- Drop invoices table indexes
DROP INDEX IF EXISTS idx_invoices_invoice_number;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoices_due_date;
DROP INDEX IF EXISTS idx_invoices_total_amount;
DROP INDEX IF EXISTS idx_invoices_created_at;
DROP INDEX IF EXISTS idx_invoices_updated_at;
DROP INDEX IF EXISTS idx_invoices_last_processed_at;
DROP INDEX IF EXISTS idx_invoices_content_hash;
DROP INDEX IF EXISTS idx_invoices_duplicate_of;
DROP INDEX IF EXISTS idx_invoices_status_created;
DROP INDEX IF EXISTS idx_invoices_status_due_date;
DROP INDEX IF EXISTS idx_invoices_bill_to_status;
DROP INDEX IF EXISTS idx_invoices_processing_attempts;
DROP INDEX IF EXISTS idx_invoices_bill_to_gin;
DROP INDEX IF EXISTS idx_invoices_failed_status;
DROP INDEX IF EXISTS idx_invoices_processing_status;
DROP INDEX IF EXISTS idx_invoices_completed_status;
DROP INDEX IF EXISTS idx_invoices_duplicate_status;
DROP INDEX IF EXISTS idx_invoices_due_date_range;
DROP INDEX IF EXISTS idx_invoices_created_date_range;
DROP INDEX IF EXISTS idx_invoices_metadata_gin;
DROP INDEX IF EXISTS idx_invoices_original_filename;
DROP INDEX IF EXISTS idx_invoices_processing_time;
DROP INDEX IF EXISTS idx_invoices_extraction_confidence;
DROP INDEX IF EXISTS idx_invoices_unique_invoice_number;
DROP INDEX IF EXISTS idx_invoices_cleanup;
DROP INDEX IF EXISTS idx_invoices_performance_monitoring;

-- Drop audit trail indexes
DROP INDEX IF EXISTS idx_audit_trail_invoice_id;
DROP INDEX IF EXISTS idx_audit_trail_timestamp;
DROP INDEX IF EXISTS idx_audit_trail_action;
DROP INDEX IF EXISTS idx_audit_trail_user_id;
DROP INDEX IF EXISTS idx_audit_trail_correlation_id;
DROP INDEX IF EXISTS idx_audit_trail_invoice_timestamp;

-- Drop duplicate detection indexes
DROP INDEX IF EXISTS idx_duplicates_original_invoice;
DROP INDEX IF EXISTS idx_duplicates_duplicate_invoice;
DROP INDEX IF EXISTS idx_duplicates_detection_method;
DROP INDEX IF EXISTS idx_duplicates_similarity_score;
DROP INDEX IF EXISTS idx_duplicates_created_at;
DROP INDEX IF EXISTS idx_duplicates_unresolved;
DROP INDEX IF EXISTS idx_duplicates_resolution;
DROP INDEX IF EXISTS idx_duplicates_original_created;
DROP INDEX IF EXISTS idx_duplicates_method_score;

-- ============================================================================
-- Rollback Migration 3: Drop duplicate detection table
-- ============================================================================

DROP TABLE IF EXISTS invoice_duplicates CASCADE;

-- ============================================================================
-- Rollback Migration 2: Drop audit trail table
-- ============================================================================

DROP TABLE IF EXISTS invoice_audit_trail CASCADE;

-- ============================================================================
-- Rollback Migration 1: Drop invoices table and related objects
-- ============================================================================

-- Drop trigger first
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop table (this will also drop any dependent objects)
DROP TABLE IF EXISTS invoices CASCADE;

-- ============================================================================
-- Drop migration tracking table
-- ============================================================================

DROP TABLE IF EXISTS schema_migrations CASCADE;

-- ============================================================================
-- Note about UUID extension
-- ============================================================================

-- We don't drop the uuid-ossp extension as it might be used by other tables
-- If you need to drop it, uncomment the following line:
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- ============================================================================
-- Verification (uncomment to verify rollback was successful)
-- ============================================================================

-- These should return errors if rollback was successful
-- SELECT count(*) FROM invoices;
-- SELECT count(*) FROM invoice_audit_trail;
-- SELECT count(*) FROM invoice_duplicates;