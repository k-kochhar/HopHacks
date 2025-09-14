'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRole, getPlayerData } from '../../../lib/localStorage';
import { getSpacetimeDBConnection } from '../../../lib/spacetimedb';
import { countPlayerClaims, hasPlayerClaimedTag } from '../../../lib/utils';
import { formatCoord, DEFAULT_LAT, DEFAULT_LON } from '../../_lib/geo';
import GeoPickModal from '../../_components/GeoPickModal';

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
  
  // Geolocation state
  const [showGeoModal, setShowGeoModal] = useState(false);
  const [geoError, setGeoError] = useState('');
  
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
            
            // Force React to re-render by creating new arrays
            setGames([...gamesData]);
            setTags([...tagsData]);
            setProgress([...progressData]);
            
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

        // Set up table callbacks for real-time updates
        console.log('Tag page: Setting up table callbacks...');
        
        // Define callReducer function inside useEffect to access connection
        const callReducer = async (reducerName, args) => {
          try {
            if (!connection || !connection.db) {
              throw new Error('SpacetimeDB connection not ready');
            }
            
            // Use the SpacetimeDB client's callReducer method
            switch (reducerName) {
              case 'activate_tag':
                connection.reducers.activateTag(args[0], args[1], args[2], args[3]);
                break;
              case 'activate_tag_with_location':
                connection.reducers.activateTagWithLocation(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
                break;
              case 'claim_tag':
                connection.reducers.claimTag(args[0], args[1], args[2]);
                break;
              case 'create_game':
                connection.reducers.createGame(args[0]);
                break;
              default:
                throw new Error(`Unknown reducer: ${reducerName}`);
            }
            
            console.log(`Tag page: Reducer ${reducerName} called successfully.`);
          } catch (err) {
            console.error(`Tag page: Error calling reducer ${reducerName}:`, err);
            setMessage(`Error: ${err.message}`);
          }
        };
        
        // Games table callbacks (insert, update, delete)
        connection.db.games.onInsert((_ctx, row) => {
          console.log('Tag page: Game inserted:', row);
          setGames(prev => {
            // Check if game already exists to prevent duplicates
            const exists = prev.some(g => g.gameId === row.gameId);
            if (exists) {
              console.log('Tag page: Game already exists, replacing:', row.gameId);
              return prev.map(g => g.gameId === row.gameId ? row : g);
            } else {
              console.log('Tag page: Adding new game:', row.gameId);
              return [...prev, row];
            }
          });
          setCurrentGameId(row.gameId);
        });
        
        connection.db.games.onUpdate((_ctx, oldRow, newRow) => {
          console.log('Tag page: Game updated:', oldRow.gameId, '->', newRow);
          setGames(prev => prev.map(g => g.gameId === oldRow.gameId ? newRow : g));
        });

        // Tags table callbacks (insert, update, delete)
        connection.db.tags.onInsert((_ctx, row) => {
          console.log('Tag page: Tag inserted:', row);
          setTags(prev => {
            // Check if tag already exists to prevent duplicates
            const exists = prev.some(t => t.tagId === row.tagId);
            if (exists) {
              console.log('Tag page: Tag already exists, replacing:', row.tagId);
              return prev.map(t => t.tagId === row.tagId ? row : t);
            } else {
              console.log('Tag page: Adding new tag:', row.tagId);
              return [...prev, row];
            }
          });
        });
        
        connection.db.tags.onUpdate((_ctx, oldRow, newRow) => {
          console.log('Tag page: Tag updated:', oldRow.tagId, '->', newRow);
          setTags(prev => prev.map(t => t.tagId === oldRow.tagId ? newRow : t));
        });
        
        connection.db.tags.onDelete((_ctx, row) => {
          console.log('Tag page: Tag deleted:', row);
          setTags(prev => prev.filter(t => t.tagId !== row.tagId));
        });

        // Progress table callbacks (delete + insert pattern, no updates)
        connection.db.progress.onInsert((_ctx, row) => {
          console.log('Tag page: Progress inserted:', row);
          setProgress(prev => {
            // Check if progress already exists to prevent duplicates
            const exists = prev.some(p => 
              p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId
            );
            if (exists) {
              console.log('Tag page: Progress already exists, replacing:', row.playerId, row.tagId);
              return prev.map(p => 
                (p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId) ? row : p
              );
            } else {
              console.log('Tag page: Adding new progress:', row.playerId, row.tagId);
              return [...prev, row];
            }
          });
        });
        
        connection.db.progress.onDelete((_ctx, row) => {
          console.log('Tag page: Progress deleted:', row);
          setProgress(prev => prev.filter(p => 
            !(p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId)
          ));
        });

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
  
  // Check if player can claim this tag (has claimed all previous tags in order)
  const canClaimTag = () => {
    if (!playerData || !currentGameId || !currentTag) return false;
    
    // Get all active tags for this game, sorted by order
    const activeTags = tags
      .filter(tag => tag.gameId === currentGameId && tag.isActive)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    
    // Find the current tag's position
    const currentTagIndex = activeTags.findIndex(tag => tag.tagId === tagId);
    if (currentTagIndex === -1) return false;
    
    // Check if player has claimed all previous tags
    for (let i = 0; i < currentTagIndex; i++) {
      const previousTag = activeTags[i];
      const hasClaimedPrevious = hasPlayerClaimedTag(progress, playerData.playerId, previousTag.tagId, currentGameId);
      if (!hasClaimedPrevious) {
        return false;
      }
    }
    
    return true;
  };
  
  const playerCanClaimTag = canClaimTag();
  

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
      // Call SpacetimeDB activate_tag reducer using client SDK
      const connection = getSpacetimeDBConnection();
      
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        const checkReady = () => {
          if (connection && connection.reducers) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        setTimeout(checkReady, 100);
      });
      
      // Get existing tag data to preserve clue and order
      const existingOrder = currentTag?.orderIndex || 1;
      const existingClue = currentTag?.clue;
      
      // Call the reducer using the client SDK
      connection.reducers.activateTag(currentGameId, tagId, existingOrder, existingClue);
      
      setMessage('Tag activated successfully! ✅');
      setTimeout(() => {
        setMessage('');
        router.push('/admin');
      }, 1500);
    } catch (error) {
      console.error('Error activating tag:', error);
      setMessage(`Failed to activate tag: ${error.message}`);
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivateTagWithLocation = async () => {
    if (!currentGameId) {
      setMessage('No game selected');
      return;
    }

    setActionLoading(true);
    setMessage('Getting location...');
    setGeoError('');

    // Check if geolocation is available
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser. Please use the map to pick a location.');
      setShowGeoModal(true);
      setActionLoading(false);
      return;
    }

    try {
      console.log('Requesting geolocation...');
      // Request geolocation
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log('Geolocation success:', pos);
            resolve(pos);
          },
          (err) => {
            console.error('Geolocation failed:', err);
            reject(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000
          }
        );
      });

      const { latitude, longitude, accuracy } = position.coords;
      
      // Call SpacetimeDB activate_tag_with_location reducer
      const connection = getSpacetimeDBConnection();
      
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        const checkReady = () => {
          if (connection && connection.reducers) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        setTimeout(checkReady, 100);
      });
      
      // Get existing tag data to preserve clue and order
      const existingOrder = currentTag?.orderIndex || 1;
      const existingClue = currentTag?.clue;
      
      // Call the new activate_tag_with_location reducer
      connection.reducers.activateTagWithLocation(currentGameId, tagId, latitude, longitude, Math.round(accuracy), 'admin', existingOrder, existingClue);
      
      setMessage('Tag activated with location! ✅');
      setTimeout(() => {
        setMessage('');
        router.push('/admin');
      }, 1500);
    } catch (error) {
      console.error('Geolocation error:', error);

      let errorMessage = '';
      if (error.code === 1) { // PERMISSION_DENIED
        errorMessage = 'Location permission denied. Please allow location access in your browser settings, or use the map to pick a location.';
      } else if (error.code === 2) { // POSITION_UNAVAILABLE
        errorMessage = 'Location information is unavailable. Please use the map to pick a location.';
      } else if (error.code === 3) { // TIMEOUT
        errorMessage = 'Location request timed out. Please use the map to pick a location.';
      } else {
        errorMessage = `Failed to get location: ${error.message || 'Unknown error'}. Please use the map to pick a location.`;
      }

      setGeoError(errorMessage);
      setShowGeoModal(true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeoModalSave = async (lat, lon) => {
    if (!currentGameId) return;
    
    setActionLoading(true);
    setMessage('');

    try {
      const connection = getSpacetimeDBConnection();
      
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        const checkReady = () => {
          if (connection && connection.reducers) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        setTimeout(checkReady, 100);
      });
      
      // Get existing tag data to preserve clue and order
      const existingOrder = currentTag?.orderIndex || 1;
      const existingClue = currentTag?.clue || null;
      
      // Call the new activate_tag_with_location reducer
      connection.reducers.activateTagWithLocation(currentGameId, tagId, lat, lon, 0, 'admin', existingOrder, existingClue);
      
      setMessage('Tag activated with location! ✅');
      setTimeout(() => {
        setMessage('');
        router.push('/admin');
      }, 1500);
    } catch (error) {
      console.error('Error activating tag with location:', error);
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
    
    // Check if player can claim this tag (order validation)
    if (!playerCanClaimTag) {
      setMessage('❌ You must claim the previous tags in order first!');
      return;
    }
    
    setActionLoading(true);
    setMessage('');

    try {
      // Call SpacetimeDB claim_tag reducer using client SDK
      const connection = getSpacetimeDBConnection();
      
      // Wait for connection to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        const checkReady = () => {
          if (connection && connection.reducers) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        setTimeout(checkReady, 100);
      });
      
      // Call the reducer using the client SDK
      connection.reducers.claimTag(currentGameId, playerData.playerId, tagId);
      
      setMessage(`Tag claimed successfully! 🎉 You now have ${playerClaimCount + 1}/${totalActiveTags} tags.`);
      setTimeout(() => {
        setMessage('');
        router.push('/dashboard');
      }, 1500);
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
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#F9FAFB'}}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{borderColor: '#2563EB'}}></div>
          <p className="mt-2" style={{color: '#6B7280'}}>Loading tag...</p>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#F9FAFB'}}>
        <div className="text-center max-w-md mx-auto p-6">
          <h3 className="text-lg font-semibold mb-2" style={{color: '#2563EB'}}>Please Join First</h3>
          <p className="mb-4" style={{color: '#6B7280'}}>You need to join the game before interacting with tags.</p>
          <button
            onClick={() => router.push('/join')}
            className="inline-flex items-center px-4 py-2 border-0 text-sm font-medium rounded-lg text-white transition-colors"
            style={{backgroundColor: '#2563EB'}}
            onMouseEnter={e => e.target.style.backgroundColor = '#1D4ED8'}
            onMouseLeave={e => e.target.style.backgroundColor = '#2563EB'}
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
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#F9FAFB'}}>
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mb-4" style={{color: '#DC2626'}}>
            <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2" style={{color: '#2563EB'}}>Tag Not Found</h3>
          <p className="mb-4" style={{color: '#6B7280'}}>The tag &quot;{tagId}&quot; doesn&apos;t exist in the current game.</p>
          <button
            onClick={() => router.push('/join')}
            className="inline-flex items-center px-4 py-2 border-0 text-sm font-medium rounded-lg text-white transition-colors"
            style={{backgroundColor: '#2563EB'}}
            onMouseEnter={e => e.target.style.backgroundColor = '#1D4ED8'}
            onMouseLeave={e => e.target.style.backgroundColor = '#2563EB'}
          >
            Back to Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{backgroundColor: '#F9FAFB'}}>
      {/* Header */}
      <div className="bg-white shadow-sm" style={{borderBottom: '1px solid #E5E7EB'}}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              {role === 'player' && (
                <button
                  onClick={() => router.push('/dashboard')}
                  className="text-sm flex items-center transition-colors"
                  style={{color: '#2563EB'}}
                  onMouseEnter={e => e.target.style.color = '#1D4ED8'}
                  onMouseLeave={e => e.target.style.color = '#2563EB'}
                >
                  ← Back to Dashboard
                </button>
              )}
              <div>
                <h1 className="text-2xl font-bold" style={{color: '#2563EB'}}>Tag: {tagId}</h1>
                <p className="text-sm" style={{color: '#6B7280'}}>
                  {role === 'organizer' ? 'Organizer View' : `Player: ${playerData?.name}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/join')}
              className="text-sm transition-colors"
              style={{color: '#2563EB'}}
              onMouseEnter={e => e.target.style.color = '#1D4ED8'}
              onMouseLeave={e => e.target.style.color = '#2563EB'}
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
          <div className="bg-white rounded-xl shadow-lg p-4" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
            <div className="text-sm font-semibold" style={{color: '#6B7280'}}>Game Status</div>
            <div className="text-lg font-bold" style={{
              color: gameStatus === 'active' ? '#059669' :
                     gameStatus === 'ended' ? '#DC2626' : '#D97706'
            }}>
              {gameStatus.toUpperCase()}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
            <div className="text-sm font-semibold" style={{color: '#6B7280'}}>Tag Status</div>
            <div className="text-lg font-bold" style={{
              color: tagActive ? '#059669' : '#6B7280'
            }}>
              {tagActive ? 'ACTIVE' : 'INACTIVE'}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
            <div className="text-sm font-semibold" style={{color: '#6B7280'}}>Claimed</div>
            <div className="text-lg font-bold" style={{
              color: tagClaimed ? '#059669' : '#6B7280'
            }}>
              {tagClaimed ? 'YES' : 'NO'}
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className="mb-6 p-4 rounded-lg" style={{backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0'}}>
            <p style={{color: '#059669'}}>{message}</p>
          </div>
        )}

        {/* Organizer View */}
        {role === 'organizer' && (
          <div className="bg-white rounded-xl shadow-lg p-6" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
            <h2 className="text-lg font-bold mb-4" style={{color: '#2563EB'}}>Organizer Actions</h2>
            
            {!tagActive ? (
              <div className="space-y-4">
                <p style={{color: '#6B7280'}}>This tag is not active yet. You can activate it for the current game.</p>
                
                {/* Primary button for geolocation activation */}
                <button
                  onClick={handleActivateTagWithLocation}
                  disabled={actionLoading}
                  className="w-full text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{backgroundColor: '#2563EB'}}
                  onMouseEnter={e => !e.target.disabled && (e.target.style.backgroundColor = '#1D4ED8')}
                  onMouseLeave={e => !e.target.disabled && (e.target.style.backgroundColor = '#2563EB')}
                >
                  {actionLoading ? 'Activating...' : 'Activate & Save Location'}
                </button>
                
                {/* Secondary button for activation without location */}
                <button
                  onClick={handleActivateTag}
                  disabled={actionLoading}
                  className="w-full text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{backgroundColor: '#6B7280'}}
                  onMouseEnter={e => !e.target.disabled && (e.target.style.backgroundColor = '#4B5563')}
                  onMouseLeave={e => !e.target.disabled && (e.target.style.backgroundColor = '#6B7280')}
                >
                  {actionLoading ? 'Activating...' : 'Activate (no location)'}
                </button>
                
                <p className="text-xs" style={{color: '#6B7280'}}>
                  We&apos;ll ask for location permission (required once on iPhone).
                </p>
                
                {geoError && (
                  <div className="text-sm p-3 rounded" style={{color: '#DC2626', backgroundColor: '#FEE2E2'}}>
                    {geoError}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center" style={{color: '#059669'}}>
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="font-semibold">Tag is active and ready for players!</span>
                </div>
                <p className="text-sm" style={{color: '#6B7280'}}>
                  Players can now find and claim this tag during the active game.
                </p>
                
                {/* Show location info if available */}
                {currentTag && currentTag.lat && currentTag.lon && (
                  <div className="mt-4 p-3 rounded" style={{backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE'}}>
                    <div className="text-sm font-semibold mb-1" style={{color: '#2563EB'}}>Location:</div>
                    <div className="text-sm font-mono" style={{color: '#1D4ED8'}}>
                      {formatCoord(currentTag.lat, currentTag.lon)}
                    </div>
                    {currentTag.accuracyM && (
                      <div className="text-xs mt-1" style={{color: '#2563EB'}}>
                        ±{currentTag.accuracyM}m accuracy
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Player View */}
        {role === 'player' && (
          <div className="bg-white rounded-xl shadow-lg p-6" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
            <h2 className="text-lg font-bold mb-4" style={{color: '#2563EB'}}>Player Actions</h2>
            
            {gameStatus !== 'active' ? (
              <div className="text-center py-8">
                <div className="mb-2" style={{color: '#D97706'}}>
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{color: '#2563EB'}}>Game Not Started</h3>
                <p style={{color: '#6B7280'}}>The scavenger hunt hasn&apos;t started yet. Please wait for the organizer to begin the game.</p>
              </div>
            ) : !tagActive ? (
              <div className="text-center py-8">
                <div className="mb-2" style={{color: '#6B7280'}}>
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{color: '#2563EB'}}>Tag Not Active</h3>
                <p style={{color: '#6B7280'}}>This tag hasn&apos;t been activated yet by the organizer.</p>
              </div>
            ) : tagClaimed ? (
              <div className="text-center py-8">
                <div className="mb-2" style={{color: '#059669'}}>
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{color: '#2563EB'}}>Already Claimed!</h3>
                <p style={{color: '#6B7280'}}>You have claimed {playerClaimCount}/{totalActiveTags} tags so far.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mb-2" style={{color: '#059669'}}>
                    <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{color: '#2563EB'}}>Tag Found!</h3>
                  <p className="mb-4" style={{color: '#6B7280'}}>This tag is active and ready to be claimed.</p>
                </div>
                
                {!playerCanClaimTag && (
                  <div className="mb-4 p-3 rounded" style={{backgroundColor: '#FEF3C7', border: '1px solid #FDE68A'}}>
                    <p className="text-sm" style={{color: '#D97706'}}>
                      ⚠️ You must claim the previous tags in order first! Complete the earlier tags before claiming this one.
                    </p>
                    {(() => {
                      // Find the next tag the player should claim
                      const activeTags = tags
                        .filter(tag => tag.gameId === currentGameId && tag.isActive)
                        .sort((a, b) => a.orderIndex - b.orderIndex);

                      const nextTag = activeTags.find(tag =>
                        !hasPlayerClaimedTag(progress, playerData.playerId, tag.tagId, currentGameId)
                      );

                      return nextTag ? (
                        <p className="text-xs mt-1" style={{color: '#92400E'}}>
                          Next tag to claim: <span className="font-semibold">{nextTag.tagId}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
                
                <button
                  onClick={handleClaimTag}
                  disabled={actionLoading || !playerCanClaimTag}
                  className="w-full py-3 px-4 rounded-lg text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: playerCanClaimTag ? '#059669' : '#D1D5DB',
                    color: playerCanClaimTag ? 'white' : '#6B7280'
                  }}
                  onMouseEnter={e => playerCanClaimTag && !e.target.disabled && (e.target.style.backgroundColor = '#047857')}
                  onMouseLeave={e => playerCanClaimTag && !e.target.disabled && (e.target.style.backgroundColor = '#059669')}
                >
                  {actionLoading ? 'Claiming...' :
                   playerCanClaimTag ? 'Claim This Tag!' : 'Complete Previous Tags First'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-sm" style={{color: '#6B7280'}}>
            Connected to live SpacetimeDB data.
          </p>
        </div>
      </div>
      
      {/* Geolocation Modal */}
      <GeoPickModal
        open={showGeoModal}
        onClose={() => setShowGeoModal(false)}
        initialLat={DEFAULT_LAT}
        initialLon={DEFAULT_LON}
        onSave={handleGeoModalSave}
      />
    </div>
  );
}
