'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ensureLeafletCss } from '../(maps)/leaflet-setup';
import MapErrorBoundary from './MapErrorBoundary';

// Dynamically import Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false });

export default function GeoPickModal({ open, onClose, initialLat, initialLon, onSave }) {
  const [lat, setLat] = useState(initialLat);
  const [lon, setLon] = useState(initialLon);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (open) {
      ensureLeafletCss();
      // Small delay to ensure CSS is loaded
      setTimeout(() => setMapReady(true), 100);
    } else {
      setMapReady(false);
    }
  }, [open]);

  useEffect(() => {
    setLat(initialLat);
    setLon(initialLon);
  }, [initialLat, initialLon]);

  if (!open) return null;

  const handleSave = () => {
    onSave(lat, lon);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Pick Location</h3>
        
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Drag the marker to set the tag location:
          </p>
          <div className="text-sm">
            <span className="font-mono">{lat.toFixed(5)}, {lon.toFixed(5)}</span>
          </div>
        </div>

        {mapReady && (
          <div className="h-64 mb-4 rounded border">
            <MapErrorBoundary>
              <MapContainer
                center={[lat, lon]}
                zoom={18}
                style={{ height: '100%', width: '100%' }}
              >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <Marker
                position={[lat, lon]}
                draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    setLat(position.lat);
                    setLon(position.lng);
                  }
                }}
              />
              </MapContainer>
            </MapErrorBoundary>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save Location
          </button>
        </div>
      </div>
    </div>
  );
}
