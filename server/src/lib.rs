use spacetimedb::{table, reducer, Table, ReducerContext};

// Games table: tracks game sessions
#[table(name = games, public)]
pub struct Game {
    #[primary_key]
    game_id: String,
    status: String, // 'setup', 'active', 'ended'
    started_at: Option<i64>, // BIGINT timestamp
    ended_at: Option<i64>,   // BIGINT timestamp
}

// Tags table: NFC tags that can be activated for games
#[table(name = tags, public)]
pub struct Tag {
    #[primary_key]
    tag_id: String,
    game_id: String,
    is_active: bool,
    clue: Option<String>,
    order_index: Option<i32>,
}

// Players table: registered players/teams
#[table(name = players, public)]
pub struct Player {
    #[primary_key]
    player_id: String,
    name: String,
    team: Option<String>,
}

// Progress table: tracks which players have claimed which tags
#[table(name = progress, public)]
pub struct Progress {
    #[primary_key]
    game_id: String,
    player_id: String,
    tag_id: String,
    ts: i64, // BIGINT timestamp
}

// Reducer to create a new game
#[reducer]
pub fn create_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    if ctx.db.games().game_id().find(&game_id).is_some() {
        return Err("Game with this ID already exists".to_string());
    }
    
    ctx.db.games().insert(Game {
        game_id: game_id.clone(),
        status: "setup".to_string(),
        started_at: None,
        ended_at: None,
    });
    
    log::info!("Created game: {}", game_id);
    Ok(())
}

// Reducer to start a game
#[reducer]
pub fn start_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    if let Some(game) = ctx.db.games().game_id().find(&game_id) {
        if game.status != "setup" {
            return Err("Game is not in setup status".to_string());
        }
        
        ctx.db.games().game_id().update(Game {
            status: "active".to_string(),
            started_at: Some(0), // TODO: Use proper timestamp
            ..game
        });
        
        log::info!("Started game: {}", game_id);
        Ok(())
    } else {
        Err("Game not found".to_string())
    }
}

// Reducer to end a game
#[reducer]
pub fn end_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    if let Some(game) = ctx.db.games().game_id().find(&game_id) {
        if game.status != "active" {
            return Err("Game is not active".to_string());
        }
        
        ctx.db.games().game_id().update(Game {
            status: "ended".to_string(),
            ended_at: Some(0), // TODO: Use proper timestamp
            ..game
        });
        
        log::info!("Ended game: {}", game_id);
        Ok(())
    } else {
        Err("Game not found".to_string())
    }
}

// Reducer to activate a tag (upsert with is_active=true)
#[reducer]
pub fn activate_tag(ctx: &ReducerContext, game_id: String, tag_id: String, clue: Option<String>, order_index: Option<i32>) -> Result<(), String> {
    if ctx.db.games().game_id().find(&game_id).is_none() {
        return Err("Game not found".to_string());
    }
    
    // Upsert tag - insert if doesn't exist, update if exists
    if let Some(existing_tag) = ctx.db.tags().tag_id().find(&tag_id) {
        ctx.db.tags().tag_id().update(Tag {
            is_active: true,
            clue: clue.or(existing_tag.clue),
            order_index: order_index.or(existing_tag.order_index),
            ..existing_tag
        });
    } else {
        ctx.db.tags().insert(Tag {
            tag_id: tag_id.clone(),
            game_id,
            is_active: true,
            clue,
            order_index,
        });
    }
    
    log::info!("Activated tag: {}", tag_id);
    Ok(())
}

// Reducer to upsert a player (insert or update)
#[reducer]
pub fn upsert_player(ctx: &ReducerContext, player_id: String, name: String, team: Option<String>) -> Result<(), String> {
    if let Some(existing_player) = ctx.db.players().player_id().find(&player_id) {
        ctx.db.players().player_id().update(Player {
            name,
            team,
            ..existing_player
        });
        log::info!("Updated player: {}", player_id);
    } else {
        ctx.db.players().insert(Player {
            player_id: player_id.clone(),
            name,
            team,
        });
        log::info!("Created player: {}", player_id);
    }
    Ok(())
}

// Reducer to claim a tag (this is what players will call when they tap an NFC tag)
#[reducer]
pub fn claim_tag(ctx: &ReducerContext, game_id: String, player_id: String, tag_id: String) -> Result<(), String> {
    // Check if game exists and is active
    if let Some(game) = ctx.db.games().game_id().find(&game_id) {
        if game.status != "active" {
            return Err("Game is not active".to_string());
        }
    } else {
        return Err("Game not found".to_string());
    }
    
    // Check if tag exists and is active
    if let Some(tag) = ctx.db.tags().tag_id().find(&tag_id) {
        if !tag.is_active {
            return Err("Tag is not active".to_string());
        }
        if tag.game_id != game_id {
            return Err("Tag does not belong to this game".to_string());
        }
    } else {
        return Err("Tag not found".to_string());
    }
    
    // Check if this player has already claimed this tag (ignore if already exists)
    if ctx.db.progress().game_id().find(&game_id).is_some() {
        // Check if this specific combination exists
        let existing_progress = ctx.db.progress().iter()
            .find(|p| p.game_id == game_id && p.player_id == player_id && p.tag_id == tag_id);
        
        if existing_progress.is_some() {
            // Already claimed, ignore silently
            return Ok(());
        }
    }
    
    // Record the claim
    ctx.db.progress().insert(Progress {
        game_id: game_id.clone(),
        player_id: player_id.clone(),
        tag_id: tag_id.clone(),
        ts: 0, // TODO: Use proper timestamp
    });
    
    log::info!("Player {} claimed tag: {} in game: {}", player_id, tag_id, game_id);
    Ok(())
}

// Reducer to delete a tag and its progress entries
#[reducer]
pub fn delete_tag(ctx: &ReducerContext, game_id: String, tag_id: String) -> Result<(), String> {
    // Check if tag exists for this game
    if let Some(tag) = ctx.db.tags().tag_id().find(&tag_id) {
        if tag.game_id != game_id {
            return Err("Tag does not belong to this game".to_string());
        }
    } else {
        return Err("Tag not found".to_string());
    }
    
    // Delete all progress entries for this tag in this game
    let progress_to_delete: Vec<_> = ctx.db.progress().iter()
        .filter(|p| p.game_id == game_id && p.tag_id == tag_id)
        .collect();
    
    for progress in progress_to_delete {
        ctx.db.progress().delete(progress);
    }
    
    // Delete the tag
    if let Some(tag) = ctx.db.tags().tag_id().find(&tag_id) {
        ctx.db.tags().delete(tag);
    }
    
    log::info!("Deleted tag {} and its progress entries for game {}", tag_id, game_id);
    Ok(())
}

// Reducer to delete a player's progress for a specific game
#[reducer]
pub fn delete_player(ctx: &ReducerContext, game_id: String, player_id: String) -> Result<(), String> {
    // Check if game exists
    if ctx.db.games().game_id().find(&game_id).is_none() {
        return Err("Game not found".to_string());
    }
    
    // Delete all progress entries for this player in this game
    let progress_to_delete: Vec<_> = ctx.db.progress().iter()
        .filter(|p| p.game_id == game_id && p.player_id == player_id)
        .collect();
    
    for progress in progress_to_delete {
        ctx.db.progress().delete(progress);
    }
    
    log::info!("Deleted player {} progress for game {}", player_id, game_id);
    Ok(())
}

// Reducer to delete a single progress entry
#[reducer]
pub fn delete_progress(ctx: &ReducerContext, game_id: String, player_id: String, tag_id: String) -> Result<(), String> {
    // Check if the progress entry exists
    let progress_exists = ctx.db.progress().iter()
        .any(|p| p.game_id == game_id && p.player_id == player_id && p.tag_id == tag_id);
    
    if !progress_exists {
        return Err("Progress entry not found".to_string());
    }
    
    // Delete the specific progress entry
    if let Some(progress) = ctx.db.progress().iter()
        .find(|p| p.game_id == game_id && p.player_id == player_id && p.tag_id == tag_id) {
        ctx.db.progress().delete(progress);
    }
    
    log::info!("Deleted progress entry: game={}, player={}, tag={}", game_id, player_id, tag_id);
    Ok(())
}

// Reducer to cascade delete a game and optionally orphaned players
#[reducer]
pub fn delete_game_cascade(ctx: &ReducerContext, game_id: String, delete_orphan_players: bool) -> Result<(), String> {
    // Check if game exists
    if ctx.db.games().game_id().find(&game_id).is_none() {
        return Err("Game not found".to_string());
    }
    
    // Count entries to be deleted for logging
    let progress_count = ctx.db.progress().iter().filter(|p| p.game_id == game_id).count();
    let tags_count = ctx.db.tags().iter().filter(|t| t.game_id == game_id).count();
    
    // Delete all progress entries for this game
    let progress_to_delete: Vec<_> = ctx.db.progress().iter()
        .filter(|p| p.game_id == game_id)
        .collect();
    
    for progress in progress_to_delete {
        ctx.db.progress().delete(progress);
    }
    
    // Delete all tags for this game
    let tags_to_delete: Vec<_> = ctx.db.tags().iter()
        .filter(|t| t.game_id == game_id)
        .collect();
    
    for tag in tags_to_delete {
        ctx.db.tags().delete(tag);
    }
    
    // Delete the game
    if let Some(game) = ctx.db.games().game_id().find(&game_id) {
        ctx.db.games().delete(game);
    }
    
    // Optionally delete orphaned players (players with no remaining progress)
    if delete_orphan_players {
        let players_to_delete: Vec<_> = ctx.db.players().iter()
            .filter(|player| {
                // Check if this player has any remaining progress entries
                !ctx.db.progress().iter().any(|p| p.player_id == player.player_id)
            })
            .collect();
        
        let orphan_count = players_to_delete.len();
        
        for player in players_to_delete {
            ctx.db.players().delete(player);
        }
        
        log::info!("Deleted game {} and {} orphaned players ({} progress, {} tags)", 
                  game_id, orphan_count, progress_count, tags_count);
    } else {
        log::info!("Deleted game {} ({} progress, {} tags)", game_id, progress_count, tags_count);
    }
    
    Ok(())
}

// Initialize the hunt module
#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("Initializing hunt database");
}