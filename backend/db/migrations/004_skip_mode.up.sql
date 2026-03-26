INSERT INTO admin_settings (key, value) VALUES ('skip_mode', 'fixed') ON CONFLICT (key) DO NOTHING;
INSERT INTO admin_settings (key, value) VALUES ('skip_percent', '50') ON CONFLICT (key) DO NOTHING;
