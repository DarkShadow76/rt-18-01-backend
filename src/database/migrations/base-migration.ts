import { Logger } from '@nestjs/common';
import {
  IMigration,
  MigrationMetadata,
  MigrationResult,
  DatabaseConnection,
  MigrationError,
} from './migration.interface';

/**
 * Abstract base class for database migrations
 * Provides common functionality and enforces structure
 */
export abstract class BaseMigration implements IMigration {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    public readonly metadata: MigrationMetadata,
    protected readonly connection: DatabaseConnection,
  ) {}

  abstract up(): Promise<MigrationResult>;
  abstract down(): Promise<MigrationResult>;

  /**
   * Validates that the migration can be safely applied
   */
  async validate(): Promise<boolean> {
    try {
      // Check if dependencies are satisfied
      if (this.metadata.dependencies) {
        const appliedMigrations = await this.getAppliedMigrationVersions();
        const missingDeps = this.metadata.dependencies.filter(
          (dep) => !appliedMigrations.includes(dep),
        );

        if (missingDeps.length > 0) {
          this.logger.error(`Missing dependencies: ${missingDeps.join(', ')}`);
          return false;
        }
      }

      // Perform custom validation
      return await this.customValidation();
    } catch (error) {
      this.logger.error('Migration validation failed', error);
      return false;
    }
  }

  /**
   * Override this method for custom validation logic
   */
  protected async customValidation(): Promise<boolean> {
    return true;
  }

  /**
   * Executes SQL with proper error handling and logging
   */
  protected async executeSql(
    sql: string,
    description: string,
    params?: any[],
  ): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.log(`Executing: ${description}`);
      const result = await this.connection.query(sql, params);
      const executionTime = Date.now() - startTime;

      this.logger.log(`Completed: ${description} (${executionTime}ms)`);
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.logger.error(`Failed: ${description} (${executionTime}ms)`, error);
      throw new MigrationError(
        `SQL execution failed: ${description}`,
        this.metadata.version,
        error as Error,
      );
    }
  }

  /**
   * Executes multiple SQL statements in a transaction
   */
  protected async executeTransaction(
    operations: Array<{ sql: string; description: string; params?: any[] }>,
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      await this.connection.transaction(async (trx) => {
        for (const op of operations) {
          await this.executeSqlInTransaction(
            trx,
            op.sql,
            op.description,
            op.params,
          );
        }
      });

      const executionTimeMs = Date.now() - startTime;

      return {
        success: true,
        version: this.metadata.version,
        executionTimeMs,
        affectedRows: operations.length,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      return {
        success: false,
        version: this.metadata.version,
        executionTimeMs,
        error: error as Error,
      };
    }
  }

  private async executeSqlInTransaction(
    trx: DatabaseConnection,
    sql: string,
    description: string,
    params?: any[],
  ): Promise<any> {
    this.logger.log(`Executing in transaction: ${description}`);
    return await trx.query(sql, params);
  }

  /**
   * Checks if a table exists
   */
  protected async tableExists(
    tableName: string,
    schemaName = 'public',
  ): Promise<boolean> {
    const sql = `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      ) as exists
    `;

    const result = await this.connection.query(sql, [schemaName, tableName]);
    return result[0]?.exists || false;
  }

  /**
   * Checks if a column exists
   */
  protected async columnExists(
    tableName: string,
    columnName: string,
    schemaName = 'public',
  ): Promise<boolean> {
    const sql = `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
      ) as exists
    `;

    const result = await this.connection.query(sql, [
      schemaName,
      tableName,
      columnName,
    ]);
    return result[0]?.exists || false;
  }

  /**
   * Checks if an index exists
   */
  protected async indexExists(
    indexName: string,
    schemaName = 'public',
  ): Promise<boolean> {
    const sql = `
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = $1 AND indexname = $2
      ) as exists
    `;

    const result = await this.connection.query(sql, [schemaName, indexName]);
    return result[0]?.exists || false;
  }

  /**
   * Gets list of applied migration versions
   */
  private async getAppliedMigrationVersions(): Promise<string[]> {
    try {
      const sql = 'SELECT version FROM schema_migrations ORDER BY applied_at';
      const result = await this.connection.query(sql);
      return result.map((row: any) => row.version);
    } catch (error) {
      // If migrations table doesn't exist yet, return empty array
      return [];
    }
  }

  /**
   * Creates a standardized error result
   */
  protected createErrorResult(
    error: Error,
    executionTimeMs: number,
  ): MigrationResult {
    return {
      success: false,
      version: this.metadata.version,
      executionTimeMs,
      error,
    };
  }

  /**
   * Creates a standardized success result
   */
  protected createSuccessResult(
    executionTimeMs: number,
    affectedRows?: number,
  ): MigrationResult {
    return {
      success: true,
      version: this.metadata.version,
      executionTimeMs,
      affectedRows,
    };
  }
}
