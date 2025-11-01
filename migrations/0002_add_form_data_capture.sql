-- =============================================================================
-- D1 MIGRATION 0002: ADD FORM DATA CAPTURE
-- PPP Tracking Pixel Form Data Enhancement
-- =============================================================================

-- Add form_data column to existing tracking_events table
ALTER TABLE tracking_events ADD COLUMN form_data TEXT DEFAULT NULL;

-- Index for form data queries
CREATE INDEX idx_tracking_events_form_data ON tracking_events(form_data) WHERE form_data IS NOT NULL; 