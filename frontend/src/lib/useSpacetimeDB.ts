import { useState, useEffect, useCallback } from 'react';
import { getSpacetimeDBConnection } from './spacetimedb';

/**
 * Custom hook for subscribing to SpacetimeDB tables
 * @param tableName - The name of the table to subscribe to
 * @param query - Optional SQL query to filter the data
 * @returns Object containing data, loading state, and error state
 */
export function useSpacetimeDB<T = any>(tableName: string, query?: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const connection = getSpacetimeDBConnection();
      
      // Wait for connection.db to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout: connection.db not ready.'));
        }, 10000);
        
        const checkDbReady = () => {
          if (connection && connection.db) {
            clearTimeout(timeout);
            setConnected(true);
            resolve(connection);
          } else {
            setTimeout(checkDbReady, 200);
          }
        };
        setTimeout(checkDbReady, 500);
      });

      // Subscribe to table changes
      const subscription = connection
        .subscriptionBuilder()
        .onApplied(() => {
          console.log(`Subscription applied for ${tableName}`);
          const tableHandle = (connection.db as any)[tableName];
          if (tableHandle) {
            const tableData = tableHandle.iter() as T[];
            console.log(`Data from ${tableName}:`, tableData);
            setData(tableData);
          }
          setLoading(false);
        })
        .subscribe([query || `SELECT * FROM ${tableName}`]);

      // Return cleanup function
      return () => {
        subscription.unsubscribe();
      };
    } catch (err) {
      console.error(`Error subscribing to ${tableName}:`, err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, [tableName, query]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    refreshData().then((cleanupFn) => {
      cleanup = cleanupFn;
    });

    // Cleanup on unmount
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [refreshData]);

  return {
    data,
    loading,
    error,
    connected,
    refresh: refreshData
  };
}

/**
 * Hook specifically for subscribing to tags table
 */
export function useTags(gameId?: string) {
  const query = gameId ? `SELECT * FROM tags WHERE game_id = '${gameId}' ORDER BY order_index` : 'SELECT * FROM tags ORDER BY order_index';
  return useSpacetimeDB('tags', query);
}

/**
 * Hook specifically for subscribing to progress table
 */
export function useProgress(gameId?: string) {
  const query = gameId ? `SELECT * FROM progress WHERE game_id = '${gameId}' ORDER BY ts DESC` : 'SELECT * FROM progress ORDER BY ts DESC';
  return useSpacetimeDB('progress', query);
}

/**
 * Hook specifically for subscribing to games table
 */
export function useGames() {
  return useSpacetimeDB('games', 'SELECT * FROM games ORDER BY started_at DESC');
}

/**
 * Hook specifically for subscribing to players table
 */
export function usePlayers() {
  return useSpacetimeDB('players', 'SELECT * FROM players ORDER BY name');
}
