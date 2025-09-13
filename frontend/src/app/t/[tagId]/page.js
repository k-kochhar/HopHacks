'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRole, getPlayerData } from '../../../lib/localStorage';
import { getSpacetimeDBConnection } from '../../../lib/spacetimedb';
import { countPlayerClaims, hasPlayerClaimedTag } from '../../../lib/utils';

/**
 * NFC Tag interaction page
 * 
 * TODO: Later this will integrate with SpacetimeDB to:
 * - Subscribe to game status, tag status, and player progress
 * - Call claim_tag reducer when player claims a tag
 * - Call activate_tag reducer when organizer activates a tag
 * - Real-time updates for tag status changes
 */

export default function TagPage() {
  const params = useParams();
  const router = useRouter();
  const tagId = params.tagId;

  const [role, setRole] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [currentGameId, setCurrentGameId] = useState(null);
  
  // SpacetimeDB data
  const [games, setGames] = useState([]);
  const [tags, setTags] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Set current game ID when games are loaded
  useEffect(() => {
    if (games.length > 0 && !currentGameId) {
      setCurrentGameId(games[0].gameId);
    }
  }, [games, currentGameId]);

  // SpacetimeDB connection
  useEffect(() => {
    const setupConnection = async () => {
      try {
        console.log('Tag page: Starting connection setup...');
        
        const connection = getSpacetimeDBConnection();
        console.log('Tag page: Connection object created');
        
        // Wait for connection.db to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('Tag page: Connection timeout: connection.db not ready.');
            reject(new Error('Connection timeout: connection.db not ready.'));
          }, 10000);
          
          const checkDbReady = () => {
            if (connection && connection.db) {
              console.log('Tag page: Connection ready.');
              clearTimeout(timeout);
              resolve(connection);
            } else {
              setTimeout(checkDbReady, 200);
            }
          };
          setTimeout(checkDbReady, 500);
        });

        console.log('Tag page: Attempting to subscribe to all tables...');

        const subscription = connection
          .subscriptionBuilder()
          .onApplied(() => {
            console.log('Tag page: Subscription applied!');
            
            // Get data
            const gamesData = connection.db.games.iter();
            const tagsData = connection.db.tags.iter();
            const playersData = connection.db.players.iter();
            const progressData = connection.db.progress.iter();
            
            console.log('Tag page: Data updated:', {
              games: gamesData.length,
              tags: tagsData.length,
              players: playersData.length,
              progress: progressData.length
            });
            
            setGames(gamesData);
            setTags(tagsData);
            setProgress(progressData);
            
            // If no games, create one
            if (gamesData.length === 0) {
              const gameId = `game_${Date.now()}`;
              callReducer('create_game', [gameId]);
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

        console.log('Tag page: Subscription created');

        return () => {
          console.log('Tag page: Unsubscribing from tables.');
          subscription.unsubscribe();
        };
      } catch (err) {
        console.error('Tag page: SpacetimeDB connection error:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    let cleanup;
    setupConnection().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, []);

  const callReducer = async (reducerName, args) => {
    try {
      const response = await fetch(`http://localhost:3000/v1/database/hunt/call/${reducerName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to call ${reducerName}: ${errorText}`);
      }
      console.log(`Tag page: Reducer ${reducerName} called successfully.`);
    } catch (err) {
      console.error(`Tag page: Error calling reducer ${reducerName}:`, err);
      setMessage(`Error: ${err.message}`);
    }
  };

  // Get current game status
  const currentGame = currentGameId ? games.find(game => game.gameId === currentGameId) : null;
  const gameStatus = currentGame?.status || 'setup';
  
  // Check if this specific tag exists and is active
  const currentTag = tags.find(tag => tag.tagId === tagId);
  const tagActive = currentTag?.isActive || false;
  const tagExists = !!currentTag;
  
  // Check if player has already claimed this tag
  const tagClaimed = playerData && currentGameId ? hasPlayerClaimedTag(progress, playerData.playerId, tagId, currentGameId) : false;
  
  // Count player's total claims
  const playerClaimCount = playerData ? countPlayerClaims(progress, playerData.playerId) : 0;
  const totalActiveTags = currentGameId ? tags.filter(tag => tag.gameId === currentGameId && tag.isActive).length : 0;
  

  useEffect(() => {
    // Get user data from localStorage
    const userRole = getRole();
    const userPlayerData = getPlayerData();
    
    setRole(userRole);
    setPlayerData(userPlayerData);
  }, [tagId]);




  const handleActivateTag = async () => {
    if (!currentGameId) {
      setMessage('No game selected');
      return;
    }
    
    setActionLoading(true);
    setMessage('');

    try {
      // Call SpacetimeDB activate_tag reducer
      const response = await fetch('http://localhost:3000/v1/database/hunt/call/activate_tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([currentGameId, tagId, null, null])
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to activate tag: ${errorText}`);
      }
      
      setMessage('Tag activated successfully! ✅');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error activating tag:', error);
      setMessage(`Failed to activate tag: ${error.message}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClaimTag = async () => {
    if (!currentGameId) {
      setMessage('No game selected');
      return;
    }
    
    setActionLoading(true);
    setMessage('');

    try {
      // Call SpacetimeDB claim_tag reducer
      const response = await fetch('http://localhost:3000/v1/database/hunt/call/claim_tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([currentGameId, playerData.playerId, tagId])
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to claim tag: ${errorText}`);
      }
      
      setMessage(`Tag claimed successfully! 🎉 You now have ${playerClaimCount + 1}/${totalActiveTags} tags.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error claiming tag:', error);
      setMessage(`Failed to claim tag: ${error.message}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading tag...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Please Join First</h3>
          <p className="text-gray-600 mb-4">You need to join the game before interacting with tags.</p>
          <button
            onClick={() => router.push('/join')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Join Game
          </button>
        </div>
      </div>
    );
  }

  // Check if tag exists
  if (!loading && !tagExists) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Tag Not Found</h3>
          <p className="text-gray-600 mb-4">The tag &quot;{tagId}&quot; doesn&apos;t exist in the current game.</p>
          <button
            onClick={() => router.push('/join')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Back to Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tag: {tagId}</h1>
              <p className="text-sm text-gray-500">
                {role === 'organizer' ? 'Organizer View' : `Player: ${playerData?.name}`}
              </p>
            </div>
            <button
              onClick={() => router.push('/join')}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Change Role
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Game Status</div>
            <div className={`text-lg font-semibold ${
              gameStatus === 'active' ? 'text-green-600' : 
              gameStatus === 'ended' ? 'text-red-600' : 'text-yellow-600'
            }`}>
              {gameStatus.toUpperCase()}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Tag Status</div>
            <div className={`text-lg font-semibold ${
              tagActive ? 'text-green-600' : 'text-gray-400'
            }`}>
              {tagActive ? 'ACTIVE' : 'INACTIVE'}
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm font-medium text-gray-500">Claimed</div>
            <div className={`text-lg font-semibold ${
              tagClaimed ? 'text-green-600' : 'text-gray-400'
            }`}>
              {tagClaimed ? 'YES' : 'NO'}
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800">{message}</p>
          </div>
        )}

        {/* Organizer View */}
        {role === 'organizer' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Organizer Actions</h2>
            
            {!tagActive ? (
              <div className="space-y-4">
                <p className="text-gray-600">This tag is not active yet. You can activate it for the current game.</p>
                <button
                  onClick={handleActivateTag}
                  disabled={actionLoading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? 'Activating...' : 'Activate Tag'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center text-green-600">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Tag is active and ready for players!</span>
                </div>
                <p className="text-sm text-gray-500">
                  Players can now find and claim this tag during the active game.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Player View */}
        {role === 'player' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Player Actions</h2>
            
            {gameStatus !== 'active' ? (
              <div className="text-center py-8">
                <div className="text-yellow-600 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Game Not Started</h3>
                <p className="text-gray-600">The scavenger hunt hasn&apos;t started yet. Please wait for the organizer to begin the game.</p>
              </div>
            ) : !tagActive ? (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Tag Not Active</h3>
                <p className="text-gray-600">This tag hasn&apos;t been activated yet by the organizer.</p>
              </div>
            ) : tagClaimed ? (
              <div className="text-center py-8">
                <div className="text-green-600 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Already Claimed!</h3>
                <p className="text-gray-600">You have claimed {playerClaimCount}/{totalActiveTags} tags so far.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-green-600 mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Tag Found!</h3>
                  <p className="text-gray-600 mb-4">This tag is active and ready to be claimed.</p>
                </div>
                
                <button
                  onClick={handleClaimTag}
                  disabled={actionLoading}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium"
                >
                  {actionLoading ? 'Claiming...' : 'Claim This Tag!'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Connected to live SpacetimeDB data. Writes will be added in Step 3.
          </p>
        </div>
      </div>
    </div>
  );
}
