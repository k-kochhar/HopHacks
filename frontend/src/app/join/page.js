'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setRole, setPlayerData } from '../../lib/localStorage';

/**
 * Join page for role selection
 * 
 * TODO: Later this will integrate with SpacetimeDB to:
 * - Register players in the database via upsert_player reducer
 * - Validate organizer credentials
 * - Handle team assignments
 */

export default function JoinPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [organizerPassword, setOrganizerPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (selectedRole === 'organizer') {
        // Check organizer password
        if (organizerPassword !== 'ABC123') {
          alert('Invalid organizer password');
          setLoading(false);
          return;
        }
        
        // Store organizer role
        setRole('organizer');
        // Redirect to admin dashboard
        router.push('/admin');
      } else if (selectedRole === 'player') {
        if (!playerName.trim()) {
          alert('Please enter your name');
          setLoading(false);
          return;
        }

        // Generate a simple player ID
        const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Store player data
        setRole('player');
        setPlayerData({
          playerId,
          name: playerName.trim(),
          team: null // No teams needed
        });

        // Call SpacetimeDB upsert_player reducer
        try {
          const response = await fetch('http://localhost:3000/v1/database/hunt/call/upsert_player', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([playerId, playerName.trim(), null]) // No teams needed
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to register player: ${errorText}`);
          }
          
          console.log('Successfully registered player');
        } catch (err) {
          console.error('Error registering player:', err);
          alert(`Error: ${err.message}`);
          setLoading(false);
          return;
        }

        // Redirect to a test tag for now
        router.push('/t/TAG001');
      }
    } catch (error) {
      console.error('Error during join:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Join Scavenger Hunt
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Choose your role to get started
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Role Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Select Your Role</h3>
            
            <div className="space-y-3">
              <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="role"
                  value="organizer"
                  checked={selectedRole === 'organizer'}
                  onChange={(e) => handleRoleSelect(e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900">Organizer</div>
                  <div className="text-sm text-gray-500">Manage the game and activate tags</div>
                </div>
              </label>

              <label className="flex items-center p-4 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="role"
                  value="player"
                  checked={selectedRole === 'player'}
                  onChange={(e) => handleRoleSelect(e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900">Player</div>
                  <div className="text-sm text-gray-500">Find and claim NFC tags</div>
                </div>
              </label>
            </div>
          </div>

          {/* Organizer Password */}
          {selectedRole === 'organizer' && (
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Organizer Access</h3>
              
              <div>
                <label htmlFor="organizerPassword" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <input
                  id="organizerPassword"
                  type="password"
                  required
                  value={organizerPassword}
                  onChange={(e) => setOrganizerPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter organizer password"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Contact the game administrator for the password
                </p>
              </div>
            </div>
          )}

          {/* Player Details */}
          {selectedRole === 'player' && (
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Player Information</h3>
              
              <div>
                <label htmlFor="playerName" className="block text-sm font-medium text-gray-700">
                  Name *
                </label>
                <input
                  id="playerName"
                  type="text"
                  required
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your name"
                />
              </div>

            </div>
          )}

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={!selectedRole || loading || (selectedRole === 'organizer' && !organizerPassword) || (selectedRole === 'player' && !playerName.trim())}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Organizer password: ABC123 (for demo purposes)
          </p>
        </div>
      </div>
    </div>
  );
}
