'use client';

import { useState, useEffect } from 'react';
import { getSpacetimeDBConnection } from '../../lib/spacetimedb';

export default function AdminPage() {
  const [games, setGames] = useState([]);
  const [tags, setTags] = useState([]);
  const [players, setPlayers] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    const setupConnection = async () => {
      try {
        console.log('Starting connection setup...');
        
        const connection = getSpacetimeDBConnection();
        console.log('Connection object created');
        
        // Wait for connection.db to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout: connection.db not ready.'));
          }, 10000);
          
          const checkDbReady = () => {
            if (connection && connection.db) {
              clearTimeout(timeout);
              console.log('Connection.db exists: true');
              resolve(connection);
            } else {
              console.log('Checking connection state...');
              setTimeout(checkDbReady, 200);
            }
          };
          setTimeout(checkDbReady, 500);
        });

        console.log('Attempting to subscribe to all tables...');

        const subscription = connection
          .subscriptionBuilder()
          .onApplied(() => {
            console.log('Subscription applied!');
            const gamesTable = (connection.db).games;
            const tagsTable = (connection.db).tags;
            const playersTable = (connection.db).players;
            const progressTable = (connection.db).progress;
            
            if (gamesTable) {
              const gamesData = gamesTable.iter();
              console.log(`Found ${gamesData.length} games:`, gamesData);
              setGames(gamesData);
            }
            
            if (tagsTable) {
              const tagsData = tagsTable.iter();
              console.log(`Found ${tagsData.length} tags:`, tagsData);
              setTags(tagsData);
            }
            
            if (playersTable) {
              const playersData = playersTable.iter();
              console.log(`Found ${playersData.length} players:`, playersData);
              setPlayers(playersData);
            }
            
            if (progressTable) {
              const progressData = progressTable.iter();
              console.log(`Found ${progressData.length} progress entries:`, progressData);
              setProgress(progressData);
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
      const response = await fetch(`http://localhost:3000/v1/database/scavengerhunt/call/${reducerName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to call ${reducerName}: ${errorText}`);
      }
      
      console.log(`Successfully called ${reducerName}`);
    } catch (err) {
      console.error(`Error calling ${reducerName}:`, err);
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  // Delete functions
  const deleteTag = (tagId) => {
    if (confirm(`Are you sure you want to delete tag "${tagId}"?`)) {
      callReducer('delete_tag', [tagId]);
    }
  };

  const deletePlayer = (playerId) => {
    if (confirm(`Are you sure you want to delete player "${playerId}"?`)) {
      callReducer('delete_player', [playerId]);
    }
  };

  const deleteGame = (gameId) => {
    if (confirm(`Are you sure you want to delete game "${gameId}"?`)) {
      callReducer('delete_game', [gameId]);
    }
  };

  const toggleTagActive = (tagId, isActive) => {
    callReducer('set_tag_active', [tagId, !isActive]);
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

  // Get the current active game
  const currentGame = games.find(game => game.status === 'active') || games[0];

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
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🎯 Scavenger Hunt Admin</h1>
          <p className="text-gray-600">Real-time game management dashboard</p>
        </div>
        
        {/* Game Status Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900">Game Status</h2>
            {currentGame && (
              <button
                onClick={() => deleteGame(currentGame.gameId)}
                className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition-colors"
              >
                Delete Game
              </button>
            )}
          </div>
          {currentGame ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-sm font-medium text-gray-500">Game ID</span>
                <p className="text-lg font-semibold text-gray-900 mt-1">{currentGame.gameId}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <span className="text-sm font-medium text-gray-500">Status</span>
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
                  {currentGame.startedAt ? new Date(currentGame.startedAt).toLocaleString() : 'Not started'}
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
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">🏷️ NFC Tags</h2>
            <div className="space-y-4">
              {tags && tags.length > 0 ? (
                tags.map((tag, index) => (
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
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => toggleTagActive(tag.tagId, tag.isActive)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                            tag.isActive 
                              ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {tag.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => deleteTag(tag.tagId)}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Order:</span>
                        <span className="ml-2 font-medium">{tag.orderIndex}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Game:</span>
                        <span className="ml-2 font-medium">{tag.gameId}</span>
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
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">📊 Recent Progress</h2>
            <div className="space-y-4">
              {progress && progress.length > 0 ? (
                progress.slice(0, 8).map((entry, index) => (
                  <div key={`${entry.gameId}-${entry.playerId}-${entry.tagId}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{entry.playerId}</h3>
                      <span className="text-sm text-gray-500">
                        {new Date(entry.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Claimed:</span>
                        <span className="ml-2 font-medium text-green-600">{entry.tagId}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Game:</span>
                        <span className="ml-2 font-medium">{entry.gameId}</span>
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

        {/* Players Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-8 border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">👥 Registered Players</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {players && players.length > 0 ? (
              players.map((player, index) => (
                <div key={`${player.playerId}-${index}`} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-lg">{player.name}</h3>
                    <button
                      onClick={() => deletePlayer(player.playerId)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">ID:</span>
                      <span className="ml-2 font-medium">{player.playerId}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Team:</span>
                      <span className="ml-2 font-medium text-blue-600">{formatTeam(player.team)}</span>
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
            <span className="font-medium">Connected to SpacetimeDB - Data updates in real-time</span>
          </div>
        </div>
      </div>
    </div>
  );
}