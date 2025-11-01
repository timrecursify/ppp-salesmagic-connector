-- =============================================================================
-- D1 MIGRATION 0010: ADD PIPEDRIVE SYNC STATUS
-- Adds column to track Pipedrive sync status
-- =============================================================================

-- Add pipedrive_sync_status column to track sync status
ALTER TABLE tracking_events ADD COLUMN pipedrive_sync_status TEXT DEFAULT NULL;

-- Add pipedrive_sync_at timestamp column
ALTER TABLE tracking_events ADD COLUMN pipedrive_sync_at TEXT DEFAULT NULL;

-- Add pipedrive_person_id column to store the person ID if found
ALTER TABLE tracking_events ADD COLUMN pipedrive_person_id TEXT DEFAULT NULL;

-- Create index for querying sync status
CREATE INDEX idx_tracking_events_pipedrive_sync_status ON tracking_events(pipedrive_sync_status) WHERE pipedrive_sync_status IS NOT NULL;

-- Create index for pending syncs
CREATE INDEX idx_tracking_events_pending_pipedrive_sync ON tracking_events(pipedrive_sync_status) WHERE pipedrive_sync_status IS NULL AND form_data IS NOT NULL;

