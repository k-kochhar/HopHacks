'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { ensureLeafletCss } from '../../(maps)/leaflet-setup';
import { DEFAULT_LAT, DEFAULT_LON } from '../../_lib/geo';
import MapErrorBoundary from '../../_components/MapErrorBoundary';

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });
const Circle = dynamic(() => import('react-leaflet').then(m => m.Circle), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false });

export default function AdminMap({ tags }) {
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    ensureLeafletCss();
    // Small delay to ensure CSS is loaded
    setTimeout(() => setMapReady(true), 100);
  }, []);

  // Filter for active tags with coordinates
  const activeTagsWithLocation = tags.filter(tag => 
    tag.lat && tag.lon
  );

  if (!mapReady) {
    return (
      <div className="h-96 bg-gray-100 rounded border flex items-center justify-center">
        <div className="text-gray-500">Loading map...</div>
      </div>
    );
  }

  return (
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
        
        {activeTagsWithLocation.map((tag) => (
          <div key={tag.tagId}>
            <Marker position={[tag.lat, tag.lon]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Tag: {tag.tagId}</div>
                  {tag.clue && <div className="mt-1">Clue: {tag.clue}</div>}
                  <div className="mt-1 text-gray-600">
                    {tag.lat.toFixed(5)}, {tag.lon.toFixed(5)}
                  </div>
                  {tag.accuracyM && (
                    <div className="text-xs text-gray-500">
                      ±{tag.accuracyM}m accuracy
                    </div>
                  )}
                  {tag.activatedAt && (
                    <div className="text-xs text-gray-500">
                      Activated: {new Date(Number(tag.activatedAt)).toLocaleString()}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
            
            {/* Show accuracy circle if available */}
            {tag.accuracyM && (
              <Circle
                center={[tag.lat, tag.lon]}
                radius={tag.accuracyM}
                pathOptions={{
                  color: 'blue',
                  fillColor: 'blue',
                  fillOpacity: 0.1,
                  weight: 1
                }}
              />
            )}
          </div>
        ))}
        </MapContainer>
      </MapErrorBoundary>
    </div>
  );
}
