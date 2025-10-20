-- Rollback: Drop invoices table and related objects
-- Date: 2024-10-19 12:00:00
-- Description: Rollback script for create_invoices_table migration

-- Drop trigger first
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;

-- Drop function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop table (this will also drop any dependent objects)
DROP TABLE IF EXISTS invoices CASCADE;

-- Note: We don't drop the uuid-ossp extension as it might be used by other tables