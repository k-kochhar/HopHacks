# Scavenger Hunt with SpacetimeDB

A hackathon project for a real-time scavenger hunt using SpacetimeDB and NFC checkpoints with strict ordering.

## 🎯 Features

- **Ordered Checkpoints**: Players must scan checkpoints in sequence (1 → 2 → 3...)
- **Real-time Updates**: Live leaderboards and progress tracking via SpacetimeDB
- **NFC Integration**: Use NFC tags at physical locations as checkpoints
- **Game Management**: Create games with join codes, register checkpoints, track progress

## 🏗️ Backend API

### Core Mutations

#### `create_game(name: String) -> (game_id, code)`
Creates a new scavenger hunt game with a unique 6-character join code.

#### `register_checkpoint(game_code, nfc_uid, location_name, order_index, lat?, lng?)`
Registers an NFC checkpoint with strict order enforcement. Each `order_index` must be unique within a game.

#### `join_game(game_code, display_name) -> (player_id, player_game_id, game_id)`
Players join a game using the join code and start at checkpoint 1.

#### `scan_checkpoint(player_id, game_code, nfc_uid, client_token) -> ScanResult`
Core scanning logic with order enforcement:
- ✅ **ACCEPTED**: Correct order, advances progress
- ❌ **REJECTED_OUT_OF_ORDER**: Must scan checkpoint X first  
- ⏭️ **IGNORED_OUT_OF_ORDER**: Already passed this checkpoint
- 🔄 **ALREADY_SCANNED**: Duplicate scan prevention

### Query Functions

- `get_game_info(game_code)` - Game details and stats
- `get_player_progress(player_id, game_code)` - Individual progress
- `get_leaderboard(game_code)` - Ranked players by progress and time
- `get_checkpoints(game_code)` - Ordered list of checkpoints

## 🗄️ Data Model

```rust
Game: { game_id, code, name, created_at, is_active }
Player: { player_id, display_name, created_at }
PlayerGame: { player_game_id, player_id, game_id, checkpoints_scanned, next_required }
Checkpoint: { checkpoint_id, game_id, nfc_uid, location_name, order_index, lat?, lng? }
ScanEvent: { scan_id, game_id, player_id, checkpoint_id, scanned_at, client_token }
```

## 🚀 Getting Started

### Prerequisites
- Rust 1.78.0+ 
- SpacetimeDB CLI

### Build & Deploy
```bash
# Install SpacetimeDB CLI
curl -fsSL https://install.spacetimedb.com | bash

# Build the module
cargo build --release

# Deploy to SpacetimeDB (create account first)
spacetimedb deploy --name scavenger-hunt
```

### Example Usage Flow
```bash
# 1. Create game
spacetimedb call scavenger-hunt create_game "Campus Quest"
# Returns: (1, "ABC123")

# 2. Register checkpoints (in order!)
spacetimedb call scavenger-hunt register_checkpoint "ABC123" "04:A2:BC:1D:90:7F:11" "Library" 1 38.986 -76.944
spacetimedb call scavenger-hunt register_checkpoint "ABC123" "04:A2:BC:1D:90:7F:22" "Cafeteria" 2 38.987 -76.945

# 3. Player joins
spacetimedb call scavenger-hunt join_game "ABC123" "Alice"
# Returns: (101, 201, 1)

# 4. Player scans checkpoint 1
spacetimedb call scavenger-hunt scan_checkpoint 101 "ABC123" "04:A2:BC:1D:90:7F:11" "unique-token-1"
# Returns: "ACCEPTED:1:2:1:Library"

# 5. Player tries to skip to checkpoint 3 (will be rejected!)
spacetimedb call scavenger-hunt scan_checkpoint 101 "ABC123" "04:A2:BC:1D:90:7F:33" "unique-token-2"  
# Returns: "REJECTED_OUT_OF_ORDER:2:3:You need checkpoint #2 first"
```

## 📱 Client Integration

### Web NFC (Android Chrome)
```javascript
async function scanNFC() {
  const ndef = new NDEFReader();
  await ndef.scan();
  ndef.onreading = async (event) => {
    const nfcUid = event.serialNumber;
    const result = await spacetimedb.call("scan_checkpoint", {
      player_id: currentPlayerId,
      game_code: currentGameCode, 
      nfc_uid: nfcUid,
      client_token: crypto.randomUUID()
    });
    handleScanResult(result);
  };
}
```

### iOS Fallback (QR Codes)
For iOS devices without Web NFC support, place QR codes alongside NFC tags containing the same `nfc_uid`.

## 🎨 Making It Unique

1. **Dynamic Checkpoints**: Some unlock only after conditions are met
2. **Team Battles**: Teams can "lock" checkpoints temporarily  
3. **AR Hints**: Show AR clues after scanning
4. **Themed Narratives**: "Time Travelers' Quest" or "Hackers vs Guardians"
5. **Spectator Mode**: Live dashboard for judges/audience

## 🏁 Demo Tips

- **Judges can play**: Hand them phones with the game loaded
- **Live leaderboard**: Display real-time updates on a big screen
- **Order enforcement**: Show the rejection when scanning out of order
- **Real-time sync**: Multiple players scanning simultaneously

Built with ❤️ for hackathons using SpacetimeDB's real-time multiplayer database.