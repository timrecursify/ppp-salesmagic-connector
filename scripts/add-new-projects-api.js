/**
 * Script to add new projects and pixels via API endpoints
 * Projects: Desaas.io, Blackbowassociates, Cloud Nine, Miami Flowers
 * All projects have Pipedrive sync disabled (pipedrive_enabled: false)
 * 
 * Usage:
 *   API_KEY=your-api-key node scripts/add-new-projects-api.js
 */

const API_BASE_URL = process.env.API_BASE_URL || 'https://pixel.salesmagic.us';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('❌ API_KEY environment variable is required');
  console.log('\nUsage:');
  console.log('  API_KEY=your-api-key node scripts/add-new-projects-api.js');
  console.log('  API_KEY=your-api-key API_BASE_URL=http://localhost:8787 node scripts/add-new-projects-api.js');
  process.exit(1);
}

// Projects configuration
const projects = [
  {
    name: 'Desaas.io',
    configuration: {
      description: 'Desaas.io website tracking - form submissions on start-now page',
      retention_days: 180,
      auto_cleanup: true,
      pipedrive_enabled: false,
      privacy_settings: {
        anonymize_ip: false,
        respect_dnt: true,
        cookie_consent_required: false
      },
      form_page: 'https://desaas.io/start-now',
      form_fields: []
    },
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://desaas.io',
        configuration: {
          description: 'Main Desaas.io website pixel',
          collect_performance: true,
          fallback_enabled: true,
          domains: ['desaas.io', 'www.desaas.io']
        }
      }
    ]
  },
  {
    name: 'Blackbowassociates',
    configuration: {
      description: 'Blackbowassociates.com tracking - sign-up conversions (no form)',
      retention_days: 180,
      auto_cleanup: true,
      pipedrive_enabled: false,
      privacy_settings: {
        anonymize_ip: false,
        respect_dnt: true,
        cookie_consent_required: false
      },
      form_page: null,
      form_fields: []
    },
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://blackbowassociates.com',
        configuration: {
          description: 'Blackbowassociates.com main website pixel - tracks sign-up conversions',
          collect_performance: true,
          fallback_enabled: true,
          domains: ['blackbowassociates.com', 'www.blackbowassociates.com']
        }
      }
    ]
  },
  {
    name: 'Cloud Nine',
    configuration: {
      description: 'Premium Romance Concierge Cloud Nine - form submissions on contact page',
      retention_days: 180,
      auto_cleanup: true,
      pipedrive_enabled: false,
      privacy_settings: {
        anonymize_ip: false,
        respect_dnt: true,
        cookie_consent_required: false
      },
      form_page: 'https://prccloudnine.com/#contacts',
      form_fields: ['project_date', 'select_service', 'budget', 'total_guests']
    },
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://prccloudnine.com',
        configuration: {
          description: 'Cloud Nine main website pixel',
          collect_performance: true,
          fallback_enabled: true,
          domains: ['prccloudnine.com', 'www.prccloudnine.com']
        }
      }
    ]
  },
  {
    name: 'Miami Flowers',
    configuration: {
      description: 'Miami Flowers Time - form submissions on contact page',
      retention_days: 180,
      auto_cleanup: true,
      pipedrive_enabled: false,
      privacy_settings: {
        anonymize_ip: false,
        respect_dnt: true,
        cookie_consent_required: false
      },
      form_page: 'https://miamiflowerstime.com/contact/',
      form_fields: ['event_type', 'services', 'budget', 'file_uploads']
    },
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://miamiflowerstime.com',
        configuration: {
          description: 'Miami Flowers main website pixel',
          collect_performance: true,
          fallback_enabled: true,
          domains: ['miamiflowerstime.com', 'www.miamiflowerstime.com']
        }
      }
    ]
  }
];

async function makeRequest(url, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  };

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${data.error || JSON.stringify(data)}`);
  }

  return data;
}

async function addProjects() {
  const results = [];

  for (const projectConfig of projects) {
    try {
      // Create project
      console.log(`\n📦 Creating project: ${projectConfig.name}...`);
      const projectResponse = await makeRequest(
        `${API_BASE_URL}/api/projects`,
        'POST',
        {
          name: projectConfig.name,
          configuration: projectConfig.configuration
        }
      );

      if (!projectResponse.success) {
        throw new Error(projectResponse.error || 'Failed to create project');
      }

      const projectId = projectResponse.data.id;
      console.log(`✅ Created project: ${projectConfig.name} (ID: ${projectId})`);

      // Create pixels for this project
      const pixelResults = [];
      for (const pixelConfig of projectConfig.pixels) {
        console.log(`  🎯 Creating pixel: ${pixelConfig.name}...`);
        const pixelResponse = await makeRequest(
          `${API_BASE_URL}/api/projects/${projectId}/pixels`,
          'POST',
          {
            name: pixelConfig.name,
            website_url: pixelConfig.website_url,
            configuration: pixelConfig.configuration
          }
        );

        if (!pixelResponse.success) {
          throw new Error(pixelResponse.error || 'Failed to create pixel');
        }

        const pixelId = pixelResponse.data.id;
        console.log(`  ✅ Created pixel: ${pixelConfig.name} (ID: ${pixelId})`);

        pixelResults.push({
          pixel_id: pixelId,
          pixel_name: pixelConfig.name,
          website_url: pixelConfig.website_url
        });
      }

      results.push({
        project_id: projectId,
        project_name: projectConfig.name,
        pixels: pixelResults
      });

    } catch (error) {
      if (error.message?.includes('already exists') || error.message?.includes('409')) {
        console.log(`⚠️  Project ${projectConfig.name} already exists, skipping...`);
      } else {
        console.error(`❌ Error creating project ${projectConfig.name}:`, error.message);
        throw error;
      }
    }
  }

  return results;
}

// Main execution
async function main() {
  try {
    console.log('🚀 Adding new projects and pixels via API...');
    console.log(`📍 API Base URL: ${API_BASE_URL}`);
    console.log('');

    const results = await addProjects();

    console.log('\n✅ All projects and pixels created successfully!\n');
    console.log('='.repeat(80));
    console.log('PIXEL CODES FOR INSTALLATION');
    console.log('='.repeat(80));
    console.log('');

    for (const project of results) {
      console.log(`📦 Project: ${project.project_name}`);
      console.log(`   Project ID: ${project.project_id}`);
      console.log('');

      for (const pixel of project.pixels) {
        console.log(`   🎯 Pixel: ${pixel.pixel_name}`);
        console.log(`      Pixel ID: ${pixel.pixel_id}`);
        console.log(`      Website: ${pixel.website_url}`);
        console.log('');
        console.log('      Installation Code:');
        console.log('      ' + '-'.repeat(70));
        console.log(`      <script 
        src="https://pixel.salesmagic.us/static/pixel.js" 
        data-pixel-id="${pixel.pixel_id}" 
        async
></script>`);
        console.log('      ' + '-'.repeat(70));
        console.log('');
      }

      console.log('');
    }

    console.log('='.repeat(80));
    console.log('✅ Setup complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Copy the pixel code above for each website');
    console.log('2. Add the script tag to the appropriate pages:');
    console.log('   - Desaas.io: Add to https://desaas.io/start-now (form submission page)');
    console.log('   - Blackbowassociates: Add to sign-up confirmation page');
    console.log('   - Cloud Nine: Add to https://prccloudnine.com/#contacts (form page)');
    console.log('   - Miami Flowers: Add to https://miamiflowerstime.com/contact/ (form page)');
    console.log('3. Test tracking by submitting a form or triggering a conversion');
    console.log('4. Verify data is being collected in the database');
    console.log('5. Verify Pipedrive sync is disabled (no data sent to Pipedrive)');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { addProjects, projects };

