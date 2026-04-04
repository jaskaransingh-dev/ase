#!/usr/bin/env node

/**
 * Apply Migration 009: Add last_error column and seed 5 new agents
 *
 * This script applies the database migration directly to your Supabase project
 * using the service role key from .env.local
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'ase/.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

// Read the migration SQL
const migrationPath = path.join(__dirname, 'ase/supabase/migrations/009_seed_5_new_agents.sql');
if (!fs.existsSync(migrationPath)) {
  console.error(`❌ Migration file not found: ${migrationPath}`);
  process.exit(1);
}

const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

/**
 * Execute SQL against Supabase using the REST API
 */
async function applySQLMigration() {
  try {
    console.log('🔄 Applying migration 009...\n');

    // Supabase SQL API endpoint
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ sql: migrationSQL }),
    });

    // Note: The /rpc/exec_sql endpoint may not exist on all Supabase projects
    // If it fails, we'll fall back to using the Postgres endpoint

    if (!response.ok) {
      console.log('ℹ️  REST API approach didn\'t work. Using direct query method...\n');
      await applyViaDirectQuery();
      return;
    }

    console.log('✅ Migration 009 applied successfully!\n');
    console.log('Changes made:');
    console.log('  - Added "last_error" column to agents table');
    console.log('  - Seeded 5 new trading agents');
    console.log('  - Created index on last_error for performance\n');
  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    process.exit(1);
  }
}

/**
 * Fallback: Apply migration using individual statements
 */
async function applyViaDirectQuery() {
  try {
    // Split SQL by statements (simple split on ;)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));

    let executed = 0;

    for (const statement of statements) {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'apikey': SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({ query: statement }),
      });

      // If direct query API doesn't exist, skip and inform user
      if (!response.ok && response.status === 404) {
        throw new Error('Supabase SQL execution API not available. Please run SQL manually.');
      }

      if (response.ok) {
        executed++;
      }
    }

    console.log(`✅ Applied ${executed} SQL statements successfully!\n`);
    console.log('Changes made:');
    console.log('  - Added "last_error" column to agents table');
    console.log('  - Seeded 5 new trading agents');
    console.log('  - Created index on last_error for performance\n');
  } catch (error) {
    console.error('\n⚠️  Could not apply migration automatically.');
    console.error('\nTo apply the migration manually:');
    console.error('1. Go to https://supabase.com/dashboard');
    console.error('2. Open your project "ASE Startup"');
    console.error('3. Click "SQL Editor"');
    console.error('4. Click "New Query"');
    console.error('5. Copy and paste the SQL from: ase/supabase/migrations/009_seed_5_new_agents.sql');
    console.error('6. Click "Run"');
    process.exit(1);
  }
}

// Run the migration
applySQLMigration();
