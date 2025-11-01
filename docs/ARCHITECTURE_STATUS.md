# Architecture & Status Documentation

## Current Architecture (January 2025)

### System Overview

Production tracking pixel system deployed on Cloudflare Workers with direct Pipedrive CRM integration.

### Technology Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono.js v3.12.0
- **Database**: Cloudflare D1 (SQLite)
- **Caching**: Cloudflare KV
- **Rate Limiting**: Durable Objects
- **CRM Integration**: Pipedrive API

### Architecture Components

#### 1. Client-Side (Browser)
- **File**: `src/static/pixel.js` v2.3.1
- **Size**: <2KB compressed
- **Features**:
  - Page-specific duplicate prevention via sessionStorage
  - Complete UTM parameter capture (source, medium, campaign, content, term)
  - Click ID capture (gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id)
  - Form data capture (first_name, last_name, email only)
  - Viewport and screen dimension capture
  - Referrer URL and page title capture
  - Error handling with HTTP status checking
  - Debug logging (localhost only)

#### 2. Server-Side (Cloudflare Worker)

**Services Layer** (`src/services/`)
- `utm.service.js` - UTM parameter extraction and attribution logic
- `visitor.service.js` - Visitor CRUD operations
- `session.service.js` - Session management with UTM attribution
- `pipedrive.service.js` - Pipedrive API client with field mapping
- `pipedrive-delayed.service.js` - Delayed sync service (7-minute delay)

**Routes Layer** (`src/routes/`)
- `tracking.js` - Main tracking endpoint (refactored with handler extraction)
- `analytics.js` - Analytics and reporting endpoints
  - `/metrics` - Performance metrics tracking endpoint (circuit breaker state, queue depth, system health)
  - `/stats/:pixelId` - Pixel-level statistics
  - `/project/:projectId/stats` - Project-level statistics
  - `/export/:pixelId` - Data export (JSON/CSV)
  - `/realtime/:pixelId` - Real-time analytics
  - `/debug/utm-analysis` - UTM parameter debugging
- `projects.js` - Project and pixel management

**Handlers Layer** (`src/handlers/`)
- `tracking.handlers.js` - Form data extraction, geographic data, event type determination
- `eventInsertion.handler.js` - Database event insertion logic
- `pipedriveSync.handler.js` - Pipedrive sync preparation and scheduling

**Utilities** (`src/utils/`)
- `cookies.js` - Cookie generation
- `browser.js` - Browser/device detection
- `url.js` - URL parameter extraction
- `workerLogger.js` - Structured logging
- `fetchWithRetry.js` - Fetch utility with timeout and exponential backoff retry
- `circuitBreaker.js` - Circuit breaker pattern for external API calls (prevents cascading failures)

**Middleware** (`src/middleware/`)
- `security.js` - Input validation, sanitization, form data filtering, bot detection, security headers
- `privacy.js` - IP extraction, privacy headers
- `rateLimit.js` - Rate limiting via Durable Objects (sharded by IP prefix)
- `auth.js` - API key authentication (uses workerLogger for production logging)

#### 3. Database (Cloudflare D1)

**Tables**:
- `projects` - Project configuration
- `pixels` - Pixel configuration per project
- `visitors` - Visitor tracking with cookie deduplication
- `sessions` - Session management with UTM attribution and click IDs
- `tracking_events` - Event storage with individual columns for click IDs

**Schema**:
- Click IDs stored as individual columns: `gclid`, `fbclid`, `msclkid`, `ttclid`, `twclid`, `li_fat_id`, `sc_click_id`
- Ad parameters: `campaign_region`, `ad_group`, `ad_id`, `search_query`
- Form data stored as JSON: `form_data` (first_name, last_name, email only)
- Pipedrive sync tracking: `pipedrive_sync_status`, `pipedrive_sync_at`, `pipedrive_person_id`

**Indexes**: Optimized for visitor lookup, session queries, and analytics
- Composite indexes for analytics queries (pixel_id + timestamp + archived)
- Performance indexes for UTM source queries and event type filtering
- Indexes for session queries by visitor_id and started_at (first-visit attribution)
- Migration 0009 adds additional performance indexes

#### 4. CRM Integration (Pipedrive)

**Service**: `src/services/pipedrive.service.js`

**Features**:
- Direct API integration with timeout protection (5s) and retry logic (max 2 retries)
- **Circuit breaker pattern** - Prevents cascading failures when Pipedrive API is down
  - Opens circuit after 5 consecutive failures
  - Automatically attempts recovery after 1 minute
  - Half-open state requires 2 successful calls before closing
- Exponential backoff retry strategy for failed requests
- Delayed sync (7-minute delay via KV storage) with **idempotency protection**
- Person search: email first, then name (first_name + last_name) if email not found
- Person matching only - does NOT create new persons
- Sync status tracking: `synced`, `not_found`, `error` (stored in database)
- Field mapping to 40+ Pipedrive Person custom fields
- Async delivery (non-blocking)
- Timeout protection in scheduled worker (30s max per sync operation)

**Field Mapping** (Updated January 27, 2025):
- Standard fields: name, email, first_name, last_name (search only, not updated)
- UTM parameters: utm_source, utm_medium, utm_campaign, utm_content, utm_term
- Click IDs: gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id
- Tracking IDs: event_id, visitor_id, session_id, pixel_id, project_id
- Page data: page_url, page_title, referrer_url
- Geographic: country, region, city, location (combined formatted string)
- Ad data: campaign_region, ad_group, ad_id, search_query
- Device/Browser: user_agent, screen_resolution, device_type, operating_system
- **New fields**:
  - `last_visited_on`: Human-readable date format (e.g., "January 27, 2025 at 2:30 PM")
  - `visited_pages`: Comma-separated list of all unique page URLs visited
  - `session_duration`: Formatted duration (e.g., "15 minutes" or "1h 23m")
  - `ip_address`: Visitor IP address from tracking event

**Field Mapping Fixes** (January 27, 2025):
- Fixed duplicate field IDs that were causing data to be written to wrong fields
- Verified all field IDs against Pipedrive API
- Corrected mappings for: project_id, page_url, page_title, session_id, ad_group, ad_id, msclkid

**Delayed Sync**:
- Form submissions stored in KV with 7-minute delay
- **Idempotency keys** prevent duplicate syncs if client retries form submission
  - Keys generated from event_id + email + timestamp hash
  - Stored in KV for 24 hours
  - Automatic duplicate detection and prevention
- Scheduled worker processes delayed syncs every 5 minutes
  - **Batch processing** with pagination support (50 items per batch)
  - Handles up to 10,000 keys per run with cursor-based pagination
  - Prevents memory issues in high-volume scenarios
- Allows form processing to complete before CRM update
- Sync status tracked in database: `pipedrive_sync_status` column
  - `synced`: Person found and updated successfully
  - `not_found`: Person not found by email or name (no action taken)
  - `error`: Error occurred during sync attempt
  - `NULL`: Sync pending (not yet processed)

### Data Flow

```
1. Visitor → Lands on website with UTM parameters
   ↓
2. pixel.js → Sends complete tracking data to /api/track
   ↓
3. Worker → Extracts UTM from page_url + referrer_url
   ↓
4. Worker → Creates/updates visitor (by cookie)
   ↓
5. Worker → Creates/updates session (with UTM attribution)
   ↓
6. Worker → Stores tracking event in D1 (individual columns)
   ↓
7. Worker → If form submission:
   ↓
   a. Prepares Pipedrive payload with all tracking data
   ↓
   b. Stores in KV for delayed sync (7-minute delay)
   ↓
   c. Scheduled worker processes delayed syncs
   ↓
   d. Searches Pipedrive by email (exact match)
   ↓
   e. If not found, searches by name (first_name + last_name)
   ↓
   f. If found: Updates existing Person with tracking data
   ↓
   g. If not found: Sets status to 'not_found' (no person created)
   ↓
   h. Updates database with sync status and person_id
   ↓
8. Returns success response (non-blocking)
```

### UTM Parameter Tracking Architecture

**Server-Side Extraction**:
- Primary source: `page_url` query parameters sent from client
- Fallback: `Referer` header for attribution recovery
- Single extraction utility: `src/services/utm.service.js`
- Complete capture: All UTM parameters (source, medium, campaign, content, term) and click IDs

**Attribution Logic**:
- Server-side first-visit attribution via session tracking
- No localStorage dependency (works in private browsing)
- Session-based attribution persistence across page views
- First-visit UTM preserved in session record

**Click ID Support**:
- Google Ads: `gclid`
- Facebook: `fbclid`
- Microsoft Ads: `msclkid`
- TikTok: `ttclid`
- Twitter: `twclid`
- LinkedIn: `li_fat_id`
- Snapchat: `sc_click_id`

### Environment Variables

```toml
# Production
PIPEDRIVE_API_KEY = "2bd2ab77ade376a3c1c64ae62f748feb5c8cf591"
ENVIRONMENT = "production"
LOG_LEVEL = "warn"
ARCHIVE_ENDPOINT = "https://pixel.salesmagic.us/api/archive"
ARCHIVE_DAYS = "180"
```

### Performance Metrics

- **API Response Time**: <50ms
- **Pixel Script Size**: <2KB compressed
- **Core Web Vitals Impact**: Zero (async, non-blocking)
- **Database Queries**: Optimized with indexes and reduced redundant queries
  - Visitor/session services return constructed objects instead of re-querying DB
  - Composite indexes for common analytics query patterns
- **Pipedrive Sync**: Async with 7-minute delay, timeout protection (30s)
- **External API Calls**: All fetch operations use timeout (5-10s) and retry logic with exponential backoff

### Security Features

- API key authentication for management endpoints
- Rate limiting via Durable Objects (sharded by IP prefix for load distribution)
  - Tracking endpoints: 100 requests/minute per IP
  - API endpoints: 1000 requests/hour per IP
  - Management endpoints: 100 requests/hour per IP
- Bot detection middleware (blocks crawlers, headless browsers, automated tools)
- Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- Input validation and sanitization
- Form data filtering (only first_name, last_name, email)
- Privacy headers (GDPR compliance)
- CORS configuration for tracking pixel
- SQL injection prevention (parameterized queries)
- Global error handler with structured logging (no error details leaked in production)

### Deployment

- **Platform**: Cloudflare Workers
- **Command**: `npx wrangler deploy --env production`
- **Database Migrations**: `npx wrangler d1 migrations apply ppp-tracking-db --env production`
- **Domain**: pixel.salesmagic.us
- **Scheduled Tasks**: Every 5 minutes (delayed Pipedrive syncs)

### Monitoring

- Cloudflare Workers Logs (100% sampling)
- Structured logging with workerLogger
- Error tracking and reporting
- Analytics endpoints for monitoring
- **Performance metrics endpoint** (`/api/analytics/metrics`) provides:
  - Database statistics (total events, visitors, sessions, pixels)
  - Recent activity (events and form submissions in last hour)
  - Pipedrive sync metrics (circuit breaker state, queue depth)
  - System health indicators (cache/database availability, environment)

### Recent Improvements (January 2025)

**Security Enhancements:**
- ✅ Middleware chain wired to tracking routes (security headers, bot detection, rate limiting)
- ✅ Rate limiter sharded by IP prefix (distributes load across multiple Durable Objects)
- ✅ Global error handler added for consistent error logging
- ✅ Auth middleware updated to use workerLogger (production-grade logging)

**Reliability Improvements:**
- ✅ Fetch utility with timeout and retry logic (`fetchWithRetry.js`)
- ✅ All Pipedrive API calls protected with 5s timeout and 2 retry attempts
- ✅ Archive endpoint protected with 10s timeout and retry logic
- ✅ Scheduled worker timeout protection (30s max per sync operation)
- ✅ **Circuit breaker pattern** implemented for Pipedrive API calls
  - Prevents cascading failures when external service is down
  - Automatic recovery with half-open state probing
  - Configurable failure threshold (5 failures) and reset timeout (60s)
- ✅ **Idempotency keys** for form submissions prevent duplicate Pipedrive syncs
  - Client retries handled gracefully
  - 24-hour idempotency window
  - Hash-based key generation for uniqueness

**Performance Optimizations:**
- ✅ Visitor/session services optimized (eliminated redundant DB queries after insert)
- ✅ Added composite performance indexes (Migration 0009)
- ✅ Tracking route refactored with handler extraction (reduced complexity from 583 to ~280 lines)
- ✅ **KV list operations optimized with batching**
  - Batch processing (50 items per batch) for delayed sync processing
  - Cursor-based pagination supports up to 10,000 keys per run
  - Prevents memory issues in high-volume scenarios
  - Small delays between batches prevent system overload

**Monitoring & Observability:**
- ✅ **Performance metrics endpoint** added (`/api/analytics/metrics`)
  - Real-time system health metrics
  - Circuit breaker state monitoring
  - Queue depth tracking
  - Database and cache availability checks
  - Recent activity statistics

**Code Quality:**
- ✅ Fixed duplicate migration numbering (0002_seed_initial_data.sql → 0008)
- ✅ Created handler modules for tracking event insertion and Pipedrive sync preparation
- ✅ Improved code maintainability and testability

### Status

✅ **Production Ready**
- All refactoring complete
- Pipedrive integration active with timeout/retry protection
- Form data capture restricted to email, first_name, last_name
- All UTM parameters and click IDs captured
- Delayed sync implemented (7-minute delay) with timeout protection
- Person search: email first, then name - no person creation
- Sync status tracking in database (synced/not_found/error)
- Code optimized, compact, and maintainable
- Security middleware fully implemented
- Performance indexes added for analytics queries
- External API calls protected with timeout and retry logic
