// services/geoService.js
// Free geocoding + nearby POI search using OpenStreetMap (no API key).

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';

const HEADERS = {
  'User-Agent': 'Stoic-AI-Answer-Engine/1.0 (contact: you@example.com)',
};

// Geocode a place name -> { lat, lon, displayName }
export async function geocodePlace(query) {
  const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nominatim error: ${res.status}`);
  const data = await res.json();
  if (!data.length) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// Reverse geocode lat/lon -> address string
export async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=json`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Nominatim reverse error: ${res.status}`);
  const data = await res.json();
  return data.display_name || null;
}

// Find nearby POIs by category (restaurant, cafe, hospital, atm, etc.)
// using Overpass API within a radius (meters) of lat/lon.
export async function findNearby({ lat, lon, category = 'restaurant', radius = 2000, limit = 8 }) {
  const query = `
    [out:json][timeout:15];
    (
      node["amenity"="${category}"](around:${radius},${lat},${lon});
      way["amenity"="${category}"](around:${radius},${lat},${lon});
    );
    out center ${limit};
  `;
  const res = await fetch(OVERPASS_BASE, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'text/plain' },
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();

  return (data.elements || [])
    .map((el) => ({
      name: el.tags?.name || 'Unnamed',
      lat: el.lat ?? el.center?.lat,
      lon: el.lon ?? el.center?.lon,
      address: el.tags?.['addr:street']
        ? `${el.tags['addr:housenumber'] || ''} ${el.tags['addr:street']}`.trim()
        : null,
    }))
    .filter((p) => p.lat && p.lon);
}