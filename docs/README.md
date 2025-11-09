# Custom Website Tracking Pixel System

## Project Overview

Lightweight website tracking pixel system that collects visitor UTM parameters and browser/device data, stores it in Cloudflare D1 database, and syncs directly to Pipedrive CRM.

## Documentation

- **[ARCHITECTURE_STATUS.md](./ARCHITECTURE_STATUS.md)** - Complete system architecture and technical details
- **[STATUS.md](./STATUS.md)** - Current system status, incident reports, and health metrics

## Quick Start

### Deployment

```bash
# Deploy to production
npx wrangler deploy --env production

# Apply database migrations
npx wrangler d1 migrations apply ppp-tracking-db --env production --remote
```

### Infrastructure

- **Platform**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Caching**: Cloudflare KV
- **Rate Limiting**: Durable Objects
- **Domain**: pixel.salesmagic.us
- **Performance**: <50ms response time

### Key Technologies

- **Backend**: Cloudflare Workers (JavaScript ES2022), Hono.js
- **Frontend**: Vanilla JavaScript (ES5 compatible)
- **Database**: Cloudflare D1 (SQLite)
- **Integration**: Pipedrive API (direct integration)

## Architecture Overview

```
Website Visitor → JavaScript Pixel → Cloudflare Worker → D1 Database → Pipedrive API
```

### Component Architecture

**Client-Side (Browser)**
- `pixel.js` v2.4.0 - Tracking script
  - Page-specific duplicate prevention
  - Complete UTM and click ID capture
  - Form data capture (ALL form fields with normalization)
  - Viewport/screen data capture
  - Error handling with HTTP status checking
  - Optional newsletter signup via captured form data or URL parameters

**Server-Side (Cloudflare Worker)**
- Services Layer: utm.service.js, visitor.service.js, session.service.js, pipedrive.service.js, pipedrive-delayed.service.js, newsletter.service.js
- Routes Layer: tracking.js (refactored), analytics.js, projects.js
- Handlers Layer: tracking.handlers.js, eventInsertion.handler.js, pipedriveSync.handler.js
- Utilities: cookies.js, browser.js, url.js, workerLogger.js, fetchWithRetry.js
- Middleware: security.js, privacy.js, rateLimit.js (sharded), auth.js

**Data Storage**
- Cloudflare D1 (SQLite)
- Tables: projects, pixels, visitors, sessions, tracking_events
- Click IDs stored as individual columns
- Form data stored as JSON (all captured fields, sanitized)

**CRM Integration**
- Pipedrive API (direct integration)
- Delayed sync via KV storage (7-minute delay, retries via scheduled Worker)
- Person search: email first, then name (first_name + last_name)
- Person matching only - does NOT create new persons
- Sync status tracking: synced, not_found, error
- 40+ field mapping to custom fields
- Newsletter automation triggered alongside form submissions (non-blocking)

## Data Collection

- UTM parameters (source, medium, campaign, content, term)
- Platform click IDs (gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id)
- Browser/device information
- Session and visitor tracking with cookies
- Geographic location (IP-based via Cloudflare)
- Form submission data (ALL fields captured and sanitized)

## Privacy & Security

- GDPR compliance
- Cookie-based deduplication
- First-party cookies only
- Input validation and sanitization
- Form data filtering with XSS protection
- Server-side first-visit attribution
- Rate limiting via Durable Objects (sharded by IP prefix)
- Bot detection middleware (blocks crawlers and automated tools)
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- All external API calls protected with timeout and retry logic

## Pipedrive Integration

### Architecture
- Direct API integration
- Delayed sync (7-minute delay via KV, with scheduled retries for resilience)
- Person matching by email, fallback to name
- Field mapping to 40+ Pipedrive Person custom fields

### Field Mapping
- Standard fields: name, email, first_name, last_name (search only)
- UTM parameters: utm_source, utm_medium, utm_campaign, utm_content, utm_term
- Click IDs: gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id
- Tracking IDs: event_id, visitor_id, session_id, pixel_id, project_id
- Page data: page_url, page_title, referrer_url
- Geographic: country, region, city
- Ad data: campaign_region, ad_group, ad_id, search_query
- Device/Browser: user_agent, screen_resolution, device_type, operating_system
- Additional fields: last_visited_on, visited_pages, session_duration, ip_address

### Integration Flow
```
Form Submission Event
    ↓
Extract form data (email + additional normalized fields)
    ↓
Store in KV with 7-minute delay
    ↓
Scheduled worker processes delayed syncs & retries
    ↓
Map to Pipedrive Person format
    ↓
Search Pipedrive by email (exact match)
    ↓
If not found, search by name (first_name + last_name)
    ↓
If found: Update existing Person with tracking data
    ↓
If not found: Set status to 'not_found' (no person created)
    ↓
Update database with sync status and person_id
    ↓
All tracking data synced to Pipedrive custom fields
```

## Recent Updates (November 2025)

### Architecture Simplification
- Removed redundant database reads in Pipedrive sync handler (UTMs sourced directly from request payload)
- Hardened newsletter integration with wedding date parsing and logging
- Increased observability across delayed sync pipeline (KV inspection, retries)

### Production Hardening
- Structured logging across routes/services (no `console.log`)
- KV TTL safeguards and retry backoff for delayed syncs
- Circuit breaker for Pipedrive API + timeout-protected fetches
- Rate limiting via Durable Objects with sharding

### Form Data Capture
- Captures ALL form fields with normalization and sanitization
- Email required for CRM interaction; names inferred or parsed when present
- Supports URL-parameter-only submissions for newsletter opt-in without creating false form submissions

## Project Context

- **Primary Project**: PPP (Precious Pics Pro)
- **Websites**: 3 different websites requiring tracking
- **CRM Integration**: Pipedrive (direct API integration)
- **Data Retention**: 180 days active, then archived
- **Deduplication**: Cookie-based visitor tracking

## Support

For technical details, see [ARCHITECTURE_STATUS.md](./ARCHITECTURE_STATUS.md).  
For system status and incidents, see [STATUS.md](./STATUS.md).
