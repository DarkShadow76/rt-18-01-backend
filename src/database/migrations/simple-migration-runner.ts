#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple migration runner that works with the existing SQL files
 * but provides better error handling and structure
 */
class SimpleMigrationRunner {
  private supabase: any;
  private migrationsDir: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!url || !key) {
      console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
      process.exit(1);
    }

    this.supabase = createClient(url, key);
    this.migrationsDir = path.join(__dirname, '../../../migrations');
  }

  async run(): Promise<void> {
    const command = process.argv[2];

    try {
      switch (command) {
        case 'up':
          await this.runAllMigrations();
          break;
        case 'status':
          await this.showStatus();
          break;
        case 'validate':
          await this.validateMigrations();
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  }

  private async runAllMigrations(): Promise<void> {
    console.log('🚀 Running all migrations...');
    
    const migrationFile = path.join(this.migrationsDir, 'all-migrations.sql');
    
    if (!fs.existsSync(migrationFile)) {
      console.error('❌ Migration file not found:', migrationFile);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    try {
      // Split SQL into individual statements
      const statements = this.splitSqlStatements(sql);
      
      console.log(`📝 Executing ${statements.length} SQL statements...`);
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (statement && !statement.startsWith('--')) {
          console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
          
          try {
            await this.executeSql(statement);
            console.log(`✅ Statement ${i + 1} completed`);
          } catch (error) {
            console.error(`❌ Statement ${i + 1} failed:`, error);
            throw error;
          }
        }
      }
      
      console.log('🎉 All migrations completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  private async showStatus(): Promise<void> {
    console.log('📊 Migration Status:');
    console.log('==================');
    
    try {
      // Check if tables exist
      const tables = ['invoices', 'invoice_audit_trail', 'invoice_duplicates'];
      
      for (const table of tables) {
        const exists = await this.tableExists(table);
        const status = exists ? '✅ Created' : '❌ Missing';
        console.log(`${status} ${table}`);
      }
      
      // Check migration tracking table
      const migrationTableExists = await this.tableExists('schema_migrations');
      if (migrationTableExists) {
        const { data, error } = await this.supabase
          .from('schema_migrations')
          .select('filename, applied_at')
          .order('applied_at');
        
        if (!error && data) {
          console.log('\n📋 Applied Migrations:');
          data.forEach((migration: any) => {
            console.log(`  ✅ ${migration.filename} (${migration.applied_at})`);
          });
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to get status:', error);
    }
  }

  private async validateMigrations(): Promise<void> {
    console.log('🔍 Validating migrations...');
    
    const migrationFile = path.join(this.migrationsDir, 'all-migrations.sql');
    const validationFile = path.join(this.migrationsDir, 'validate-schema.sql');
    
    // Check if files exist
    if (!fs.existsSync(migrationFile)) {
      console.error('❌ Migration file not found:', migrationFile);
      return;
    }
    
    if (!fs.existsSync(validationFile)) {
      console.error('❌ Validation file not found:', validationFile);
      return;
    }
    
    console.log('✅ Migration files found');
    
    // Basic SQL syntax validation
    const sql = fs.readFileSync(migrationFile, 'utf8');
    const statements = this.splitSqlStatements(sql);
    
    let validStatements = 0;
    let invalidStatements = 0;
    
    for (const statement of statements) {
      if (statement.trim() && !statement.trim().startsWith('--')) {
        if (this.isValidSqlStatement(statement)) {
          validStatements++;
        } else {
          invalidStatements++;
          console.log(`⚠️  Potentially invalid statement: ${statement.substring(0, 50)}...`);
        }
      }
    }
    
    console.log(`📊 Validation Results:`);
    console.log(`  ✅ Valid statements: ${validStatements}`);
    console.log(`  ⚠️  Questionable statements: ${invalidStatements}`);
    
    if (invalidStatements === 0) {
      console.log('🎉 All migrations appear valid!');
    } else {
      console.log('⚠️  Some statements may need review');
    }
  }

  private async executeSql(sql: string): Promise<any> {
    // For Supabase, we need to handle different types of SQL statements
    // This is a simplified approach - in production you might need more sophisticated handling
    
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      const { data, error } = await this.supabase.rpc('exec_sql', { sql });
      if (error) throw error;
      return data;
    } else {
      // For DDL statements, we'll use a different approach
      // Note: This is a workaround - Supabase might require different handling
      const { error } = await this.supabase.rpc('exec_sql', { sql });
      if (error) throw error;
      return null;
    }
  }

  private async tableExists(tableName: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      return !error;
    } catch {
      return false;
    }
  }

  private splitSqlStatements(sql: string): string[] {
    // Simple SQL statement splitter
    // This is basic - a production version would need more sophisticated parsing
    return sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  private isValidSqlStatement(statement: string): boolean {
    const trimmed = statement.trim().toUpperCase();
    
    // Basic validation - check for common SQL keywords
    const validStarters = [
      'CREATE', 'ALTER', 'DROP', 'INSERT', 'UPDATE', 'DELETE', 'SELECT',
      'COMMENT', 'GRANT', 'REVOKE', 'BEGIN', 'COMMIT', 'ROLLBACK'
    ];
    
    return validStarters.some(starter => trimmed.startsWith(starter));
  }

  private showHelp(): void {
    console.log(`
🗃️  Simple Database Migration Runner

Usage:
  npm run migration:simple <command>

Commands:
  up        Apply all migrations from all-migrations.sql
  status    Show current migration status
  validate  Validate migration files
  help      Show this help message

Examples:
  npm run migration:simple up
  npm run migration:simple status
  npm run migration:simple validate

Environment Variables:
  SUPABASE_URL          Your Supabase project URL
  SUPABASE_SERVICE_KEY  Your Supabase service role key

Note: This runner uses the existing SQL files in the migrations/ directory
and provides better error handling and progress reporting.
    `);
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new SimpleMigrationRunner();
  runner.run().catch(error => {
    console.error('Migration runner failed:', error);
    process.exit(1);
  });
}

export { SimpleMigrationRunner };