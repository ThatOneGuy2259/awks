CREATE SEQUENCE IF NOT EXISTS queue_position_seq;

-- Initialize sequence to current max position
SELECT setval('queue_position_seq', COALESCE((SELECT MAX(position) FROM queue), 0));
