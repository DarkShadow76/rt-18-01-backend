#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MigrationModule } from './migration.module';
import { MigrationRunnerService } from './migration-runner.service';

/**
 * CLI script for running database migrations
 * 
 * Usage:
 *   ts-node src/database/migrations/migration.command.ts up      # Apply all pending migrations
 *   ts-node src/database/migrations/migration.command.ts down    # Rollback last migration
 *   ts-node src/database/migrations/migration.command.ts status  # Show migration status
 *   ts-node src/database/migrations/migration.command.ts validate # Validate all migrations
 */
class MigrationCLI {
  private readonly logger = new Logger(MigrationCLI.name);

  async run(): Promise<void> {
    const command = process.argv[2];
    const options = this.parseOptions();

    try {
      // Create NestJS application context
      const app = await NestFactory.createApplicationContext(MigrationModule, {
        logger: ['error', 'warn', 'log']
      });

      const migrationRunner = app.get(MigrationRunnerService);
      await migrationRunner.initialize();

      switch (command) {
        case 'up':
          await this.runUp(migrationRunner, options);
          break;
        case 'down':
          await this.runDown(migrationRunner, options);
          break;
        case 'status':
          await this.showStatus(migrationRunner);
          break;
        case 'validate':
          await this.validateMigrations(migrationRunner);
          break;
        default:
          this.showHelp();
      }

      await app.close();
    } catch (error) {
      this.logger.error('Migration command failed', error);
      process.exit(1);
    }
  }

  private parseOptions(): MigrationCommandOptions {
    const options: MigrationCommandOptions = {};
    
    const versionArg = process.argv.find(arg => arg.startsWith('--version='));
    if (versionArg) {
      options.version = versionArg.split('=')[1];
    }
    
    options.dryRun = process.argv.includes('--dry-run');
    options.verbose = process.argv.includes('--verbose');
    
    return options;
  }

  private async runUp(migrationRunner: MigrationRunnerService, options?: MigrationCommandOptions): Promise<void> {
    this.logger.log('Starting migration up...');
    
    const results = await migrationRunner.applyAllPendingMigrations();
    
    if (results.length === 0) {
      this.logger.log('✓ No pending migrations to apply');
      return;
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    if (failureCount === 0) {
      this.logger.log(`✓ Successfully applied ${successCount} migrations`);
    } else {
      this.logger.error(`✗ Applied ${successCount} migrations, ${failureCount} failed`);
      
      // Show failed migrations
      results
        .filter(r => !r.success)
        .forEach(r => {
          this.logger.error(`  - ${r.version}: ${r.error?.message}`);
        });
      
      process.exit(1);
    }
  }

  private async runDown(migrationRunner: MigrationRunnerService, options?: MigrationCommandOptions): Promise<void> {
    const version = options?.version;
    
    if (!version) {
      // Rollback last migration
      const status = await migrationRunner.getStatus();
      
      if (status.applied.length === 0) {
        this.logger.log('✓ No migrations to rollback');
        return;
      }

      const lastMigration = status.applied[status.applied.length - 1];
      this.logger.log(`Rolling back last migration: ${lastMigration.version}`);
      
      const result = await migrationRunner.rollbackMigration(lastMigration.version);
      
      if (result.success) {
        this.logger.log(`✓ Successfully rolled back migration: ${lastMigration.version}`);
      } else {
        this.logger.error(`✗ Failed to rollback migration: ${result.error?.message}`);
        process.exit(1);
      }
    } else {
      // Rollback specific version
      this.logger.log(`Rolling back migration: ${version}`);
      
      const result = await migrationRunner.rollbackMigration(version);
      
      if (result.success) {
        this.logger.log(`✓ Successfully rolled back migration: ${version}`);
      } else {
        this.logger.error(`✗ Failed to rollback migration: ${result.error?.message}`);
        process.exit(1);
      }
    }
  }

  private async showStatus(migrationRunner: MigrationRunnerService): Promise<void> {
    const status = await migrationRunner.getStatus();
    
    this.logger.log('Migration Status:');
    this.logger.log('================');
    
    if (status.applied.length > 0) {
      this.logger.log('\nApplied Migrations:');
      status.applied.forEach(migration => {
        this.logger.log(`  ✓ ${migration.version} (${migration.appliedAt.toISOString()})`);
      });
    }
    
    if (status.pending.length > 0) {
      this.logger.log('\nPending Migrations:');
      status.pending.forEach(migration => {
        this.logger.log(`  ○ ${migration.metadata.version} - ${migration.metadata.name}`);
      });
    }
    
    this.logger.log(`\nSummary: ${status.applied.length} applied, ${status.pending.length} pending, ${status.total} total`);
  }

  private async validateMigrations(migrationRunner: MigrationRunnerService): Promise<void> {
    this.logger.log('Validating migrations...');
    
    const status = await migrationRunner.getStatus();
    let allValid = true;
    
    // Validate pending migrations
    for (const migration of status.pending) {
      const isValid = await migrationRunner.validateMigration(migration);
      
      if (isValid) {
        this.logger.log(`  ✓ ${migration.metadata.version} - Valid`);
      } else {
        this.logger.error(`  ✗ ${migration.metadata.version} - Invalid`);
        allValid = false;
      }
    }
    
    if (allValid) {
      this.logger.log('✓ All migrations are valid');
    } else {
      this.logger.error('✗ Some migrations are invalid');
      process.exit(1);
    }
  }

  private showHelp(): void {
    console.log(`
Database Migration Commands:

  npm run migration:up              Apply all pending migrations
  npm run migration:down            Rollback the last migration
  npm run migration:down --version=001  Rollback specific migration
  npm run migration:status          Show migration status
  npm run migration:validate       Validate all migrations

Options:
  --version=<version>              Specify migration version for rollback
  --dry-run                        Show what would be done without executing
  --verbose                        Show detailed output

Examples:
  npm run migration:up
  npm run migration:down --version=002
  npm run migration:status
    `);
  }
}

interface MigrationCommandOptions {
  version?: string;
  dryRun?: boolean;
  verbose?: boolean;
}
//Run the CLI if this file is executed directly
if (require.main === module) {
  const cli = new MigrationCLI();
  cli.run().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}

export { MigrationCLI };