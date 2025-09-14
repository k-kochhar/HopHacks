'use client';

import AdminMap from './components/AdminMap';

/**
 * Admin dashboard for managing the scavenger hunt game
 * 
 * TEST PLAN:
 * 1) /join as Organizer → /admin. Click "Create Game" (optional), then "Start game".
 * 2) In tag list, hit "Activate" for a tag; confirm its `is_active` flips live.
 * 3) /join as Player (name 'Alice'), confirm it calls `upsert_player` and stores `playerId`.
 * 4) Visit /t/TAG001; click "Claim" → confirm success and your X/Y increases; `/admin` leaderboard updates live.
 * 5) Try claiming TAG001 again → you should get an "already claimed" message.
 * 6) Activate and claim another tag; verify counts update across tabs instantly.
 * 7) Click "End game"; try to claim → reducer should error with "not active" and UI shows guard.
 * 
 * DELETE TEST PLAN:
 * 1) Toggle a tag active, then **Delete tag** → tag disappears from list; any of its progress rows disappear; leaderboard adjusts.
 * 2) Create a couple of claims, then **Delete progress** for one row → leaderboard decrements live.
 * 3) **Delete player (this game)** → all of their progress disappears; leaderboard re-sorts.
 * 4) **Delete game (cascade)** after typing the exact gameId:
 *    - tags list empties
 *    - progress list empties
 *    - status panel shows no game (or a message "Game not found")
 *    - if `delete_orphan_players=true`, players with no progress remaining across any game are removed (optional)
 * 5) Try to claim after game deletion (visit /t/[tagId]) → reducer guards should fail ("game not found"); UI shows the error cleanly.
 */

import { useState, useEffect } from 'react';
import { getSpacetimeDBConnection } from '../../lib/spacetimedb';
import { groupLeaderboard } from '../../lib/utils';

function AdminPageContent() {
  const [games, setGames] = useState([]);
  const [tags, setTags] = useState([]);
  const [players, setPlayers] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [currentGameId, setCurrentGameId] = useState(null);
  const [connection, setConnection] = useState(null);

  // Fallback: ensure we always have a game selected
  useEffect(() => {
    if (games.length > 0 && !currentGameId) {
      console.log('Fallback: Setting current game to first available');
      setCurrentGameId(games[0].gameId);
    }
  }, [games, currentGameId]);

  useEffect(() => {
    const setupConnection = async () => {
      try {
        console.log('Starting connection setup...');
        
        const conn = getSpacetimeDBConnection();
        console.log('Connection object created:', conn);
        console.log('Connection URI:', process.env.NEXT_PUBLIC_STDB_URI || 'ws://localhost:3000');
        console.log('Connection module name:', process.env.NEXT_PUBLIC_SPACETIMEDB_NAME || 'hunt');
        
        // Set connection in state so other functions can access it
        setConnection(conn);
        
        // Wait for connection.db to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout: connection.db not ready.'));
          }, 10000);
          
          const checkDbReady = () => {
            if (conn && conn.db) {
              clearTimeout(timeout);
              console.log('Connection.db exists: true');
              resolve(conn);
            } else {
              console.log('Checking connection state...');
              setTimeout(checkDbReady, 200);
            }
          };
          setTimeout(checkDbReady, 500);
        });

        console.log('Attempting to subscribe to all tables...');

        const subscription = conn
          .subscriptionBuilder()
          .onApplied(() => {
            console.log('Subscription applied!');
            console.log('Connection.db:', conn.db);
            console.log('Available tables:', Object.keys(conn.db || {}));
            
            // Get data
            const gamesData = conn.db.games.iter();
            const tagsData = conn.db.tags.iter();
            const playersData = conn.db.players.iter();
            const progressData = conn.db.progress.iter();
            
            console.log('Data updated:', {
              games: gamesData.length,
              tags: tagsData.length,
              players: playersData.length,
              progress: progressData.length
            });
            console.log('Games data:', gamesData);
            
            // Force React to re-render by creating new arrays
            setGames([...gamesData]);
            setTags([...tagsData]);
            setPlayers([...playersData]);
            setProgress([...progressData]);
            
            // If no games, create one
            if (gamesData.length === 0) {
              const gameId = `game_${Date.now()}`;
              // Use conn.reducers directly since connection state might not be set yet
              conn.reducers.createGame(gameId);
            } else {
              setCurrentGameId(gamesData[0].gameId);
            }
            
            setLoading(false);
          })
          .subscribe([
            'SELECT * FROM games',
            'SELECT * FROM tags',
            'SELECT * FROM players',
            'SELECT * FROM progress'
          ]);

        console.log('Subscription created');

        // Set up table callbacks for real-time updates
        console.log('Setting up table callbacks...');
        
        // Games table callbacks (insert, update, delete)
        conn.db.games.onInsert((_ctx, row) => {
          console.log('Admin: Game inserted:', row);
          setGames(prev => {
            // Check if game already exists to prevent duplicates
            const exists = prev.some(g => g.gameId === row.gameId);
            if (exists) {
              console.log('Admin: Game already exists, replacing:', row.gameId);
              return prev.map(g => g.gameId === row.gameId ? row : g);
            } else {
              console.log('Admin: Adding new game:', row.gameId);
              return [...prev, row];
            }
          });
          setCurrentGameId(row.gameId);
        });
        
        conn.db.games.onUpdate((_ctx, oldRow, newRow) => {
          console.log('Admin: Game updated:', oldRow.gameId, '->', newRow);
          setGames(prev => prev.map(g => g.gameId === oldRow.gameId ? newRow : g));
        });
        
        conn.db.games.onDelete((_ctx, row) => {
          console.log('Admin: Game deleted:', row);
          setGames(prev => prev.filter(g => g.gameId !== row.gameId));
        });

        // Tags table callbacks (insert, update, delete)
        conn.db.tags.onInsert((_ctx, row) => {
          console.log('Admin: Tag inserted:', row);
          setTags(prev => {
            // Check if tag already exists to prevent duplicates
            const exists = prev.some(t => t.tagId === row.tagId);
            if (exists) {
              console.log('Admin: Tag already exists, replacing:', row.tagId);
              return prev.map(t => t.tagId === row.tagId ? row : t);
            } else {
              console.log('Admin: Adding new tag:', row.tagId);
              return [...prev, row];
            }
          });
        });
        
        conn.db.tags.onUpdate((_ctx, oldRow, newRow) => {
          console.log('Admin: Tag updated:', oldRow.tagId, '->', newRow);
          setTags(prev => prev.map(t => t.tagId === oldRow.tagId ? newRow : t));
        });
        
        conn.db.tags.onDelete((_ctx, row) => {
          console.log('Admin: Tag deleted:', row);
          setTags(prev => prev.filter(t => t.tagId !== row.tagId));
        });

        // Players table callbacks (delete + insert pattern, no updates)
        conn.db.players.onInsert((_ctx, row) => {
          console.log('Admin: Player inserted:', row);
          setPlayers(prev => {
            // Check if player already exists to prevent duplicates
            const exists = prev.some(p => p.playerId === row.playerId);
            if (exists) {
              console.log('Admin: Player already exists, replacing:', row.playerId);
              return prev.map(p => p.playerId === row.playerId ? row : p);
            } else {
              console.log('Admin: Adding new player:', row.playerId);
              return [...prev, row];
            }
          });
        });
        
        conn.db.players.onDelete((_ctx, row) => {
          console.log('Admin: Player deleted:', row);
          setPlayers(prev => prev.filter(p => p.playerId !== row.playerId));
        });

        // Progress table callbacks (delete + insert pattern, no updates)
        conn.db.progress.onInsert((_ctx, row) => {
          console.log('Admin: Progress inserted:', row);
          setProgress(prev => {
            // Check if progress already exists to prevent duplicates
            const exists = prev.some(p => 
              p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId
            );
            if (exists) {
              console.log('Admin: Progress already exists, replacing:', row.playerId, row.tagId);
              return prev.map(p => 
                (p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId) ? row : p
              );
            } else {
              console.log('Admin: Adding new progress:', row.playerId, row.tagId);
              return [...prev, row];
            }
          });
        });
        
        conn.db.progress.onDelete((_ctx, row) => {
          console.log('Admin: Progress deleted:', row);
          setProgress(prev => prev.filter(p => 
            !(p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId)
          ));
        });

        return () => {
          console.log('Unsubscribing from tables.');
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error('Connection setup failed:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    setupConnection();
  }, []);

  // Helper function to call SpacetimeDB reducers
  const callReducer = async (reducerName, args) => {
    const actionKey = `${reducerName}_${JSON.stringify(args)}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    
    try {
      if (!connection || !connection.db) {
        throw new Error('SpacetimeDB connection not ready');
      }
      
      // Use the SpacetimeDB client's reducers
      switch (reducerName) {
        case 'create_game':
          connection.reducers.createGame(args[0]);
          break;
        case 'start_game':
          connection.reducers.startGame(args[0]);
          break;
        case 'end_game':
          connection.reducers.endGame(args[0]);
          break;
        case 'create_tag':
          connection.reducers.createTag(args[0], args[1], args[2], args[3]);
          break;
        case 'activate_tag':
          connection.reducers.activateTag(args[0], args[1], args[2], args[3]);
          break;
        case 'claim_tag':
          connection.reducers.claimTag(args[0], args[1], args[2]);
          break;
        case 'upsert_player':
          connection.reducers.upsertPlayer(args[0], args[1], args[2]);
          break;
        case 'delete_tag':
          connection.reducers.deleteTag(args[0]);
          break;
        default:
          throw new Error(`Unknown reducer: ${reducerName}`);
      }
      
      console.log(`Successfully called ${reducerName}`);
    } catch (err) {
      console.error(`Error calling ${reducerName}:`, err);
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  // Game management functions
  const createGame = async () => {
    if (!confirm('This will DELETE ALL EXISTING DATA and create a fresh game. Continue?')) {
      return;
    }
    
    // Auto-generate game ID (user never sees this)
    const finalGameId = `game_${Date.now()}`;
    
    // The create_game reducer already wipes all existing data, so we just need to call it
    callReducer('create_game', [finalGameId]);
  };

  const startGame = () => {
    if (!currentGameId) {
      alert('No game selected');
      return;
    }
    if (confirm(`Are you sure you want to start game "${currentGameId}"?`)) {
      callReducer('start_game', [currentGameId]);
    }
  };

  const endGame = () => {
    if (!currentGameId) {
      alert('No game selected');
      return;
    }
    if (confirm(`Are you sure you want to end game "${currentGameId}"?`)) {
      callReducer('end_game', [currentGameId]);
    }
  };

  // Tag management functions
  const activateTag = () => {
    if (!currentGameId) {
      alert('No game selected. This should not happen.');
      return;
    }
    
    const clue = prompt('Enter clue (optional, press Enter to skip):');
    const orderIndex = prompt('Enter order index (optional, press Enter to skip):');
    
    // Auto-generate tag ID based on existing tags for current game
    const existingTagIds = tags
      .filter(tag => tag.gameId === currentGameId)
      .map(tag => tag.tagId)
      .filter(id => id.startsWith('TAG'));
    const nextTagNumber = existingTagIds.length > 0 
      ? Math.max(...existingTagIds.map(id => parseInt(id.replace('TAG', '')))) + 1
      : 1;
    const tagId = `TAG${nextTagNumber.toString().padStart(3, '0')}`;
    
    const args = [
      currentGameId,
      tagId, 
      orderIndex && orderIndex.trim() ? parseInt(orderIndex) : 1,
      clue && clue.trim() ? clue.trim() : null
    ];
    
    callReducer('activate_tag', args);
  };

  const createTag = () => {
    if (!currentGameId) {
      alert('No game selected. This should not happen.');
      return;
    }
    
    // Auto-generate tag ID based on current tag count
    const currentTags = tags.filter(tag => currentGameId ? tag.gameId === currentGameId : true);
    const nextTagNumber = currentTags.length + 1;
    const tagId = `TAG${nextTagNumber.toString().padStart(3, '0')}`;
    
    // Auto-generate order index (same as tag count + 1)
    const orderIndex = nextTagNumber;
    
    const clue = prompt('Enter clue (optional, press Enter to skip):');
    
    // Create tag as inactive first
    const args = [
      currentGameId,
      tagId, 
      orderIndex,
      clue && clue.trim() ? clue.trim() : null
    ];
    
    callReducer('create_tag', args);
  };

  // Player management functions
  const upsertPlayer = () => {
    const playerId = prompt('Enter player ID:');
    const name = prompt('Enter player name:');
    
    if (playerId && name) {
      callReducer('upsert_player', [playerId, name, null]); // No teams needed
    }
  };

  // Tag management functions
  const deleteTag = (tagId) => {
    if (confirm(`Are you sure you want to delete tag "${tagId}"? This will also delete all progress entries for this tag.`)) {
      callReducer('delete_tag', [tagId]);
    }
  };

  // Helper function to format clue display
  const formatClue = (clue) => {
    if (!clue || clue === '(none = ())') return 'No clue';
    if (clue.startsWith('(some = "') && clue.endsWith('")')) {
      return clue.slice(9, -2);
    }
    return clue;
  };

  // Helper function to format team display
  const formatTeam = (team) => {
    if (!team || team === '(none = ())') return 'No team';
    if (team.startsWith('(some = "') && team.endsWith('")')) {
      return team.slice(9, -2);
    }
    return team;
  };

  // Helper function to format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp || timestamp === 0) return '';
    try {
      return new Date(Number(timestamp)).toLocaleString();
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Get the current active game
  const currentGame = currentGameId ? games.find(game => game.gameId === currentGameId) : null;
  
  // Generate leaderboard from progress data for current game
  const currentGameProgress = currentGameId ? progress.filter(entry => entry.gameId === currentGameId) : progress;
  const leaderboard = groupLeaderboard(currentGameProgress);

  // Helper function to get player name by ID
  const getPlayerName = (playerId) => {
    const player = players.find(p => p.playerId === playerId);
    return player ? player.name : playerId; // Fallback to ID if name not found
  };

  // Get current game stats
  const currentGameTags = currentGameId ? tags.filter(tag => tag.gameId === currentGameId) : tags;
  const activeTagsCount = currentGameTags.filter(tag => tag.isActive).length;
  const totalClaims = currentGameProgress.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600">Loading HopQuest...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-8">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md">
          <div className="flex items-center mb-4">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
              <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-red-800">Connection Error</h2>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <p className="text-red-600 text-sm">
            Make sure your SpacetimeDB instance is running and accessible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col" style={{backgroundColor: '#F9FAFB'}}>
      {/* Top Bar - Sticky Header */}
      <div className="sticky top-0 z-50 bg-white border-b" style={{borderColor: '#E5E7EB', height: '72px'}}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between h-full">
            {/* Logo & Title Group */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <img
                  src="/logo.png"
                  alt="HopQuest Logo"
                  className="h-8 w-8 object-contain"
                  onError={e => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{display: 'none', backgroundColor: '#2563EB'}}>
                  HQ
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-bold" style={{color: '#2563EB'}}>HopQuest</h1>
                    {currentGame && (
                      <div className="px-2 py-1 rounded-full text-xs font-medium" style={{
                        backgroundColor: currentGame.status === 'active' ? '#D1FAE5' : currentGame.status === 'setup' ? '#FEF3C7' : '#FEE2E2',
                        color: currentGame.status === 'active' ? '#059669' : currentGame.status === 'setup' ? '#D97706' : '#DC2626'
                      }}>
                        {currentGame.status.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <p className="text-xs" style={{color: '#6B7280'}}>Mission Control</p>
                </div>
              </div>

              {/* Compact Stats */}
              <div className="flex items-center space-x-6 ml-8">
                <div className="flex items-center space-x-1">
                  <span className="text-lg font-semibold" style={{color: '#2563EB'}}>{players.length}</span>
                  <span className="text-xs" style={{color: '#6B7280'}}>Players</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-lg font-semibold" style={{color: '#4F46E5'}}>{activeTagsCount}</span>
                  <span className="text-xs" style={{color: '#6B7280'}}>Tags</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-lg font-semibold" style={{color: '#059669'}}>{totalClaims}</span>
                  <span className="text-xs" style={{color: '#6B7280'}}>Claims</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={createGame}
                className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{backgroundColor: '#FEE2E2', color: '#DC2626'}}
                onMouseEnter={e => e.target.style.backgroundColor = '#FECACA'}
                onMouseLeave={e => e.target.style.backgroundColor = '#FEE2E2'}
                title="This will delete all existing data and start fresh"
              >
                New Game
              </button>
              {currentGame && (
                <>
                  {currentGame.status === 'setup' && (
                    <button
                      onClick={startGame}
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{backgroundColor: '#D1FAE5', color: '#059669'}}
                      onMouseEnter={e => e.target.style.backgroundColor = '#A7F3D0'}
                      onMouseLeave={e => e.target.style.backgroundColor = '#D1FAE5'}
                    >
                      Start Game
                    </button>
                  )}
                  {currentGame.status === 'active' && (
                    <button
                      onClick={endGame}
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{backgroundColor: '#FEE2E2', color: '#DC2626'}}
                      onMouseEnter={e => e.target.style.backgroundColor = '#FECACA'}
                      onMouseLeave={e => e.target.style.backgroundColor = '#FEE2E2'}
                    >
                      End Game
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Body - Split Card Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6" style={{height: 'calc(100vh - 72px - 40px)'}}>
        {/* Left Side - Hero Map Card */}
        <div className="w-full lg:w-[68%] h-full">
          <div className="h-full bg-white rounded-2xl shadow-lg border-4 p-4" style={{borderColor: '#E0E7FF', boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
            <div className="w-full h-full rounded-xl overflow-hidden" style={{borderRadius: '14px'}}>
              <AdminMap tags={currentGameTags} />
            </div>
          </div>
        </div>

        {/* Right Side - Single Stats Card with Grid Layout */}
        <div className="w-full lg:w-[32%] h-full" style={{minHeight: 0}}>
          <div className="h-full bg-white rounded-2xl shadow-lg overflow-hidden grid gap-0" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)', gridTemplateRows: 'auto auto minmax(120px, auto) 1fr', minHeight: 0}}>

            {/* Leaderboard Section */}
            <div className="p-4">
              <h3 className="text-sm font-bold" style={{color: '#4F46E5'}}>
                LEADERBOARD ({leaderboard.length})
              </h3>
              <div className="mt-3">
                {leaderboard && leaderboard.length > 0 ? (
                  <div className="space-y-2">
                    {leaderboard.slice(0, 4).map((entry, index) => (
                      <div key={entry.playerId} className="flex items-center justify-between p-2 rounded" style={{backgroundColor: '#F9FAFB'}}>
                        <div className="flex items-center space-x-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                            index === 0 ? 'bg-yellow-500' :
                            index === 1 ? 'bg-gray-400' :
                            index === 2 ? 'bg-orange-500' : ''
                          }`} style={{backgroundColor: index > 2 ? '#2563EB' : undefined}}>
                            {index + 1}
                          </div>
                          <h4 className="font-medium text-gray-900 text-sm">{getPlayerName(entry.playerId)}</h4>
                        </div>
                        <p className="text-sm font-bold" style={{color: '#2563EB'}}>{entry.count}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3" style={{color: '#6B7280'}}>
                    <p className="text-xs">No claims yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity Section */}
            <div className="p-4 border-t" style={{borderColor: '#E5E7EB'}}>
              <h3 className="text-sm font-bold" style={{color: '#4F46E5'}}>RECENT ACTIVITY</h3>
              <div className="mt-3">
                {progress && progress.length > 0 ? (
                  <div className="space-y-2">
                    {progress
                      .filter(entry => currentGameId ? entry.gameId === currentGameId : true)
                      .slice(0, 3)
                      .map((entry, index) => (
                        <div key={`${entry.gameId}-${entry.playerId}-${entry.tagId}-${index}`} className="flex items-center space-x-2 p-2 rounded" style={{backgroundColor: '#F9FAFB'}}>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{backgroundColor: '#059669'}}>
                            <span className="text-white text-xs">✓</span>
                          </div>
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {getPlayerName(entry.playerId)} → {entry.tagId}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-center py-3" style={{color: '#6B7280'}}>
                    <p className="text-xs">No activity yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Players Section */}
            <div className="p-4 flex flex-col border-t" style={{borderColor: '#E5E7EB', minHeight: 0}}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold" style={{color: '#4F46E5'}}>PLAYERS ({players.length})</h3>
                <button
                  onClick={upsertPlayer}
                  className="px-2 py-1 text-xs rounded font-medium transition-colors"
                  style={{backgroundColor: '#2563EB', color: 'white'}}
                  onMouseEnter={e => e.target.style.backgroundColor = '#1D4ED8'}
                  onMouseLeave={e => e.target.style.backgroundColor = '#2563EB'}
                >
                  + Add
                </button>
              </div>
              <div className="overflow-y-auto flex-1 mt-3 pr-2 scrollable-content" style={{minHeight: 0, maxHeight: '120px'}}>
                {players && players.length > 0 ? (
                  <div className="space-y-1">
                    {players.map((player, index) => (
                      <div key={`${player.playerId}-${index}`} className="p-2 rounded" style={{backgroundColor: '#F9FAFB'}}>
                        <h4 className="font-medium text-gray-900 text-xs truncate" style={{textOverflow: 'ellipsis', overflow: 'hidden'}}>
                          {player.name} ({player.playerId})
                        </h4>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3" style={{color: '#6B7280'}}>
                    <p className="text-xs">No players registered</p>
                  </div>
                )}
              </div>
            </div>

            {/* Tags Management Section - Takes remaining space */}
            <div className="p-4 flex flex-col border-t" style={{borderColor: '#E5E7EB', minHeight: 0}}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold" style={{color: '#4F46E5'}}>TAGS ({currentGameTags.length})</h3>
                <button
                  onClick={createTag}
                  className="px-2 py-1 text-xs rounded font-medium transition-colors"
                  style={{backgroundColor: '#059669', color: 'white'}}
                  onMouseEnter={e => e.target.style.backgroundColor = '#047857'}
                  onMouseLeave={e => e.target.style.backgroundColor = '#059669'}
                >
                  + Add
                </button>
              </div>
              <div className="overflow-y-auto flex-1 mt-3" style={{minHeight: 0}}>
                {currentGameTags && currentGameTags.length > 0 ? (
                  <div className="space-y-2">
                    {currentGameTags.map((tag, index) => (
                      <div key={`${tag.tagId}-${index}`} className="p-3 border rounded" style={{borderColor: '#E5E7EB', backgroundColor: '#F9FAFB'}}>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900 text-sm">{tag.tagId}</h4>
                          <div className="flex items-center space-x-1">
                            <span className="px-2 py-1 rounded text-xs font-medium" style={{
                              backgroundColor: tag.isActive ? '#D1FAE5' : '#F3F4F6',
                              color: tag.isActive ? '#059669' : '#6B7280'
                            }}>
                              {tag.isActive ? 'Active' : 'Inactive'}
                            </span>
                            <button
                              onClick={() => deleteTag(tag.tagId)}
                              disabled={actionLoading[`delete_tag_${tag.tagId}`]}
                              className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-50"
                              style={{backgroundColor: '#FEE2E2', color: '#DC2626'}}
                              onMouseEnter={e => !e.target.disabled && (e.target.style.backgroundColor = '#FECACA')}
                              onMouseLeave={e => !e.target.disabled && (e.target.style.backgroundColor = '#FEE2E2')}
                            >
                              Del
                            </button>
                          </div>
                        </div>
                        <div className="text-xs" style={{color: '#6B7280'}}>
                          <p>Order: {tag.orderIndex}</p>
                          <p className="truncate">Clue: {formatClue(tag.clue) || 'No clue'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3" style={{color: '#6B7280'}}>
                    <p className="text-xs">No tags found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer - Light Status Bar */}
      <div className="border-t px-6 py-2" style={{backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', height: '40px'}}>
        <div className="flex items-center justify-between text-xs h-full">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{backgroundColor: '#059669'}}></div>
            <span style={{color: '#6B7280'}}>Connected to SpacetimeDB · Last sync: {new Date().toLocaleTimeString()}</span>
          </div>
          <div style={{color: '#6B7280'}}>
            Game ID: {currentGameId || 'None'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <AdminPageContent />;
}
