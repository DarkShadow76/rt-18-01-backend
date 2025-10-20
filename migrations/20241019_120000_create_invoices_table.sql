-- Migration: Create enhanced invoices table
-- Date: 2024-10-19 12:00:00
-- Description: Creates the main invoices table with enhanced structure for status tracking, metadata, and audit support

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create invoices table with enhanced structure
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(255) NOT NULL,
    bill_to TEXT NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed', 'duplicate')),
    processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    last_processed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}',
    duplicate_of UUID REFERENCES invoices(id) ON DELETE SET NULL,
    content_hash VARCHAR(64), -- SHA-256 hash for duplicate detection
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at on row updates
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE invoices IS 'Main table for storing invoice data with enhanced tracking and metadata';
COMMENT ON COLUMN invoices.id IS 'Unique identifier for the invoice';
COMMENT ON COLUMN invoices.invoice_number IS 'Business invoice number from the document';
COMMENT ON COLUMN invoices.bill_to IS 'Billing recipient information';
COMMENT ON COLUMN invoices.due_date IS 'Invoice due date';
COMMENT ON COLUMN invoices.total_amount IS 'Total invoice amount in decimal format';
COMMENT ON COLUMN invoices.status IS 'Current processing status of the invoice';
COMMENT ON COLUMN invoices.processing_attempts IS 'Number of times processing has been attempted';
COMMENT ON COLUMN invoices.last_processed_at IS 'Timestamp of last processing attempt';
COMMENT ON COLUMN invoices.metadata IS 'JSON metadata including file info, processing details, etc.';
COMMENT ON COLUMN invoices.duplicate_of IS 'Reference to original invoice if this is a duplicate';
COMMENT ON COLUMN invoices.content_hash IS 'Content hash for duplicate detection';
COMMENT ON COLUMN invoices.created_at IS 'Timestamp when record was created';
COMMENT ON COLUMN invoices.updated_at IS 'Timestamp when record was last updated';