-- =============================================================================
-- D1 MIGRATION 0001: INITIAL SCHEMA
-- PPP Tracking Pixel Database Schema for Cloudflare D1
-- =============================================================================

-- Projects table for organizing pixels
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    webhook_url TEXT NOT NULL,
    configuration TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    active INTEGER DEFAULT 1
);

-- Pixels table for pixel management
CREATE TABLE pixels (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    website_url TEXT,
    configuration TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    active INTEGER DEFAULT 1,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, name)
);

-- Visitors table for cookie-based deduplication
CREATE TABLE visitors (
    id TEXT PRIMARY KEY,
    visitor_cookie TEXT UNIQUE NOT NULL,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    visit_count INTEGER DEFAULT 1,
    user_agent TEXT,
    ip_address TEXT
);

-- Sessions table for session management
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    visitor_id TEXT,
    pixel_id TEXT,
    session_cookie TEXT UNIQUE NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    last_activity TEXT DEFAULT (datetime('now')),
    page_views INTEGER DEFAULT 0,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    FOREIGN KEY (pixel_id) REFERENCES pixels(id)
);

-- Main tracking data table
CREATE TABLE tracking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    pixel_id TEXT,
    visitor_id TEXT,
    session_id TEXT,
    event_type TEXT DEFAULT 'pageview',
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    custom_utm TEXT,
    page_url TEXT,
    referrer_url TEXT,
    page_title TEXT,
    user_agent TEXT,
    ip_address TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    browser_data TEXT,
    device_data TEXT,
    viewport_data TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    zapier_sent INTEGER DEFAULT 0,
    zapier_sent_at TEXT,
    archived INTEGER DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (pixel_id) REFERENCES pixels(id),
    FOREIGN KEY (visitor_id) REFERENCES visitors(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Create performance indexes
CREATE INDEX idx_tracking_events_project_id ON tracking_events(project_id);
CREATE INDEX idx_tracking_events_pixel_id ON tracking_events(pixel_id);
CREATE INDEX idx_tracking_events_visitor_id ON tracking_events(visitor_id);
CREATE INDEX idx_tracking_events_session_id ON tracking_events(session_id);
CREATE INDEX idx_tracking_events_timestamp ON tracking_events(timestamp);
CREATE INDEX idx_tracking_events_zapier_sent ON tracking_events(zapier_sent) WHERE zapier_sent = 0;
CREATE INDEX idx_tracking_events_archived ON tracking_events(archived) WHERE archived = 0;

CREATE INDEX idx_visitors_cookie ON visitors(visitor_cookie);
CREATE INDEX idx_sessions_cookie ON sessions(session_cookie);
CREATE INDEX idx_sessions_visitor_pixel ON sessions(visitor_id, pixel_id);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity);

-- Create composite indexes for common queries
CREATE INDEX idx_tracking_events_project_timestamp ON tracking_events(project_id, timestamp);
CREATE INDEX idx_tracking_events_pixel_timestamp ON tracking_events(pixel_id, timestamp);

-- Create triggers for updated_at
CREATE TRIGGER update_projects_updated_at 
    AFTER UPDATE ON projects
    FOR EACH ROW 
    BEGIN
        UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

CREATE TRIGGER update_pixels_updated_at 
    AFTER UPDATE ON pixels
    FOR EACH ROW 
    BEGIN
        UPDATE pixels SET updated_at = datetime('now') WHERE id = NEW.id;
    END; 