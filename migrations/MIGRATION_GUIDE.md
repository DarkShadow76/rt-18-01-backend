# Database Migration Guide

This guide explains how to set up and manage database migrations for the invoice processing application.

## Overview

The migration system provides a structured way to manage database schema changes, including:

- Enhanced invoice table structure with status tracking and metadata
- Audit trail system for tracking all invoice operations
- Duplicate detection system for preventing duplicate invoices
- Performance indexes for optimal query performance
- Rollback capabilities for safe schema changes

## Quick Start

### Option 1: Run All Migrations at Once (Recommended for new setups)

1. Open Supabase SQL Editor
2. Copy and paste the contents of `all-migrations.sql`
3. Execute the script
4. Verify with `validate-schema.sql`

### Option 2: Run Individual Migrations

1. Set up environment variables:
   ```bash
   export SUPABASE_URL="your-supabase-url"
   export SUPABASE_SERVICE_KEY="your-service-key"
   ```

2. Run migrations:
   ```bash
   npm run migrate:up      # Apply all pending migrations
   npm run migrate:status  # Check migration status
   npm run migrate:down    # Rollback last migration
   ```

## Migration Files

### Forward Migrations

1. **20241019_120000_create_invoices_table.sql**
   - Creates the main invoices table with enhanced structure
   - Adds status tracking, processing attempts, metadata support
   - Includes automatic timestamp updates via triggers

2. **20241019_120100_create_audit_trail_table.sql**
   - Creates audit trail table for tracking all invoice operations
   - Supports change tracking, user attribution, and correlation IDs
   - Includes indexes for efficient querying

3. **20241019_120200_create_duplicate_detection_table.sql**
   - Creates duplicate detection tracking table
   - Supports multiple detection methods and resolution tracking
   - Includes similarity scoring and confidence levels

4. **20241019_120300_create_indexes.sql**
   - Creates comprehensive performance indexes
   - Includes partial indexes for status-specific queries
   - Adds JSONB indexes for metadata queries

5. **20241019_120400_add_invoice_enhancements.sql**
   - Adds enhanced columns to existing invoices table
   - Safe for existing data (includes IF NOT EXISTS checks)
   - Updates existing records with default values

### Rollback Migrations

Each forward migration has a corresponding `*_rollback.sql` file that reverses the changes.

## Database Schema

### Tables Created

#### invoices
Main table for storing invoice data with enhanced tracking capabilities.

**Key Features:**
- UUID primary keys
- Status tracking (uploaded, processing, completed, failed, duplicate)
- Processing attempt counting
- JSONB metadata storage
- Duplicate detection support via content hashing
- Automatic timestamp management

#### invoice_audit_trail
Comprehensive audit logging for all invoice operations.

**Key Features:**
- Links to invoice records via foreign key
- Action type tracking (created, updated, processed, etc.)
- Before/after change tracking in JSONB
- User and correlation ID support
- Automatic timestamping

#### invoice_duplicates
Tracks detected duplicate invoices and their resolution.

**Key Features:**
- Links original and duplicate invoices
- Multiple detection methods support
- Similarity scoring and confidence levels
- Resolution tracking and metadata
- Constraint enforcement for data integrity

### Indexes Created

The migration creates comprehensive indexes for optimal performance:

- **Primary indexes**: invoice_number, status, dates, amounts
- **Composite indexes**: Common query patterns (status + date, etc.)
- **Partial indexes**: Status-specific queries for better performance
- **JSONB indexes**: Metadata field queries using GIN indexes
- **Text search indexes**: Full-text search on bill_to field
- **Foreign key indexes**: Efficient joins and cascading operations

## Environment Setup

### Required Environment Variables

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key  # Required for migrations
```

### Permissions Required

The service role key must have permissions to:
- Create and drop tables
- Create and drop indexes
- Create and drop functions and triggers
- Insert, update, and delete data
- Manage constraints and foreign keys

## Migration Process

### Pre-Migration Checklist

1. **Backup existing data** (if any)
2. **Verify environment variables** are set correctly
3. **Test in development environment** first
4. **Review migration scripts** for your specific needs
5. **Plan rollback strategy** if needed

### Running Migrations

#### Using npm scripts (requires Node.js setup):

```bash
# Check current status
npm run migrate:status

# Apply all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down
```

#### Using Supabase SQL Editor:

1. Copy contents of `all-migrations.sql`
2. Paste into Supabase SQL Editor
3. Execute the script
4. Run `validate-schema.sql` to verify

### Post-Migration Verification

1. Run the validation script:
   ```sql
   -- Copy and run validate-schema.sql in Supabase SQL Editor
   ```

2. Check that all tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('invoices', 'invoice_audit_trail', 'invoice_duplicates');
   ```

3. Verify indexes are created:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE schemaname = 'public' 
   AND tablename = 'invoices';
   ```

## Rollback Procedures

### Emergency Rollback

If you need to completely rollback all migrations:

1. **BACKUP YOUR DATA FIRST**
2. Run `rollback-all.sql` in Supabase SQL Editor
3. This will destroy all invoice-related tables and data

### Selective Rollback

To rollback specific migrations:

```bash
# Rollback last migration only
npm run migrate:down

# For manual rollback, run specific rollback files in reverse order
```

## Troubleshooting

### Common Issues

1. **Permission Errors**
   - Ensure you're using the service role key, not anon key
   - Verify the key has admin permissions in Supabase

2. **Table Already Exists**
   - Migrations use `IF NOT EXISTS` to prevent conflicts
   - If you get conflicts, check existing schema

3. **Foreign Key Violations**
   - Ensure tables are created in the correct order
   - Check that referenced tables exist before creating foreign keys

4. **Index Creation Failures**
   - Some indexes require specific PostgreSQL extensions
   - Ensure `uuid-ossp` extension is available

### Validation Failures

If validation fails:

1. Check the specific error message
2. Verify all migration files were executed
3. Check for partial failures in the migration log
4. Consider running individual migration files manually

## Production Considerations

### Before Production Deployment

1. **Test thoroughly** in staging environment
2. **Plan maintenance window** for migration execution
3. **Prepare rollback plan** and test it
4. **Monitor performance** after migration
5. **Update application code** to use new schema features

### Performance Impact

- Index creation may take time on large datasets
- Consider creating indexes `CONCURRENTLY` for production
- Monitor query performance after migration
- Adjust indexes based on actual usage patterns

### Data Migration

If you have existing invoice data:

1. **Backup existing data** before migration
2. **Map existing fields** to new schema
3. **Update status values** to match new enum values
4. **Populate metadata fields** with appropriate defaults
5. **Test data integrity** after migration

## Maintenance

### Regular Tasks

1. **Monitor audit trail growth** and implement cleanup if needed
2. **Review duplicate detection** effectiveness
3. **Analyze query performance** and adjust indexes
4. **Update migration documentation** for new changes

### Cleanup Scripts

```sql
-- Clean up old audit entries (older than 1 year)
DELETE FROM invoice_audit_trail 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Clean up resolved duplicates (older than 6 months)
DELETE FROM invoice_duplicates 
WHERE resolved_at IS NOT NULL 
AND resolved_at < NOW() - INTERVAL '6 months';
```

## Support

For issues with migrations:

1. Check this documentation first
2. Review the validation script output
3. Check Supabase logs for detailed error messages
4. Ensure all prerequisites are met
5. Test in development environment first

## Version History

- **v1.0** (2024-10-19): Initial migration system
  - Enhanced invoice table structure
  - Audit trail system
  - Duplicate detection system
  - Performance indexes
  - Rollback capabilities