-- =============================================================================
-- D1 MIGRATION 0009: ADD PERFORMANCE INDEXES
-- Additional composite indexes for analytics queries and performance optimization
-- =============================================================================

-- Composite index for pixel analytics queries (most common query pattern)
-- Covers: pixel_id + timestamp range + archived filter
CREATE INDEX IF NOT EXISTS idx_tracking_events_pixel_timestamp_archived 
ON tracking_events(pixel_id, timestamp, archived) 
WHERE archived = 0;

-- Composite index for project analytics queries
-- Covers: project_id + timestamp range + archived filter
CREATE INDEX IF NOT EXISTS idx_tracking_events_project_timestamp_archived 
ON tracking_events(project_id, timestamp, archived) 
WHERE archived = 0;

-- Index for event_type filtering (common in analytics)
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_type 
ON tracking_events(event_type) 
WHERE event_type IS NOT NULL;

-- Composite index for UTM source queries (common analytics pattern)
CREATE INDEX IF NOT EXISTS idx_tracking_events_pixel_utm_source 
ON tracking_events(pixel_id, utm_source, timestamp) 
WHERE utm_source IS NOT NULL AND archived = 0;

-- Index for session queries by visitor_id and started_at (for first-visit attribution)
CREATE INDEX IF NOT EXISTS idx_sessions_visitor_started 
ON sessions(visitor_id, pixel_id, started_at);

-- Index for visitor lookup by last_seen (for cleanup queries)
CREATE INDEX IF NOT EXISTS idx_visitors_last_seen 
ON visitors(last_seen);

