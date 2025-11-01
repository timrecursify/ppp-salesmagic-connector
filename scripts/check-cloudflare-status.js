#!/usr/bin/env node

/**
 * Cloudflare Status Checker
 * Uses Cloudflare API to check deployment history, logs, and D1 database status
 */

const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || 'l94UH8KqbyMpuIC2pY0KmO0ADOoRN7A2RxCcBDBG9y8.Lk4kckwfzzRbVlCdCzS7Oc9f9n8AZzaneZiCZjFzlEI';
const WORKER_NAME = 'ppp-pixel';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
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

async function getAccountId() {
  if (ACCOUNT_ID) return ACCOUNT_ID;
  
  console.log('Fetching account ID...');
  const data = await makeRequest('/accounts');
  
  if (data.result && data.result.length > 0) {
    return data.result[0].id;
  }
  
  throw new Error('No account ID found');
}

async function getWorkerDeployments(accountId) {
  console.log(`\n📦 Fetching deployment history for worker: ${WORKER_NAME}...`);
  
  const data = await makeRequest(`/accounts/${accountId}/workers/scripts/${WORKER_NAME}/deployments`);
  
  if (data.result && data.result.deployments) {
    return data.result.deployments;
  }
  
  return [];
}

async function getWorkerScript(accountId) {
  console.log(`\n📄 Fetching current worker script...`);
  
  try {
    const data = await makeRequest(`/accounts/${accountId}/workers/scripts/${WORKER_NAME}`);
    return data.result;
  } catch (error) {
    console.error('Could not fetch worker script:', error.message);
    return null;
  }
}

async function getD1DatabaseInfo(accountId) {
  console.log(`\n🗄️ Checking D1 database status (ID: ${DATABASE_ID})...`);
  
  try {
    const data = await makeRequest(`/accounts/${accountId}/d1/database/${DATABASE_ID}`);
    return data.result;
  } catch (error) {
    console.error('Database check failed:', error.message);
    return null;
  }
}

async function listD1Databases(accountId) {
  console.log(`\n📋 Listing all D1 databases...`);
  
  try {
    const data = await makeRequest(`/accounts/${accountId}/d1/database`);
    return data.result || [];
  } catch (error) {
    console.error('Failed to list databases:', error.message);
    return [];
  }
}

async function getWorkerLogs(accountId) {
  console.log(`\n📊 Fetching recent worker logs...`);
  
  // Note: Logs API requires different endpoint and may need tail token
  try {
    // Try to get logs via Workers Logs API
    const data = await makeRequest(`/accounts/${accountId}/workers/scripts/${WORKER_NAME}/logs`);
    return data;
  } catch (error) {
    console.log('Note: Logs API may require different authentication or endpoint');
    console.log('Error:', error.message);
    return null;
  }
}

async function downloadDeployment(accountId, deploymentId) {
  console.log(`\n⬇️ Downloading deployment: ${deploymentId}...`);
  
  try {
    const data = await makeRequest(`/accounts/${accountId}/workers/scripts/${WORKER_NAME}/deployments/${deploymentId}`);
    return data.result;
  } catch (error) {
    console.error('Failed to download deployment:', error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 Cloudflare Worker Status Check');
  console.log('==================================\n');

  try {
    // Get account ID
    const accountId = await getAccountId();
    console.log(`✅ Account ID: ${accountId}`);

    // Check D1 database
    const dbInfo = await getD1DatabaseInfo(accountId);
    if (dbInfo) {
      console.log(`✅ Database found: ${dbInfo.name}`);
      console.log(`   Created: ${dbInfo.created_at}`);
      console.log(`   Version: ${dbInfo.version}`);
    } else {
      console.log(`⚠️ Database not found or inaccessible`);
      
      // List all databases
      const allDbs = await listD1Databases(accountId);
      console.log(`\n📋 Available databases (${allDbs.length}):`);
      allDbs.forEach(db => {
        console.log(`   - ${db.name} (${db.uuid})`);
        if (db.uuid === DATABASE_ID) {
          console.log(`     ✅ This matches our expected database ID!`);
        }
      });
    }

    // Get deployments
    const deployments = await getWorkerDeployments(accountId);
    console.log(`\n📦 Found ${deployments.length} deployments`);
    
    if (deployments.length > 0) {
      console.log('\nRecent deployments:');
      deployments.slice(0, 10).forEach((deployment, index) => {
        const date = new Date(deployment.created_on || deployment.id);
        console.log(`\n${index + 1}. Deployment ${deployment.id}`);
        console.log(`   Created: ${date.toISOString()}`);
        console.log(`   Source: ${deployment.source || 'unknown'}`);
        console.log(`   Author: ${deployment.author_email || 'unknown'}`);
        
        if (deployment.metadata) {
          console.log(`   Strategy: ${deployment.metadata.strategy || 'unknown'}`);
        }
      });

      // Get the most recent deployment
      const latestDeployment = deployments[0];
      console.log(`\n🎯 Latest deployment: ${latestDeployment.id}`);
      console.log(`   Created: ${new Date(latestDeployment.created_on || latestDeployment.id).toISOString()}`);
    }

    // Get current worker script info
    const workerScript = await getWorkerScript(accountId);
    if (workerScript) {
      console.log(`\n✅ Worker script found`);
      console.log(`   Modified: ${workerScript.modified_on || 'unknown'}`);
      console.log(`   ETag: ${workerScript.etag || 'unknown'}`);
    }

    // Check logs (may not work without proper setup)
    const logs = await getWorkerLogs(accountId);
    if (logs) {
      console.log(`\n📊 Logs retrieved`);
    }

    console.log('\n✅ Status check complete!');
    
    // Output summary
    console.log('\n📋 Summary:');
    console.log(`   Account ID: ${accountId}`);
    console.log(`   Worker: ${WORKER_NAME}`);
    console.log(`   Database ID: ${DATABASE_ID}`);
    console.log(`   Database Status: ${dbInfo ? '✅ Found' : '❌ Not Found'}`);
    console.log(`   Deployments: ${deployments.length}`);
    console.log(`   Latest Deployment: ${deployments[0]?.id || 'None'}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

