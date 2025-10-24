/**
 * Migration system interfaces and types
 * Provides type safety and structure for database migrations
 */

export interface MigrationMetadata {
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly author?: string;
  readonly createdAt: Date;
  readonly dependencies?: string[];
}

export interface MigrationResult {
  readonly success: boolean;
  readonly version: string;
  readonly executionTimeMs: number;
  readonly error?: Error;
  readonly affectedRows?: number;
}

export interface MigrationState {
  readonly version: string;
  readonly appliedAt: Date;
  readonly checksum: string;
  readonly executionTimeMs: number;
}

export interface IMigration {
  readonly metadata: MigrationMetadata;
  up(): Promise<MigrationResult>;
  down(): Promise<MigrationResult>;
  validate(): Promise<boolean>;
}

export interface IMigrationRunner {
  getAppliedMigrations(): Promise<MigrationState[]>;
  getPendingMigrations(): Promise<IMigration[]>;
  applyMigration(migration: IMigration): Promise<MigrationResult>;
  rollbackMigration(version: string): Promise<MigrationResult>;
  validateMigration(migration: IMigration): Promise<boolean>;
}

export interface DatabaseConnection {
  query(sql: string, params?: any[]): Promise<any>;
  transaction<T>(callback: (trx: DatabaseConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export enum MigrationStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

export interface MigrationConfig {
  readonly migrationsPath: string;
  readonly tableName: string;
  readonly schemaName: string;
  readonly validateChecksums: boolean;
  readonly allowOutOfOrder: boolean;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly version: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}