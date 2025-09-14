'use client';

import { useEffect, useState, useRef } from 'react';
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
  const mapRef = useRef(null);

  useEffect(() => {
    ensureLeafletCss();
    // Small delay to ensure CSS is loaded
    setTimeout(() => setMapReady(true), 100);

    // Cleanup function to prevent memory leaks
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };
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
    const tagProgress = progress.find(p => p.tagId === tagId && p.playerId === playerId);
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
      <div className="h-96 rounded-xl flex items-center justify-center" style={{backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB'}}>
        <div style={{color: '#6B7280'}}>Loading map...</div>
      </div>
    );
  }

  // Show message if no accessible tags
  if (activeTagsWithLocation.length === 0) {
    return (
      <div className="h-96 rounded-xl flex items-center justify-center" style={{backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB'}}>
        <div className="text-center">
          <div style={{color: '#6B7280', marginBottom: '8px'}}>No accessible tags to display</div>
          <div className="text-sm" style={{color: '#6B7280'}}>Complete some tags to see them on the map!</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="h-96 rounded-xl overflow-hidden" style={{border: '1px solid #E5E7EB'}}>
        <MapErrorBoundary>
          <MapContainer
            key={`player-map-${playerId}`}
            center={[DEFAULT_LAT, DEFAULT_LON]}
            zoom={15}
            style={{ height: '100%', width: '100%', borderRadius: '12px' }}
            ref={mapRef}
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
                      <div className="mt-1" style={{color: '#6B7280'}}>
                        {tag.lat.toFixed(5)}, {tag.lon.toFixed(5)}
                      </div>
                      <div className="mt-1 text-xs" style={{color: isVisited ? '#059669' : '#6B7280'}}>
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
                      color: isVisited ? '#059669' : '#6B7280',
                      fillColor: isVisited ? '#059669' : '#6B7280',
                      fillOpacity: 0.1,
                      weight: 0.5
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
