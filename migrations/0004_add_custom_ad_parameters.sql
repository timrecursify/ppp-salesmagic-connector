-- =============================================================================
-- D1 MIGRATION 0004: ADD CUSTOM AD PARAMETERS
-- PPP Tracking Pixel - Additional Google Ads Parameters
-- =============================================================================

-- Add custom ad parameters to tracking_events table
ALTER TABLE tracking_events ADD COLUMN campaign_region TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN ad_group TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN ad_id TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN search_query TEXT DEFAULT NULL;

-- Add index for performance on campaign analysis
CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign_region ON tracking_events(campaign_region);
CREATE INDEX IF NOT EXISTS idx_tracking_events_ad_group ON tracking_events(ad_group);

-- Add custom ad parameters to sessions table for attribution persistence
ALTER TABLE sessions ADD COLUMN campaign_region TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN ad_group TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN ad_id TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN search_query TEXT DEFAULT NULL; 