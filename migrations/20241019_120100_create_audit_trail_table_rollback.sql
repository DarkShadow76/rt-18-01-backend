-- Rollback: Drop audit trail table and related objects
-- Date: 2024-10-19 12:01:00
-- Description: Rollback script for create_audit_trail_table migration

-- Drop indexes first (they will be dropped automatically with the table, but explicit for clarity)
DROP INDEX IF EXISTS idx_audit_trail_invoice_id;
DROP INDEX IF EXISTS idx_audit_trail_timestamp;
DROP INDEX IF EXISTS idx_audit_trail_action;
DROP INDEX IF EXISTS idx_audit_trail_user_id;
DROP INDEX IF EXISTS idx_audit_trail_correlation_id;
DROP INDEX IF EXISTS idx_audit_trail_invoice_timestamp;

-- Drop the audit trail table
DROP TABLE IF EXISTS invoice_audit_trail CASCADE;