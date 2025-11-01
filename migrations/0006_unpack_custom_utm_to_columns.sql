-- =============================================================================
-- D1 MIGRATION 0006: UNPACK CUSTOM_UTM JSON INTO COLUMNS
-- PPP Tracking Pixel - Add individual columns for all UTM parameters
-- =============================================================================

-- Add columns for all click IDs and UTM parameters
ALTER TABLE tracking_events ADD COLUMN gclid TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN fbclid TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN msclkid TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN ttclid TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN twclid TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN li_fat_id TEXT DEFAULT NULL;
ALTER TABLE tracking_events ADD COLUMN sc_click_id TEXT DEFAULT NULL;

-- Add indexes for performance on click ID queries
CREATE INDEX IF NOT EXISTS idx_tracking_events_gclid ON tracking_events(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_events_fbclid ON tracking_events(fbclid) WHERE fbclid IS NOT NULL;

-- Note: Data migration will be done via script to unpack existing custom_utm JSON

