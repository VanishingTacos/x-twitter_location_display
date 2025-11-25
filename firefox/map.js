// Static map image display. Uses MapBox Static Images API.
// Firefox version with proper browser.storage API support
(function() {
  const statText = document.getElementById('statText');
  const mapContainer = document.getElementById('map');

  let users = [];
  let points = [];

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
  // Removed country filtering; always use full user set.
  function setStat(n) { statText.textContent = `${n} user${n===1?'':'s'}`; }
  // Ensure spinner keyframes are available
  function ensureSpinnerStyles() {
    if (!document.getElementById('mapSpinnerStyles')) {
      const s = document.createElement('style');
      s.id = 'mapSpinnerStyles';
      s.textContent = '@keyframes mcspin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
  }
  // Global loading overlay helpers (shown during geocoding and tile loading)
  let loadingOverlay = null;
  let overlayStart = 0;
  const minOverlayMs = 200;
  function showOverlay() {
    ensureSpinnerStyles();
    if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove();
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:rgba(255,255,255,0.85);z-index:9999;';
    const spinner = document.createElement('div');
    spinner.style.cssText = 'width:28px;height:28px;border:3px solid #d7dbdc;border-top-color:#1d9bf0;border-radius:50%;animation:mcspin 0.8s linear infinite';
    const text = document.createElement('div');
    text.textContent = 'Loading map…';
    text.style.cssText = 'font-size:12px;color:#536471';
    el.appendChild(spinner);
    el.appendChild(text);
    mapContainer.appendChild(el);
    loadingOverlay = el;
    overlayStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function hideOverlay() {
    if (!loadingOverlay || !loadingOverlay.parentNode) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = now - overlayStart;
    const wait = Math.max(0, minOverlayMs - elapsed);
    if (wait > 0) {
      setTimeout(() => { if (loadingOverlay && loadingOverlay.parentNode) loadingOverlay.remove(); }, wait);
    } else {
      loadingOverlay.remove();
    }
    loadingOverlay = null;
  }
  
  function renderStaticMap() {
    mapContainer.innerHTML = '';
    if (!points.length) {
      mapContainer.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#536471;font-size:14px;">No users to display</div>';
      hideOverlay();
      return;
    }
    
    let sumLat = 0, sumLon = 0;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const p of points) { 
      sumLat += p.lat; sumLon += p.lon;
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
    }
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    
    const width = Math.min(mapContainer.clientWidth || 800, 1280);
    const height = Math.min(mapContainer.clientHeight || 600, 1280);
    
    // Calculate zoom to fit all points with padding
    function getBoundsZoomLevel(bounds, mapDim) {
      const WORLD_DIM = { height: 256, width: 256 };
      const ZOOM_MAX = 18;
      
      function latRad(lat) {
        const sin = Math.sin(lat * Math.PI / 180);
        const radX2 = Math.log((1 + sin) / (1 - sin)) / 2;
        return Math.max(Math.min(radX2, Math.PI), -Math.PI) / 2;
      }
      
      function zoom(mapPx, worldPx, fraction) {
        return Math.floor(Math.log(mapPx / worldPx / fraction) / Math.LN2);
      }
      
      const latFraction = (latRad(bounds.maxLat) - latRad(bounds.minLat)) / Math.PI;
      const lngDiff = bounds.maxLon - bounds.minLon;
      const lngFraction = ((lngDiff < 0) ? (lngDiff + 360) : lngDiff) / 360;
      
      const latZoom = zoom(mapDim.height, WORLD_DIM.height, latFraction);
      const lngZoom = zoom(mapDim.width, WORLD_DIM.width, lngFraction);
      
      return Math.min(latZoom, lngZoom, ZOOM_MAX);
    }
    
    // Add 10% padding to bounds
    const latPadding = (maxLat - minLat) * 0.1 || 0.1;
    const lonPadding = (maxLon - minLon) * 0.1 || 0.1;
    const zoom = points.length === 1 ? 12 : getBoundsZoomLevel({
      minLat: minLat - latPadding,
      maxLat: maxLat + latPadding,
      minLon: minLon - lonPadding,
      maxLon: maxLon + lonPadding
    }, { width, height });
    
    // Create canvas-based static map using OSM tiles
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.objectFit = 'contain';
    const ctx = canvas.getContext('2d');
    
    // Append canvas first
    mapContainer.appendChild(canvas);
    
    // Calculate tile coordinates
    const tileSize = 256;
    const scale = Math.pow(2, zoom);
    const worldTileWidth = tileSize / scale;
    
    const centerX = (centerLon + 180) / 360 * scale;
    const centerY = (1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * scale;
    
    const numTilesX = Math.ceil(width / tileSize) + 1;
    const numTilesY = Math.ceil(height / tileSize) + 1;
    
    const startTileX = Math.floor(centerX - numTilesX / 2);
    const startTileY = Math.floor(centerY - numTilesY / 2);
    
    const offsetX = width / 2 - (centerX - startTileX) * tileSize;
    const offsetY = height / 2 - (centerY - startTileY) * tileSize;
    
    // Draw background
    ctx.fillStyle = '#aad3df';
    ctx.fillRect(0, 0, width, height);
    
    let tilesLoaded = 0;
    let tilesToLoad = numTilesX * numTilesY;
    
    // Load and draw tiles
    for (let x = 0; x < numTilesX; x++) {
      for (let y = 0; y < numTilesY; y++) {
        const tileX = startTileX + x;
        const tileY = startTileY + y;
        
        if (tileX < 0 || tileY < 0 || tileX >= scale || tileY >= scale) {
          tilesToLoad--;
          continue;
        }
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, offsetX + x * tileSize, offsetY + y * tileSize, tileSize, tileSize);
          tilesLoaded++;
          if (tilesLoaded === tilesToLoad) {
            drawMarkers();
            hideOverlay();
          }
        };
        img.onerror = () => {
          tilesLoaded++;
          if (tilesLoaded === tilesToLoad) {
            drawMarkers();
            hideOverlay();
          }
        };
        img.src = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
      }
    }
    
    function drawMarkers() {
      // Calculate positions for all markers and labels
      const markerData = [];
      const placedLabels = [];
      
      for (const p of points) {
        const px = (p.lon + 180) / 360 * scale;
        const py = (1 - Math.log(Math.tan(p.lat * Math.PI / 180) + 1 / Math.cos(p.lat * Math.PI / 180)) / Math.PI) / 2 * scale;
        
        const x = offsetX + (px - startTileX) * tileSize;
        const y = offsetY + (py - startTileY) * tileSize;
        
        const labelText = (p.usernames && p.usernames.length > 1)
          ? `${p.location} (${p.usernames.length})`
          : p.location;
        ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const metrics = ctx.measureText(labelText);
        const padding = 4;
        const textHeight = 14;
        const labelWidth = metrics.width + padding * 2;
        const labelHeight = textHeight + padding;
        
        markerData.push({ x, y, location: labelText, labelWidth, labelHeight, padding });
      }
      
      // Draw all markers first
      for (const m of markerData) {
        ctx.fillStyle = '#e74c3c';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      
      // Find non-overlapping positions for labels
      function rectanglesOverlap(r1, r2) {
        return !(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom);
      }
      
      function tryPosition(m, offsetY) {
        const bgX = m.x - m.labelWidth / 2;
        const bgY = m.y + offsetY;
        const rect = {
          left: bgX,
          right: bgX + m.labelWidth,
          top: bgY,
          bottom: bgY + m.labelHeight
        };
        
        // Check if position is within canvas bounds
        if (rect.left < 0 || rect.right > width || rect.top < 0 || rect.bottom > height) {
          return null;
        }
        
        // Check overlap with existing labels
        for (const placed of placedLabels) {
          if (rectanglesOverlap(rect, placed)) {
            return null;
          }
        }
        
        return rect;
      }
      
      // Try placing labels with different offsets
      for (const m of markerData) {
        const offsets = [10, -m.labelHeight - 10, 20, -m.labelHeight - 20, 30, -m.labelHeight - 30];
        let placed = false;
        
        for (const offset of offsets) {
          const rect = tryPosition(m, offset);
          if (rect) {
            placedLabels.push(rect);
            
            // Draw label background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(rect.left, rect.top, m.labelWidth, m.labelHeight, 3);
            ctx.fill();
            ctx.stroke();
            
            // Draw text
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(m.location, m.x, rect.top + m.padding);
            
            placed = true;
            break;
          }
        }
        
        // If no position found, draw it anyway at default position with higher transparency
        if (!placed) {
          const bgX = m.x - m.labelWidth / 2;
          const bgY = m.y + 10;
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bgX, bgY, m.labelWidth, m.labelHeight, 3);
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#555';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(m.location, m.x, bgY + m.padding);
        }
      }
    }
    
    if (tilesToLoad === 0) {
      drawMarkers();
      hideOverlay();
    }
    
    // canvas already appended earlier
    
    const userList = document.createElement('div');
    userList.style.cssText = 'position:absolute;bottom:10px;left:10px;background:rgba(255,255,255,0.95);padding:10px;border-radius:8px;max-height:200px;overflow-y:auto;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);';
    
    // Build user list safely without innerHTML
    const title = document.createElement('strong');
    title.textContent = 'Users:';
    userList.appendChild(title);
    userList.appendChild(document.createElement('br'));
    
    const userEntries = points.flatMap(p => (p.usernames ? p.usernames.map(u => ({ username: u, location: p.location })) : [{ username: p.username, location: p.location }]));
    userEntries.forEach((entry, index) => {
      if (index > 0) userList.appendChild(document.createElement('br'));
      const line = document.createTextNode(`• @${entry.username} — ${entry.location}`);
      userList.appendChild(line);
    });
    
    mapContainer.appendChild(userList);
    console.log(`Static map rendered with ${points.length} points at zoom ${zoom}`);
  }
  
  async function loadUsersFromStorage() {
    const all = await storageGet(null);
    const list = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('loc_') && v && typeof v.location === 'string') {
        list.push({ username: k.substring(4), location: v.location });
      }
    }
    return list;
  }
  async function buildPoints() {
    setStat(users.length);
    const uniqueLocs = new Map();
    for (const u of users) {
      const key = (u.location || '').trim().toLowerCase();
      if (key && !uniqueLocs.has(key)) uniqueLocs.set(key, []);
      if (key) uniqueLocs.get(key).push(u);
    }
    const results = [];
    for (const [locKey, arr] of uniqueLocs.entries()) {
      const geo = await geocodeLocation(locKey);
      if (geo) {
        for (const u of arr) {
          results.push({ username: u.username, location: u.location, lat: geo.lat, lon: geo.lon });
        }
      }
      await new Promise(r => setTimeout(r, 250));
    }
    // Aggregate identical coordinates (rounded) into single point with usernames array
    const aggregated = new Map();
    for (const p of results) {
      const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
      if (!aggregated.has(key)) {
        aggregated.set(key, { lat: p.lat, lon: p.lon, location: p.location, usernames: [p.username] });
      } else {
        const entry = aggregated.get(key);
        entry.usernames.push(p.username);
        if (p.location.length < entry.location.length) entry.location = p.location;
      }
    }
    points = Array.from(aggregated.values());
  }
  async function init() {
    try {
      users = await loadUsersFromStorage();
      console.log(`Loaded ${users.length} users`);
    } catch (e) {
      console.error('Error loading users:', e);
      users = [];
    }
    // No filter input to reset.
    try { await apply(); } catch (e) { console.error('Error:', e); setStat(0); }
  }
  async function apply() { 
    try {
      showOverlay();
      await buildPoints(); 
      renderStaticMap();
    } catch (e) { console.error('Error in apply():', e); setStat(0); }
  }
  window.addEventListener('resize', () => { if (points.length) renderStaticMap(); });
  init();
})();
