-- =============================================================================
-- D1 MIGRATION 0011: ADD RETRY TRACKING FOR PIPEDRIVE SYNCS
-- Adds retry counter and last retry timestamp to track sync attempts
-- =============================================================================

-- Add retry columns to tracking_events
ALTER TABLE tracking_events ADD COLUMN pipedrive_retry_count INTEGER DEFAULT 0;
ALTER TABLE tracking_events ADD COLUMN pipedrive_last_retry_at TEXT;

-- Create index for finding failed syncs that need retry
CREATE INDEX IF NOT EXISTS idx_tracking_events_retry ON tracking_events(pipedrive_sync_status, pipedrive_retry_count, created_at) 
WHERE pipedrive_sync_status IS NULL OR pipedrive_sync_status = 'error';

