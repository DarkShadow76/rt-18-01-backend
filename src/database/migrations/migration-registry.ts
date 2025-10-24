import { IMigration, DatabaseConnection } from './migration.interface';
import { CreateInvoicesTableMigration } from './001-create-invoices-table.migration';
import { CreateAuditTrailTableMigration } from './002-create-audit-trail-table.migration';
import { CreateDuplicateDetectionTableMigration } from './003-create-duplicate-detection-table.migration';

/**
 * Migration registry that manages all available migrations
 * 
 * This is where you register new migrations to make them available
 * to the migration runner system.
 */
export class MigrationRegistry {
  private static migrations: Array<new (connection: DatabaseConnection) => IMigration> = [
    CreateInvoicesTableMigration,
    CreateAuditTrailTableMigration,
    CreateDuplicateDetectionTableMigration
    // Add new migrations here in order
  ];

  /**
   * Get all registered migrations
   */
  static getAllMigrations(connection: DatabaseConnection): IMigration[] {
    return this.migrations.map(MigrationClass => new MigrationClass(connection));
  }

  /**
   * Get migration by version
   */
  static getMigrationByVersion(connection: DatabaseConnection, version: string): IMigration | null {
    const migrations = this.getAllMigrations(connection);
    return migrations.find(m => m.metadata.version === version) || null;
  }

  /**
   * Register a new migration (for dynamic registration if needed)
   */
  static registerMigration(migrationClass: new (connection: DatabaseConnection) => IMigration): void {
    this.migrations.push(migrationClass);
  }

  /**
   * Get migrations in dependency order
   */
  static getMigrationsInOrder(connection: DatabaseConnection): IMigration[] {
    const migrations = this.getAllMigrations(connection);
    
    // Simple topological sort based on dependencies
    const sorted: IMigration[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (migration: IMigration) => {
      if (visiting.has(migration.metadata.version)) {
        throw new Error(`Circular dependency detected involving migration ${migration.metadata.version}`);
      }
      
      if (visited.has(migration.metadata.version)) {
        return;
      }

      visiting.add(migration.metadata.version);

      // Visit dependencies first
      if (migration.metadata.dependencies) {
        for (const depVersion of migration.metadata.dependencies) {
          const depMigration = migrations.find(m => m.metadata.version === depVersion);
          if (depMigration) {
            visit(depMigration);
          }
        }
      }

      visiting.delete(migration.metadata.version);
      visited.add(migration.metadata.version);
      sorted.push(migration);
    };

    // Visit all migrations
    for (const migration of migrations) {
      visit(migration);
    }

    return sorted;
  }
}