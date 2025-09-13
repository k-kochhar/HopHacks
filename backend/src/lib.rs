use spacetimedb::{table, reducer, Table, ReducerContext, Timestamp};

#[table(name = game)]
#[derive(Clone)]
pub struct Game {
    #[primary_key]
    pub game_id: u64,
    #[unique]
    pub code: String,
    pub name: String,
    pub created_at: Timestamp,
    pub is_active: bool,
}

#[table(name = player)]
#[derive(Clone)]
pub struct Player {
    #[primary_key]
    pub player_id: u64,
    pub display_name: String,
    pub created_at: Timestamp,
}

#[table(name = player_game)]
#[derive(Clone)]
pub struct PlayerGame {
    #[primary_key]
    pub player_game_id: u64,
    pub player_id: u64,
    pub game_id: u64,
    pub joined_at: Timestamp,
    pub checkpoints_scanned: u32,
    pub last_scan_at: Option<Timestamp>,
    pub next_required: u32,
}

#[table(name = checkpoint)]
#[derive(Clone)]
pub struct Checkpoint {
    #[primary_key]
    pub checkpoint_id: u64,
    pub game_id: u64,
    pub nfc_uid: String,
    pub location_name: String,
    pub order_index: u32,
    pub created_at: Timestamp,
}

#[table(name = scan_event)]
#[derive(Clone)]
pub struct ScanEvent {
    #[primary_key]
    pub scan_id: u64,
    pub game_id: u64,
    pub player_id: u64,
    pub checkpoint_id: u64,
    pub scanned_at: Timestamp,
    pub client_token: String,
}

fn get_next_game_id(ctx: &ReducerContext) -> u64 {
    // Use table count + 1 for unique ID generation
    ctx.db.game().iter().count() as u64 + 1
}

fn get_next_player_id(ctx: &ReducerContext) -> u64 {
    ctx.db.player().iter().count() as u64 + 1
}

fn get_next_checkpoint_id(ctx: &ReducerContext) -> u64 {
    ctx.db.checkpoint().iter().count() as u64 + 1
}

fn get_next_player_game_id(ctx: &ReducerContext) -> u64 {
    ctx.db.player_game().iter().count() as u64 + 1
}

fn get_next_scan_id(ctx: &ReducerContext) -> u64 {
    ctx.db.scan_event().iter().count() as u64 + 1
}

fn generate_unique_code(ctx: &ReducerContext) -> String {
    // Simple approach: use game count + prefix to ensure uniqueness
    let count = ctx.db.game().iter().count();
    format!("GAME{:04}", count + 1)
}

#[reducer]
pub fn create_game(ctx: &ReducerContext, name: String) {
    let game_id = get_next_game_id(ctx);
    let code = generate_unique_code(ctx);

    let game = Game {
        game_id,
        code,
        name,
        created_at: ctx.timestamp,
        is_active: true,
    };

    ctx.db.game().try_insert(game).ok();
}

#[reducer]
pub fn register_checkpoint(
    ctx: &ReducerContext,
    game_code: String,
    nfc_uid: String,
    location_name: String,
    order_index: u32,
) {
    if order_index == 0 {
        return;
    }
    
    let game = match ctx.db.game().iter().find(|g| g.code == game_code) {
        Some(g) => g,
        None => return,
    };
    
    // Check for duplicates
    for checkpoint in ctx.db.checkpoint().iter() {
        if checkpoint.game_id == game.game_id && 
           (checkpoint.nfc_uid == nfc_uid || checkpoint.order_index == order_index) {
            return;
        }
    }
    
    let checkpoint = Checkpoint {
        checkpoint_id: get_next_checkpoint_id(ctx),
        game_id: game.game_id,
        nfc_uid,
        location_name,
        order_index,
        created_at: ctx.timestamp,
    };
    
    ctx.db.checkpoint().try_insert(checkpoint).ok();
}

#[reducer]
pub fn join_game(
    ctx: &ReducerContext,
    game_code: String,
    display_name: String,
) {
    let game = match ctx.db.game().iter().find(|g| g.code == game_code) {
        Some(g) => g,
        None => return,
    };
    
    if !game.is_active {
        return;
    }
    
    let player_id = get_next_player_id(ctx);
    let player = Player {
        player_id,
        display_name,
        created_at: ctx.timestamp,
    };
    
    if ctx.db.player().try_insert(player).is_err() {
        return;
    }

    let player_game = PlayerGame {
        player_game_id: get_next_player_game_id(ctx),
        player_id,
        game_id: game.game_id,
        joined_at: ctx.timestamp,
        checkpoints_scanned: 0,
        last_scan_at: None,
        next_required: 1,
    };
    
    ctx.db.player_game().try_insert(player_game).ok();
}

#[reducer]
pub fn scan_checkpoint(
    ctx: &ReducerContext,
    player_id: u64,
    game_code: String,
    nfc_uid: String,
    client_token: String,
) {
    let game = match ctx.db.game().iter().find(|g| g.code == game_code) {
        Some(g) => g,
        None => return,
    };
    
    if !game.is_active {
        return;
    }
    
    let checkpoint = match ctx.db.checkpoint().iter()
        .find(|cp| cp.game_id == game.game_id && cp.nfc_uid == nfc_uid) {
        Some(cp) => cp,
        None => return,
    };
    
    let player_game = match ctx.db.player_game().iter()
        .find(|pg| pg.player_id == player_id && pg.game_id == game.game_id) {
        Some(pg) => pg,
        None => return,
    };
    
    // Order enforcement: must scan checkpoints in sequence
    if checkpoint.order_index != player_game.next_required {
        return;
    }
    
    // Check if already scanned
    let already_scanned = ctx.db.scan_event().iter()
        .any(|se| se.game_id == game.game_id &&
                  se.player_id == player_id &&
                  se.checkpoint_id == checkpoint.checkpoint_id);
    
    if already_scanned {
        return;
    }
    
    // Record the scan
    let scan_event = ScanEvent {
        scan_id: get_next_scan_id(ctx),
        game_id: game.game_id,
        player_id,
        checkpoint_id: checkpoint.checkpoint_id,
        scanned_at: ctx.timestamp,
        client_token,
    };
    
    if ctx.db.scan_event().try_insert(scan_event).is_err() {
        return;
    }
    
    // Update player progress
    let updated_player_game = PlayerGame {
        player_game_id: player_game.player_game_id,
        player_id: player_game.player_id,
        game_id: player_game.game_id,
        joined_at: player_game.joined_at,
        checkpoints_scanned: player_game.checkpoints_scanned + 1,
        last_scan_at: Some(ctx.timestamp),
        next_required: player_game.next_required + 1,
    };
    
    ctx.db.player_game().player_game_id().delete(&player_game.player_game_id);
    ctx.db.player_game().try_insert(updated_player_game).ok();
}