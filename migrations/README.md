# Database Migrations

This directory contains database migration scripts for the invoice processing application.

## Migration Files

Migration files are named with the format: `YYYYMMDD_HHMMSS_description.sql`

### Current Migrations

1. `20241019_120000_create_invoices_table.sql` - Creates the enhanced invoices table
2. `20241019_120100_create_audit_trail_table.sql` - Creates the audit trail table
3. `20241019_120200_create_duplicate_detection_table.sql` - Creates the duplicate detection table
4. `20241019_120300_create_indexes.sql` - Creates performance indexes
5. `20241019_120400_add_invoice_enhancements.sql` - Adds enhanced columns to existing invoices table

### Rollback Files

Each migration has a corresponding rollback file with the suffix `_rollback.sql`

## Running Migrations

Migrations should be run in order. Each migration file contains both the forward migration and checks for existing structures to avoid conflicts.

## Supabase Setup

These migrations are designed for Supabase (PostgreSQL). Run them through the Supabase SQL editor or using the Supabase CLI.

### Prerequisites

- Supabase project setup
- Database connection configured
- Proper permissions for DDL operations

### Migration Order

1. Run forward migrations in chronological order
2. Test the application functionality
3. If rollback is needed, run rollback scripts in reverse order

## Notes

- All migrations include IF NOT EXISTS checks to prevent conflicts
- Indexes are created with IF NOT EXISTS where supported
- Foreign key constraints are properly defined
- All timestamps use UTC timezone
- JSONB is used for metadata storage for better performance