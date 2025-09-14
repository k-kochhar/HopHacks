'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSpacetimeDBConnection } from '../../lib/spacetimedb';
import { getPlayerData, getRole } from '../../lib/localStorage';
import PlayerMap from './components/PlayerMap';

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
        
        // Tags table callbacks (insert, update, delete)
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
        
        conn.db.tags.onUpdate((_ctx, oldRow, newRow) => {
          console.log('Dashboard: Tag updated:', oldRow.tagId, '->', newRow);
          setTags(prev => prev.map(t => t.tagId === oldRow.tagId ? newRow : t));
        });
        
        conn.db.tags.onDelete((_ctx, row) => {
          console.log('Dashboard: Tag deleted:', row);
          setTags(prev => prev.filter(t => t.tagId !== row.tagId));
        });

        // Progress table callbacks (delete + insert pattern, no updates)
        conn.db.progress.onInsert((_ctx, row) => {
          console.log('Dashboard: Progress inserted:', row);
          setProgress(prev => {
            // Check if progress already exists to prevent duplicates
            const exists = prev.some(p => 
              p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId
            );
            if (exists) {
              console.log('Dashboard: Progress already exists, replacing:', row.playerId, row.tagId);
              return prev.map(p => 
                (p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId) ? row : p
              );
            } else {
              console.log('Dashboard: Adding new progress:', row.playerId, row.tagId);
              return [...prev, row];
            }
          });
        });
        
        conn.db.progress.onDelete((_ctx, row) => {
          console.log('Dashboard: Progress deleted:', row);
          setProgress(prev => prev.filter(p => 
            !(p.gameId === row.gameId && p.playerId === row.playerId && p.tagId === row.tagId)
          ));
        });

        // Games table callbacks (insert, update)
        conn.db.games.onInsert((_ctx, row) => {
          console.log('Dashboard: Game inserted:', row);
          setCurrentGame(row);
        });
        
        conn.db.games.onUpdate((_ctx, oldRow, newRow) => {
          console.log('Dashboard: Game updated:', oldRow.gameId, '->', newRow);
          setCurrentGame(newRow);
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
    if (!progress || !playerData?.playerId) return 'pending';
    const tagProgress = progress.find(p =>
      String(p.tagId) === String(tagId) &&
      String(p.playerId) === String(playerData.playerId)
    );
    return tagProgress ? 'completed' : 'pending';
  };

  const getNextTagToFind = () => {
    if (!tags.length || !playerData?.playerId) return null;

    // Find the first tag that hasn't been completed
    const sortedTags = [...tags].sort((a, b) => a.orderIndex - b.orderIndex);
    const nextTag = sortedTags.find(tag => getTagStatus(tag.tagId) === 'pending');

    return nextTag;
  };

  const canAccessTag = (tag) => {
    // Only show completed tags
    return getTagStatus(tag.tagId) === 'completed';
  };

  // Removed handleTagClick - players should not be able to directly access tag pages

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#F9FAFB'}}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{borderColor: '#2563EB'}}></div>
          <p className="mt-2" style={{color: '#6B7280'}}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!currentGame) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: '#F9FAFB'}}>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4" style={{color: '#2563EB'}}>No Active Game</h1>
          <p style={{color: '#6B7280'}}>There&apos;s no active game at the moment. Check back later!</p>
        </div>
      </div>
    );
  }

  const completedCount = progress.filter(p => p.playerId === playerData?.playerId).length;
  const totalTags = tags.length;
  const unlockedTags = tags.filter(tag => canAccessTag(tag));
  const lockedTags = totalTags - unlockedTags.length;
  const nextTag = getNextTagToFind();

  return (
    <div className="min-h-screen" style={{backgroundColor: '#F9FAFB'}}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
          <div className="flex items-center space-x-3 mb-4">
            <img
              src="/logo.png"
              alt="HopQuest Logo"
              className="h-8 w-8 object-contain"
              onError={e => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{display: 'none', backgroundColor: '#2563EB'}}>
              HQ
            </div>
            <h1 className="text-3xl font-bold" style={{color: '#2563EB'}}>
              Welcome, {playerData?.name}!
            </h1>
          </div>
          <p style={{color: '#6B7280'}}>
            Game Status: <span className="font-semibold" style={{color: '#059669'}}>{currentGame.status}</span>
          </p>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2" style={{color: '#6B7280'}}>
              <span>Progress</span>
              <span>{completedCount}/{totalTags} tags found</span>
            </div>
            {completedCount === 0 && totalTags > 0 && (
              <div className="flex items-center justify-between text-sm mb-2" style={{color: '#6B7280'}}>
                <span>Ready to start</span>
                <span>Find the first NFC tag!</span>
              </div>
            )}
            {completedCount > 0 && lockedTags > 0 && (
              <div className="flex items-center justify-between text-sm mb-2" style={{color: '#6B7280'}}>
                <span>More tags</span>
                <span>{lockedTags} more to discover</span>
              </div>
            )}
            <div className="w-full rounded-full h-2" style={{backgroundColor: '#E5E7EB'}}>
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${totalTags > 0 ? (completedCount / totalTags) * 100 : 0}%`,
                  backgroundColor: '#2563EB'
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Next Tag to Find */}
        {nextTag && (
          <div className="rounded-xl p-6 mb-6" style={{backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE'}}>
            <h2 className="text-xl font-bold mb-3" style={{color: '#2563EB'}}>Next Tag to Find</h2>
            <div>
              <p className="font-semibold text-lg" style={{color: '#1D4ED8'}}>{nextTag.tagId}</p>
              {nextTag.clue ? (
                <div className="mt-3 p-3 rounded-lg" style={{backgroundColor: '#DBEAFE', border: '1px solid #BFDBFE'}}>
                  <p className="font-semibold text-sm mb-1" style={{color: '#1E40AF'}}>Clue:</p>
                  <p className="text-base" style={{color: '#1D4ED8'}}>{nextTag.clue}</p>
                </div>
              ) : (
                <div className="mt-3 p-3 rounded-lg" style={{backgroundColor: '#FEF3C7', border: '1px solid #FDE68A'}}>
                  <p className="text-sm" style={{color: '#92400E'}}>No clue provided for this tag</p>
                </div>
              )}
              <p className="text-sm mt-3" style={{color: '#2563EB'}}>
                Find the physical NFC tag to claim this location!
              </p>
            </div>
          </div>
        )}

        {/* All Tags */}
        <div className="bg-white rounded-xl shadow-lg p-6" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
          <h2 className="text-2xl font-bold mb-6" style={{color: '#2563EB'}}>All Tags</h2>

          {tags.length === 0 ? (
            <p className="text-center py-8" style={{color: '#6B7280'}}>
              No tags have been created yet. Check back later!
            </p>
          ) : tags.filter(tag => canAccessTag(tag)).length === 0 ? (
            <div className="text-center py-8">
              <p className="mb-4" style={{color: '#6B7280'}}>
                Start your scavenger hunt! Find and scan the first NFC tag to begin.
              </p>
              <p className="text-sm" style={{color: '#6B7280'}}>
                Tags will appear here as you complete them.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {tags
                .filter(tag => canAccessTag(tag)) // Only show completed tags
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((tag) => {
                  const status = getTagStatus(tag.tagId);
                  const canAccess = canAccessTag(tag);

                  return (
                    <div
                      key={tag.tagId}
                      className="border rounded-xl p-4"
                      style={{
                        borderColor: status === 'completed' ? '#A7F3D0' : canAccess ? '#E5E7EB' : '#E5E7EB',
                        backgroundColor: status === 'completed' ? '#D1FAE5' : canAccess ? '#FFFFFF' : '#F9FAFB',
                        opacity: !canAccess && status !== 'completed' ? 0.6 : 1
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="px-2 py-1 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{
                            backgroundColor: status === 'completed' ? '#059669' : canAccess ? '#2563EB' : '#6B7280'
                          }}>
                            {status === 'completed' ? '✓' : '•'}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold" style={{color: '#2563EB'}}>{tag.tagId}</h3>
                            {tag.clue ? (
                              <div className="mt-2 p-2 rounded border" style={{backgroundColor: '#F9FAFB', borderColor: '#E5E7EB'}}>
                                <p className="text-sm font-medium" style={{color: '#4F46E5'}}>Clue: {tag.clue}</p>
                              </div>
                            ) : (
                              <p className="text-sm mt-1 italic" style={{color: '#6B7280'}}>No clue provided</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {status === 'completed' && (
                            <span className="font-semibold" style={{color: '#059669'}}>✓ Found</span>
                          )}
                          {!canAccess && status !== 'completed' && (
                            <span className="text-sm" style={{color: '#6B7280'}}>Complete previous tag first</span>
                          )}
                          {canAccess && status !== 'completed' && (
                            <span className="text-sm" style={{color: '#2563EB'}}>Find the physical tag</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Map Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6" style={{boxShadow: '0 4px 12px rgba(0,0,0,0.08)'}}>
          <h2 className="text-xl font-bold mb-4" style={{color: '#2563EB'}}>Tag Map</h2>
          <PlayerMap
            tags={tags}
            progress={progress}
            playerId={playerData?.playerId}
          />
        </div>

        {/* Game Complete */}
        {completedCount === totalTags && totalTags > 0 && (
          <div className="rounded-xl p-6 mt-6 text-center" style={{backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0'}}>
            <h2 className="text-2xl font-bold mb-2" style={{color: '#059669'}}>🎉 Congratulations!</h2>
            <p style={{color: '#047857'}}>
              You&apos;ve found all {totalTags} tags! You&apos;ve completed the scavenger hunt!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
