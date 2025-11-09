#!/usr/bin/env node

/**
 * Monitor Sync Health
 * Checks for potential sync issues and provides health status
 */

import { execSync } from 'child_process';

function executeD1Query(query) {
  try {
    const result = execSync(
      `npx wrangler d1 execute ppp-tracking-db --env production --remote --command "${query.replace(/\n/g, ' ').replace(/\s+/g, ' ')}"`,
      { encoding: 'utf-8', cwd: process.cwd() }
    );
    
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON found in output');
    }
    
    const data = JSON.parse(jsonMatch[0]);
    if (Array.isArray(data) && data.length > 0 && data[0].results) {
      return data[0].results;
    }
    
    return data || [];
  } catch (error) {
    console.error('Query failed:', error.message);
    return [];
  }
}

async function checkSyncHealth() {
  console.log('\n🏥 PIPEDRIVE SYNC HEALTH MONITOR');
  console.log('='.repeat(80));
  console.log(`\n📅 Timestamp: ${new Date().toISOString()}`);
  
  // 1. Check for NULL sync statuses (form submissions that were never synced)
  console.log('\n📋 Checking for unsynced form submissions...');
  const unsyncedQuery = `
    SELECT COUNT(*) as count
    FROM tracking_events 
    WHERE event_type = 'form_submit' 
      AND pipedrive_sync_status IS NULL
      AND created_at >= datetime('now', '-24 hours')
  `;
  
  const unsynced = await executeD1Query(unsyncedQuery);
  const unsyncedCount = unsynced[0]?.count || 0;
  
  if (unsyncedCount > 0) {
    console.log(`   ⚠️  WARNING: ${unsyncedCount} form submissions in last 24h have NULL sync status`);
    console.log(`   This could indicate:`);
    console.log(`   - Scheduled worker not running`);
    console.log(`   - KV entries expiring before processing`);
    console.log(`   - Errors in prepareAndSchedulePipedriveSync()`);
  } else {
    console.log(`   ✅ All form submissions from last 24h have been processed`);
  }
  
  // 2. Check sync success rate
  console.log('\n📊 Checking sync success rate (last 24h)...');
  const syncStatsQuery = `
    SELECT 
      pipedrive_sync_status,
      COUNT(*) as count
    FROM tracking_events 
    WHERE event_type = 'form_submit'
      AND created_at >= datetime('now', '-24 hours')
    GROUP BY pipedrive_sync_status
  `;
  
  const syncStats = await executeD1Query(syncStatsQuery);
  let totalSubmissions = 0;
  let synced = 0;
  let notFound = 0;
  let errors = 0;
  let nullStatus = 0;
  
  syncStats.forEach(stat => {
    totalSubmissions += stat.count;
    if (stat.pipedrive_sync_status === 'synced') synced = stat.count;
    else if (stat.pipedrive_sync_status === 'not_found') notFound = stat.count;
    else if (stat.pipedrive_sync_status === 'error') errors = stat.count;
    else if (stat.pipedrive_sync_status === null) nullStatus = stat.count;
  });
  
  console.log(`   Total form submissions: ${totalSubmissions}`);
  console.log(`   ✅ Synced: ${synced} (${totalSubmissions ? Math.round((synced / totalSubmissions) * 100) : 0}%)`);
  console.log(`   ⚠️  Not found: ${notFound} (${totalSubmissions ? Math.round((notFound / totalSubmissions) * 100) : 0}%)`);
  console.log(`   ❌ Errors: ${errors} (${totalSubmissions ? Math.round((errors / totalSubmissions) * 100) : 0}%)`);
  console.log(`   ⚠️  NULL (unprocessed): ${nullStatus} (${totalSubmissions ? Math.round((nullStatus / totalSubmissions) * 100) : 0}%)`);
  
  // 3. Check for sync delays
  console.log('\n⏰ Checking for sync delays...');
  const delayQuery = `
    SELECT 
      id,
      created_at,
      pipedrive_sync_at,
      julianday(pipedrive_sync_at) - julianday(created_at) as delay_days,
      (julianday(pipedrive_sync_at) - julianday(created_at)) * 24 * 60 as delay_minutes
    FROM tracking_events
    WHERE event_type = 'form_submit'
      AND pipedrive_sync_at IS NOT NULL
      AND created_at >= datetime('now', '-24 hours')
      AND (julianday(pipedrive_sync_at) - julianday(created_at)) * 24 * 60 > 15
    ORDER BY delay_minutes DESC
    LIMIT 5
  `;
  
  const delays = await executeD1Query(delayQuery);
  if (delays.length > 0) {
    console.log(`   ⚠️  Found ${delays.length} syncs with delays > 15 minutes:`);
    delays.forEach(d => {
      console.log(`      Event ${d.id}: ${Math.round(d.delay_minutes)} minutes delay`);
    });
  } else {
    console.log(`   ✅ All syncs completed within expected timeframe (< 15 minutes)`);
  }
  
  // 4. Check for recent errors
  console.log('\n🔍 Recent error details (last 10)...');
  const errorQuery = `
    SELECT 
      id,
      created_at,
      pipedrive_sync_at,
      json_extract(form_data, '$.email') as email
    FROM tracking_events
    WHERE event_type = 'form_submit'
      AND pipedrive_sync_status = 'error'
      AND created_at >= datetime('now', '-7 days')
    ORDER BY created_at DESC
    LIMIT 10
  `;
  
  const errorEvents = await executeD1Query(errorQuery);
  if (errorEvents.length > 0) {
    console.log(`   ⚠️  Found ${errorEvents.length} error events:`);
    errorEvents.forEach(e => {
      console.log(`      Event ${e.id}: ${e.email} (${e.created_at})`);
    });
  } else {
    console.log(`   ✅ No error events in last 7 days`);
  }
  
  // 5. Health Score
  console.log('\n🏥 OVERALL HEALTH SCORE');
  console.log('-'.repeat(80));
  
  let healthScore = 100;
  const issues = [];
  
  if (unsyncedCount > 0) {
    healthScore -= 40;
    issues.push(`${unsyncedCount} unsynced submissions`);
  }
  
  if (errors > 0) {
    healthScore -= 20;
    issues.push(`${errors} error syncs`);
  }
  
  if (delays.length > 0) {
    healthScore -= 10;
    issues.push(`${delays.length} delayed syncs`);
  }
  
  if (totalSubmissions > 0 && synced / totalSubmissions < 0.8) {
    healthScore -= 20;
    issues.push(`Low sync success rate (${Math.round((synced / totalSubmissions) * 100)}%)`);
  }
  
  if (healthScore >= 90) {
    console.log(`   ✅ HEALTHY (${healthScore}/100)`);
  } else if (healthScore >= 70) {
    console.log(`   ⚠️  WARNING (${healthScore}/100)`);
  } else {
    console.log(`   ❌ CRITICAL (${healthScore}/100)`);
  }
  
  if (issues.length > 0) {
    console.log(`\n   Issues:`);
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  // 6. Recommendations
  console.log('\n💡 RECOMMENDATIONS');
  console.log('-'.repeat(80));
  
  if (unsyncedCount > 0) {
    console.log(`   ⚠️  Action Required: Investigate unsynced submissions`);
    console.log(`      Command: node scripts/sync-all-pending-leads.js`);
  }
  
  if (delays.length > 0) {
    console.log(`   ⚠️  Monitor scheduled worker execution`);
    console.log(`      Command: npx wrangler tail --env production | grep "scheduled-worker"`);
  }
  
  if (errors > 0) {
    console.log(`   ⚠️  Review error logs for sync failures`);
    console.log(`      Check Cloudflare Workers logs for error details`);
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

checkSyncHealth().catch(console.error);

