/**
 * Inject Leaflet CSS client-side only (avoids SSR/hydration issues).
 * Idempotent: safe under React StrictMode + HMR.
 */
let injected = false;

export function ensureLeafletCss() {
  if (typeof window === "undefined") return; // SSR guard
  if (injected) return;

  // If already present (by id or href), bail.
  if (document.getElementById("leaflet-css")) { injected = true; return; }
  const existingHref = document.querySelector('link[href*="leaflet"]');
  if (existingHref) { injected = true; return; }

  const link = document.createElement("link");
  link.id = "leaflet-css";
  link.rel = "stylesheet";
  link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
  link.crossOrigin = "";

  document.head.appendChild(link);
  
  // Add custom CSS for marker styling
  const style = document.createElement('style');
  style.textContent = `
    .visited-marker .leaflet-marker-icon {
      filter: hue-rotate(120deg) saturate(1.5);
    }
    .unvisited-marker .leaflet-marker-icon {
      filter: grayscale(0.5) brightness(0.8);
    }
  `;
  document.head.appendChild(style);
  
  injected = true;
}
