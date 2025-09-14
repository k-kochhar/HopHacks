'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ensureLeafletCss } from '../../(maps)/leaflet-setup';
import { DEFAULT_LAT, DEFAULT_LON, toMeters } from '../../_lib/geo';
import MapErrorBoundary from '../../_components/MapErrorBoundary';

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

export default function PlayerMap({ tags, progress, playerId }) {
  const [mapReady, setMapReady] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    ensureLeafletCss();
    // Small delay to ensure CSS is loaded
    setTimeout(() => setMapReady(true), 100);
  }, []);

  // Get visited tags for this player
  const visitedTagIds = new Set(
    progress.filter(p => p.playerId === playerId).map(p => p.tagId)
  );

  // Helper function to check if a tag can be accessed (unlocked)
  const canAccessTag = (tag) => {
    // Only show completed tags
    return getTagStatus(tag.tagId) === 'completed';
  };

  // Helper function to get tag status
  const getTagStatus = (tagId) => {
    const tagProgress = progress.find(p => p.tagId === tagId);
    return tagProgress ? 'completed' : 'pending';
  };

  // Filter for active tags with coordinates that are unlocked
  const activeTagsWithLocation = tags.filter(tag => 
    tag.lat && tag.lon && canAccessTag(tag)
  );

  // Calculate nearest unvisited tag if user location is available
  const nearestUnvisited = userLocation ? 
    activeTagsWithLocation
      .filter(tag => !visitedTagIds.has(tag.tagId))
      .map(tag => ({
        ...tag,
        distance: toMeters(userLocation.lat, userLocation.lon, tag.lat, tag.lon)
      }))
      .sort((a, b) => a.distance - b.distance)[0] : null;

  // Request user location
  const requestLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.log('Location access denied or failed:', error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 300000 }
      );
    }
  };

  if (!mapReady) {
    return (
      <div className="h-96 bg-gray-100 rounded border flex items-center justify-center">
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Legend and Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded-full"></div>
          <span className="text-sm">✓ visited</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
          <span className="text-sm">• unvisited</span>
        </div>
        
        {!userLocation && (
          <button
            onClick={requestLocation}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
          >
            📍 Show my location
          </button>
        )}
        
        {nearestUnvisited && (
          <div className="text-sm text-gray-600">
            Nearest next: <span className="font-semibold">{nearestUnvisited.tagId}</span> – {Math.round(nearestUnvisited.distance)}m
          </div>
        )}
      </div>

      <div className="h-96 rounded border">
        <MapErrorBoundary>
          <MapContainer
            center={[DEFAULT_LAT, DEFAULT_LON]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
          >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {/* User location marker */}
          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lon]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Your Location</div>
                </div>
              </Popup>
            </Marker>
          )}
          
          {/* Tag markers */}
          {activeTagsWithLocation.map((tag) => {
            const isVisited = visitedTagIds.has(tag.tagId);
            return (
              <div key={tag.tagId}>
                <Marker 
                  position={[tag.lat, tag.lon]}
                  className={isVisited ? 'visited-marker' : 'unvisited-marker'}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">Tag: {tag.tagId}</div>
                      {tag.clue && <div className="mt-1">Clue: {tag.clue}</div>}
                      <div className="mt-1 text-gray-600">
                        {tag.lat.toFixed(5)}, {tag.lon.toFixed(5)}
                      </div>
                      <div className={`mt-1 text-xs ${isVisited ? 'text-green-600' : 'text-gray-500'}`}>
                        {isVisited ? '✓ Visited' : '• Not visited'}
                      </div>
                    </div>
                  </Popup>
                </Marker>
                
                {/* Show accuracy circle if available */}
                {tag.accuracyM && (
                  <Circle
                    center={[tag.lat, tag.lon]}
                    radius={tag.accuracyM}
                    pathOptions={{
                      color: isVisited ? '#10b981' : '#9ca3af',
                      fillColor: isVisited ? '#10b981' : '#9ca3af',
                      fillOpacity: 0.1,
                      weight: 1
                    }}
                  />
                )}
              </div>
            );
          })}
          </MapContainer>
        </MapErrorBoundary>
      </div>
    </div>
  );
}
