import { DbConnection } from '../app/module_bindings';

// SpacetimeDB configuration
const SPACETIMEDB_URI = process.env.NEXT_PUBLIC_STDB_URI || 'ws://localhost:3000';
const SPACETIMEDB_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_NAME || 'hunt';

/**
 * Get or create the SpacetimeDB connection instance
 */
export function getSpacetimeDBConnection(): DbConnection {
  const connection = DbConnection.builder()
    .withUri(SPACETIMEDB_URI)
    .withModuleName(SPACETIMEDB_NAME)
    .build();
  
  console.log('SpacetimeDB connection created');
  return connection;
}

// Re-export types from generated bindings
export { Game, Tag, Player, Progress } from '../app/module_bindings';
