import { Injectable, Logger } from '@nestjs/common';
import { 
  IMigrationRunner, 
  IMigration, 
  MigrationState, 
  MigrationResult, 
  MigrationConfig,
  MigrationError,
  DatabaseConnection 
} from './migration.interface';
import { createHash } from 'crypto';

/**
 * Service for managing database migrations
 * 
 * Provides a robust migration system with:
 * - Transaction safety
 * - Checksum validation
 * - Dependency management
 * - Rollback capabilities
 * - Comprehensive logging
 */
@Injectable()
export class MigrationRunnerService implements IMigrationRunner {
  private readonly logger = new Logger(MigrationRunnerService.name);
  
  constructor(
    private readonly connection: DatabaseConnection,
    private readonly config: MigrationConfig
  ) {}

  /**
   * Initialize the migration system
   */
  async initialize(): Promise<void> {
    await this.ensureMigrationTable();
    this.logger.log('Migration system initialized');
  }

  /**
   * Get all applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationState[]> {
    try {
      const sql = `
        SELECT version, applied_at, checksum, execution_time_ms
        FROM ${this.config.schemaName}.${this.config.tableName}
        ORDER BY applied_at ASC
      `;
      
      const rows = await this.connection.query(sql);
      
      return rows.map((row: any) => ({
        version: row.version,
        appliedAt: new Date(row.applied_at),
        checksum: row.checksum,
        executionTimeMs: row.execution_time_ms
      }));
    } catch (error) {
      this.logger.error('Failed to get applied migrations', error);
      throw new MigrationError('Failed to retrieve migration state', 'unknown', error as Error);
    }
  }

  /**
   * Get pending migrations that need to be applied
   */
  async getPendingMigrations(): Promise<IMigration[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    // This would be populated by a migration registry
    const allMigrations = await this.loadAllMigrations();
    
    return allMigrations.filter(migration => 
      !appliedVersions.has(migration.metadata.version)
    );
  }

  /**
   * Apply a single migration
   */
  async applyMigration(migration: IMigration): Promise<MigrationResult> {
    const startTime = Date.now();
    
    try {
      // Validate migration before applying
      const isValid = await this.validateMigration(migration);
      if (!isValid) {
        throw new MigrationError(
          'Migration validation failed',
          migration.metadata.version
        );
      }

      // Check if already applied
      const appliedMigrations = await this.getAppliedMigrations();
      const isAlreadyApplied = appliedMigrations.some(
        m => m.version === migration.metadata.version
      );
      
      if (isAlreadyApplied) {
        this.logger.warn(`Migration ${migration.metadata.version} already applied`);
        return {
          success: true,
          version: migration.metadata.version,
          executionTimeMs: 0
        };
      }

      this.logger.log(`Applying migration: ${migration.metadata.version} - ${migration.metadata.name}`);

      // Execute migration in transaction
      const result = await this.connection.transaction(async (trx) => {
        // Apply the migration
        const migrationResult = await migration.up();
        
        if (!migrationResult.success) {
          throw migrationResult.error || new Error('Migration failed');
        }

        // Record the migration
        await this.recordMigration(trx, migration, migrationResult.executionTimeMs);
        
        return migrationResult;
      });

      this.logger.log(
        `Successfully applied migration: ${migration.metadata.version} ` +
        `(${result.executionTimeMs}ms)`
      );

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      this.logger.error(
        `Failed to apply migration: ${migration.metadata.version}`,
        error
      );
      
      return {
        success: false,
        version: migration.metadata.version,
        executionTimeMs,
        error: error as Error
      };
    }
  }

  /**
   * Rollback a migration
   */
  async rollbackMigration(version: string): Promise<MigrationResult> {
    const startTime = Date.now();
    
    try {
      // Find the migration to rollback
      const migration = await this.findMigrationByVersion(version);
      if (!migration) {
        throw new MigrationError(`Migration ${version} not found`, version);
      }

      // Check if migration is applied
      const appliedMigrations = await this.getAppliedMigrations();
      const appliedMigration = appliedMigrations.find(m => m.version === version);
      
      if (!appliedMigration) {
        throw new MigrationError(`Migration ${version} is not applied`, version);
      }

      this.logger.log(`Rolling back migration: ${version} - ${migration.metadata.name}`);

      // Execute rollback in transaction
      const result = await this.connection.transaction(async (trx) => {
        // Execute the rollback
        const rollbackResult = await migration.down();
        
        if (!rollbackResult.success) {
          throw rollbackResult.error || new Error('Rollback failed');
        }

        // Remove migration record
        await this.removeMigrationRecord(trx, version);
        
        return rollbackResult;
      });

      this.logger.log(
        `Successfully rolled back migration: ${version} ` +
        `(${result.executionTimeMs}ms)`
      );

      return result;
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      this.logger.error(`Failed to rollback migration: ${version}`, error);
      
      return {
        success: false,
        version,
        executionTimeMs,
        error: error as Error
      };
    }
  }

  /**
   * Validate a migration
   */
  async validateMigration(migration: IMigration): Promise<boolean> {
    try {
      // Check dependencies
      if (migration.metadata.dependencies) {
        const appliedMigrations = await this.getAppliedMigrations();
        const appliedVersions = new Set(appliedMigrations.map(m => m.version));
        
        const missingDeps = migration.metadata.dependencies.filter(
          dep => !appliedVersions.has(dep)
        );
        
        if (missingDeps.length > 0) {
          this.logger.error(
            `Migration ${migration.metadata.version} has missing dependencies: ${missingDeps.join(', ')}`
          );
          return false;
        }
      }

      // Validate checksum if enabled
      if (this.config.validateChecksums) {
        const appliedMigrations = await this.getAppliedMigrations();
        const existingMigration = appliedMigrations.find(
          m => m.version === migration.metadata.version
        );
        
        if (existingMigration) {
          const currentChecksum = this.calculateChecksum(migration);
          if (currentChecksum !== existingMigration.checksum) {
            this.logger.error(
              `Migration ${migration.metadata.version} checksum mismatch. ` +
              `Expected: ${existingMigration.checksum}, Got: ${currentChecksum}`
            );
            return false;
          }
        }
      }

      // Run custom validation
      return await migration.validate();
    } catch (error) {
      this.logger.error(`Migration validation failed: ${migration.metadata.version}`, error);
      return false;
    }
  }

  /**
   * Apply all pending migrations
   */
  async applyAllPendingMigrations(): Promise<MigrationResult[]> {
    const pendingMigrations = await this.getPendingMigrations();
    
    if (pendingMigrations.length === 0) {
      this.logger.log('No pending migrations to apply');
      return [];
    }

    this.logger.log(`Applying ${pendingMigrations.length} pending migrations`);
    
    const results: MigrationResult[] = [];
    
    for (const migration of pendingMigrations) {
      const result = await this.applyMigration(migration);
      results.push(result);
      
      if (!result.success) {
        this.logger.error(`Migration failed, stopping execution: ${migration.metadata.version}`);
        break;
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    this.logger.log(`Applied ${successCount}/${results.length} migrations successfully`);
    
    return results;
  }

  /**
   * Get migration status summary
   */
  async getStatus(): Promise<{
    applied: MigrationState[];
    pending: IMigration[];
    total: number;
  }> {
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    const total = applied.length + pending.length;
    
    return { applied, pending, total };
  }

  private async ensureMigrationTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.config.schemaName}.${this.config.tableName} (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `;
    
    await this.connection.query(sql);
  }

  private async recordMigration(
    trx: DatabaseConnection,
    migration: IMigration,
    executionTimeMs: number
  ): Promise<void> {
    const checksum = this.calculateChecksum(migration);
    
    const sql = `
      INSERT INTO ${this.config.schemaName}.${this.config.tableName} 
      (version, name, checksum, execution_time_ms)
      VALUES ($1, $2, $3, $4)
    `;
    
    await trx.query(sql, [
      migration.metadata.version,
      migration.metadata.name,
      checksum,
      executionTimeMs
    ]);
  }

  private async removeMigrationRecord(
    trx: DatabaseConnection,
    version: string
  ): Promise<void> {
    const sql = `
      DELETE FROM ${this.config.schemaName}.${this.config.tableName}
      WHERE version = $1
    `;
    
    await trx.query(sql, [version]);
  }

  private calculateChecksum(migration: IMigration): string {
    // In a real implementation, this would hash the migration content
    const content = JSON.stringify(migration.metadata);
    return createHash('sha256').update(content).digest('hex');
  }

  private async loadAllMigrations(): Promise<IMigration[]> {
    const { MigrationRegistry } = await import('./migration-registry');
    return MigrationRegistry.getMigrationsInOrder(this.connection);
  }

  private async findMigrationByVersion(version: string): Promise<IMigration | null> {
    const { MigrationRegistry } = await import('./migration-registry');
    return MigrationRegistry.getMigrationByVersion(this.connection, version);
  }
}