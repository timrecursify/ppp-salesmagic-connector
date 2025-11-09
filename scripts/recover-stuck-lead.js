#!/usr/bin/env node
/**
 * Recover Stuck Lead Script
 * Manually triggers Pipedrive sync for a stuck lead by calling the Pipedrive API directly
 * This bypasses the delayed sync mechanism and immediately syncs the lead
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { PIPEDRIVE_API_KEY } = process.env;
const BASE_URL = 'https://api.pipedrive.com/v1';

if (!PIPEDRIVE_API_KEY) {
  console.error('❌ Missing PIPEDRIVE_API_KEY. Set it via environment variable or `wrangler secret put PIPEDRIVE_API_KEY`.');
  process.exit(1);
}

function executeD1Query(query) {
  try {
    const projectRoot = join(__dirname, '..');
    const command = `cd "${projectRoot}" && npx wrangler d1 execute ppp-tracking-db --env production --remote --command "${query.replace(/\n/g, ' ').replace(/\s+/g, ' ').replace(/"/g, '\\"')}"`;
    
    const output = execSync(command, { 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('No JSON found in output:', output.substring(0, 500));
      return [];
    }
    
    const data = JSON.parse(jsonMatch[0]);
    
    if (Array.isArray(data) && data.length > 0 && data[0].results) {
      return data[0].results;
    }
    
    return [];
  } catch (error) {
    console.error('Query error:', error.message);
    return [];
  }
}

async function searchPersonByEmail(email) {
  if (!email) return null;
  
  try {
    const emailParams = new URLSearchParams({ 
      api_token: PIPEDRIVE_API_KEY,
      term: email,
      fields: 'email',
      exact_match: 'true'
    });
    
    const response = await fetch(`${BASE_URL}/persons/search?${emailParams}`);
    const data = await response.json();
    
    if (data.success && data.data && data.data.items && data.data.items.length > 0) {
      return data.data.items[0].item.id;
    }
    
    return null;
  } catch (error) {
    console.error(`Email search error: ${error.message}`);
    return null;
  }
}

async function searchPersonByName(firstName, lastName) {
  if (!firstName && !lastName) return null;
  
  const searchTerm = `${firstName} ${lastName}`.trim();
  if (!searchTerm) return null;
  
  try {
    const nameParams = new URLSearchParams({ 
      api_token: PIPEDRIVE_API_KEY,
      term: searchTerm,
      fields: 'name'
    });
    
    const response = await fetch(`${BASE_URL}/persons/search?${nameParams}`);
    const data = await response.json();
    
    if (data.success && data.data && data.data.items && data.data.items.length > 0) {
      return data.data.items[0].item.id;
    }
    
    return null;
  } catch (error) {
    console.error(`Name search error: ${error.message}`);
    return null;
  }
}

async function updatePipedrivePerson(personId, updateData) {
  try {
    const params = new URLSearchParams({ api_token: PIPEDRIVE_API_KEY });
    const response = await fetch(`${BASE_URL}/persons/${personId}?${params}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    const data = await response.json();
    return { success: data.success, data: data.data, error: data.error };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Field mapping (from pipedrive.service.js)
const FIELD_MAPPING = {
  utm_source: 'b2be79ec6d74810f141ff0c10950d09a251841d5',
  utm_medium: '793eed228dab55f371b7a463d6272c25c10d2592',
  utm_campaign: '0c0266c6a8ca36806465ba11d0a0b7cd01401107',
  utm_content: '8f230578a37b1f6cc9735b2659d00f69a407cedd',
  utm_term: '69ce2c893d7c87679967b12727805d693463a5fe',
  gclid: '9aad4a1b8a9bcd93dc31ec8c4efea5f2d3123c58',
  fbclid: '6d9fa7cac69ac961197fe160a6e0303cc103db3c',
  msclkid: 'f97bbfff4e3665f129094b276f7c48dd3715bcdf',
  ttclid: 'd8e9e151f85917536c0867947a0ad9e1c9c5fc8d',
  event_id: '8cf49560ecaa68f90d3e4e103a8267ca5d4dc621',
  session_id: 'b0067e0f4c9d31fe12a9067ea0c2f728079ada9e',
  visitor_id: '38cf8a494a313dddb37b05eb5230c14470a71208',
  pixel_id: '5365d081bd139123cdac311b49c9b207f6a2ff7b',
  project_id: '7aea416f749df1c9b88bbf3a75d0377475b771e4',
  page_url: 'a5fda325cf12108a3156d8572d3e5df1b1157c8f',
  page_title: '82da01c675c40d01b47c044e88a43a2b840172b7',
  referrer_url: 'c588a1f5f600988d32bb9acc23365423d39fba2f',
  country: 'e00b50a52507ef7229b956dc1997b01eef506db7',
  region: '918f46e1e4c8ecdae4b300ac8fdc38b2ebf52dab',
  city: 'c068cb8babf4d594f68f14bda5093f51c45d6527',
  ad_group: 'e94db8ffea0cdb798171a5011f7e67e56d111941',
  ad_id: 'be273aec0e4263097e79c469b84512667e20ccff',
  search_query: '3fbc29539c444f99220a09890ad579f7501e1ffe',
  user_agent: '56e5c28437b29d4e11e48a0af2985a0318257ef3',
  screen_resolution: '783ba423096fe12674cee2db61812f65413d3ced',
  device_type: 'a15bd6127ea55f527e904922e5185ad1fceb8367',
  operating_system: 'c6af69e1287659f160d38c5194221e55081d7cec',
  event_type: '1bcb4f1e92d4add82f1e71254913bde0063b99b0',
  last_visited_on: '937a29aadcfc5a4c8d019712d64c2de19df1d0fa',
  visited_pages: '1eeecc0ef962b8b79d5da5c0fea6148c86d97380',
  session_duration: 'cff9425cb26b594ad315d1afe09308c1766d42aa',
  ip_address: '511d65babf591015ec6be0b58434327933c6f703'
};

function mapToPipedriveFields(trackingData) {
  const pipedriveData = {};
  
  for (const [ourKey, pipedriveKey] of Object.entries(FIELD_MAPPING)) {
    if (['name', 'email', 'first_name', 'last_name'].includes(ourKey)) {
      continue;
    }
    
    if (trackingData.hasOwnProperty(ourKey) && trackingData[ourKey] !== null && trackingData[ourKey] !== undefined) {
      const value = String(trackingData[ourKey]).trim();
      if (value !== '' && value !== 'null' && value !== 'undefined') {
        pipedriveData[pipedriveKey] = value;
      }
    }
  }
  
  return pipedriveData;
}

async function recoverLead(eventId) {
  console.log(`\n🔧 RECOVERING STUCK LEAD - Event ID: ${eventId}\n`);
  console.log('='.repeat(80));
  
  // Fetch complete event data
  const query = `
    SELECT 
      e.id, e.visitor_id, e.session_id, e.pixel_id, e.project_id,
      e.page_url, e.referrer_url, e.page_title, e.user_agent,
      e.country, e.region, e.city, e.ip_address,
      e.utm_source, e.utm_medium, e.utm_campaign, e.utm_content, e.utm_term,
      e.gclid, e.fbclid, e.msclkid, e.ttclid, e.twclid, e.li_fat_id, e.sc_click_id,
      e.campaign_region, e.ad_group, e.ad_id, e.search_query,
      e.form_data,
      e.pipedrive_sync_status,
      e.pipedrive_person_id,
      v.last_seen as visitor_last_seen,
      s.started_at as session_started_at,
      s.last_activity as session_last_activity
    FROM tracking_events e
    LEFT JOIN visitors v ON e.visitor_id = v.id
    LEFT JOIN sessions s ON e.session_id = s.id
    WHERE e.id = ${eventId}
  `;
  
  const events = await executeD1Query(query);
  
  if (events.length === 0) {
    console.log(`❌ Event ${eventId} not found!`);
    return;
  }
  
  const event = events[0];
  const formData = JSON.parse(event.form_data || '{}');
  
  // Extract email and name
  const email = formData.email || formData.Email || formData.EMAIL || null;
  const first_name = formData.first_name || formData.firstName || formData['first-name'] || formData.FirstName || (formData.name ? formData.name.split(' ')[0] : null);
  const last_name = formData.last_name || formData.lastName || formData['last-name'] || formData.LastName || (formData.name && formData.name.split(' ').length > 1 ? formData.name.split(' ').slice(1).join(' ') : null);
  
  console.log(`\n📝 Lead Details:`);
  console.log(`   Email: ${email || 'NOT FOUND'}`);
  console.log(`   Name: ${first_name || ''} ${last_name || ''}`.trim() || 'NOT FOUND');
  console.log(`   Current Status: ${event.pipedrive_sync_status || 'NULL (pending)'}`);
  console.log(`   Person ID: ${event.pipedrive_person_id || 'N/A'}`);
  
  if (!email) {
    console.log(`\n❌ No email found - cannot sync!`);
    return;
  }
  
  // Search for person in Pipedrive
  console.log(`\n🔍 Searching Pipedrive...`);
  let personId = await searchPersonByEmail(email);
  let searchMethod = 'email';
  
  if (!personId && first_name && last_name) {
    personId = await searchPersonByName(first_name, last_name);
    searchMethod = 'name';
  }
  
  if (!personId) {
    console.log(`\n❌ Person not found in Pipedrive`);
    console.log(`   Email: ${email}`);
    console.log(`   Name: ${first_name} ${last_name}`);
    console.log(`\n💡 This person needs to be created manually in Pipedrive first.`);
    
    // Update database status
    const updateQuery = `
      UPDATE tracking_events 
      SET pipedrive_sync_status = 'not_found',
          pipedrive_sync_at = datetime('now')
      WHERE id = ${eventId}
    `;
    executeD1Query(updateQuery);
    console.log(`\n✅ Database updated: status = 'not_found'`);
    return;
  }
  
  console.log(`\n✅ Found person in Pipedrive: Person ID ${personId} (searched by ${searchMethod})`);
  
  // Build tracking data payload
  const trackingData = {
    event_id: String(event.id),
    visitor_id: event.visitor_id,
    session_id: event.session_id,
    pixel_id: event.pixel_id,
    project_id: event.project_id,
    email: email,
    first_name: first_name,
    last_name: last_name,
    page_url: event.page_url,
    page_title: event.page_title,
    referrer_url: event.referrer_url,
    country: event.country,
    region: event.region,
    city: event.city,
    ip_address: event.ip_address,
    utm_source: event.utm_source,
    utm_medium: event.utm_medium,
    utm_campaign: event.utm_campaign,
    utm_content: event.utm_content,
    utm_term: event.utm_term,
    gclid: event.gclid,
    fbclid: event.fbclid,
    msclkid: event.msclkid,
    ttclid: event.ttclid,
    twclid: event.twclid,
    li_fat_id: event.li_fat_id,
    sc_click_id: event.sc_click_id,
    campaign_region: event.campaign_region,
    ad_group: event.ad_group,
    ad_id: event.ad_id,
    search_query: event.search_query,
    user_agent: event.user_agent
  };
  
  // Map to Pipedrive fields
  const pipedriveData = mapToPipedriveFields(trackingData);
  
  console.log(`\n📤 Updating Pipedrive person...`);
  console.log(`   Fields to update: ${Object.keys(pipedriveData).length}`);
  
  const updateResult = await updatePipedrivePerson(personId, pipedriveData);
  
  if (updateResult.success) {
    console.log(`\n✅ SUCCESS! Person updated in Pipedrive`);
    
    // Update database
    const updateQuery = `
      UPDATE tracking_events 
      SET pipedrive_sync_status = 'synced',
          pipedrive_sync_at = datetime('now'),
          pipedrive_person_id = ${personId}
      WHERE id = ${eventId}
    `;
    executeD1Query(updateQuery);
    
    console.log(`\n✅ Database updated:`);
    console.log(`   Status: synced`);
    console.log(`   Person ID: ${personId}`);
    console.log(`   Synced At: ${new Date().toISOString()}`);
  } else {
    console.log(`\n❌ FAILED to update Pipedrive`);
    console.log(`   Error: ${updateResult.error || 'Unknown error'}`);
    
    // Update database with error status
    const updateQuery = `
      UPDATE tracking_events 
      SET pipedrive_sync_status = 'error',
          pipedrive_sync_at = datetime('now')
      WHERE id = ${eventId}
    `;
    executeD1Query(updateQuery);
    console.log(`\n✅ Database updated: status = 'error'`);
  }
  
  console.log(`\n`);
}

async function main() {
  const eventId = process.argv[2];
  
  if (!eventId) {
    console.log('Usage: node scripts/recover-stuck-lead.js <event_id>');
    console.log('Example: node scripts/recover-stuck-lead.js 2179');
    process.exit(1);
  }
  
  try {
    await recoverLead(parseInt(eventId));
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

