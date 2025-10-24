import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MigrationRunnerService } from './migration-runner.service';
import { SupabaseDatabaseConnection } from './supabase-connection.service';
import { MigrationConfig, DatabaseConnection } from './migration.interface';

/**
 * Migration module for dependency injection and configuration
 */
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [
    SupabaseDatabaseConnection,
    {
      provide: 'DATABASE_CONNECTION',
      useExisting: SupabaseDatabaseConnection,
    },
    {
      provide: 'MIGRATION_CONFIG',
      useFactory: (): MigrationConfig => ({
        migrationsPath: 'src/database/migrations',
        tableName: 'schema_migrations',
        schemaName: 'public',
        validateChecksums: true,
        allowOutOfOrder: false,
      }),
    },
    {
      provide: MigrationRunnerService,
      useFactory: (connection: DatabaseConnection, config: MigrationConfig) => {
        return new MigrationRunnerService(connection, config);
      },
      inject: ['DATABASE_CONNECTION', 'MIGRATION_CONFIG'],
    },
  ],
  exports: [MigrationRunnerService],
})
export class MigrationModule {}
