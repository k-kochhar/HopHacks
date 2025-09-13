/**
 * LocalStorage utilities for role and player data
 * Used to persist user role and player info across sessions
 */

const STORAGE_KEYS = {
  ROLE: 'scavenger_hunt_role',
  PLAYER_DATA: 'scavenger_hunt_player_data'
};

/**
 * Get the current user role from localStorage
 * @returns {string|null} 'organizer' | 'player' | null
 */
export function getRole() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.ROLE);
}

/**
 * Set the user role in localStorage
 * @param {string} role - 'organizer' | 'player'
 */
export function setRole(role) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ROLE, role);
}

/**
 * Get player data from localStorage
 * @returns {object|null} { playerId: string, name: string, team?: string }
 */
export function getPlayerData() {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem(STORAGE_KEYS.PLAYER_DATA);
  return data ? JSON.parse(data) : null;
}

/**
 * Set player data in localStorage
 * @param {object} playerData - { playerId: string, name: string, team?: string }
 */
export function setPlayerData(playerData) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.PLAYER_DATA, JSON.stringify(playerData));
}

/**
 * Clear all stored data
 */
export function clearAll() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.ROLE);
  localStorage.removeItem(STORAGE_KEYS.PLAYER_DATA);
}

/**
 * Check if user is an organizer
 * @returns {boolean}
 */
export function isOrganizer() {
  return getRole() === 'organizer';
}

/**
 * Check if user is a player
 * @returns {boolean}
 */
export function isPlayer() {
  return getRole() === 'player';
}
