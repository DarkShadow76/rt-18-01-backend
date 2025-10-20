-- Rollback: Remove enhancements from invoices table
-- Date: 2024-10-19 12:04:00
-- Description: Rollback script for add_invoice_enhancements migration

-- Drop trigger first
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop constraints
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS check_invoice_status;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS check_processing_attempts;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS check_total_amount_positive;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_duplicate_of;

-- Drop columns added by the enhancement migration
-- Note: Be very careful with this in production - you'll lose data!
-- Consider backing up data before running this rollback

ALTER TABLE invoices DROP COLUMN IF EXISTS status;
ALTER TABLE invoices DROP COLUMN IF EXISTS processing_attempts;
ALTER TABLE invoices DROP COLUMN IF EXISTS last_processed_at;
ALTER TABLE invoices DROP COLUMN IF EXISTS metadata;
ALTER TABLE invoices DROP COLUMN IF EXISTS duplicate_of;
ALTER TABLE invoices DROP COLUMN IF EXISTS content_hash;
ALTER TABLE invoices DROP COLUMN IF EXISTS created_at;
ALTER TABLE invoices DROP COLUMN IF EXISTS updated_at;

-- Note: This rollback assumes these columns were added by this migration
-- If any of these columns existed before this migration, they should not be dropped
-- In production, you should modify this script to only drop columns that were actually added