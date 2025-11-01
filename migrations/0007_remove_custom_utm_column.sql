-- =============================================================================
-- D1 MIGRATION 0007: REMOVE CUSTOM_UTM COLUMN (OPTIONAL CLEANUP)
-- PPP Tracking Pixel - Remove unused custom_utm column after migration
-- =============================================================================

-- Note: SQLite doesn't support DROP COLUMN directly
-- We'll keep the column for now but mark it as deprecated
-- To fully remove, would need to recreate table:
-- 1. Create new table without custom_utm
-- 2. Copy data
-- 3. Drop old table
-- 4. Rename new table

-- For now, we'll just document that custom_utm is deprecated
-- Future records will not populate this column

-- If you want to remove it completely, run:
-- ALTER TABLE tracking_events RENAME TO tracking_events_old;
-- CREATE TABLE tracking_events_new (...); -- without custom_utm
-- INSERT INTO tracking_events_new SELECT ... FROM tracking_events_old;
-- DROP TABLE tracking_events_old;
-- ALTER TABLE tracking_events_new RENAME TO tracking_events;

