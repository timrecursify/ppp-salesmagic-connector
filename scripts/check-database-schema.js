#!/usr/bin/env node

/**
 * Test D1 Database Connection and Schema
 * Uses Cloudflare API to check database tables and test queries
 */

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'l94UH8KqbyMpuIC2pY0KmO0ADOoRN7A2RxCcBDBG9y8.Lk4kckwfzzRbVlCdCzS7Oc9f9n8AZzaneZiCZjFzlEI';
const ACCOUNT_ID = '611c548ce962bcaaebb478e0e57e337e';
const DATABASE_ID = '777a0ed8-e3ee-42fc-ad9b-12f7964c1c0b';

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

async function executeD1Query(accountId, databaseId, query) {
  console.log(`\n🔍 Executing query: ${query.substring(0, 50)}...`);
  
  try {
    const data = await makeRequest(`/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify({
        sql: query,
        params: []
      })
    });
    
    // D1 API returns: [{ results: [...], success: true, meta: {...} }]
    if (Array.isArray(data.result) && data.result.length > 0 && data.result[0].results) {
      return data.result[0].results;
    }
    
    return data.result;
  } catch (error) {
    console.error('Query failed:', error.message);
    return null;
  }
}

async function checkDatabaseSchema(accountId, databaseId) {
  console.log('\n📊 Checking database schema...');
  
  // Check if tables exist
  const result = await executeD1Query(accountId, databaseId, `
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `);
  
  // D1 API returns results directly as array of objects
  const tables = Array.isArray(result) ? result : [];
  
  if (tables && tables.length > 0) {
    console.log(`\n✅ Found ${tables.length} tables:`);
    tables.forEach(row => {
      const tableName = row?.name || row?.Name || row;
      if (tableName && typeof tableName === 'string') {
        console.log(`   - ${tableName}`);
      }
    });
    
    // Check each table structure
    for (const row of tables) {
      const tableName = row?.name || row?.Name || row;
      if (!tableName || typeof tableName !== 'string') continue;
      
      const schemaResult = await executeD1Query(accountId, databaseId, `
        PRAGMA table_info(${tableName})
      `);
      
      const schema = Array.isArray(schemaResult) ? schemaResult : [];
      
      if (schema && schema.length > 0) {
        console.log(`\n   📋 ${tableName} columns:`);
        schema.forEach(col => {
          const colName = col?.name || col?.Name || col?.cid;
          const colType = col?.type || col?.Type || 'unknown';
          if (colName) {
            console.log(`      - ${colName} (${colType})`);
          }
        });
      }
    }
    
    // Check row counts
    console.log(`\n📈 Table row counts:`);
    for (const row of tables) {
      const tableName = row?.name || row?.Name || row;
      if (!tableName || typeof tableName !== 'string') continue;
      
      const countResult = await executeD1Query(accountId, databaseId, `SELECT COUNT(*) as count FROM ${tableName}`);
      const count = Array.isArray(countResult) ? countResult : [];
      
      if (count && count.length > 0) {
        const rowCount = count[0]?.count || count[0]?.Count || count[0] || 0;
        console.log(`   - ${tableName}: ${rowCount} rows`);
      }
    }
    
  } else {
    console.log(`\n⚠️ No tables found - database may be empty or schema not applied`);
  }
  
  return tables;
}

async function main() {
  console.log('🗄️ D1 Database Schema Check');
  console.log('===========================\n');

  try {
    const tables = await checkDatabaseSchema(ACCOUNT_ID, DATABASE_ID);
    
    if (!tables || tables.length === 0) {
      console.log('\n❌ Database schema is missing!');
      console.log('   This explains why the pixel stopped working.');
      console.log('   The database was likely deleted and recreated without migrations.');
    } else {
    // Check for expected tables
    const expectedTables = ['projects', 'pixels', 'visitors', 'sessions', 'tracking_events'];
    const foundTables = tables.map(row => {
      return row?.name || row?.Name || row;
    }).filter(name => name && typeof name === 'string');
      
      console.log('\n🔍 Checking for expected tables:');
      expectedTables.forEach(table => {
        if (foundTables.includes(table)) {
          console.log(`   ✅ ${table}`);
        } else {
          console.log(`   ❌ ${table} - MISSING!`);
        }
      });
    }

    console.log('\n✅ Schema check complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

