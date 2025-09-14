use spacetimedb::{Table, ReducerContext, table, reducer};

// Simple game table - only one active game at a time
#[table(name = games, public)]
pub struct Game {
    game_id: String,
    status: String, // 'setup' | 'active' | 'ended'
}

// Simple tags table with order_index for sequential claiming
#[table(name = tags, public)]
pub struct Tag {
    #[primary_key]
    tag_id: String,
    game_id: String,
    is_active: bool,
    order_index: i32, // 1, 2, 3, etc. - players must claim in order
    clue: Option<String>,
    // Geolocation fields (nullable)
    lat: Option<f64>,
    lon: Option<f64>,
    accuracy_m: Option<i32>,
    activated_by: Option<String>,
    activated_at: Option<i64>,
}

// Simple players table
#[table(name = players, public)]
pub struct Player {
    player_id: String,
    name: String,
}

// Simple progress table - tracks who claimed what
#[table(name = progress, public)]
pub struct Progress {
    game_id: String,
    player_id: String,
    tag_id: String,
    order_index: i32,
    timestamp: i64,
}

// Create a new game (wipes everything)
#[reducer]
pub fn create_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    // Delete all existing data
    let games_count = ctx.db.games().iter().count();
    let tags_count = ctx.db.tags().iter().count();
    let players_count = ctx.db.players().iter().count();
    let progress_count = ctx.db.progress().iter().count();
    
    log::info!("Wiping database: {} games, {} tags, {} players, {} progress entries", 
               games_count, tags_count, players_count, progress_count);
    
    for game in ctx.db.games().iter() {
        ctx.db.games().delete(game);
    }
    for tag in ctx.db.tags().iter() {
        ctx.db.tags().delete(tag);
    }
    for player in ctx.db.players().iter() {
        ctx.db.players().delete(player);
    }
    for progress in ctx.db.progress().iter() {
        ctx.db.progress().delete(progress);
    }

    // Create new game
    ctx.db.games().insert(Game {
        game_id: game_id.clone(),
        status: "setup".to_string(),
    });

    log::info!("Created new game: {} (database wiped clean)", game_id);
    Ok(())
}

// Start the game
#[reducer]
pub fn start_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    let game = ctx.db.games().iter()
        .find(|g| g.game_id == game_id)
        .ok_or("Game not found")?;

    ctx.db.games().delete(game);
    ctx.db.games().insert(Game {
        game_id: game_id.clone(),
        status: "active".to_string(),
    });

    log::info!("Started game: {}", game_id);
    Ok(())
}

// End the game
#[reducer]
pub fn end_game(ctx: &ReducerContext, game_id: String) -> Result<(), String> {
    let game = ctx.db.games().iter()
        .find(|g| g.game_id == game_id)
        .ok_or("Game not found")?;

    ctx.db.games().delete(game);
    ctx.db.games().insert(Game {
        game_id: game_id.clone(),
        status: "ended".to_string(),
    });

    log::info!("Ended game: {}", game_id);
    Ok(())
}

// Create a tag (organizer only) - creates inactive tag
#[reducer]
pub fn create_tag(ctx: &ReducerContext, game_id: String, tag_id: String, order_index: i32, clue: Option<String>) -> Result<(), String> {
    // Check if game exists
    let _game = ctx.db.games().iter()
        .find(|g| g.game_id == game_id)
        .ok_or("Game not found")?;

    // Check if tag already exists (globally, not just in this game)
    if let Some(_existing_tag) = ctx.db.tags().iter()
        .find(|t| t.tag_id == tag_id) {
        return Err(format!("Tag {} already exists globally", tag_id));
    }

    // Create tag as inactive
    ctx.db.tags().insert(Tag {
        tag_id: tag_id.clone(),
        game_id: game_id.clone(),
        is_active: false,
        order_index,
        clue,
        lat: None,
        lon: None,
        accuracy_m: None,
        activated_by: None,
        activated_at: None,
    });

    log::info!("Created tag: {} in game: {}", tag_id, game_id);
    Ok(())
}

// Activate a tag (organizer only)
#[reducer]
pub fn activate_tag(ctx: &ReducerContext, game_id: String, tag_id: String, order_index: i32, clue: Option<String>) -> Result<(), String> {
    // Check if game exists
    let _game = ctx.db.games().iter()
        .find(|g| g.game_id == game_id)
        .ok_or("Game not found")?;

    // Find and delete existing tag if it exists (globally)
    if let Some(existing_tag) = ctx.db.tags().iter()
        .find(|t| t.tag_id == tag_id) {
        ctx.db.tags().delete(existing_tag);
        log::info!("Deleted existing tag: {} before activating", tag_id);
    }

    // Create new tag as active
    ctx.db.tags().insert(Tag {
        tag_id: tag_id.clone(),
        game_id: game_id.clone(),
        is_active: true,
        order_index,
        clue,
        lat: None,
        lon: None,
        accuracy_m: None,
        activated_by: None,
        activated_at: None,
    });

    log::info!("Activated tag: {} in game: {}", tag_id, game_id);
    Ok(())
}

// Activate a tag with geolocation (organizer only)
#[reducer]
pub fn activate_tag_with_location(ctx: &ReducerContext, game_id: String, tag_id: String, lat: f64, lon: f64, accuracy_m: i32, activated_by: String, order_index: i32, clue: Option<String>) -> Result<(), String> {
    // Check if game exists
    let _game = ctx.db.games().iter()
        .find(|g| g.game_id == game_id)
        .ok_or("Game not found")?;

    // Find and delete existing tag if it exists (globally)
    if let Some(existing_tag) = ctx.db.tags().iter()
        .find(|t| t.tag_id == tag_id) {
        ctx.db.tags().delete(existing_tag);
        log::info!("Deleted existing tag: {} before activating with location", tag_id);
    }

    // Create new tag as active with geolocation
    ctx.db.tags().insert(Tag {
        tag_id: tag_id.clone(),
        game_id: game_id.clone(),
        is_active: true,
        order_index, // Use provided order_index
        clue: clue.clone(), // Use provided clue (clone for logging)
        lat: Some(lat),
        lon: Some(lon),
        accuracy_m: Some(accuracy_m),
        activated_by: Some(activated_by),
        activated_at: None, // TODO: Use proper timestamp when available
    });

    log::info!("Activated tag: {} in game: {} with location: {:.5}, {:.5} (±{}m), order: {}, clue: {:?}", 
               tag_id, game_id, lat, lon, accuracy_m, order_index, clue);
    Ok(())
}

// Claim a tag (players only) - must be in order
#[reducer]
pub fn claim_tag(ctx: &ReducerContext, game_id: String, player_id: String, tag_id: String) -> Result<(), String> {
    // Check if game exists and is active
    let game = ctx.db.games().iter()
        .find(|g| g.game_id == game_id)
        .ok_or("Game not found")?;
    
    if game.status != "active" {
        return Err("Game is not active".to_string());
    }

    // Check if tag exists and is active
    let tag = ctx.db.tags().iter()
        .find(|t| t.tag_id == tag_id && t.game_id == game_id)
        .ok_or("Tag not found")?;
    
    if !tag.is_active {
        return Err("Tag is not active".to_string());
    }

    // Check if player has already claimed this tag
    let existing_progress = ctx.db.progress().iter()
        .find(|p| p.game_id == game_id && p.player_id == player_id && p.tag_id == tag_id);

    if existing_progress.is_some() {
        return Ok(()); // Already claimed, ignore
    }

    // Check if player can claim this tag (must have claimed all previous tags)
    let player_progress: Vec<_> = ctx.db.progress().iter()
        .filter(|p| p.game_id == game_id && p.player_id == player_id)
        .collect();

    // Check if they've claimed all tags with order_index < current tag's order_index
    for i in 1..tag.order_index {
        let has_claimed = player_progress.iter()
            .any(|p| p.order_index == i);
        if !has_claimed {
            return Err(format!("You must claim tag with order {} first", i));
        }
    }

    // Record the claim
    ctx.db.progress().insert(Progress {
        game_id: game_id.clone(),
        player_id: player_id.clone(),
        tag_id: tag_id.clone(),
        order_index: tag.order_index,
        timestamp: 0, // Simple timestamp
    });

    log::info!("Player {} claimed tag: {} in game: {}", player_id, tag_id, game_id);
    Ok(())
}

// Delete a tag (organizer only)
#[reducer]
pub fn delete_tag(ctx: &ReducerContext, tag_id: String) -> Result<(), String> {
    // Find the tag to delete
    if let Some(tag) = ctx.db.tags().iter().find(|t| t.tag_id == tag_id) {
        // Delete all progress entries for this tag
        let progress_entries: Vec<_> = ctx.db.progress().iter()
            .filter(|p| p.tag_id == tag_id)
            .collect();
        
        for progress in progress_entries {
            ctx.db.progress().delete(progress);
        }
        
        // Delete the tag itself
        ctx.db.tags().delete(tag);
        
        log::info!("Deleted tag: {} and all associated progress entries", tag_id);
    } else {
        return Err(format!("Tag {} not found", tag_id));
    }
    
    Ok(())
}

// Register a player
#[reducer]
pub fn upsert_player(ctx: &ReducerContext, player_id: String, name: String, role: Option<String>) -> Result<(), String> {
    ctx.db.players().insert(Player {
        player_id: player_id.clone(),
        name: name.clone(),
    });

    log::info!("Registered player: {} ({}) with role: {:?}", name, player_id, role);
    Ok(())
}