// Static tile map without external libs. Uses OSM tiles.
// Firefox version with proper browser.storage API support
(function() {
  const TILE_SIZE = 256;
  const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  const countryInput = document.getElementById('countryInput');
  const zoomSelect = document.getElementById('zoomSelect');
  const applyBtn = document.getElementById('applyBtn');
  const recenterBtn = document.getElementById('recenterBtn');
  const tilesEl = document.getElementById('tiles');
  const markersEl = document.getElementById('markers');
  const tooltipEl = document.getElementById('tooltip');
  const statText = document.getElementById('statText');

  let users = [];
  let points = [];
  let lastState = { z: 4, boundsPx: null };

  // Web Mercator projection helpers
  function latLonToPixel(lat, lon, z) {
    const sinLat = Math.sin(lat * Math.PI / 180);
    const n = Math.pow(2, z);
    const x = ((lon + 180) / 360) * n * TILE_SIZE;
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n * TILE_SIZE;
    return { x, y };
  }
  
  function pixelToTile(px) { 
    return { x: Math.floor(px.x / TILE_SIZE), y: Math.floor(px.y / TILE_SIZE) }; 
  }
  function computeBounds(pts, z) {
    if (!pts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      const px = latLonToPixel(p.lat, p.lon, z);
      minX = Math.min(minX, px.x);
      minY = Math.min(minY, px.y);
      maxX = Math.max(maxX, px.x);
      maxY = Math.max(maxY, px.y);
    }
    return { minX, minY, maxX, maxY };
  }
  function storageGet(keys) { 
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return browser.storage.local.get(keys);
    }
    return new Promise((resolve) => chrome.storage.local.get(keys || null, (items) => resolve(items || {}))); 
  }
  function storageSet(obj) { 
    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
      return browser.storage.local.set(obj);
    }
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve)); 
  }
  const geocodeCacheKey = (loc) => `geo_${encodeURIComponent(loc.toLowerCase())}`;
  async function geocodeLocation(loc) {
    const key = geocodeCacheKey(loc);
    try {
      const cachedAll = await storageGet([key]);
      if (cachedAll[key] && typeof cachedAll[key].lat === 'number' && typeof cachedAll[key].lon === 'number') {
        return cachedAll[key];
      }
    } catch (e) {
      console.warn('Error checking geocode cache for', loc, e);
    }
    
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(loc)}&limit=1`;
    try {
      const resp = await fetch(url, { headers: { 'accept': 'application/json', 'accept-language': 'en', 'User-Agent': 'MapChirp Browser Extension' } });
      if (!resp.ok) {
        console.warn(`Geocode failed for "${loc}": ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      if (Array.isArray(data) && data[0] && data[0].lat && data[0].lon) {
        const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), t: Date.now() };
        try {
          await storageSet({ [key]: result });
        } catch (e) {
          console.warn('Error caching geocode result:', e);
        }
        return result;
      }
    } catch (e) {
      console.error('Geocoding error for', loc, e);
    }
    return null;
  }
  function filterUsersByCountry(users, country) { if (!country) return users; const c = country.toLowerCase(); return users.filter(u => (u.location || '').toLowerCase().includes(c)); }
  function setStat(n) { statText.textContent = `${n} user${n===1?'':'s'}`; }
  function clearMap() { tilesEl.innerHTML = ''; markersEl.innerHTML = ''; tooltipEl.style.display = 'none'; }
  function renderStaticMap(z) {
    clearMap();
    if (!points.length) return;
    const b = computeBounds(points, z); if (!b) return;
    const pad = 40; b.minX -= pad; b.minY -= pad; b.maxX += pad; b.maxY += pad;
    const minTile = pixelToTile({ x: b.minX, y: b.minY });
    const maxTile = pixelToTile({ x: b.maxX, y: b.maxY });
    const originPx = { x: minTile.x * TILE_SIZE, y: minTile.y * TILE_SIZE };
    const width = (maxTile.x - minTile.x + 1) * TILE_SIZE;
    const height = (maxTile.y - minTile.y + 1) * TILE_SIZE;
    tilesEl.style.width = `${width}px`; tilesEl.style.height = `${height}px`;
    markersEl.style.width = `${width}px`; markersEl.style.height = `${height}px`;
    console.log(`Tile range: x=${minTile.x}-${maxTile.x}, y=${minTile.y}-${maxTile.y}, size=${width}x${height}px`);
    for (let ty = minTile.y; ty <= maxTile.y; ty++) {
      for (let tx = minTile.x; tx <= maxTile.x; tx++) {
        const img = document.createElement('img');
        img.className = 'tile'; img.src = TILE_URL(z, tx, ty);
        const left = (tx * TILE_SIZE) - originPx.x;
        const top = (ty * TILE_SIZE) - originPx.y;
        img.style.left = `${left}px`;
        img.style.top = `${top}px`;
        console.log(`Tile z=${z} x=${tx} y=${ty} → left=${left}px top=${top}px`);
        img.alt = ''; tilesEl.appendChild(img);
      }
    }
    for (const p of points) {
      const px = latLonToPixel(p.lat, p.lon, z);
      const left = px.x - originPx.x; const top = px.y - originPx.y;
      const el = document.createElement('div'); el.className = 'marker';
      el.style.left = `${left}px`; el.style.top = `${top}px`;
      el.title = `${p.username} — ${p.location}`;
      el.addEventListener('mouseenter', () => showTooltip(p, left, top));
      el.addEventListener('mouseleave', () => hideTooltip());
      markersEl.appendChild(el);
    }
    lastState = { z, boundsPx: { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY } };
  }
  function showTooltip(p, x, y) { tooltipEl.textContent = `@${p.username} — ${p.location}`; tooltipEl.style.left = `${x}px`; tooltipEl.style.top = `${y - 10}px`; tooltipEl.style.display = 'block'; }
  function hideTooltip() { tooltipEl.style.display = 'none'; }
  async function loadUsersFromStorage() {
    const all = await storageGet(null);
    const list = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('loc_') && v && typeof v.location === 'string') {
        const username = k.substring(4);
        list.push({ username, location: v.location });
      }
    }
    return list;
  }
  async function buildPoints(country, z) {
    const filtered = filterUsersByCountry(users, country); setStat(filtered.length);
    const uniqueLocs = new Map();
    for (const u of filtered) {
      const key = (u.location || '').trim().toLowerCase();
      if (key && !uniqueLocs.has(key)) uniqueLocs.set(key, []);
      if (key) uniqueLocs.get(key).push(u);
    }
    const results = [];
    for (const [locKey, arr] of uniqueLocs.entries()) {
      const geo = await geocodeLocation(locKey);
      if (geo) { for (const u of arr) results.push({ username: u.username, location: u.location, lat: geo.lat, lon: geo.lon }); }
      await new Promise(r => setTimeout(r, 250));
    }
    points = results;
  }
  function restoreUIFromSettings(settings) { if (settings && Array.isArray(settings.countryFilter) && settings.countryFilter.length > 0) { countryInput.value = settings.countryFilter[0]; } }
  async function init() {
    try { 
      const { settings } = await storageGet(['settings']); 
      restoreUIFromSettings(settings || {}); 
    } catch (e) {
      console.error('Error loading settings:', e);
    }
    
    try {
      users = await loadUsersFromStorage();
      console.log(`Loaded ${users.length} users from storage`);
    } catch (e) {
      console.error('Error loading users:', e);
      users = [];
    }
    
    try { 
      const { map_zoom, map_country } = await storageGet(['map_zoom', 'map_country']); 
      if (map_zoom) zoomSelect.value = String(map_zoom); 
      // Start with empty country filter to show all users
      countryInput.value = ''; 
    } catch (e) {
      console.error('Error loading map preferences:', e);
    }
    
    try {
      await apply();
    } catch (e) {
      console.error('Error applying initial map view:', e);
      setStat(0);
    }
  }
  async function apply() { 
    try {
      const z = Number(zoomSelect.value); 
      const country = countryInput.value.trim(); 
      await storageSet({ map_zoom: z, map_country: country }); 
      await buildPoints(country, z); 
      renderStaticMap(z);
      console.log(`Map rendered with ${points.length} points at zoom ${z}`);
    } catch (e) {
      console.error('Error in apply():', e);
      setStat(0);
    }
  }
  function recenter() { if (!points.length) return; renderStaticMap(Number(zoomSelect.value)); }
  applyBtn.addEventListener('click', () => apply());
  recenterBtn.addEventListener('click', () => recenter());
  window.addEventListener('resize', () => { renderStaticMap(Number(zoomSelect.value)); });
  init();
})();
