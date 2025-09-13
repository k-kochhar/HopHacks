-- Seed data for testing the NFC Scavenger Hunt Game
-- Run this after creating the schema to populate with test data

-- Insert a test game
INSERT INTO games (game_id, status, started_at) VALUES 
('game_001', 'active', NOW());

-- Insert some test tags for the game
INSERT INTO tags (tag_id, game_id, is_active, clue, order_index) VALUES 
('TAG001', 'game_001', true, 'Find the red door near the main entrance', 1),
('TAG002', 'game_001', true, 'Look for the statue with a book', 2),
('TAG003', 'game_001', false, 'Check the coffee shop counter', 3),
('TAG004', 'game_001', true, 'Find the elevator with the blue button', 4),
('TAG005', 'game_001', false, 'Look behind the reception desk', 5);

-- Insert some test players
INSERT INTO players (player_id, name, team) VALUES 
('player_001', 'Alice Johnson', 'Team Alpha'),
('player_002', 'Bob Smith', 'Team Alpha'),
('player_003', 'Carol Davis', 'Team Beta'),
('player_004', 'David Wilson', 'Team Beta');

-- Insert some test progress (players claiming tags)
INSERT INTO progress (game_id, player_id, tag_id, ts) VALUES 
('game_001', 'player_001', 'TAG001', NOW() - INTERVAL '10 minutes'),
('game_001', 'player_001', 'TAG002', NOW() - INTERVAL '8 minutes'),
('game_001', 'player_002', 'TAG001', NOW() - INTERVAL '7 minutes'),
('game_001', 'player_003', 'TAG004', NOW() - INTERVAL '5 minutes'),
('game_001', 'player_004', 'TAG001', NOW() - INTERVAL '3 minutes'),
('game_001', 'player_004', 'TAG002', NOW() - INTERVAL '2 minutes');
