# SpacetimeDB Setup Instructions

## Prerequisites

1. **Install SpacetimeDB CLI:**
   ```bash
   curl -L https://install.spacetimedb.com | sh
   export PATH="$HOME/.local/bin:$PATH"
   ```

2. **Install Rust (if not already installed):**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source ~/.cargo/env
   rustup update
   ```

3. **Install Node.js and npm:**
   - Download from [nodejs.org](https://nodejs.org/) or use a version manager like nvm

## 1. Project Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd HopHacks
   ```

2. **Install frontend dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## 2. SpacetimeDB Server Setup

1. **Build the SpacetimeDB module:**
   ```bash
   spacetime build --project-path server
   ```

2. **Start SpacetimeDB server:**
   ```bash
   spacetime start --in-memory
   ```
   This starts SpacetimeDB on `localhost:3000` with an in-memory database.

3. **Publish the module:**
   ```bash
   spacetime publish scavengerhunt server/target/wasm32-unknown-unknown/release/spacetimedb_scavengerhunt.wasm
   ```

4. **Generate TypeScript bindings:**
   ```bash
   spacetime generate --lang typescript --out-dir frontend/src/module_bindings
   ```

## 3. Environment Configuration

Create a `.env.local` file in the `frontend/` directory:

```env
# SpacetimeDB Configuration
NEXT_PUBLIC_SPACETIMEDB_HOST=localhost:3000
NEXT_PUBLIC_SPACETIMEDB_NAME=scavengerhunt
```

## 4. Seed Test Data

Run these commands to populate the database with test data:

```bash
# Create a game
spacetime call scavengerhunt create_game demo_game

# Add tags to the game
spacetime call scavengerhunt add_tag tag_001 demo_game '{"some": "Find the red door"}' 1
spacetime call scavengerhunt add_tag tag_002 demo_game '{"some": "Look under the table"}' 2
spacetime call scavengerhunt add_tag tag_003 demo_game '{"some": "Check the bookshelf"}' 3

# Activate some tags
spacetime call scavengerhunt set_tag_active tag_001 true
spacetime call scavengerhunt set_tag_active tag_002 true

# Register players
spacetime call scavengerhunt register_player player_001 "Alice" '{"some": "Team Alpha"}'
spacetime call scavengerhunt register_player player_002 "Bob" '{"some": "Team Beta"}'
spacetime call scavengerhunt register_player player_003 "Charlie" '{"some": "Team Alpha"}'

# Start the game
spacetime call scavengerhunt start_game demo_game
```

## 5. Start the Frontend

1. **Start Next.js development server:**
   ```bash
   cd frontend
   PORT=3001 npm run dev
   ```

2. **Visit the admin dashboard:**
   - Go to `http://localhost:3001/admin`
   - You should see live data from SpacetimeDB

## 6. Testing the Setup

1. **Verify data is loading:**
   - The admin dashboard should show the demo game, tags, and players
   - Data should load without infinite loading screens

2. **Test real-time updates:**
   - Open another terminal and run:
     ```bash
     spacetime call scavengerhunt set_tag_active tag_003 true
     ```
   - Watch the admin dashboard update automatically

3. **Test delete functionality:**
   - Click "Delete Game" on the demo_game
   - Confirm the deletion
   - Watch all related data disappear (cascade delete)

## 7. Database Schema Overview

- **games**: Tracks game sessions (setup/active/ended)
- **tags**: NFC tags that can be activated for games
- **players**: Registered players/teams  
- **progress**: Tracks which players have claimed which tags

## 8. Available Reducers

- `create_game(game_id)` - Create a new game
- `start_game(game_id)` - Start a game
- `end_game(game_id)` - End a game
- `add_tag(tag_id, game_id, clue, order_index)` - Add a tag to a game
- `set_tag_active(tag_id, is_active)` - Activate/deactivate a tag
- `register_player(player_id, name, team)` - Register a player
- `claim_tag(game_id, tag_id)` - Claim a tag (for players)
- `delete_tag(tag_id)` - Delete a tag
- `delete_player(player_id)` - Delete a player
- `delete_game(game_id)` - Delete a game and all related data

## 9. Troubleshooting

**If you get "unsupported metadata version" error:**
```bash
rustup update
cd server
cargo clean
cd ..
spacetime build --project-path server
```

**If connection fails:**
- Make sure SpacetimeDB is running: `spacetime start --in-memory`
- Check the port isn't conflicting (SpacetimeDB uses 3000, Next.js uses 3001)
- Verify the module is published: `spacetime list`

**If data doesn't load:**
- Check browser console for errors
- Verify TypeScript bindings are generated: `ls frontend/src/module_bindings/`
- Try refreshing the page

## 10. Development Workflow

1. **Make changes to Rust code** (`server/src/lib.rs`)
2. **Rebuild and republish:**
   ```bash
   spacetime build --project-path server
   spacetime publish scavengerhunt server/target/wasm32-unknown-unknown/release/spacetimedb_scavengerhunt.wasm
   spacetime generate --lang typescript --out-dir frontend/src/module_bindings
   ```
3. **Refresh the frontend** to see changes

## 11. Production Deployment

For production, you'll need to:
1. Set up a persistent SpacetimeDB instance (not in-memory)
2. Update environment variables with production URLs
3. Deploy the frontend to Vercel/Netlify
4. Configure proper CORS settings
