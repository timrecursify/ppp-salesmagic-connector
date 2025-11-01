-- Migration: Add system logs table for debugging and audit trail
-- File: migrations/0005_add_system_logs.sql

CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    level TEXT NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL')),
    category TEXT NOT NULL, -- e.g., 'WEBHOOK', 'PIXEL', 'FORM_CAPTURE', 'SESSION', 'DATABASE'
    action TEXT NOT NULL, -- e.g., 'SENT', 'FAILED', 'CREATED', 'UPDATED', 'DUPLICATE_BLOCKED'
    message TEXT NOT NULL,
    context TEXT, -- JSON string with additional context
    event_id INTEGER, -- Link to tracking_events if relevant
    visitor_id TEXT, -- Visitor UUID if relevant
    pixel_id TEXT, -- Pixel ID if relevant
    error_code TEXT, -- Error code for failures
    processing_time INTEGER, -- Processing time in ms
    ip_address TEXT,
    user_agent TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_id ON system_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_visitor_id ON system_logs(visitor_id);

-- Create index for debugging queries (recent errors)
CREATE INDEX IF NOT EXISTS idx_system_logs_level_timestamp ON system_logs(level, timestamp); 