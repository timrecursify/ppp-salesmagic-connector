-- =============================================================================
-- D1 MIGRATION 0002: SEED INITIAL DATA
-- PPP Tracking Pixel Initial Project and Pixel Setup
-- =============================================================================

-- Insert PPP project with proper UUID-like ID
INSERT OR IGNORE INTO projects (id, name, webhook_url, configuration) VALUES 
(
    'ppp-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    'PPP', 
    NULL, -- DEPRECATED: Legacy Zapier webhook URL, replaced with direct Pipedrive API integration 
    '{"description": "Precious Pics Pro tracking project", "retention_days": 180, "auto_cleanup": true, "privacy_settings": {"anonymize_ip": false, "respect_dnt": true, "cookie_consent_required": false}}'
);

-- Get the PPP project ID and insert pixels
INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'pixel1-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    p.id,
    'website1',
    'https://preciouspicspro.com',
    '{"description": "Primary website pixel", "collect_performance": true, "fallback_enabled": true, "domains": ["preciouspicspro.com", "www.preciouspicspro.com"]}'
FROM projects p WHERE p.name = 'PPP';

INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'pixel2-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    p.id,
    'website2',
    'https://universal.preciouspicspro.com',
    '{"description": "Universal website pixel", "collect_performance": true, "fallback_enabled": true, "domains": ["universal.preciouspicspro.com"]}'
FROM projects p WHERE p.name = 'PPP';

INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'pixel3-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
    p.id,
    'website3',
    'https://photography.preciouspicspro.com',
    '{"description": "Photography website pixel", "collect_performance": true, "fallback_enabled": true, "domains": ["photography.preciouspicspro.com"]}'
FROM projects p WHERE p.name = 'PPP'; 