import { BaseMigration } from './base-migration';
import { MigrationMetadata, MigrationResult, DatabaseConnection } from './migration.interface';

/**
 * Migration: Create enhanced invoices table
 * 
 * Creates the main invoices table with enhanced structure for:
 * - Status tracking and processing attempts
 * - JSONB metadata storage
 * - Duplicate detection support
 * - Automatic timestamp management
 */
export class CreateInvoicesTableMigration extends BaseMigration {
  constructor(connection: DatabaseConnection) {
    const metadata: MigrationMetadata = {
      version: '001',
      name: 'CreateInvoicesTable',
      description: 'Creates the enhanced invoices table with status tracking and metadata support',
      author: 'System',
      createdAt: new Date('2024-10-19T12:00:00Z')
    };
    
    super(metadata, connection);
  }

  async up(): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Check if table already exists
      if (await this.tableExists('invoices')) {
        this.logger.warn('Invoices table already exists, skipping creation');
        return this.createSuccessResult(Date.now() - startTime, 0);
      }

      const operations = [
        {
          sql: 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
          description: 'Enable UUID extension'
        },
        {
          sql: this.getCreateTableSql(),
          description: 'Create invoices table'
        },
        {
          sql: this.getCreateTriggerFunctionSql(),
          description: 'Create updated_at trigger function'
        },
        {
          sql: this.getCreateTriggerSql(),
          description: 'Create updated_at trigger'
        },
        {
          sql: this.getAddCommentsSql(),
          description: 'Add table and column comments'
        }
      ];

      return await this.executeTransaction(operations);
    } catch (error) {
      return this.createErrorResult(error as Error, Date.now() - startTime);
    }
  }

  async down(): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      const operations = [
        {
          sql: 'DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices',
          description: 'Drop updated_at trigger'
        },
        {
          sql: 'DROP FUNCTION IF EXISTS update_updated_at_column()',
          description: 'Drop trigger function'
        },
        {
          sql: 'DROP TABLE IF EXISTS invoices CASCADE',
          description: 'Drop invoices table'
        }
      ];

      return await this.executeTransaction(operations);
    } catch (error) {
      return this.createErrorResult(error as Error, Date.now() - startTime);
    }
  }

  protected async customValidation(): Promise<boolean> {
    // Check if UUID extension can be created
    try {
      await this.connection.query('SELECT uuid_generate_v4()');
      return true;
    } catch (error) {
      this.logger.error('UUID extension not available', error);
      return false;
    }
  }

  private getCreateTableSql(): string {
    return `
      CREATE TABLE invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_number VARCHAR(255) NOT NULL,
        bill_to TEXT NOT NULL,
        due_date TIMESTAMP WITH TIME ZONE NOT NULL,
        total_amount DECIMAL(12,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'uploaded',
        processing_attempts INTEGER NOT NULL DEFAULT 0,
        last_processed_at TIMESTAMP WITH TIME ZONE,
        metadata JSONB NOT NULL DEFAULT '{}',
        duplicate_of UUID,
        content_hash VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        
        -- Constraints
        CONSTRAINT check_total_amount_positive CHECK (total_amount >= 0),
        CONSTRAINT check_processing_attempts_non_negative CHECK (processing_attempts >= 0),
        CONSTRAINT check_invoice_status CHECK (status IN (
          'uploaded', 'processing', 'completed', 'failed', 'duplicate'
        )),
        CONSTRAINT fk_invoices_duplicate_of FOREIGN KEY (duplicate_of) 
          REFERENCES invoices(id) ON DELETE SET NULL
      )
    `;
  }

  private getCreateTriggerFunctionSql(): string {
    return `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
  }

  private getCreateTriggerSql(): string {
    return `
      CREATE TRIGGER update_invoices_updated_at
        BEFORE UPDATE ON invoices
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `;
  }

  private getAddCommentsSql(): string {
    return `
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
      COMMENT ON COLUMN invoices.updated_at IS 'Timestamp when record was last updated'
    `;
  }
}