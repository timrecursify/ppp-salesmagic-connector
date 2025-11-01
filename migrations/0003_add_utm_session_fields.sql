-- =============================================================================
-- D1 MIGRATION 0003: ADD UTM CONTENT AND TERM TO SESSIONS
-- PPP Tracking Pixel UTM Attribution Enhancement
-- =============================================================================

-- Add missing UTM fields to sessions table for complete attribution persistence
ALTER TABLE sessions ADD COLUMN utm_content TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN utm_term TEXT DEFAULT NULL;

-- Index for session retrieval by visitor and activity
CREATE INDEX IF NOT EXISTS idx_sessions_visitor_activity ON sessions(visitor_id, pixel_id, last_activity); 