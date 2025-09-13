import { DbConnection } from '../module_bindings';

// SpacetimeDB configuration
const SPACETIMEDB_HOST = process.env.NEXT_PUBLIC_SPACETIMEDB_HOST || 'localhost:3000';
const SPACETIMEDB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_NAME || 'scavengerhunt';

/**
 * Get or create the SpacetimeDB connection instance
 */
export function getSpacetimeDBConnection(): DbConnection {
  const connection = DbConnection.builder()
    .withUri(`ws://${SPACETIMEDB_HOST}`)
    .withModuleName(SPACETIMEDB_NAME)
    .build();
  
  console.log('SpacetimeDB connection created');
  return connection;
}

// Re-export types from generated bindings
export { Game, Tag, Player, Progress } from '../module_bindings';
