/**
 * Script to add new projects and pixels to the tracking system
 * Projects: Desaas.io, Blackbowassociates, Cloud Nine, Miami Flowers
 * All projects have Pipedrive sync disabled (pipedrive_enabled: false)
 */

import { createClient } from '@libsql/client';

// Generate UUID v4 format
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Projects configuration
const projects = [
  {
    name: 'Desaas.io',
    description: 'Desaas.io website tracking - form submissions on start-now page',
    website_url: 'https://desaas.io',
    form_page: 'https://desaas.io/start-now',
    pipedrive_enabled: false,
    retention_days: 180,
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://desaas.io',
        description: 'Main Desaas.io website pixel',
        domains: ['desaas.io', 'www.desaas.io']
      }
    ]
  },
  {
    name: 'Blackbowassociates',
    description: 'Blackbowassociates.com tracking - sign-up conversions (no form)',
    website_url: 'https://blackbowassociates.com',
    form_page: null, // No form - tracking sign-ups as conversion events
    pipedrive_enabled: false,
    retention_days: 180,
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://blackbowassociates.com',
        description: 'Blackbowassociates.com main website pixel - tracks sign-up conversions',
        domains: ['blackbowassociates.com', 'www.blackbowassociates.com']
      }
    ]
  },
  {
    name: 'Cloud Nine',
    description: 'Premium Romance Concierge Cloud Nine - form submissions on contact page',
    website_url: 'https://prccloudnine.com',
    form_page: 'https://prccloudnine.com/#contacts',
    pipedrive_enabled: false,
    retention_days: 180,
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://prccloudnine.com',
        description: 'Cloud Nine main website pixel',
        domains: ['prccloudnine.com', 'www.prccloudnine.com']
      }
    ],
    form_fields: [
      'project_date',
      'select_service',
      'budget',
      'total_guests'
    ]
  },
  {
    name: 'Miami Flowers',
    description: 'Miami Flowers Time - form submissions on contact page',
    website_url: 'https://miamiflowerstime.com',
    form_page: 'https://miamiflowerstime.com/contact/',
    pipedrive_enabled: false,
    retention_days: 180,
    pixels: [
      {
        name: 'main-website',
        website_url: 'https://miamiflowerstime.com',
        description: 'Miami Flowers main website pixel',
        domains: ['miamiflowerstime.com', 'www.miamiflowerstime.com']
      }
    ],
    form_fields: [
      'event_type',
      'services',
      'budget',
      'file_uploads'
    ]
  }
];

async function addProjects(client) {
  const results = [];
  
  for (const projectConfig of projects) {
    try {
      const projectId = generateUUID();
      
      // Create project configuration JSON
      const projectConfiguration = {
        description: projectConfig.description,
        retention_days: projectConfig.retention_days,
        auto_cleanup: true,
        pipedrive_enabled: projectConfig.pipedrive_enabled,
        privacy_settings: {
          anonymize_ip: false,
          respect_dnt: true,
          cookie_consent_required: false
        },
        form_page: projectConfig.form_page,
        form_fields: projectConfig.form_fields || []
      };
      
      // Insert project
      await client.execute({
        sql: `
          INSERT INTO projects (id, name, webhook_url, configuration)
          VALUES (?, ?, ?, ?)
        `,
        args: [
          projectId,
          projectConfig.name,
          null, // webhook_url is deprecated
          JSON.stringify(projectConfiguration)
        ]
      });
      
      console.log(`✅ Created project: ${projectConfig.name} (ID: ${projectId})`);
      
      // Create pixels for this project
      const pixelResults = [];
      for (const pixelConfig of projectConfig.pixels) {
        const pixelId = generateUUID();
        
        const pixelConfiguration = {
          description: pixelConfig.description,
          collect_performance: true,
          fallback_enabled: true,
          domains: pixelConfig.domains || []
        };
        
        await client.execute({
          sql: `
            INSERT INTO pixels (id, project_id, name, website_url, configuration)
            VALUES (?, ?, ?, ?, ?)
          `,
          args: [
            pixelId,
            projectId,
            pixelConfig.name,
            pixelConfig.website_url,
            JSON.stringify(pixelConfiguration)
          ]
        });
        
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
      if (error.message?.includes('UNIQUE constraint failed')) {
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
  // Check if running in Cloudflare Workers environment
  if (typeof process === 'undefined' || !process.env.DB_URL) {
    console.error('❌ This script must be run with database connection.');
    console.log('\nUsage:');
    console.log('  For local D1: npx wrangler d1 execute ppp-tracking-db --local --file=scripts/add-new-projects.js');
    console.log('  For remote D1: npx wrangler d1 execute ppp-tracking-db --remote --file=scripts/add-new-projects.js');
    console.log('\nOr use the API endpoints:');
    console.log('  POST /api/projects');
    console.log('  POST /api/projects/:projectId/pixels');
    process.exit(1);
  }
  
  const client = createClient({
    url: process.env.DB_URL
  });
  
  try {
    console.log('🚀 Adding new projects and pixels...\n');
    
    const results = await addProjects(client);
    
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
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { addProjects, projects };

