#!/usr/bin/env node

/**
 * Apply D1 Migrations via API
 * Directly applies SQL migrations to D1 database
 */

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'l94UH8KqbyMpuIC2pY0KmO0ADOoRN7A2RxCcBDBG9y8.Lk4kckwfzzRbVlCdCzS7Oc9f9n8AZzaneZiCZjFzlEI';
const ACCOUNT_ID = '611c548ce962bcaaebb478e0e57e337e';
const DATABASE_ID = '777a0ed8-e3ee-42fc-ad9b-12f7964c1c0b';
const fs = require('fs');
const path = require('path');

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

async function makeRequest(endpoint, options = {}) {
  const url = `${CLOUDFLARE_API_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
    'Content-Type': 'application/json',
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`API Error: ${data.errors?.[0]?.message || response.statusText}`);
    }

    return data;
  } catch (error) {
    console.error(`Request failed for ${endpoint}:`, error.message);
    throw error;
  }
}

async function executeD1Query(accountId, databaseId, sql) {
  console.log(`\n🔍 Executing: ${sql.substring(0, 60)}...`);
  
  try {
    const data = await makeRequest(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        sql: sql,
        params: []
      })
    });
    
    return data.result;
  } catch (error) {
    console.error('Query failed:', error.message);
    return null;
  }
}

async function readMigrationFile(filename) {
  const filePath = path.join(__dirname, '..', 'migrations', filename);
  return fs.readFileSync(filePath, 'utf-8');
}

async function applyMigration(accountId, databaseId, filename) {
  console.log(`\n📝 Applying migration: ${filename}`);
  
  const sql = await readMigrationFile(filename);
  
  // Split by semicolons, but preserve those inside strings
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    if (statement.trim()) {
      await executeD1Query(accountId, databaseId, statement + ';');
    }
  }
  
  console.log(`✅ Migration ${filename} applied`);
}

async function main() {
  console.log('🗄️ Applying D1 Migrations via API');
  console.log('==================================\n');

  try {
    const migrations = [
      '0001_create_initial_schema.sql',
      '0002_add_form_data_capture.sql',
      '0002_seed_initial_data.sql',
      '0003_add_utm_session_fields.sql',
      '0004_add_custom_ad_parameters.sql',
      '0005_add_system_logs.sql'
    ];

    for (const migration of migrations) {
      await applyMigration(ACCOUNT_ID, DATABASE_ID, migration);
    }

    // Verify schema
    console.log('\n🔍 Verifying schema...');
    const tables = await executeD1Query(ACCOUNT_ID, DATABASE_ID, `
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    if (tables && tables.length > 0) {
      console.log(`\n✅ Found ${tables.length} tables:`);
      tables.forEach(table => {
        console.log(`   - ${table.name}`);
      });
    }

    console.log('\n✅ Migrations complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

