-- SpacetimeDB Schema for NFC Scavenger Hunt Game
-- Run this in your SpacetimeDB console to create the tables

-- Games table: tracks game sessions
CREATE TABLE games (
    game_id STRING PRIMARY KEY,
    status STRING NOT NULL, -- 'setup', 'active', 'ended'
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Tags table: NFC tags that can be activated for games
CREATE TABLE tags (
    tag_id STRING PRIMARY KEY,
    game_id STRING NOT NULL,
    is_active BOOL NOT NULL DEFAULT false,
    clue STRING,
    order_index INT NOT NULL DEFAULT 0
);

-- Players table: registered players/teams
CREATE TABLE players (
    player_id STRING PRIMARY KEY,
    name STRING NOT NULL,
    team STRING
);

-- Progress table: tracks which players have claimed which tags
CREATE TABLE progress (
    game_id STRING NOT NULL,
    player_id STRING NOT NULL,
    tag_id STRING NOT NULL,
    ts TIMESTAMP NOT NULL,
    PRIMARY KEY (game_id, player_id, tag_id)
);

-- Indexes for better query performance
CREATE INDEX idx_tags_game_id ON tags(game_id);
CREATE INDEX idx_progress_game_id ON progress(game_id);
CREATE INDEX idx_progress_player_id ON progress(player_id);
