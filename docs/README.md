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
- `pixel.js` v2.3.1 - Tracking script
  - Page-specific duplicate prevention
  - Complete UTM and click ID capture
  - Form data capture (first_name, last_name, email only)
  - Viewport/screen data capture
  - Error handling with HTTP status checking

**Server-Side (Cloudflare Worker)**
- Services Layer: utm.service.js, visitor.service.js, session.service.js, pipedrive.service.js, pipedrive-delayed.service.js
- Routes Layer: tracking.js (refactored), analytics.js, projects.js
- Handlers Layer: tracking.handlers.js, eventInsertion.handler.js, pipedriveSync.handler.js
- Utilities: cookies.js, browser.js, url.js, workerLogger.js, fetchWithRetry.js
- Middleware: security.js, privacy.js, rateLimit.js (sharded), auth.js

**Data Storage**
- Cloudflare D1 (SQLite)
- Tables: projects, pixels, visitors, sessions, tracking_events
- Click IDs stored as individual columns
- Form data stored as JSON (restricted fields)

**CRM Integration**
- Pipedrive API (direct integration)
- Delayed sync via KV storage (7-minute delay)
- Person search: email first, then name (first_name + last_name)
- Person matching only - does NOT create new persons
- Sync status tracking: synced, not_found, error
- 40+ field mapping to custom fields

## Data Collection

- UTM parameters (source, medium, campaign, content, term)
- Platform click IDs (gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id)
- Browser/device information
- Session and visitor tracking with cookies
- Geographic location (IP-based via Cloudflare)
- Form submission data (first_name, last_name, email only)

## Privacy & Security

- GDPR compliance
- Cookie-based deduplication
- First-party cookies only
- Input validation and sanitization
- Form data filtering (restricted fields only)
- Server-side first-visit attribution
- Rate limiting via Durable Objects (sharded by IP prefix)
- Bot detection middleware (blocks crawlers and automated tools)
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- All external API calls protected with timeout and retry logic

## Pipedrive Integration

### Architecture
- Direct API integration
- Delayed sync (10-minute delay via KV)
- Person matching by email
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

### Integration Flow
```
Form Submission Event
    ↓
Extract form data (email, first_name, last_name)
    ↓
Store in KV with 7-minute delay
    ↓
Scheduled worker processes delayed syncs
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

## Recent Updates (January 2025)

### Security Enhancements
- ✅ Middleware chain wired to tracking routes (security headers, bot detection, rate limiting)
- ✅ Rate limiter sharded by IP prefix for load distribution
- ✅ Global error handler with structured logging
- ✅ Auth middleware updated to use production-grade logging

### Reliability Improvements
- ✅ Fetch utility with timeout and retry logic (`fetchWithRetry.js`)
- ✅ All Pipedrive API calls protected with 5s timeout and 2 retry attempts
- ✅ Archive endpoint protected with 10s timeout and retry logic
- ✅ Scheduled worker timeout protection (30s max per sync operation)

### Performance Optimizations
- ✅ Visitor/session services optimized (eliminated redundant DB queries)
- ✅ Added composite performance indexes (Migration 0009)
- ✅ Tracking route refactored with handler extraction (reduced from 583 to ~280 lines)

### Code Refactoring
- ✅ Services layer extracted business logic
- ✅ Handlers layer created for event insertion and Pipedrive sync
- ✅ Code reduction in main tracking route
- ✅ Utilities consolidation

### Pipedrive Integration
- ✅ Direct Pipedrive API integration with timeout/retry protection
- ✅ Delayed sync (7-minute delay) with timeout protection
- ✅ Person search: email first, then name - no person creation
- ✅ Sync status tracking in database (synced/not_found/error)
- ✅ Exponential backoff retry strategy for failed requests

### Form Data Capture
- Restricted to first_name, last_name, email only
- Comments and other fields excluded
- Form data sanitization in security middleware

### Pixel Enhancements
- Version 2.3.1
- Complete UTM parameter capture
- Click ID capture
- Error handling improvements
- Script selector robustness

### Database Schema
- Click IDs migrated from JSON to individual columns
- Improved query performance with composite indexes
- Form data stored as JSON (restricted fields)
- Pipedrive sync status tracking: pipedrive_sync_status, pipedrive_sync_at, pipedrive_person_id
- Migration 0009 adds performance indexes for analytics queries
- Migration 0010 adds Pipedrive sync status columns

## Project Context

- **Primary Project**: PPP (Precious Pics Pro)
- **Websites**: 3 different websites requiring tracking
- **CRM Integration**: Pipedrive (direct API integration)
- **Data Retention**: 180 days active, then archived
- **Deduplication**: Cookie-based visitor tracking

## Support

For technical details, see [ARCHITECTURE_STATUS.md](./ARCHITECTURE_STATUS.md).  
For system status and incidents, see [STATUS.md](./STATUS.md).
