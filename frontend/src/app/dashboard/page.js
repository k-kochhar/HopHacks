'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSpacetimeDBConnection } from '../../lib/spacetimedb';
import { getPlayerData, getRole } from '../../lib/localStorage';

export default function PlayerDashboard() {
  const router = useRouter();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState([]);
  const [progress, setProgress] = useState([]);
  const [currentGame, setCurrentGame] = useState(null);
  const [playerData, setPlayerData] = useState(null);

  useEffect(() => {
    // Check if user is a player
    const role = getRole();
    if (role !== 'player') {
      router.push('/join');
      return;
    }

    const player = getPlayerData();
    if (!player) {
      router.push('/join');
      return;
    }
    setPlayerData(player);

    let subscription = null;

    // Set up SpacetimeDB connection
    const setupConnection = async () => {
      try {
        console.log('Dashboard: Starting connection setup...');
        
        const conn = getSpacetimeDBConnection();
        setConnection(conn);
        
        // Wait for connection.db to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout: connection.db not ready.'));
          }, 10000);
          
          const checkDbReady = () => {
            if (conn && conn.db) {
              clearTimeout(timeout);
              resolve();
            } else {
              setTimeout(checkDbReady, 500);
            }
          };
          setTimeout(checkDbReady, 500);
        });

        console.log('Dashboard: Attempting to subscribe to tables...');

        // Subscribe to real-time updates
        subscription = conn
          .subscriptionBuilder()
          .onApplied(() => {
            console.log('Dashboard subscription applied!');
            // Refresh data when changes are committed
            refreshData(conn, player.playerId);
          })
          .subscribe([
            'SELECT * FROM games',
            'SELECT * FROM tags',
            'SELECT * FROM progress'
          ]);

        console.log('Dashboard: Subscription created');

        // Set up table callbacks for real-time updates
        console.log('Dashboard: Setting up table callbacks...');
        
        // Tags table callbacks (delete + insert pattern, no updates)
        conn.db.tags.onInsert((_ctx, row) => {
          console.log('Dashboard: Tag inserted:', row);
          setTags(prev => {
            // Check if tag already exists to prevent duplicates
            const exists = prev.some(t => t.tagId === row.tagId);
            if (exists) {
              console.log('Dashboard: Tag already exists, replacing:', row.tagId);
              return prev.map(t => t.tagId === row.tagId ? row : t);
            } else {
              console.log('Dashboard: Adding new tag:', row.tagId);
              return [...prev, row];
            }
          });
        });
        
        conn.db.tags.onDelete((_ctx, row) => {
          console.log('Dashboard: Tag deleted:', row);
          setTags(prev => prev.filter(t => t.tagId !== row.tagId));
        });

        // Progress table callbacks (append-only, no updates)
        conn.db.progress.onInsert((_ctx, row) => {
          console.log('Dashboard: Progress inserted:', row);
          setProgress(prev => [...prev, row]);
        });
        
        conn.db.progress.onDelete((_ctx, row) => {
          console.log('Dashboard: Progress deleted:', row);
          setProgress(prev => prev.filter(p => 
            !(p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId)
          ));
        });

        // Games table callbacks (delete + insert pattern, no updates)
        conn.db.games.onInsert((_ctx, row) => {
          console.log('Dashboard: Game inserted:', row);
          setCurrentGame(row);
        });

        // Initial data load
        refreshData(conn, player.playerId);
      } catch (err) {
        console.error('Dashboard: Connection setup failed:', err);
        setLoading(false);
      }
    };

    setupConnection();

    return () => {
      if (subscription) {
        console.log('Dashboard: Unsubscribing from tables.');
        subscription.unsubscribe();
      }
    };
  }, [router]);

  const refreshData = async (conn, playerId) => {
    try {
      // Get current game
      const games = conn.db.games.iter();
      if (games.length > 0) {
        setCurrentGame(games[0]);
        const gameId = games[0].gameId;

        // Get all tags for current game
        const allTags = conn.db.tags.iter()
          .filter(tag => tag.gameId === gameId);
        // Force React to re-render by creating new arrays
        setTags([...allTags]);

        // Get player's progress
        const playerProgress = conn.db.progress.iter()
          .filter(p => p.gameId === gameId && p.playerId === playerId);
        setProgress([...playerProgress]);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTagStatus = (tagId) => {
    const tagProgress = progress.find(p => p.tagId === tagId);
    return tagProgress ? 'completed' : 'pending';
  };

  const getNextTagToFind = () => {
    // Find the first tag that hasn't been completed
    const sortedTags = [...tags].sort((a, b) => a.orderIndex - b.orderIndex);
    return sortedTags.find(tag => getTagStatus(tag.tagId) === 'pending');
  };

  const canAccessTag = (tag) => {
    // Players can only access tags in order
    const sortedTags = [...tags].sort((a, b) => a.orderIndex - b.orderIndex);
    const tagIndex = sortedTags.findIndex(t => t.tagId === tag.tagId);
    
    if (tagIndex === 0) return true; // First tag is always accessible
    
    // Check if previous tag is completed
    const previousTag = sortedTags[tagIndex - 1];
    return getTagStatus(previousTag.tagId) === 'completed';
  };

  // Removed handleTagClick - players should not be able to directly access tag pages

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!currentGame) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">No Active Game</h1>
          <p className="text-gray-600">There&apos;s no active game at the moment. Check back later!</p>
        </div>
      </div>
    );
  }

  const completedCount = progress.length;
  const totalTags = tags.length;
  const nextTag = getNextTagToFind();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome, {playerData?.name}!
          </h1>
          <p className="text-gray-600">
            Game Status: <span className="font-semibold text-green-600">{currentGame.status}</span>
          </p>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>Progress</span>
              <span>{completedCount}/{totalTags} tags found</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${totalTags > 0 ? (completedCount / totalTags) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Next Tag to Find */}
        {nextTag && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-blue-900 mb-3">Next Tag to Find</h2>
            <div>
              <p className="text-blue-800 font-medium text-lg">Tag #{nextTag.orderIndex}</p>
              {nextTag.clue ? (
                <div className="mt-3 p-3 bg-blue-100 rounded-lg border border-blue-300">
                  <p className="text-blue-900 font-semibold text-sm mb-1">Clue:</p>
                  <p className="text-blue-800 text-base">{nextTag.clue}</p>
                </div>
              ) : (
                <div className="mt-3 p-3 bg-yellow-100 rounded-lg border border-yellow-300">
                  <p className="text-yellow-800 text-sm">No clue provided for this tag</p>
                </div>
              )}
              <p className="text-blue-600 text-sm mt-3">
                Find the physical NFC tag to claim this location!
              </p>
            </div>
          </div>
        )}

        {/* All Tags */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">All Tags</h2>
          
          {tags.length === 0 ? (
            <p className="text-gray-600 text-center py-8">
              No tags have been created yet. Check back later!
            </p>
          ) : (
            <div className="grid gap-4">
              {tags
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((tag) => {
                  const status = getTagStatus(tag.tagId);
                  const canAccess = canAccessTag(tag);
                  
                  return (
                    <div
                      key={tag.tagId}
                      className={`border rounded-lg p-4 ${
                        status === 'completed'
                          ? 'bg-green-50 border-green-200'
                          : canAccess
                          ? 'bg-white border-gray-200'
                          : 'bg-gray-50 border-gray-200 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            status === 'completed'
                              ? 'bg-green-500 text-white'
                              : canAccess
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-400 text-white'
                          }`}>
                            {tag.orderIndex}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">Tag #{tag.orderIndex}</h3>
                            {tag.clue ? (
                              <div className="mt-2 p-2 bg-gray-50 rounded border">
                                <p className="text-gray-700 text-sm font-medium">Clue: {tag.clue}</p>
                              </div>
                            ) : (
                              <p className="text-gray-500 text-sm mt-1 italic">No clue provided</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {status === 'completed' && (
                            <span className="text-green-600 font-medium">✓ Found</span>
                          )}
                          {!canAccess && status !== 'completed' && (
                            <span className="text-gray-500 text-sm">Complete previous tag first</span>
                          )}
                          {canAccess && status !== 'completed' && (
                            <span className="text-blue-600 text-sm">Find the physical tag</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Game Complete */}
        {completedCount === totalTags && totalTags > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6 text-center">
            <h2 className="text-2xl font-bold text-yellow-900 mb-2">🎉 Congratulations!</h2>
            <p className="text-yellow-800">
              You&apos;ve found all {totalTags} tags! You&apos;ve completed the scavenger hunt!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
