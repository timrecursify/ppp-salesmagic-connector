# PPP Tracking Pixel System

## 🚨 CRITICAL DEPLOYMENT INSTRUCTIONS

**ALWAYS deploy with the production environment:**

```bash
# ✅ CORRECT - Includes database binding
npx wrangler deploy --env production

# ❌ WRONG - Missing database binding
npx wrangler deploy
```

**Verify deployment includes bindings:**
- D1 Databases: `DB: ppp-tracking-db`
- KV Namespaces: `CACHE`
- Durable Objects: `RATE_LIMITER`

**Configure secrets before deployment:**
```bash
wrangler secret put PIPEDRIVE_API_KEY
wrangler secret put NEWSLETTER_AUTH_TOKEN
```

**Test after deployment:**
```bash
curl -s "https://pixel.salesmagic.us/api/track/debug/recent" | jq '.debug_info'
```

---

## Project Overview

Production-grade website tracking pixel system for PPP (Precious Pics Pro) project. Built on Cloudflare Workers with direct Pipedrive CRM integration.

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

- **Backend**: Cloudflare Workers (JavaScript ES2022), Hono.js v3.12.0
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
  - Enhanced form data capture (ALL form fields)
  - Viewport/screen data capture
  - Error handling with HTTP status checking

**Server-Side (Cloudflare Worker)**
- Services Layer: utm.service.js, visitor.service.js, session.service.js, pipedrive.service.js, pipedrive-delayed.service.js, newsletter.service.js
- Routes Layer: tracking.js (refactored), analytics.js, projects.js
- Handlers Layer: tracking.handlers.js, eventInsertion.handler.js, pipedriveSync.handler.js
- Utilities: cookies.js, browser.js, url.js, workerLogger.js, fetchWithRetry.js, circuitBreaker.js
- Middleware: security.js, privacy.js, rateLimit.js (sharded), auth.js

**Data Storage**
- Cloudflare D1 (SQLite)
- Tables: projects, pixels, visitors, sessions, tracking_events
- Click IDs stored as individual columns
- Form data stored as JSON (ALL fields captured)
- Email field required for Pipedrive sync (extracted from form_data JSON)
- Pipedrive sync tracking: `pipedrive_sync_status`, `pipedrive_sync_at`, `pipedrive_person_id`

**CRM Integration**
- Pipedrive API (direct integration)
- Delayed sync via KV storage (7-minute delay)
- Person search: email first, then name (first_name + last_name)
- Person matching only - does NOT create new persons
- Sync status tracking: synced, not_found, error
- Field mapping to 40+ Pipedrive Person custom fields
- Async delivery (non-blocking)

## Data Collection

- UTM parameters (source, medium, campaign, content, term)
- Platform click IDs (gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id)
- Browser/device information
- Session and visitor tracking with cookies
- Geographic location (IP-based via Cloudflare)
- Form submission data (ALL form fields captured and sanitized)

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

## Documentation

- **[docs/ARCHITECTURE_STATUS.md](./docs/ARCHITECTURE_STATUS.md)** - Complete system architecture and technical details
- **[docs/STATUS.md](./docs/STATUS.md)** - Current system status, incident reports, and health metrics

## Support

For technical details, see [docs/ARCHITECTURE_STATUS.md](./docs/ARCHITECTURE_STATUS.md).  
For system status and incidents, see [docs/STATUS.md](./docs/STATUS.md).
