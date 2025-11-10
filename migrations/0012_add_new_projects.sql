-- =============================================================================
-- D1 MIGRATION 0012: ADD NEW PROJECTS AND PIXELS
-- Adds Desaas.io, Blackbowassociates, Cloud Nine, and Miami Flowers projects
-- All projects have Pipedrive sync disabled (pipedrive_enabled: false)
-- =============================================================================

-- Desaas.io Project
INSERT OR IGNORE INTO projects (id, name, webhook_url, configuration) VALUES 
(
    'desaas-0001-4000-8000-0000-000000000001',
    'Desaas.io', 
    '',
    '{"description": "Desaas.io website tracking - form submissions on start-now page", "retention_days": 180, "auto_cleanup": true, "pipedrive_enabled": false, "privacy_settings": {"anonymize_ip": false, "respect_dnt": true, "cookie_consent_required": false}, "form_page": "https://desaas.io/start-now", "form_fields": []}'
);

-- Desaas.io Pixel
INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'desaas-pixel-0001-4000-8000-0000-000000000001',
    p.id,
    'main-website',
    'https://desaas.io',
    '{"description": "Main Desaas.io website pixel", "collect_performance": true, "fallback_enabled": true, "domains": ["desaas.io", "www.desaas.io"]}'
FROM projects p WHERE p.name = 'Desaas.io' AND p.id = 'desaas-0001-4000-8000-0000-000000000001';

-- Blackbowassociates Project
INSERT OR IGNORE INTO projects (id, name, webhook_url, configuration) VALUES 
(
    'blackbow-0001-4000-8000-0000-000000000002',
    'Blackbowassociates', 
    '',
    '{"description": "Blackbowassociates.com tracking - sign-up conversions (no form)", "retention_days": 180, "auto_cleanup": true, "pipedrive_enabled": false, "privacy_settings": {"anonymize_ip": false, "respect_dnt": true, "cookie_consent_required": false}, "form_page": null, "form_fields": []}'
);

-- Blackbowassociates Pixel
INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'blackbow-pixel-0001-4000-8000-0000-000000000002',
    p.id,
    'main-website',
    'https://blackbowassociates.com',
    '{"description": "Blackbowassociates.com main website pixel - tracks sign-up conversions", "collect_performance": true, "fallback_enabled": true, "domains": ["blackbowassociates.com", "www.blackbowassociates.com"]}'
FROM projects p WHERE p.name = 'Blackbowassociates' AND p.id = 'blackbow-0001-4000-8000-0000-000000000002';

-- Cloud Nine Project
INSERT OR IGNORE INTO projects (id, name, webhook_url, configuration) VALUES 
(
    'cloudnine-0001-4000-8000-0000-000000000003',
    'Cloud Nine', 
    '',
    '{"description": "Premium Romance Concierge Cloud Nine - form submissions on contact page", "retention_days": 180, "auto_cleanup": true, "pipedrive_enabled": false, "privacy_settings": {"anonymize_ip": false, "respect_dnt": true, "cookie_consent_required": false}, "form_page": "https://prccloudnine.com/#contacts", "form_fields": "ALL_FIELDS_AUTO_CAPTURED"}'
);

-- Cloud Nine Pixel
INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'cloudnine-pixel-0001-4000-8000-0000-000000000003',
    p.id,
    'main-website',
    'https://prccloudnine.com',
    '{"description": "Cloud Nine main website pixel", "collect_performance": true, "fallback_enabled": true, "domains": ["prccloudnine.com", "www.prccloudnine.com"]}'
FROM projects p WHERE p.name = 'Cloud Nine' AND p.id = 'cloudnine-0001-4000-8000-0000-000000000003';

-- Miami Flowers Project
INSERT OR IGNORE INTO projects (id, name, webhook_url, configuration) VALUES 
(
    'miamiflowers-0001-4000-8000-0000-000000000004',
    'Miami Flowers', 
    '',
    '{"description": "Miami Flowers Time - form submissions on contact page", "retention_days": 180, "auto_cleanup": true, "pipedrive_enabled": false, "privacy_settings": {"anonymize_ip": false, "respect_dnt": true, "cookie_consent_required": false}, "form_page": "https://miamiflowerstime.com/contact/", "form_fields": "ALL_FIELDS_AUTO_CAPTURED"}'
);

-- Miami Flowers Pixel
INSERT OR IGNORE INTO pixels (id, project_id, name, website_url, configuration) 
SELECT 
    'miamiflowers-pixel-0001-4000-8000-0000-000000000004',
    p.id,
    'main-website',
    'https://miamiflowerstime.com',
    '{"description": "Miami Flowers main website pixel", "collect_performance": true, "fallback_enabled": true, "domains": ["miamiflowerstime.com", "www.miamiflowerstime.com"]}'
FROM projects p WHERE p.name = 'Miami Flowers' AND p.id = 'miamiflowers-0001-4000-8000-0000-000000000004';
