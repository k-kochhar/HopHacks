use spacetimedb::{table, reducer, Table, ReducerContext, Timestamp};

// Games table: tracks game sessions
#[table(name = games, public)]
pub struct Game {
    #[primary_key]
    game_id: String,
    status: String, // 'setup', 'active', 'ended'
    started_at: Option<Timestamp>,
    ended_at: Option<Timestamp>,
}

// Tags table: NFC tags that can be activated for games
#[table(name = tags, public)]
pub struct Tag {
    #[primary_key]
    tag_id: String,
    game_id: String,
    is_active: bool,
    clue: Option<String>,
    order_index: i32,
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
    progress_id: String, // Composite key: game_id + player_id + tag_id
    game_id: String,
    player_id: String,
    tag_id: String,
    ts: Timestamp,
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
            started_at: Some(ctx.timestamp),
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
            ended_at: Some(ctx.timestamp),
            ..game
        });
        
        log::info!("Ended game: {}", game_id);
        Ok(())
    } else {
        Err("Game not found".to_string())
    }
}

// Reducer to add a tag to a game
#[reducer]
pub fn add_tag(ctx: &ReducerContext, tag_id: String, game_id: String, clue: Option<String>, order_index: i32) -> Result<(), String> {
    if ctx.db.games().game_id().find(&game_id).is_none() {
        return Err("Game not found".to_string());
    }
    
    if ctx.db.tags().tag_id().find(&tag_id).is_some() {
        return Err("Tag with this ID already exists".to_string());
    }
    
    ctx.db.tags().insert(Tag {
        tag_id: tag_id.clone(),
        game_id,
        is_active: false,
        clue,
        order_index,
    });
    
    log::info!("Added tag: {}", tag_id);
    Ok(())
}

// Reducer to activate/deactivate a tag
#[reducer]
pub fn set_tag_active(ctx: &ReducerContext, tag_id: String, is_active: bool) -> Result<(), String> {
    if let Some(tag) = ctx.db.tags().tag_id().find(&tag_id) {
        ctx.db.tags().tag_id().update(Tag {
            is_active,
            ..tag
        });
        
        log::info!("Set tag {} active: {}", tag_id, is_active);
        Ok(())
    } else {
        Err("Tag not found".to_string())
    }
}

// Reducer to register a player
#[reducer]
pub fn register_player(ctx: &ReducerContext, player_id: String, name: String, team: Option<String>) -> Result<(), String> {
    if ctx.db.players().player_id().find(&player_id).is_some() {
        return Err("Player with this ID already exists".to_string());
    }
    
    ctx.db.players().insert(Player {
        player_id: player_id.clone(),
        name,
        team,
    });
    
    log::info!("Registered player: {}", player_id);
    Ok(())
}

// Reducer to claim a tag (this is what players will call when they tap an NFC tag)
#[reducer]
pub fn claim_tag(ctx: &ReducerContext, game_id: String, tag_id: String) -> Result<(), String> {
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
    
    // For now, we'll use a placeholder player_id since we don't have authentication
    // In a real app, you'd get this from the authenticated user
    let player_id = format!("player_{}", ctx.sender.to_string());
    
    // Check if this player has already claimed this tag
    let progress_id = format!("{}_{}_{}", game_id, player_id, tag_id);
    if ctx.db.progress().progress_id().find(&progress_id).is_some() {
        return Err("Tag already claimed by this player".to_string());
    }
    
    // Record the claim
    ctx.db.progress().insert(Progress {
        progress_id: progress_id.clone(),
        game_id: game_id.clone(),
        tag_id: tag_id.clone(),
        player_id,
        ts: ctx.timestamp,
    });
    
    log::info!("Player claimed tag: {} in game: {}", tag_id, game_id);
    Ok(())
}

// Reducer to delete a tag
#[reducer]
pub fn delete_tag(ctx: &ReducerContext, tag_id: String) -> Result<(), String> {
    if let Some(_tag) = ctx.db.tags().tag_id().find(&tag_id) {
        ctx.db.tags().tag_id().delete(&tag_id);
        log::info!("Deleted tag: {}", tag_id);
        Ok(())
    } else {
        Err("Tag not found".to_string())
    }
}

// Reducer to delete a player
#[reducer]
pub fn delete_player(ctx: &ReducerContext, player_id: String) -> Result<(), String> {
    if let Some(_player) = ctx.db.players().player_id().find(&player_id) {
        ctx.db.players().player_id().delete(&player_id);
        log::info!("Deleted player: {}", player_id);
        Ok(())
    } else {
        Err("Player not found".to_string())
    }
}

// Reducer to delete a game and all related data (cascade delete)
#[reducer]
pub fn delete_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    if let Some(_game) = ctx.db.games().game_id().find(&game_id) {
        // Delete all tags for this game
        let tags_to_delete: Vec<String> = ctx.db.tags().iter()
            .filter(|tag| tag.game_id == game_id)
            .map(|tag| tag.tag_id.clone())
            .collect();
        
        for tag_id in tags_to_delete {
            ctx.db.tags().tag_id().delete(&tag_id);
            log::info!("Deleted tag {} for game {}", tag_id, game_id);
        }
        
        // Delete all progress entries for this game
        let progress_to_delete: Vec<String> = ctx.db.progress().iter()
            .filter(|progress| progress.game_id == game_id)
            .map(|progress| progress.progress_id.clone())
            .collect();
        
        for progress_id in progress_to_delete {
            ctx.db.progress().progress_id().delete(&progress_id);
            log::info!("Deleted progress entry {} for game {}", progress_id, game_id);
        }
        
        // Delete the game itself
        ctx.db.games().game_id().delete(&game_id);
        
        log::info!("Deleted game and all related data: {}", game_id);
        Ok(())
    } else {
        Err("Game not found".to_string())
    }
}


// Initialize with some test data
#[reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    log::info!("Initializing scavenger hunt database");
    
    // This will be called when the module is first published
    // We'll add some test data here
}