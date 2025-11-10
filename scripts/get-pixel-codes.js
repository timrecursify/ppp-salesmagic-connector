/**
 * Script to retrieve pixel codes for all projects
 * Run this after applying migration 0012_add_new_projects.sql
 * 
 * Usage:
 *   API_KEY=your-api-key node scripts/get-pixel-codes.js
 */

const API_BASE_URL = process.env.API_BASE_URL || 'https://pixel.salesmagic.us';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('❌ API_KEY environment variable is required');
  console.log('\nUsage:');
  console.log('  API_KEY=your-api-key node scripts/get-pixel-codes.js');
  process.exit(1);
}

async function makeRequest(url, method = 'GET') {
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(url, { method, headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${data.error || JSON.stringify(data)}`);
  }

  return data;
}

async function getPixelCodes() {
  try {
    console.log('🔍 Retrieving projects and pixels...\n');

    // Get all projects
    const projectsResponse = await makeRequest(`${API_BASE_URL}/api/projects`);
    
    if (!projectsResponse.success) {
      throw new Error('Failed to retrieve projects');
    }

    const projects = projectsResponse.data || [];
    
    // Filter to new projects
    const targetProjects = ['Desaas.io', 'Blackbowassociates', 'Cloud Nine', 'Miami Flowers'];
    const filteredProjects = projects.filter(p => targetProjects.includes(p.name));

    if (filteredProjects.length === 0) {
      console.log('⚠️  No projects found. Please run the migration first:');
      console.log('   npx wrangler d1 migrations apply ppp-tracking-db --env production --remote');
      return;
    }

    console.log(`✅ Found ${filteredProjects.length} projects\n`);
    console.log('='.repeat(80));
    console.log('PIXEL CODES FOR INSTALLATION');
    console.log('='.repeat(80));
    console.log('');

    for (const project of filteredProjects) {
      // Get project details with pixels
      const projectDetails = await makeRequest(`${API_BASE_URL}/api/projects/${project.id}`);
      
      if (!projectDetails.success || !projectDetails.data) {
        console.log(`⚠️  Could not retrieve details for ${project.name}`);
        continue;
      }

      const projectData = projectDetails.data;
      const pixels = projectData.pixels || [];

      console.log(`📦 Project: ${project.name}`);
      console.log(`   Project ID: ${project.id}`);
      
      // Parse configuration to show Pipedrive status
      try {
        const config = typeof projectData.configuration === 'string' 
          ? JSON.parse(projectData.configuration) 
          : projectData.configuration;
        console.log(`   Pipedrive Sync: ${config.pipedrive_enabled === false ? '❌ DISABLED' : '✅ ENABLED'}`);
      } catch (e) {
        // Ignore parse errors
      }
      
      console.log('');

      if (pixels.length === 0) {
        console.log('   ⚠️  No pixels found for this project');
        console.log('');
        continue;
      }

      for (const pixel of pixels) {
        console.log(`   🎯 Pixel: ${pixel.name}`);
        console.log(`      Pixel ID: ${pixel.id}`);
        console.log(`      Website: ${pixel.website_url || 'N/A'}`);
        console.log('');
        console.log('      Installation Code:');
        console.log('      ' + '-'.repeat(70));
        console.log(`      <script 
        src="https://pixel.salesmagic.us/static/pixel.js" 
        data-pixel-id="${pixel.id}" 
        async
></script>`);
        console.log('      ' + '-'.repeat(70));
        console.log('');
      }

      console.log('');
    }

    console.log('='.repeat(80));
    console.log('✅ Pixel codes retrieved successfully!');
    console.log('');
    console.log('Installation Instructions:');
    console.log('');
    console.log('1. Desaas.io:');
    console.log('   - Add pixel code to: https://desaas.io/start-now');
    console.log('   - Place before closing </body> tag');
    console.log('');
    console.log('2. Blackbowassociates:');
    console.log('   - Add pixel code to sign-up confirmation/success page');
    console.log('   - Track sign-up conversions (event_type: form_submit)');
    console.log('');
    console.log('3. Cloud Nine:');
    console.log('   - Add pixel code to: https://prccloudnine.com/#contacts');
    console.log('   - Place before closing </body> tag');
    console.log('   - Form fields tracked: project_date, select_service, budget, total_guests');
    console.log('');
    console.log('4. Miami Flowers:');
    console.log('   - Add pixel code to: https://miamiflowerstime.com/contact/');
    console.log('   - Place before closing </body> tag');
    console.log('   - Form fields tracked: event_type, services, budget, file_uploads');
    console.log('');
    console.log('All projects have Pipedrive sync DISABLED - data will only be stored in database.');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  getPixelCodes().catch(console.error);
}

export { getPixelCodes };

