import { BaseMigration } from './base-migration';
import { MigrationMetadata, MigrationResult, DatabaseConnection } from './migration.interface';

/**
 * Migration: Create audit trail table
 * 
 * Creates the audit trail table for tracking all changes and operations on invoices:
 * - Complete change tracking with before/after values
 * - User attribution and correlation ID support
 * - Efficient indexing for audit queries
 * - Automatic cleanup capabilities
 */
export class CreateAuditTrailTableMigration extends BaseMigration {
  constructor(connection: DatabaseConnection) {
    const metadata: MigrationMetadata = {
      version: '002',
      name: 'CreateAuditTrailTable',
      description: 'Creates the audit trail table for tracking invoice operations and changes',
      author: 'System',
      createdAt: new Date('2024-10-19T12:01:00Z'),
      dependencies: ['001'] // Depends on invoices table
    };
    
    super(metadata, connection);
  }

  async up(): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Check if table already exists
      if (await this.tableExists('invoice_audit_trail')) {
        this.logger.warn('Audit trail table already exists, skipping creation');
        return this.createSuccessResult(Date.now() - startTime, 0);
      }

      const operations = [
        {
          sql: this.getCreateTableSql(),
          description: 'Create invoice_audit_trail table'
        },
        {
          sql: this.getCreateIndexesSql(),
          description: 'Create audit trail indexes'
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
          sql: this.getDropIndexesSql(),
          description: 'Drop audit trail indexes'
        },
        {
          sql: 'DROP TABLE IF EXISTS invoice_audit_trail CASCADE',
          description: 'Drop audit trail table'
        }
      ];

      return await this.executeTransaction(operations);
    } catch (error) {
      return this.createErrorResult(error as Error, Date.now() - startTime);
    }
  }

  protected async customValidation(): Promise<boolean> {
    // Ensure invoices table exists (dependency check)
    const invoicesExists = await this.tableExists('invoices');
    if (!invoicesExists) {
      this.logger.error('Invoices table does not exist - required dependency');
      return false;
    }

    return true;
  }

  private getCreateTableSql(): string {
    return `
      CREATE TABLE invoice_audit_trail (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        invoice_id UUID NOT NULL,
        action VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        user_id VARCHAR(255),
        changes JSONB NOT NULL DEFAULT '{}',
        metadata JSONB NOT NULL DEFAULT '{}',
        correlation_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        
        -- Constraints
        CONSTRAINT check_audit_action CHECK (action IN (
          'created', 'updated', 'deleted', 'processed', 'failed',
          'reprocessed', 'status_changed', 'duplicate_detected', 'validation_failed'
        )),
        CONSTRAINT fk_audit_trail_invoice FOREIGN KEY (invoice_id) 
          REFERENCES invoices(id) ON DELETE CASCADE
      )
    `;
  }

  private getCreateIndexesSql(): string {
    return `
      -- Primary indexes for efficient querying
      CREATE INDEX idx_audit_trail_invoice_id ON invoice_audit_trail(invoice_id);
      CREATE INDEX idx_audit_trail_timestamp ON invoice_audit_trail(timestamp DESC);
      CREATE INDEX idx_audit_trail_action ON invoice_audit_trail(action);
      
      -- Conditional indexes for optional fields
      CREATE INDEX idx_audit_trail_user_id ON invoice_audit_trail(user_id) 
        WHERE user_id IS NOT NULL;
      CREATE INDEX idx_audit_trail_correlation_id ON invoice_audit_trail(correlation_id) 
        WHERE correlation_id IS NOT NULL;
      
      -- Composite indexes for common query patterns
      CREATE INDEX idx_audit_trail_invoice_timestamp ON invoice_audit_trail(invoice_id, timestamp DESC);
      CREATE INDEX idx_audit_trail_action_timestamp ON invoice_audit_trail(action, timestamp DESC);
      
      -- JSONB indexes for metadata queries
      CREATE INDEX idx_audit_trail_changes_gin ON invoice_audit_trail USING gin(changes);
      CREATE INDEX idx_audit_trail_metadata_gin ON invoice_audit_trail USING gin(metadata)
    `;
  }

  private getDropIndexesSql(): string {
    return `
      DROP INDEX IF EXISTS idx_audit_trail_invoice_id;
      DROP INDEX IF EXISTS idx_audit_trail_timestamp;
      DROP INDEX IF EXISTS idx_audit_trail_action;
      DROP INDEX IF EXISTS idx_audit_trail_user_id;
      DROP INDEX IF EXISTS idx_audit_trail_correlation_id;
      DROP INDEX IF EXISTS idx_audit_trail_invoice_timestamp;
      DROP INDEX IF EXISTS idx_audit_trail_action_timestamp;
      DROP INDEX IF EXISTS idx_audit_trail_changes_gin;
      DROP INDEX IF EXISTS idx_audit_trail_metadata_gin
    `;
  }

  private getAddCommentsSql(): string {
    return `
      COMMENT ON TABLE invoice_audit_trail IS 'Audit trail for tracking all changes and operations on invoices';
      COMMENT ON COLUMN invoice_audit_trail.id IS 'Unique identifier for the audit entry';
      COMMENT ON COLUMN invoice_audit_trail.invoice_id IS 'Reference to the invoice being audited';
      COMMENT ON COLUMN invoice_audit_trail.action IS 'Type of action performed on the invoice';
      COMMENT ON COLUMN invoice_audit_trail.timestamp IS 'When the action occurred';
      COMMENT ON COLUMN invoice_audit_trail.user_id IS 'Identifier of the user who performed the action';
      COMMENT ON COLUMN invoice_audit_trail.changes IS 'JSON object containing before/after values of changed fields';
      COMMENT ON COLUMN invoice_audit_trail.metadata IS 'Additional context information about the action';
      COMMENT ON COLUMN invoice_audit_trail.correlation_id IS 'Correlation ID for tracing related operations';
      COMMENT ON COLUMN invoice_audit_trail.created_at IS 'Timestamp when audit entry was created'
    `;
  }
}