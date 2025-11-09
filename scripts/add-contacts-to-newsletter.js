#!/usr/bin/env node

/**
 * Add Contacts to Newsletter Bot
 * Adds the 6 contacts that are NOT in Pipedrive to the newsletter mailing list
 * 
 * Requirements:
 * - NEWSLETTER_AUTH_TOKEN environment variable must be set (or use Cloudflare secret)
 * - Newsletter bot API endpoint: https://ppp-newsletter.tim-611.workers.dev/api/contacts/bulk
 */

const contacts = [
  {
    email: 'adlbertburr@gmail.com',
    first_name: 'Dalbert', // Extracted from page URL
    wedding_date: getDefaultWeddingDate() // Default: 1 year from now
  },
  {
    email: 'collinsc42@yahoo.com',
    first_name: 'CHARLES',
    wedding_date: getDefaultWeddingDate()
  },
  {
    email: 'anitaevette@gmail.com',
    first_name: 'Carl',
    wedding_date: getDefaultWeddingDate()
  },
  {
    email: 'okwedding98@gmail.com',
    first_name: 'Olivia',
    wedding_date: getDefaultWeddingDate()
  },
  {
    email: 'keegan712@yahoo.com',
    first_name: 'Keegan', // No first name in form data, using email prefix
    wedding_date: getDefaultWeddingDate()
  },
  {
    email: 'bekyva@yahoo.com',
    first_name: 'Rebecca',
    wedding_date: getDefaultWeddingDate()
  }
];

/**
 * Get default wedding date (1 year from today)
 * Format: YYYY-MM-DD
 */
function getDefaultWeddingDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().split('T')[0];
}

async function addContactsToNewsletter() {
  const apiKey = process.env.NEWSLETTER_AUTH_TOKEN || process.env.ZAPIER_AUTH_TOKEN; // Support both for backward compatibility
  const apiUrl = 'https://ppp-newsletter.tim-611.workers.dev/api/contacts/bulk';

  if (!apiKey) {
    console.error('\n❌ ERROR: NEWSLETTER_AUTH_TOKEN environment variable is not set\n');
    console.error('Please set it with: export NEWSLETTER_AUTH_TOKEN="your-token-here"\n');
    console.error('Note: ZAPIER_AUTH_TOKEN is deprecated, use NEWSLETTER_AUTH_TOKEN instead\n');
    process.exit(1);
  }

  console.log('\n📧 Adding Contacts to Newsletter Bot\n');
  console.log('='.repeat(80));
  console.log(`\nAPI Endpoint: ${apiUrl}`);
  console.log(`Total Contacts: ${contacts.length}\n`);

  // Display contacts to be added
  console.log('Contacts to Add:');
  contacts.forEach((contact, index) => {
    console.log(`  ${index + 1}. ${contact.first_name} (${contact.email}) - Wedding: ${contact.wedding_date}`);
  });
  console.log('');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        contacts: contacts
      })
    });

    const responseText = await response.text();
    let result;

    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('❌ Failed to parse response:', responseText);
      process.exit(1);
    }

    if (!response.ok) {
      console.error(`\n❌ API Error: ${response.status} ${response.statusText}`);
      console.error('Response:', result);
      process.exit(1);
    }

    console.log('✅ Response from Newsletter Bot API:\n');
    console.log(JSON.stringify(result, null, 2));

    if (result.successful > 0) {
      console.log(`\n✅ Successfully added ${result.successful} contact(s) to newsletter`);
    }

    if (result.failed > 0) {
      console.log(`\n⚠️  Failed to add ${result.failed} contact(s)`);
      if (result.errors && result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach((error, index) => {
          console.log(`  ${index + 1}. ${error.email}: ${error.error}`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Newsletter Bot Update Complete\n');

  } catch (error) {
    console.error('\n❌ Error adding contacts to newsletter:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the script
addContactsToNewsletter();

