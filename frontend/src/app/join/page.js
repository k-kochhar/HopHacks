'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setRole, setPlayerData } from '../../lib/localStorage';
import { getSpacetimeDBConnection } from '../../lib/spacetimedb';

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

        // Call SpacetimeDB upsert_player reducer using client SDK
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
          
          // Call the reducer using the client SDK
          connection.reducers.upsertPlayer(playerId, playerName.trim(), null);
          
          console.log('Successfully registered player');
        } catch (err) {
          console.error('Error registering player:', err);
          alert(`Error: ${err.message}`);
          setLoading(false);
          return;
        }

        // Redirect to admin dashboard for organizers, or to game for players
        if (selectedRole === 'organizer') {
          router.push('/admin');
        } else {
          // Redirect players to their dashboard
          router.push('/dashboard');
        }
      }
    } catch (error) {
      console.error('Error during join:', error);
      alert('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{backgroundColor: '#F9FAFB'}}>
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="flex items-center justify-center mb-6">
            <img
              src="/logo.png"
              alt="HopQuest Logo"
              className="h-12 w-12 object-contain"
              onError={e => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ml-0" style={{display: 'none', backgroundColor: '#2563EB'}}>
              HQ
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold" style={{color: '#2563EB'}}>
            Join HopQuest
          </h2>
          <p className="mt-2 text-center text-sm" style={{color: '#6B7280'}}>
            Choose your role to get started
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Role Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold" style={{color: '#2563EB'}}>Select Your Role</h3>

            <div className="space-y-3">
              <label className="flex items-center p-4 border rounded-xl cursor-pointer transition-colors" style={{
                borderColor: selectedRole === 'organizer' ? '#2563EB' : '#E5E7EB',
                backgroundColor: selectedRole === 'organizer' ? '#EFF6FF' : '#FFFFFF'
              }} onMouseEnter={e => {
                if (selectedRole !== 'organizer') {
                  e.target.style.backgroundColor = '#F9FAFB';
                }
              }} onMouseLeave={e => {
                if (selectedRole !== 'organizer') {
                  e.target.style.backgroundColor = '#FFFFFF';
                }
              }}>
                <input
                  type="radio"
                  name="role"
                  value="organizer"
                  checked={selectedRole === 'organizer'}
                  onChange={(e) => handleRoleSelect(e.target.value)}
                  className="h-4 w-4 border-2" style={{accentColor: '#2563EB', borderColor: '#E5E7EB'}}
                />
                <div className="ml-3">
                  <div className="text-sm font-semibold" style={{color: '#2563EB'}}>Organizer</div>
                  <div className="text-sm" style={{color: '#6B7280'}}>Manage the game and activate tags</div>
                </div>
              </label>

              <label className="flex items-center p-4 border rounded-xl cursor-pointer transition-colors" style={{
                borderColor: selectedRole === 'player' ? '#2563EB' : '#E5E7EB',
                backgroundColor: selectedRole === 'player' ? '#EFF6FF' : '#FFFFFF'
              }} onMouseEnter={e => {
                if (selectedRole !== 'player') {
                  e.target.style.backgroundColor = '#F9FAFB';
                }
              }} onMouseLeave={e => {
                if (selectedRole !== 'player') {
                  e.target.style.backgroundColor = '#FFFFFF';
                }
              }}>
                <input
                  type="radio"
                  name="role"
                  value="player"
                  checked={selectedRole === 'player'}
                  onChange={(e) => handleRoleSelect(e.target.value)}
                  className="h-4 w-4 border-2" style={{accentColor: '#2563EB', borderColor: '#E5E7EB'}}
                />
                <div className="ml-3">
                  <div className="text-sm font-semibold" style={{color: '#2563EB'}}>Player</div>
                  <div className="text-sm" style={{color: '#6B7280'}}>Find and claim NFC tags</div>
                </div>
              </label>
            </div>
          </div>

          {/* Organizer Password */}
          {selectedRole === 'organizer' && (
            <div className="space-y-4 pt-4" style={{borderTop: '1px solid #E5E7EB'}}>
              <h3 className="text-lg font-bold" style={{color: '#2563EB'}}>Organizer Access</h3>

              <div>
                <label htmlFor="organizerPassword" className="block text-sm font-semibold" style={{color: '#4F46E5'}}>
                  Password *
                </label>
                <input
                  id="organizerPassword"
                  type="password"
                  required
                  value={organizerPassword}
                  onChange={(e) => setOrganizerPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm transition-colors"
                  style={{
                    borderColor: '#E5E7EB',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#2563EB';
                    e.target.style.outline = 'none';
                    e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#E5E7EB';
                    e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                  }}
                  placeholder="Enter organizer password"
                />
                <p className="mt-1 text-sm" style={{color: '#6B7280'}}>
                  Contact the game administrator for the password
                </p>
              </div>
            </div>
          )}

          {/* Player Details */}
          {selectedRole === 'player' && (
            <div className="space-y-4 pt-4" style={{borderTop: '1px solid #E5E7EB'}}>
              <h3 className="text-lg font-bold" style={{color: '#2563EB'}}>Player Information</h3>

              <div>
                <label htmlFor="playerName" className="block text-sm font-semibold" style={{color: '#4F46E5'}}>
                  Name *
                </label>
                <input
                  id="playerName"
                  type="text"
                  required
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm transition-colors"
                  style={{
                    borderColor: '#E5E7EB',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = '#2563EB';
                    e.target.style.outline = 'none';
                    e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#E5E7EB';
                    e.target.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                  }}
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
              className="group relative w-full flex justify-center py-3 px-4 text-sm font-semibold rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{backgroundColor: '#2563EB'}}
              onMouseEnter={e => !e.target.disabled && (e.target.style.backgroundColor = '#1D4ED8')}
              onMouseLeave={e => !e.target.disabled && (e.target.style.backgroundColor = '#2563EB')}
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="text-center">
          <div className="p-3 rounded-lg" style={{backgroundColor: '#EFF6FF', border: '1px solid #DBEAFE'}}>
            <p className="text-xs font-medium" style={{color: '#2563EB'}}>
              Organizer password: ABC123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
