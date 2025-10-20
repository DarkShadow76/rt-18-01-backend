#!/usr/bin/env node

/**
 * Database Migration Runner
 * 
 * This script helps run database migrations for the invoice processing application.
 * It can be used to apply migrations or rollback changes.
 * 
 * Usage:
 *   node run-migrations.js up    # Run all pending migrations
 *   node run-migrations.js down  # Rollback the last migration
 *   node run-migrations.js status # Show migration status
 * 
 * Environment Variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_ANON_KEY - Supabase anonymous key (for public operations)
 *   SUPABASE_SERVICE_KEY - Supabase service role key (for admin operations)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const MIGRATIONS_DIR = __dirname;
const MIGRATION_TABLE = 'schema_migrations';

// Migration files in order
const MIGRATIONS = [
  '20241019_120000_create_invoices_table.sql',
  '20241019_120100_create_audit_trail_table.sql',
  '20241019_120200_create_duplicate_detection_table.sql',
  '20241019_120300_create_indexes.sql',
  '20241019_120400_add_invoice_enhancements.sql'
];

class MigrationRunner {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
      process.exit(1);
    }
    
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
  }

  async ensureMigrationTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        checksum VARCHAR(64)
      );
    `;
    
    const { error } = await this.supabase.rpc('exec_sql', { sql: createTableSQL });
    if (error) {
      console.error('Error creating migration table:', error);
      throw error;
    }
  }

  async getAppliedMigrations() {
    const { data, error } = await this.supabase
      .from(MIGRATION_TABLE)
      .select('filename')
      .order('applied_at');
    
    if (error) {
      console.error('Error fetching applied migrations:', error);
      throw error;
    }
    
    return data.map(row => row.filename);
  }

  async applyMigration(filename) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${filename}`);
    }
    
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Applying migration: ${filename}`);
    
    // Execute the migration SQL
    const { error } = await this.supabase.rpc('exec_sql', { sql });
    if (error) {
      console.error(`Error applying migration ${filename}:`, error);
      throw error;
    }
    
    // Record the migration as applied
    const { error: insertError } = await this.supabase
      .from(MIGRATION_TABLE)
      .insert({ filename });
    
    if (insertError) {
      console.error(`Error recording migration ${filename}:`, insertError);
      throw insertError;
    }
    
    console.log(`✓ Applied migration: ${filename}`);
  }

  async rollbackMigration(filename) {
    const rollbackFilename = filename.replace('.sql', '_rollback.sql');
    const filePath = path.join(MIGRATIONS_DIR, rollbackFilename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Rollback file not found: ${rollbackFilename}`);
    }
    
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Rolling back migration: ${filename}`);
    
    // Execute the rollback SQL
    const { error } = await this.supabase.rpc('exec_sql', { sql });
    if (error) {
      console.error(`Error rolling back migration ${filename}:`, error);
      throw error;
    }
    
    // Remove the migration record
    const { error: deleteError } = await this.supabase
      .from(MIGRATION_TABLE)
      .delete()
      .eq('filename', filename);
    
    if (deleteError) {
      console.error(`Error removing migration record ${filename}:`, deleteError);
      throw deleteError;
    }
    
    console.log(`✓ Rolled back migration: ${filename}`);
  }

  async runMigrations() {
    await this.ensureMigrationTable();
    const appliedMigrations = await this.getAppliedMigrations();
    
    const pendingMigrations = MIGRATIONS.filter(
      migration => !appliedMigrations.includes(migration)
    );
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to apply.');
      return;
    }
    
    console.log(`Found ${pendingMigrations.length} pending migrations:`);
    pendingMigrations.forEach(migration => console.log(`  - ${migration}`));
    console.log('');
    
    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }
    
    console.log(`\n✓ Successfully applied ${pendingMigrations.length} migrations.`);
  }

  async rollbackLastMigration() {
    await this.ensureMigrationTable();
    const appliedMigrations = await this.getAppliedMigrations();
    
    if (appliedMigrations.length === 0) {
      console.log('No migrations to rollback.');
      return;
    }
    
    const lastMigration = appliedMigrations[appliedMigrations.length - 1];
    await this.rollbackMigration(lastMigration);
    
    console.log(`\n✓ Successfully rolled back migration: ${lastMigration}`);
  }

  async showStatus() {
    await this.ensureMigrationTable();
    const appliedMigrations = await this.getAppliedMigrations();
    
    console.log('Migration Status:');
    console.log('================');
    
    MIGRATIONS.forEach(migration => {
      const isApplied = appliedMigrations.includes(migration);
      const status = isApplied ? '✓ Applied' : '✗ Pending';
      console.log(`${status}  ${migration}`);
    });
    
    const pendingCount = MIGRATIONS.length - appliedMigrations.length;
    console.log(`\nTotal: ${MIGRATIONS.length} migrations, ${appliedMigrations.length} applied, ${pendingCount} pending`);
  }
}

// Main execution
async function main() {
  const command = process.argv[2];
  const runner = new MigrationRunner();
  
  try {
    switch (command) {
      case 'up':
        await runner.runMigrations();
        break;
      case 'down':
        await runner.rollbackLastMigration();
        break;
      case 'status':
        await runner.showStatus();
        break;
      default:
        console.log('Usage: node run-migrations.js [up|down|status]');
        console.log('');
        console.log('Commands:');
        console.log('  up     - Apply all pending migrations');
        console.log('  down   - Rollback the last applied migration');
        console.log('  status - Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = MigrationRunner;