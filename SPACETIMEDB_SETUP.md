# NFC Scavenger Hunt - Team Setup Instructions

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

## 2. Environment Configuration

Create a `.env.local` file in the `frontend/` directory:

```env
# SpacetimeDB Configuration
NEXT_PUBLIC_STDB_URI=ws://localhost:3000
NEXT_PUBLIC_SPACETIMEDB_NAME=hunt
NEXT_PUBLIC_ORGANIZER_PASSWORD=ABC123
```

## 3. Running the System

### Step 1: Start SpacetimeDB Server (Port 3000)

1. **Navigate to server directory:**
   ```bash
   cd server
   ```

2. **Build the SpacetimeDB module:**
   ```bash
   spacetime build
   ```

3. **Start SpacetimeDB server:**
   ```bash
   spacetime start --in-memory
   ```
   This starts SpacetimeDB on `localhost:3000` with an in-memory database.

4. **Publish the module:**
   ```bash
   spacetime publish hunt
   ```

5. **Generate TypeScript bindings:**
   ```bash
   spacetime generate --lang typescript --out-dir ../frontend/src/app/module_bindings
   ```

### Step 2: Start Frontend Server (Port 3001)

1. **Open a new terminal and navigate to frontend:**
   ```bash
   cd frontend
   ```

2. **Start Next.js development server:**
   ```bash
   PORT=3001 npm run dev
   ```
   This will start the frontend on `localhost:3001`

## 4. Accessing the Application

- **Frontend (Players & Admin):** `http://localhost:3001`
- **SpacetimeDB Server:** `http://localhost:3000`

### Key Pages:
- **Join Page:** `http://localhost:3001/join` - Create player accounts or access admin
- **Admin Dashboard:** `http://localhost:3001/admin` - Manage games and tags (password: ABC123)
- **Player Dashboard:** `http://localhost:3001/dashboard` - View progress and clues
- **Tag Pages:** `http://localhost:3001/t/TAG001` - Individual tag interaction pages

## 5. Game Flow & Usage

### For Organizers:
1. **Access Admin Dashboard:** Go to `http://localhost:3001/admin` (password: ABC123)
2. **Create a New Game:** Click "Create New Game" - this wipes the database and starts fresh
3. **Create Tags:** Use "Create Tag" to add tags with clues and order numbers
4. **Activate Tags:** Scan NFC tags (e.g., `/t/TAG001`) and click "Activate Tag" to make them available
5. **Start Game:** Click "Start Game" to begin the scavenger hunt

### For Players:
1. **Join Game:** Go to `http://localhost:3001/join` and create a player account
2. **View Dashboard:** Access your dashboard at `http://localhost:3001/dashboard`
3. **Find Tags:** Use clues to locate physical NFC tags
4. **Claim Tags:** Scan NFC tags to claim them (must be done in order)
5. **Track Progress:** Watch your progress update in real-time

## 6. Testing the Setup

1. **Verify servers are running:**
   - SpacetimeDB: `http://localhost:3000` (should show SpacetimeDB interface)
   - Frontend: `http://localhost:3001` (should show the app)

2. **Test admin functionality:**
   - Go to `http://localhost:3001/admin`
   - Create a new game
   - Create and activate some tags
   - Start the game

3. **Test player functionality:**
   - Go to `http://localhost:3001/join`
   - Create a player account
   - View the dashboard with clues
   - Test tag claiming (simulate by going to `/t/TAG001`)

## 7. Database Schema Overview

- **games**: Tracks game sessions (setup/active/ended) - only one active game at a time
- **tags**: NFC tags with clues and order for sequential claiming
- **players**: Registered players with names
- **progress**: Tracks which players have claimed which tags in order

## 8. Available Reducers

- `create_game()` - Create a new game (wipes existing data)
- `start_game(game_id)` - Start a game
- `end_game(game_id)` - End a game
- `create_tag(tag_id, game_id, order_index, clue)` - Create an inactive tag
- `activate_tag(game_id, tag_id, order_index, clue)` - Activate a tag for the game
- `upsert_player(player_id, name, role)` - Register/update a player
- `claim_tag(game_id, player_id, tag_id)` - Claim a tag (sequential order required)

## 9. Troubleshooting

**If SpacetimeDB won't start:**
```bash
# Kill any existing processes
pkill -f spacetime
# Clear port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
# Start fresh
cd server
spacetime start --in-memory
```

**If connection fails:**
- Make sure SpacetimeDB is running on port 3000: `lsof -i :3000`
- Make sure Next.js is running on port 3001: `lsof -i :3001`
- Check environment variables in `frontend/.env.local`
- Verify the module is published: `spacetime list`

**If data doesn't load:**
- Check browser console for errors
- Verify TypeScript bindings are generated: `ls frontend/src/module_bindings/`
- Try refreshing the page
- Check that both servers are running

**If you get build errors:**
```bash
# Clean and rebuild
cd server
cargo clean
spacetime build
spacetime publish hunt
spacetime generate --lang typescript --out-dir ../frontend/src/module_bindings
```

## 10. Development Workflow

1. **Make changes to Rust code** (`server/src/lib.rs`)
2. **Rebuild and republish:**
   ```bash
   cd server
   spacetime build
   spacetime publish hunt
   spacetime generate --lang typescript --out-dir ../frontend/src/module_bindings
   ```
3. **Refresh the frontend** to see changes

## 11. Quick Start Commands

**Complete restart (if everything is broken):**
```bash
# Kill all processes
pkill -f spacetime && pkill -f next

# Start SpacetimeDB
cd server
spacetime start --in-memory &
sleep 5
spacetime publish hunt
spacetime generate --lang typescript --out-dir ../frontend/src/module_bindings

# Start Frontend (in new terminal)
cd frontend
npm run dev
```

**Check if everything is working:**
```bash
# Check servers
curl -s http://localhost:3000/health
curl -s http://localhost:3001 | head -5
```
