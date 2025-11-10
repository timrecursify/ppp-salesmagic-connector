# New Projects Setup - Pixel Installation Guide

**Date:** January 27, 2025  
**Status:** ✅ Projects Created Successfully

## Overview

Four new projects have been added to the tracking system:
1. **Desaas.io** - Form submissions tracking
2. **Blackbowassociates** - Sign-up conversion tracking
3. **Cloud Nine** - Form submissions tracking
4. **Miami Flowers** - Form submissions tracking

**Important:** All new projects have **Pipedrive sync DISABLED** (`pipedrive_enabled: false`). Data will be stored in the database only, not sent to Pipedrive.

---

## Project Details

### 1. Desaas.io

**Project ID:** `desaas-0001-4000-8000-0000-000000000001`  
**Pixel ID:** `desaas-pixel-0001-4000-8000-0000-000000000001`  
**Website:** https://desaas.io  
**Form Page:** https://desaas.io/start-now

**Installation Code:**
```html
<script 
    src="https://pixel.salesmagic.us/static/pixel.js" 
    data-pixel-id="desaas-pixel-0001-4000-8000-0000-000000000001" 
    async
></script>
```

**Installation Instructions:**
- Add the script tag to: **https://desaas.io/start-now**
- Place before the closing `</body>` tag
- Tracks form submissions on the start-now page
- Collects all form fields automatically

---

### 2. Blackbowassociates

**Project ID:** `blackbow-0001-4000-8000-0000-000000000002`  
**Pixel ID:** `blackbow-pixel-0001-4000-8000-0000-000000000002`  
**Website:** https://blackbowassociates.com  
**Form Page:** None (tracks sign-up conversions)

**Installation Code:**
```html
<script 
    src="https://pixel.salesmagic.us/static/pixel.js" 
    data-pixel-id="blackbow-pixel-0001-4000-8000-0000-000000000002" 
    async
></script>
```

**Installation Instructions:**
- Add the script tag to: **Sign-up confirmation/success page**
- Place before the closing `</body>` tag
- Tracks sign-up conversions (event_type: `form_submit`)
- No form fields - conversion tracking only

---

### 3. Cloud Nine

**Project ID:** `cloudnine-0001-4000-8000-0000-000000000003`  
**Pixel ID:** `cloudnine-pixel-0001-4000-8000-0000-000000000003`  
**Website:** https://prccloudnine.com  
**Form Page:** https://prccloudnine.com/#contacts

**Installation Code:**
```html
<script 
    src="https://pixel.salesmagic.us/static/pixel.js" 
    data-pixel-id="cloudnine-pixel-0001-4000-8000-0000-000000000003" 
    async
></script>
```

**Installation Instructions:**
- Add the script tag to: **https://prccloudnine.com/#contacts**
- Place before the closing `</body>` tag
- Tracks form submissions on contact page
- **ALL form fields automatically captured** (no field list needed)
- Examples: `project_date`, `select_service`, `budget`, `total_guests`, plus any other fields on the form

---

### 4. Miami Flowers

**Project ID:** `miamiflowers-0001-4000-8000-0000-000000000004`  
**Pixel ID:** `miamiflowers-pixel-0001-4000-8000-0000-000000000004`  
**Website:** https://miamiflowerstime.com  
**Form Page:** https://miamiflowerstime.com/contact/

**Installation Code:**
```html
<script 
    src="https://pixel.salesmagic.us/static/pixel.js" 
    data-pixel-id="miamiflowers-pixel-0001-4000-8000-0000-000000000004" 
    async
></script>
```

**Installation Instructions:**
- Add the script tag to: **https://miamiflowerstime.com/contact/**
- Place before the closing `</body>` tag
- Tracks form submissions on contact page
- **ALL form fields automatically captured** (no field list needed)
- Examples: `event_type`, `services`, `budget`, `file_uploads`, plus any other fields on the form

---

## Data Collection

All projects collect the same comprehensive tracking data:

### Standard Tracking Data
- ✅ UTM parameters (source, medium, campaign, content, term)
- ✅ Click IDs (gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id)
- ✅ Visitor information (cookie-based deduplication)
- ✅ Session tracking (first-visit attribution)
- ✅ Device information (browser, OS, screen resolution)
- ✅ Geographic location (country, region, city)
- ✅ Page data (URL, title, referrer)
- ✅ Viewport and screen dimensions
- ✅ Form data (ALL form fields automatically captured)

### Form Data Capture

**✅ ALL FORM FIELDS ARE AUTOMATICALLY CAPTURED**

The pixel.js (v2.4.0) automatically captures **ALL form fields** on the page, including:

- **Text inputs** - All text fields captured
- **Textareas** - All textarea content captured  
- **Select dropdowns** - Selected values captured
- **Checkboxes** - Checked state captured (`true`/`false`)
- **Date fields** - Date values captured
- **Email fields** - Email addresses captured
- **Tel fields** - Phone numbers captured
- **Number fields** - Numeric values captured
- **Radio buttons** - Selected value captured
- **File uploads** - File names/metadata captured (not file contents)

**How it works:**
1. Pixel scans the page for all `<form>` elements
2. On form submit, captures ALL fields: `input`, `textarea`, `select`
3. Stores field values in a JSON object
4. Sends complete form data to tracking endpoint
5. Server stores form data as JSON string in `form_data` column

**Field Name Normalization:**
- Hyphens converted to underscores (`first-name` → `first_name`)
- Case-insensitive matching
- Common variations handled (`email`, `Email`, `EMAIL`, etc.)
- Component IDs normalized (`input_comp-kfmqou8s` → `input_comp_kfmqou8s`)

**Storage Format:**
Form data is stored as **JSON string** in the `form_data` column:
```json
{
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "project_date": "2025-06-15",
  "select_service": "Wedding",
  "budget": "$6,000 - $10,000",
  "total_guests": "50+",
  "event_type": "Wedding",
  "services": "Design, Decorations, Florals",
  "budget": "$10,000+",
  "custom_field_1": "value",
  "custom_field_2": "value",
  ...
}
```

**No field list needed** - The pixel automatically discovers and captures all fields!

---

## Pipedrive Sync Status

**⚠️ IMPORTANT:** All new projects have **Pipedrive sync DISABLED**.

- ✅ Data is stored in Cloudflare D1 database
- ✅ All tracking data is collected and stored
- ❌ Data is **NOT** sent to Pipedrive
- ❌ No Pipedrive API calls are made

This can be changed later by updating the project configuration:
```json
{
  "pipedrive_enabled": true
}
```

---

## Testing

After installation, test tracking by:

1. **Desaas.io:**
   - Visit https://desaas.io/start-now
   - Submit the form
   - Check database for tracking event

2. **Blackbowassociates:**
   - Complete sign-up process
   - Visit confirmation page with pixel
   - Check database for conversion event

3. **Cloud Nine:**
   - Visit https://prccloudnine.com/#contacts
   - Submit the contact form
   - Check database for tracking event with form data

4. **Miami Flowers:**
   - Visit https://miamiflowerstime.com/contact/
   - Submit the contact form
   - Check database for tracking event with form data

### Verify Tracking

Query the database to verify events are being tracked:
```sql
SELECT 
    te.id,
    te.event_type,
    te.page_url,
    te.created_at,
    p.name as project_name,
    px.name as pixel_name
FROM tracking_events te
JOIN projects p ON te.project_id = p.id
JOIN pixels px ON te.pixel_id = px.id
WHERE p.name IN ('Desaas.io', 'Blackbowassociates', 'Cloud Nine', 'Miami Flowers')
ORDER BY te.created_at DESC
LIMIT 10;
```

---

## Technical Details

### Project Configuration

All projects have the following configuration:
```json
{
  "description": "Project description",
  "retention_days": 180,
  "auto_cleanup": true,
  "pipedrive_enabled": false,
  "privacy_settings": {
    "anonymize_ip": false,
    "respect_dnt": true,
    "cookie_consent_required": false
  },
  "form_page": "URL to form page",
  "form_fields": ["list", "of", "expected", "fields"]
}
```

### Pixel Configuration

All pixels have the following configuration:
```json
{
  "description": "Pixel description",
  "collect_performance": true,
  "fallback_enabled": true,
  "domains": ["domain.com", "www.domain.com"]
}
```

---

## Code Changes Made

### 1. Tracking Route Update
**File:** `src/routes/tracking.js`

Added project configuration check to disable Pipedrive sync:
- Checks `pipedrive_enabled` flag in project configuration
- Defaults to `true` for backward compatibility (PPP project)
- Skips Pipedrive sync if `pipedrive_enabled: false`

### 2. Database Migration
**File:** `migrations/0012_add_new_projects.sql`

Created migration to add:
- 4 new projects with `pipedrive_enabled: false`
- 4 pixels (one per project)
- Proper configuration JSON for each project

---

## Next Steps

1. ✅ Projects and pixels created
2. ✅ Pixel codes generated
3. ⏳ **Install pixel codes on websites** (see installation instructions above)
4. ⏳ Test tracking on each website
5. ⏳ Verify data collection in database
6. ⏳ Monitor tracking events

---

## Support

For issues or questions:
- Check Cloudflare Workers logs: `npx wrangler tail --env production`
- Query database for tracking events
- Verify pixel is loading: Check browser console for `[PPP Tracker]` logs
- Test pixel endpoint: `https://pixel.salesmagic.us/static/pixel.js`

---

**Last Updated:** January 27, 2025  
**Migration Applied:** ✅ Migration 0012_add_new_projects.sql

