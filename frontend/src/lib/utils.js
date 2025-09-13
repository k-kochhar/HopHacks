/**
 * Utility functions for scavenger hunt game
 */

/**
 * Count the number of tags claimed by a specific player
 * @param {Array} progressRows - Array of progress entries from SpacetimeDB
 * @param {string} playerId - The player ID to count claims for
 * @returns {number} Number of tags claimed by the player
 */
export function countPlayerClaims(progressRows, playerId) {
  if (!progressRows || !playerId) return 0;
  return progressRows.filter(progress => progress.playerId === playerId).length;
}

/**
 * Group progress entries by player and count claims for leaderboard
 * @param {Array} progressRows - Array of progress entries from SpacetimeDB
 * @returns {Array} Array of { player_id, count } objects sorted by count (descending)
 */
export function groupLeaderboard(progressRows) {
  if (!progressRows) return [];
  
  const playerCounts = {};
  
  // Count claims per player
  progressRows.forEach(progress => {
    const playerId = progress.playerId;
    playerCounts[playerId] = (playerCounts[playerId] || 0) + 1;
  });
  
  // Convert to array and sort by count (descending)
  return Object.entries(playerCounts)
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get total number of active tags for a game
 * @param {Array} tags - Array of tag entries from SpacetimeDB
 * @param {string} gameId - The game ID to filter by
 * @returns {number} Number of active tags
 */
export function getTotalActiveTags(tags, gameId) {
  if (!tags || !gameId) return 0;
  return tags.filter(tag => tag.gameId === gameId && tag.isActive).length;
}

/**
 * Check if a player has already claimed a specific tag
 * @param {Array} progressRows - Array of progress entries from SpacetimeDB
 * @param {string} playerId - The player ID
 * @param {string} tagId - The tag ID
 * @param {string} gameId - The game ID
 * @returns {boolean} True if the player has already claimed this tag
 */
export function hasPlayerClaimedTag(progressRows, playerId, tagId, gameId) {
  if (!progressRows || !playerId || !tagId || !gameId) return false;
  return progressRows.some(progress => 
    progress.playerId === playerId && 
    progress.tagId === tagId && 
    progress.gameId === gameId
  );
}
