# Architecture & Status Documentation

## Current Architecture (November 2025)

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
- **File**: `src/static/pixel.js` v2.4.0
- **Size**: <2KB compressed
- **Features**:
  - Page-specific duplicate prevention via sessionStorage
  - Complete UTM parameter capture (source, medium, campaign, content, term)
  - Click ID capture (gclid, fbclid, msclkid, ttclid, twclid, li_fat_id, sc_click_id)
  - **Enhanced form data capture**: ALL form fields (text inputs, textareas, selects, checkboxes, dates)
  - Field name normalization (hyphens to underscores, case-insensitive matching)
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
- `newsletter.service.js` - Newsletter bot integration (automatic signup for form submissions)

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
  - **Simplified (November 2025)**: Uses `utmData`/`attribution` parameters directly instead of querying database
  - Eliminates race conditions and reduces database queries
  - Only queries database for visitor/session/page data needed for Pipedrive fields

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
- Form data stored as JSON: `form_data` (ALL form fields captured - text, textarea, select, checkbox, date, etc.)
- Email field required for Pipedrive sync (extracted from form_data JSON)
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

**Field Mapping** (Updated November 2025):
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

**Field Mapping Fixes** (November 2025):
- Fixed duplicate field IDs that were causing data to be written to wrong fields
- Verified all field IDs against Pipedrive API
- Corrected mappings for: project_id, page_url, page_title, session_id, ad_group, ad_id, msclkid

**Delayed Sync**:
- Form submissions stored in KV with 7-minute delay (allows website form processing time ~5 minutes)
- **Idempotency keys** prevent duplicate syncs if client retries form submission
  - Keys generated from event_id + email + timestamp hash
  - Stored in KV for 24 hours
  - Automatic duplicate detection and prevention
- Scheduled worker processes delayed syncs every 5 minutes
  - **Batch processing** with pagination support (50 items per batch)
  - Handles up to 10,000 keys per run with cursor-based pagination
  - Prevents memory issues in high-volume scenarios
- Allows form processing to complete before CRM update
- **Simplified Data Flow (November 2025)**:
  - UTM parameters, click IDs, and ad data come from request parameters (same source as database)
  - No redundant database queries for tracking data
  - Only queries database for visitor/session/page aggregates needed for Pipedrive fields
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
   c. Triggers newsletter signup (non-blocking, non-critical)
   ↓
   d. Scheduled worker processes delayed syncs
   ↓
   e. Searches Pipedrive by email (exact match)
   ↓
   f. If not found, searches by name (first_name + last_name)
   ↓
   g. If found: Updates existing Person with tracking data
   ↓
   h. If not found: Sets status to 'not_found' (no person created)
   ↓
   i. Updates database with sync status and person_id
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
# Configure this via `wrangler secret put PIPEDRIVE_API_KEY`
ENVIRONMENT = "production"
LOG_LEVEL = "warn"
ARCHIVE_ENDPOINT = "https://pixel.salesmagic.us/api/archive"
ARCHIVE_DAYS = "180"
NEWSLETTER_API_URL = "https://ppp-newsletter.tim-611.workers.dev/api/contacts"
NEWSLETTER_AUTH_TOKEN = "[Cloudflare Secret]"
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
  - **Parameter validation**: Rate limiter `limit` and `window` parameters validated and clamped (prevents DoS)
- Bot detection middleware (blocks crawlers, headless browsers, automated tools)
- Security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- Input validation and sanitization
  - **Enhanced validation**: All `parseInt()` calls validated with `isNaN()` checks
  - **Parameter bounds**: Date ranges clamped (1-365 days), export limits clamped (1-10000)
  - **JSON parsing**: Error handling added for browser/device data parsing
- Form data sanitization (ALL fields captured with XSS protection, email required for Pipedrive sync)
- Privacy headers (GDPR compliance)
- CORS configuration for tracking pixel
- SQL injection prevention (parameterized queries) - **Verified secure**: All queries use `.bind()` method
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

**New Projects & Pipedrive Sync Configuration (January 27, 2025):**
- ✅ **Project-Level Pipedrive Sync Control**: Added `pipedrive_enabled` flag in project configuration
  - Defaults to `true` for backward compatibility (PPP project continues syncing)
  - Can be set to `false` to disable Pipedrive sync for specific projects
  - Checked in tracking route before scheduling Pipedrive sync
- ✅ **New Projects Added**: 4 new projects created (Desaas.io, Blackbowassociates, Cloud Nine, Miami Flowers)
  - All new projects have `pipedrive_enabled: false`
  - Data stored in database only, not sent to Pipedrive
  - Full tracking data collection (UTM, visitor, device, location, form data)
- ✅ **Form Data Storage**: Confirmed all form fields automatically captured and stored as JSON
  - Form data stored in `form_data` column as JSON string
  - Pixel.js v2.4.0 captures ALL form fields automatically
  - No field list configuration needed
  - Field name normalization (hyphens → underscores, case-insensitive)
- ✅ **Documentation**: Created comprehensive guides for new projects and form data storage
  - `docs/NEW_PROJECTS_SETUP.md`: Installation guide with pixel codes
  - `docs/FORM_DATA_STORAGE.md`: Architecture documentation for form data storage

**Files Modified:**
- `src/routes/tracking.js`: Added project configuration check for `pipedrive_enabled` flag
- `migrations/0012_add_new_projects.sql`: NEW - Adds 4 projects with proper configuration

### Recent Improvements (November 2025)

**Critical Bug Fixes (November 7, 2025):**
- ✅ **Fixed expired KV entry handling**: Updated `pipedrive-delayed.service.js` to update database status when KV entries expire
  - Previous code deleted expired KV entries without updating database, leaving status as NULL
  - Now updates database status to 'error' when KV entry expires before processing
  - Increased KV TTL buffer from 15 to 30 minutes (total: 37 minutes) to prevent premature expiration
  - Scheduled worker runs every 5 minutes, so 30-minute buffer allows 6+ worker runs
- ✅ **UTM Parameter Sync Fix**: Fixed Pipedrive sync handler to read UTM parameters from database columns instead of using `attribution` object
  - Handler now prioritizes database values: `eventRecord?.utm_source` → `utmData.utm_source` → `attribution.source`
  - Added `utm_source`, `utm_medium`, `utm_campaign` to SELECT query
- ✅ **Email/Name Extraction Fix**: Enhanced `extractEmailAndName()` function to handle all field name variations
  - Checks: `email`, `Email`, `EMAIL`, `first-name`, `firstName`, `FirstName`, `last-name`, `lastName`, `LastName`
  - Extracts from `name` field by splitting on spaces if first_name/last_name not found
  - Searches for any field containing 'email' or 'mail' if standard email field not found

**Enhanced Form Data Capture (January 27, 2025):**
- ✅ **Comprehensive Form Field Capture**: Updated pixel.js (v2.4.0) to capture ALL form fields
  - Supports text inputs, textareas, select dropdowns, checkboxes, date fields
  - Field name normalization (hyphens to underscores, case-insensitive matching)
  - Maintains backward compatibility with existing form structures
  - Email field still required for Pipedrive sync (extracted from form_data JSON)
- ✅ **Security Middleware Updates**: Updated `cleanFormData()` to accept all fields with strict XSS sanitization
  - Field name normalization for consistency
  - Email field detection and validation
  - All fields sanitized against XSS attacks (script tags, javascript:, data:, event handlers)
- ✅ **URL Parameter Extraction**: Updated to capture all non-UTM parameters as form data
  - Maintains tracking parameter exclusion (UTM params, click IDs handled separately)
- ✅ **Newsletter Service Enhancement**: Automatic wedding date extraction from form data
  - Supports multiple field names: `wedding_date`, `input_comp-kfmqou8s`, `input_comp_kfmqou8s`, `event_date`, `date`
  - Parses multiple date formats: YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY
  - Validates dates are in the future before using (falls back to default: 1 year from now)
- ✅ **Files Modified**:
  - `src/static/pixel.js`: Enhanced form capture (v2.4.0)
  - `src/middleware/security.js`: Updated `cleanFormData()` to accept all fields
  - `src/handlers/tracking.handlers.js`: Updated URL parameter extraction
  - `src/services/newsletter.service.js`: Added wedding date extraction logic
- ✅ **Deployment**: Version `cbdfcbb3-1dbf-4be6-8246-fd50b0733be4` deployed successfully

**Newsletter Integration (November 6, 2025):**
- ✅ **Automatic Newsletter Signup**: Form submissions now automatically add contacts to newsletter database
  - Created `src/services/newsletter.service.js` with non-blocking API integration
  - Integrated into tracking route to trigger on form submissions
  - Uses default wedding date (1 year from submission) for newsletter bot compatibility
  - 5-second timeout prevents blocking tracking response
  - Comprehensive error handling ensures newsletter failures don't affect tracking
  - Newsletter signup runs asynchronously alongside Pipedrive sync
- ✅ **Configuration**: Added newsletter API URL and auth token to environment variables
- ✅ **Files Modified**:
  - `src/services/newsletter.service.js`: NEW - Newsletter integration service
  - `src/routes/tracking.js`: Added newsletter signup call for form submissions
  - `wrangler.toml`: Added newsletter API URL configuration
- ✅ **Deployment**: Version `549fc5b1-f457-489e-ba5c-f55f4325f584` deployed successfully

**Pipedrive Sync Bug Fixes (November 3, 2025):**
- ✅ **Fixed idempotency key generation bug**: Was using undefined `created_at` timestamp when generating idempotency keys
  - Root cause: `generateIdempotencyKey()` was called before `created_at` was set in the tracking data
  - Fix: Generate timestamp first, then create idempotency key with proper timestamp
  - Impact: Prevents inconsistent idempotency keys that could cause sync failures
- ✅ **Fixed KV expiration bug**: Increased KV expiration from 8 to 22 minutes (was 7min delay + 1min buffer)
  - Root cause: KV keys expired before scheduled worker (runs every 5 minutes) could process them
  - Scenario: Lead submitted at 11:25:57, sync scheduled for 11:32:57, KV key expired at 11:33:57, but worker didn't run until 11:35:00
  - Fix: Increased expiration to 22 minutes (7min delay + 15min buffer) to account for worker interval
  - Impact: Prevents premature key expiration and ensures all syncs are processed
- ✅ **Manual lead recovery**: Created `scripts/sync-all-pending-leads.js` to manually sync all pending leads
  - Successfully synced 7 real leads including Destiny Lee Marquez (Event ID 748) → Person ID 26311
  - Processed all 18 pending leads (7 synced, 11 test leads marked as not_found)
  - All pending leads now synced, 0 remaining in database

**Files Modified**:
- `src/services/pipedrive-delayed.service.js`: Fixed idempotency key generation sequence, increased KV expiration TTL
- `scripts/sync-all-pending-leads.js`: NEW - Manual sync script for pending leads

**Deployment**:
- Version: `fd19d164-d5aa-43ca-a23a-65e9a8a2e55e`
- Date: November 3, 2025
- Status: ✅ Deployed successfully to production

**Security Enhancements (January 27, 2025):**
- ✅ Middleware chain wired to tracking routes (security headers, bot detection, rate limiting)
- ✅ Rate limiter sharded by IP prefix (distributes load across multiple Durable Objects)
- ✅ Global error handler added for consistent error logging
- ✅ Auth middleware updated to use workerLogger (production-grade logging)
- ✅ **Rate limiter parameter validation** (January 27, 2025)
  - Validates and clamps `limit` parameter (1-10000) to prevent DoS attacks
  - Validates and clamps `window` parameter (1-86400 seconds) to prevent resource exhaustion
- ✅ **Input validation hardening** (January 27, 2025)
  - All `parseInt()` calls validated with `isNaN()` checks
  - Date range parameters clamped (1-365 days) in analytics endpoints
  - Export limit parameters clamped (1-10000) to prevent DoS

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
- ✅ **Memory leak fixes** (January 27, 2025)
  - Timeout cleanup in `fetchWithRetry.js` ensures all timers are cleared
  - Promise.race timeout cleanup in scheduled worker prevents timer accumulation
  - Proper error handling prevents resource leaks
- ✅ **Archive deletion safety** (January 27, 2025)
  - Events only deleted after confirming archive endpoint succeeded
  - Prevents data loss if archive endpoint fails
  - Verifies archive response before database deletion
- ✅ **KV pagination infinite loop protection** (January 27, 2025)
  - Added page counter to prevent infinite loops
  - Maximum 10 pages (10,000 keys) per scheduled worker run
  - Validates cursor and timestamp parsing to prevent errors

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
- ✅ **Security & runtime fixes** (January 27, 2025)
  - Fixed missing imports in `/pixel.gif` route (`extractBrowserData`, `extractDeviceData`)
  - Added JSON.parse error handling in browser/device data parsing
  - Fixed redundant conditional checks in error handlers
  - Added comprehensive input validation across all endpoints

### Status

✅ **Production Ready** (January 2025)
- All refactoring complete
- Pipedrive integration active with timeout/retry protection and circuit breaker
- Form data capture: ALL form fields (text inputs, textareas, selects, checkboxes, dates) with email required for Pipedrive sync
- All UTM parameters and click IDs captured
- Delayed sync implemented (7-minute delay) with timeout protection and idempotency
- Person search: email first, then name - no person creation
- Sync status tracking in database (synced/not_found/error)
- Newsletter integration active (automatic signup for form submissions)
- Code optimized, compact, and maintainable
- Security middleware fully implemented
- Performance indexes added for analytics queries
- External API calls protected with timeout and retry logic
- KV expiration handling improved (37-minute TTL buffer)
- Enhanced email/name extraction with field name variation support
