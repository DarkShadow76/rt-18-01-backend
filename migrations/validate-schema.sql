-- Schema Validation Script
-- This script validates that all migrations have been applied correctly
-- Run this after applying migrations to ensure everything is set up properly

-- ============================================================================
-- Check that all required tables exist
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
BEGIN
    -- Check invoices table
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_name = 'invoices' AND table_schema = 'public';
    
    IF table_count = 0 THEN
        RAISE EXCEPTION 'invoices table does not exist';
    ELSE
        RAISE NOTICE '✓ invoices table exists';
    END IF;
    
    -- Check audit trail table
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_name = 'invoice_audit_trail' AND table_schema = 'public';
    
    IF table_count = 0 THEN
        RAISE EXCEPTION 'invoice_audit_trail table does not exist';
    ELSE
        RAISE NOTICE '✓ invoice_audit_trail table exists';
    END IF;
    
    -- Check duplicates table
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_name = 'invoice_duplicates' AND table_schema = 'public';
    
    IF table_count = 0 THEN
        RAISE EXCEPTION 'invoice_duplicates table does not exist';
    ELSE
        RAISE NOTICE '✓ invoice_duplicates table exists';
    END IF;
END $$;

-- ============================================================================
-- Check that all required columns exist in invoices table
-- ============================================================================

DO $$
DECLARE
    column_count INTEGER;
    required_columns TEXT[] := ARRAY[
        'id', 'invoice_number', 'bill_to', 'due_date', 'total_amount',
        'status', 'processing_attempts', 'last_processed_at', 'metadata',
        'duplicate_of', 'content_hash', 'created_at', 'updated_at'
    ];
    col TEXT;
BEGIN
    FOREACH col IN ARRAY required_columns
    LOOP
        SELECT COUNT(*) INTO column_count 
        FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = col AND table_schema = 'public';
        
        IF column_count = 0 THEN
            RAISE EXCEPTION 'Column % does not exist in invoices table', col;
        ELSE
            RAISE NOTICE '✓ Column % exists in invoices table', col;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- Check that required indexes exist
-- ============================================================================

DO $$
DECLARE
    index_count INTEGER;
    required_indexes TEXT[] := ARRAY[
        'idx_invoices_invoice_number',
        'idx_invoices_status',
        'idx_invoices_created_at',
        'idx_audit_trail_invoice_id',
        'idx_duplicates_original_invoice'
    ];
    idx TEXT;
BEGIN
    FOREACH idx IN ARRAY required_indexes
    LOOP
        SELECT COUNT(*) INTO index_count 
        FROM pg_indexes 
        WHERE indexname = idx AND schemaname = 'public';
        
        IF index_count = 0 THEN
            RAISE EXCEPTION 'Index % does not exist', idx;
        ELSE
            RAISE NOTICE '✓ Index % exists', idx;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- Check that constraints exist
-- ============================================================================

DO $$
DECLARE
    constraint_count INTEGER;
BEGIN
    -- Check status constraint
    SELECT COUNT(*) INTO constraint_count 
    FROM information_schema.check_constraints 
    WHERE constraint_name LIKE '%status%' 
    AND constraint_schema = 'public';
    
    IF constraint_count = 0 THEN
        RAISE EXCEPTION 'Status check constraint does not exist';
    ELSE
        RAISE NOTICE '✓ Status check constraint exists';
    END IF;
    
    -- Check foreign key constraints
    SELECT COUNT(*) INTO constraint_count 
    FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name IN ('invoice_audit_trail', 'invoice_duplicates')
    AND constraint_schema = 'public';
    
    IF constraint_count < 2 THEN
        RAISE EXCEPTION 'Not all foreign key constraints exist';
    ELSE
        RAISE NOTICE '✓ Foreign key constraints exist';
    END IF;
END $$;

-- ============================================================================
-- Check that triggers exist
-- ============================================================================

DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO trigger_count 
    FROM information_schema.triggers 
    WHERE trigger_name = 'update_invoices_updated_at' 
    AND event_object_table = 'invoices';
    
    IF trigger_count = 0 THEN
        RAISE EXCEPTION 'update_invoices_updated_at trigger does not exist';
    ELSE
        RAISE NOTICE '✓ update_invoices_updated_at trigger exists';
    END IF;
END $$;

-- ============================================================================
-- Test basic functionality
-- ============================================================================

DO $$
DECLARE
    test_invoice_id UUID;
    test_audit_id UUID;
    test_duplicate_id UUID;
BEGIN
    -- Test invoice insertion
    INSERT INTO invoices (invoice_number, bill_to, due_date, total_amount, status)
    VALUES ('TEST-001', 'Test Company', NOW() + INTERVAL '30 days', 100.00, 'uploaded')
    RETURNING id INTO test_invoice_id;
    
    RAISE NOTICE '✓ Invoice insertion works, ID: %', test_invoice_id;
    
    -- Test audit trail insertion
    INSERT INTO invoice_audit_trail (invoice_id, action, changes)
    VALUES (test_invoice_id, 'created', '{"test": true}')
    RETURNING id INTO test_audit_id;
    
    RAISE NOTICE '✓ Audit trail insertion works, ID: %', test_audit_id;
    
    -- Test duplicate detection insertion
    INSERT INTO invoices (invoice_number, bill_to, due_date, total_amount, status)
    VALUES ('TEST-002', 'Test Company 2', NOW() + INTERVAL '30 days', 200.00, 'uploaded')
    RETURNING id INTO test_duplicate_id;
    
    INSERT INTO invoice_duplicates (original_invoice_id, duplicate_invoice_id, similarity_score, detection_method, confidence)
    VALUES (test_invoice_id, test_duplicate_id, 0.95, 'invoice_number', 0.90);
    
    RAISE NOTICE '✓ Duplicate detection insertion works';
    
    -- Test update trigger
    UPDATE invoices SET total_amount = 150.00 WHERE id = test_invoice_id;
    
    RAISE NOTICE '✓ Update trigger works';
    
    -- Clean up test data
    DELETE FROM invoice_duplicates WHERE original_invoice_id = test_invoice_id OR duplicate_invoice_id = test_duplicate_id;
    DELETE FROM invoice_audit_trail WHERE invoice_id IN (test_invoice_id, test_duplicate_id);
    DELETE FROM invoices WHERE id IN (test_invoice_id, test_duplicate_id);
    
    RAISE NOTICE '✓ Test data cleaned up';
END $$;

-- ============================================================================
-- Summary
-- ============================================================================

SELECT 
    'Schema validation completed successfully' as status,
    NOW() as validated_at;

-- Show table sizes
SELECT 
    schemaname,
    tablename,
    attname as column_name,
    n_distinct,
    correlation
FROM pg_stats 
WHERE schemaname = 'public' 
AND tablename IN ('invoices', 'invoice_audit_trail', 'invoice_duplicates')
ORDER BY tablename, attname;

-- Show index information
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('invoices', 'invoice_audit_trail', 'invoice_duplicates')
ORDER BY tablename, indexname;