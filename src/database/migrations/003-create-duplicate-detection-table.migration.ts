import { BaseMigration } from './base-migration';
import { MigrationMetadata, MigrationResult, DatabaseConnection } from './migration.interface';

/**
 * Migration: Create duplicate detection table
 * 
 * Creates the duplicate detection table for tracking and managing invoice duplicates:
 * - Links original and duplicate invoices
 * - Multiple detection methods support
 * - Similarity scoring and confidence levels
 * - Resolution tracking and metadata
 */
export class CreateDuplicateDetectionTableMigration extends BaseMigration {
  constructor(connection: DatabaseConnection) {
    const metadata: MigrationMetadata = {
      version: '003',
      name: 'CreateDuplicateDetectionTable',
      description: 'Creates the duplicate detection table for tracking invoice duplicates',
      author: 'System',
      createdAt: new Date('2024-10-19T12:02:00Z'),
      dependencies: ['001'] // Depends on invoices table
    };
    
    super(metadata, connection);
  }

  async up(): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      // Check if table already exists
      if (await this.tableExists('invoice_duplicates')) {
        this.logger.warn('Duplicate detection table already exists, skipping creation');
        return this.createSuccessResult(Date.now() - startTime, 0);
      }

      const operations = [
        {
          sql: this.getCreateTableSql(),
          description: 'Create invoice_duplicates table'
        },
        {
          sql: this.getCreateIndexesSql(),
          description: 'Create duplicate detection indexes'
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
          description: 'Drop duplicate detection indexes'
        },
        {
          sql: 'DROP TABLE IF EXISTS invoice_duplicates CASCADE',
          description: 'Drop duplicate detection table'
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
      CREATE TABLE invoice_duplicates (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        original_invoice_id UUID NOT NULL,
        duplicate_invoice_id UUID NOT NULL,
        similarity_score DECIMAL(5,4) NOT NULL,
        detection_method VARCHAR(50) NOT NULL,
        confidence DECIMAL(5,4) NOT NULL,
        detection_details JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMP WITH TIME ZONE,
        resolution VARCHAR(50),
        resolution_metadata JSONB DEFAULT '{}',
        resolved_by VARCHAR(255),
        
        -- Constraints
        CONSTRAINT check_similarity_score CHECK (similarity_score >= 0 AND similarity_score <= 1),
        CONSTRAINT check_confidence CHECK (confidence >= 0 AND confidence <= 1),
        CONSTRAINT check_detection_method CHECK (detection_method IN (
          'invoice_number', 'content_hash', 'fuzzy_match', 'combined'
        )),
        CONSTRAINT check_resolution CHECK (resolution IN (
          'keep_original', 'keep_duplicate', 'merge', 'manual_review'
        )),
        CONSTRAINT unique_duplicate_pair UNIQUE (original_invoice_id, duplicate_invoice_id),
        CONSTRAINT different_invoices CHECK (original_invoice_id != duplicate_invoice_id),
        CONSTRAINT fk_duplicates_original FOREIGN KEY (original_invoice_id) 
          REFERENCES invoices(id) ON DELETE CASCADE,
        CONSTRAINT fk_duplicates_duplicate FOREIGN KEY (duplicate_invoice_id) 
          REFERENCES invoices(id) ON DELETE CASCADE
      )
    `;
  }

  private getCreateIndexesSql(): string {
    return `
      -- Primary indexes for efficient querying
      CREATE INDEX idx_duplicates_original_invoice ON invoice_duplicates(original_invoice_id);
      CREATE INDEX idx_duplicates_duplicate_invoice ON invoice_duplicates(duplicate_invoice_id);
      CREATE INDEX idx_duplicates_detection_method ON invoice_duplicates(detection_method);
      CREATE INDEX idx_duplicates_similarity_score ON invoice_duplicates(similarity_score DESC);
      CREATE INDEX idx_duplicates_created_at ON invoice_duplicates(created_at DESC);
      
      -- Conditional indexes for resolution tracking
      CREATE INDEX idx_duplicates_unresolved ON invoice_duplicates(created_at) 
        WHERE resolved_at IS NULL;
      CREATE INDEX idx_duplicates_resolution ON invoice_duplicates(resolution) 
        WHERE resolution IS NOT NULL;
      
      -- Composite indexes for common query patterns
      CREATE INDEX idx_duplicates_original_created ON invoice_duplicates(original_invoice_id, created_at DESC);
      CREATE INDEX idx_duplicates_method_score ON invoice_duplicates(detection_method, similarity_score DESC);
      
      -- JSONB indexes for metadata queries
      CREATE INDEX idx_duplicates_detection_details_gin ON invoice_duplicates USING gin(detection_details);
      CREATE INDEX idx_duplicates_resolution_metadata_gin ON invoice_duplicates USING gin(resolution_metadata)
    `;
  }

  private getDropIndexesSql(): string {
    return `
      DROP INDEX IF EXISTS idx_duplicates_original_invoice;
      DROP INDEX IF EXISTS idx_duplicates_duplicate_invoice;
      DROP INDEX IF EXISTS idx_duplicates_detection_method;
      DROP INDEX IF EXISTS idx_duplicates_similarity_score;
      DROP INDEX IF EXISTS idx_duplicates_created_at;
      DROP INDEX IF EXISTS idx_duplicates_unresolved;
      DROP INDEX IF EXISTS idx_duplicates_resolution;
      DROP INDEX IF EXISTS idx_duplicates_original_created;
      DROP INDEX IF EXISTS idx_duplicates_method_score;
      DROP INDEX IF EXISTS idx_duplicates_detection_details_gin;
      DROP INDEX IF EXISTS idx_duplicates_resolution_metadata_gin
    `;
  }

  private getAddCommentsSql(): string {
    return `
      COMMENT ON TABLE invoice_duplicates IS 'Table for tracking detected duplicate invoices and their resolution';
      COMMENT ON COLUMN invoice_duplicates.id IS 'Unique identifier for the duplicate detection record';
      COMMENT ON COLUMN invoice_duplicates.original_invoice_id IS 'Reference to the original (first) invoice';
      COMMENT ON COLUMN invoice_duplicates.duplicate_invoice_id IS 'Reference to the duplicate (later) invoice';
      COMMENT ON COLUMN invoice_duplicates.similarity_score IS 'Numerical score indicating how similar the invoices are (0-1)';
      COMMENT ON COLUMN invoice_duplicates.detection_method IS 'Method used to detect the duplicate';
      COMMENT ON COLUMN invoice_duplicates.confidence IS 'Confidence level in the duplicate detection (0-1)';
      COMMENT ON COLUMN invoice_duplicates.detection_details IS 'JSON object with additional details about the detection';
      COMMENT ON COLUMN invoice_duplicates.created_at IS 'When the duplicate was detected';
      COMMENT ON COLUMN invoice_duplicates.resolved_at IS 'When the duplicate was resolved';
      COMMENT ON COLUMN invoice_duplicates.resolution IS 'How the duplicate was resolved';
      COMMENT ON COLUMN invoice_duplicates.resolution_metadata IS 'Additional details about the resolution';
      COMMENT ON COLUMN invoice_duplicates.resolved_by IS 'User who resolved the duplicate'
    `;
  }
}