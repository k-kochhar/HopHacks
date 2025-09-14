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
    if (!timestamp || timestamp === 0) return 'Not set';
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <div className="text-lg text-gray-600">Loading data from SpacetimeDB...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h2>
            <p className="text-red-700">{error}</p>
            <p className="text-red-600 text-sm mt-2">
              Make sure your SpacetimeDB instance is running and accessible.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <style jsx>{`
        .scrollable-content::-webkit-scrollbar {
          width: 6px;
        }
        .scrollable-content::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        .scrollable-content::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        .scrollable-content::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🎯 Scavenger Hunt Admin</h1>
          <p className="text-gray-600">Real-time game management dashboard</p>
        </div>
        
        {/* Warning Banner for Existing Data */}
        {games.length > 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Existing game data found.</strong> Creating a new game will permanently delete all current data (games, tags, progress, players).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Game Status Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">Game Status</h2>
            <div className="flex space-x-2">
              <button
                onClick={createGame}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors font-medium"
                title="This will delete all existing data and start fresh"
              >
                🗑️ New Game (Wipe All)
              </button>
              {currentGame && (
                <>
                  {currentGame.status === 'setup' && (
                    <button
                      onClick={startGame}
                      className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 transition-colors"
                    >
                      Start Game
                    </button>
                  )}
                  {currentGame.status === 'active' && (
                    <button
                      onClick={endGame}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors"
                    >
                      End Game
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {currentGame ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-sm font-medium text-gray-500">Game Status</span>
                <p className={`text-lg font-semibold mt-1 ${
                  currentGame.status === 'active' ? 'text-green-600' : 
                  currentGame.status === 'setup' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {currentGame.status.toUpperCase()}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-sm font-medium text-gray-500">Started</span>
                <p className="text-lg font-semibold text-gray-900 mt-1">
                  {formatTimestamp(currentGame.startedAt)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-sm font-medium text-gray-500">Players</span>
                <p className="text-lg font-semibold text-gray-900 mt-1">{players.length}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No active game found</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Tags Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 flex flex-col h-96">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-900">🏷️ NFC Tags</h2>
              <div className="flex space-x-2">
                <button
                  onClick={createTag}
                  className="px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm hover:bg-green-200 transition-colors"
                >
                  + Add Tag
                </button>
              </div>
            </div>
            <div className="space-y-4 overflow-y-auto flex-1 pr-2 scrollable-content">
              {tags && tags.length > 0 ? (
                tags.filter(tag => currentGameId ? tag.gameId === currentGameId : true).map((tag, index) => (
                  <div key={`${tag.tagId}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-semibold text-gray-900 text-lg">{tag.tagId}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          tag.isActive 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {tag.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {tag.lat && tag.lon && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            📍 
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => deleteTag(tag.tagId)}
                          disabled={actionLoading[`delete_tag_${tag.tagId}`]}
                          className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          {actionLoading[`delete_tag_${tag.tagId}`] ? '...' : '🗑️'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Order:</span>
                        <span className="ml-2 font-medium">{tag.orderIndex}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Status:</span>
                        <span className="ml-2 font-medium">{tag.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <span className="text-gray-500 text-sm">Clue:</span>
                      <p className="text-gray-700 mt-1 font-medium">{formatClue(tag.clue)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No tags found</p>
                </div>
              )}
            </div>
          </div>

          {/* Progress Section */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 flex flex-col h-96">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">📊 Recent Progress</h2>
            <div className="space-y-4 overflow-y-auto flex-1 pr-2 scrollable-content">
              {progress && progress.length > 0 ? (
                progress.filter(entry => currentGameId ? entry.gameId === currentGameId : true).slice(0, 8).map((entry, index) => (
                  <div key={`${entry.gameId}-${entry.playerId}-${entry.tagId}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{entry.playerId}</h3>
                      <span className="text-sm text-gray-500">
                        {formatTimestamp(entry.ts)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Tag:</span>
                        <span className="ml-2 font-medium text-green-600">{entry.tagId}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Order:</span>
                        <span className="ml-2 font-medium">{entry.orderIndex}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No progress entries found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-8 border border-gray-200 flex flex-col h-80">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">🏆 Leaderboard</h2>
          <div className="space-y-4 overflow-y-auto flex-1 pr-2">
            {leaderboard && leaderboard.length > 0 ? (
              leaderboard.map((entry, index) => (
                <div key={entry.playerId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                      index === 0 ? 'bg-yellow-500' : 
                      index === 1 ? 'bg-gray-400' : 
                      index === 2 ? 'bg-orange-500' : 'bg-blue-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{entry.playerId}</h3>
                      <p className="text-sm text-gray-500">Player</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">{entry.count}</p>
                      <p className="text-sm text-gray-500">tags claimed</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No claims yet - start the game to see the leaderboard!</p>
              </div>
            )}
          </div>
        </div>

        {/* Map Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-8 border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">🗺️ Tag Locations</h2>
          <AdminMap tags={tags.filter(tag => currentGameId ? tag.gameId === currentGameId : true)} />
        </div>

        {/* Players Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-8 border border-gray-200 flex flex-col h-60">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-gray-900">👥 Registered Players</h2>
            <button
              onClick={upsertPlayer}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200 transition-colors"
            >
              Add/Update Player
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto flex-1 pr-2 scrollable-content">
            {players && players.length > 0 ? (
              players.map((player, index) => (
                <div key={`${player.playerId}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="mb-3">
                    <h3 className="font-semibold text-gray-900 text-lg">{player.name}</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">ID:</span>
                      <span className="ml-2 font-medium">{player.playerId}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                <p>No players registered</p>
              </div>
            )}
          </div>
        </div>

        {/* Connection Status */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center px-6 py-3 bg-green-100 text-green-800 rounded-xl shadow-sm">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse"></div>
            <span className="font-medium">Connected to SpacetimeDB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return <AdminPageContent />;
}
