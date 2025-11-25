// Simplified popup logic for Firefox: always show main UI and provide controls
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  updateStats();
});

// Notification helper
function showNotification(message, type = 'info', duration = 4000) {
  const notificationEl = document.getElementById('notification');
  if (!notificationEl) return;

  notificationEl.textContent = message;
  notificationEl.className = `notification show ${type}`;

  if (duration > 0) {
    setTimeout(() => {
      notificationEl.classList.remove('show');
    }, duration);
  }
}

// Small storage helpers: prefer `browser.storage.local` (Promise), fallback to `chrome.storage.local` wrapped in Promises
const storageGet = (keys) => {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    return browser.storage.local.get(keys);
  }
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => resolve(result));
    } catch (e) {
      resolve({});
    }
  });
};

const storageRemove = (keys) => {
  if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
    return browser.storage.local.remove(keys);
  }
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(keys, () => resolve());
    } catch (e) {
      resolve();
    }
  });
};

function setupEventListeners() {
  const clearCacheButton = document.getElementById('clearCache');
  if (clearCacheButton) {
    clearCacheButton.addEventListener('click', clearCache);
  }

  const optionsButton = document.getElementById('openOptions');
  if (optionsButton) {
    optionsButton.addEventListener('click', openOptions);
  }

  const openMapButton = document.getElementById('openMap');
  if (openMapButton) {
    openMapButton.addEventListener('click', openMapView);
  }
}

async function updateStats() {
  try {
    const items = await storageGet(null);
    const cacheEntries = Object.keys(items || {}).filter(key => key.startsWith('loc_'));
    const cacheCountElement = document.getElementById('cacheCount');
    if (cacheCountElement) {
      cacheCountElement.textContent = cacheEntries.length;
    }

    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = 'Active';
      statusElement.style.color = '#00ba7c';
    }
  } catch (e) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = 'Error reading storage';
      statusElement.style.color = '#c0392b';
    }
  }
}

function clearCache() {
  (async () => {
    try {
      const items = await storageGet(null);
      const keysToRemove = Object.keys(items || {}).filter(key => key.startsWith('loc_'));

      if (keysToRemove.length === 0) {
        showNotification('Cache is already empty!', 'info');
        return;
      }

      await storageRemove(keysToRemove);
      showNotification(`Cleared ${keysToRemove.length} cached locations!`, 'success');
      updateStats();
    } catch (e) {
      showNotification('Failed to clear cache.', 'error');
    }
  })();
}

function openOptions() {
  if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.openOptionsPage) {
    browser.runtime.openOptionsPage();
  } else {
    // Fallback for Chrome
    chrome.runtime.openOptionsPage();
  }
}

function openMapView() {
  const url = (typeof browser !== 'undefined' && browser.runtime?.getURL)
    ? browser.runtime.getURL('map.html')
    : chrome.runtime.getURL('map.html');
  if (typeof browser !== 'undefined' && browser.tabs?.create) {
    browser.tabs.create({ url });
  } else if (chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, '_blank');
  }
}
