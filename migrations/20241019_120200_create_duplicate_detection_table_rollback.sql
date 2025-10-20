-- Rollback: Drop duplicate detection table and related objects
-- Date: 2024-10-19 12:02:00
-- Description: Rollback script for create_duplicate_detection_table migration

-- Drop indexes first (they will be dropped automatically with the table, but explicit for clarity)
DROP INDEX IF EXISTS idx_duplicates_original_invoice;
DROP INDEX IF EXISTS idx_duplicates_duplicate_invoice;
DROP INDEX IF EXISTS idx_duplicates_detection_method;
DROP INDEX IF EXISTS idx_duplicates_similarity_score;
DROP INDEX IF EXISTS idx_duplicates_created_at;
DROP INDEX IF EXISTS idx_duplicates_unresolved;
DROP INDEX IF EXISTS idx_duplicates_resolution;
DROP INDEX IF EXISTS idx_duplicates_original_created;
DROP INDEX IF EXISTS idx_duplicates_method_score;

-- Drop the duplicate detection table
DROP TABLE IF EXISTS invoice_duplicates CASCADE;