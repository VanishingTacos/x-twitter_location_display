// Cache for storing location data
const locationCache = new Map();

// Persistent cache loaded from storage
let persistentCacheLoaded = false;

// Settings variables
let settings = {
  displayEnabled: true,
  badgeColor: '#1d9bf0',
  textColor: '#ffffff',
  badgeIcon: '📍',
  countryFilter: []
};

// Persistent cache duration (match background)
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Load settings from storage
async function loadSettings() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (items) => resolve(items || {}));
    });
    if (result.settings) {
      settings = { ...settings, ...result.settings };
    }
  } catch (e) {
    // Use defaults
  }
}

// Listen for settings changes in storage
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
      // Re-process visible tweets to apply new settings
      processVisibleTweets();
    }
  });
}

// Load settings immediately
loadSettings();

// Track which usernames we've already processed
const processedUsernames = new Set();

// Track which tweet elements we've already processed
const processedTweets = new WeakSet();

// Rate limiting: track ongoing requests to prevent duplicates
const pendingRequests = new Map();

// Rate limiting: maximum concurrent requests
const MAX_CONCURRENT_REQUESTS = 3;
let activeRequests = 0;

// Advanced rate limiting: request queue and throttling
const requestQueue = [];
const REQUEST_INTERVAL = 300; // Minimum ms between requests
let lastRequestTime = 0;
let isProcessingQueue = false;

// Exponential backoff tracking
const failedRequests = new Map(); // username -> { count, lastAttempt, backoffUntil }
const MAX_RETRIES = 3;
const BASE_BACKOFF = 2000; // 2 seconds
const MAX_BACKOFF = 60000; // 60 seconds

// Rate limit detection
let rateLimitedUntil = 0;
const RATE_LIMIT_COOLDOWN = 30000; // 30 seconds cooldown after rate limit

// Batch-load persistent cache from storage
async function loadPersistentCache() {
  try {
    let result = {};
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      result = await new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => resolve(items || {}));
      });
    }

    // Load all loc_* entries into memory cache
    for (const [key, value] of Object.entries(result)) {
      if (key.startsWith('loc_') && value && value.location && typeof value.timestamp === 'number') {
        if (Date.now() - value.timestamp < CACHE_DURATION) {
          const username = key.substring(4);
          locationCache.set(username, value.location);
        }
      }
    }
    persistentCacheLoaded = true;
  } catch (e) {
    persistentCacheLoaded = true;
  }
}

// Start loading cache immediately
loadPersistentCache();

// Intercept X's fetch requests to capture location data
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);

  // Check if this is a GraphQL AboutAccountQuery response
  const url = args[0];
  if (typeof url === 'string' && url.includes('AboutAccountQuery')) {
    // Clone response so we can read it without consuming it
    const clonedResponse = response.clone();
    try {
      const data = await clonedResponse.json();
      const username = data?.data?.user_result_by_screen_name?.result?.core?.screen_name;
      const location = data?.data?.user_result_by_screen_name?.result?.about_profile?.account_based_in;

      if (username && location) {
        const normalizedUsername = username.toLowerCase();
        const sanitizedLocation = sanitizeLocation(location);
        if (sanitizedLocation) {
          locationCache.set(normalizedUsername, sanitizedLocation);
          
          // Persist to storage
          try {
            chrome.storage.local.set({
              [`loc_${normalizedUsername}`]: {
                location: sanitizedLocation,
                timestamp: Date.now()
              }
            });
          } catch (e) {
            // Ignore storage errors
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  return response;
};

/**
 * Sanitizes location string
 */
function sanitizeLocation(location) {
  if (!location || typeof location !== 'string') return null;
  const trimmed = location.trim();
  if (trimmed.length < 1 || trimmed.length > 100) return null;
  if (['null', 'undefined', 'N/A', 'n/a'].includes(trimmed.toLowerCase())) return null;
  return trimmed;
}

/**
 * Validates and sanitizes username
 */
function isValidUsername(username) {
  if (!username || typeof username !== 'string') return false;
  // Twitter usernames: 1-15 chars, alphanumeric + underscore
  return /^[a-zA-Z0-9_]{1,15}$/.test(username);
}

/**
 * Extracts username from profile link or tweet element
 */
function extractUsername(element) {
  try {
    if (!element || !element.querySelectorAll) return null;

    // Try multiple selectors to find username
    const selectors = [
      'a[href^="/"][role="link"]',
      '[data-testid="User-Name"] a',
      'a[role="link"]'
    ];

    for (const selector of selectors) {
      const links = element.querySelectorAll(selector);
      for (const link of links) {
        const href = link.getAttribute('href');
        if (!href) continue;

        const match = href.match(/^\/([^\/\?]+)/);
        if (match && match[1]) {
          const username = match[1];

          // Filter out non-username paths
          const blacklist = ['home', 'notifications', 'messages', 'explore', 'compose', 'i', 'search', 'settings'];
          if (!blacklist.includes(username) && !username.startsWith('i/') && isValidUsername(username)) {
            return username;
          }
        }
      }
    }
  } catch (error) {
    // Silently handle errors
  }
  return null;
}

/**
 * Gets CSRF token from cookies
 */
function getCsrfToken() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'ct0') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

/**
 * Checks if a username is currently in backoff period
 */
function isInBackoff(username) {
  const failed = failedRequests.get(username);
  if (!failed) return false;
  return Date.now() < failed.backoffUntil;
}

/**
 * Records a failed request and calculates backoff
 */
function recordFailure(username) {
  const failed = failedRequests.get(username) || { count: 0, lastAttempt: 0, backoffUntil: 0 };
  failed.count++;
  failed.lastAttempt = Date.now();
  
  // Exponential backoff: 2s, 4s, 8s, then cap at MAX_BACKOFF
  const backoffTime = Math.min(BASE_BACKOFF * Math.pow(2, failed.count - 1), MAX_BACKOFF);
  failed.backoffUntil = Date.now() + backoffTime;
  
  failedRequests.set(username, failed);
}

/**
 * Clears failure tracking for a username after success
 */
function clearFailure(username) {
  failedRequests.delete(username);
}

/**
 * Processes the request queue with proper throttling
 */
async function processRequestQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (requestQueue.length > 0) {
    // Check if we're rate limited
    if (Date.now() < rateLimitedUntil) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    // Check concurrent request limit
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }

    // Enforce minimum time between requests
    const timeSinceLastRequest = Date.now() - lastRequestTime;
    if (timeSinceLastRequest < REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL - timeSinceLastRequest));
    }

    const { username, resolve, reject } = requestQueue.shift();
    lastRequestTime = Date.now();
    
    executeLocationFetch(username).then(resolve).catch(reject);
  }

  isProcessingQueue = false;
}

/**
 * Executes the actual location fetch with error handling
 */
async function executeLocationFetch(username) {
  const normalizedUsername = username.toLowerCase();
  activeRequests++;

  try {
    // Get CSRF token from cookies
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      recordFailure(normalizedUsername);
      locationCache.set(normalizedUsername, null);
      return null;
    }

    // Use X's AboutAccountQuery GraphQL endpoint
    const queryId = 'XRqGa7EeokUU5kppkh13EA';
    const variables = JSON.stringify({ screenName: username });
    const url = `https://x.com/i/api/graphql/${queryId}/AboutAccountQuery?variables=${encodeURIComponent(variables)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': '*/*',
        'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'content-type': 'application/json',
        'x-csrf-token': csrfToken,
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en',
      },
      credentials: 'include'
    });

    // Check for rate limiting
    if (response.status === 429) {
      rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN;
      recordFailure(normalizedUsername);
      locationCache.set(normalizedUsername, null);
      return null;
    }

    if (!response.ok) {
      recordFailure(normalizedUsername);
      locationCache.set(normalizedUsername, null);
      return null;
    }

    const data = await response.json();

    // Extract location from response
    const location = data?.data?.user_result_by_screen_name?.result?.about_profile?.account_based_in;

    if (location && typeof location === 'string' && location.trim().length > 0) {
      const sanitizedLocation = sanitizeLocation(location);
      if (sanitizedLocation) {
        clearFailure(normalizedUsername); // Clear failure tracking on success
        locationCache.set(normalizedUsername, sanitizedLocation);
      
        // Persist to storage
        try {
          chrome.storage.local.set({
            [`loc_${normalizedUsername}`]: {
              location: sanitizedLocation,
              timestamp: Date.now()
            }
          });
        } catch (e) {
          // ignore storage errors
        }
        
        return sanitizedLocation;
      }
    }

    locationCache.set(normalizedUsername, null);
    return null;

  } catch (error) {
    recordFailure(normalizedUsername);
    locationCache.set(normalizedUsername, null);
    return null;
  } finally {
    activeRequests--;
    pendingRequests.delete(normalizedUsername);
  }
}

/**
 * Fetches location data using X's GraphQL API with advanced rate limiting
 */
async function fetchLocationData(username) {
  // Validate username
  if (!isValidUsername(username)) {
    return null;
  }

  const normalizedUsername = username.toLowerCase();

  // Check in-memory cache first
  if (locationCache.has(normalizedUsername)) {
    return locationCache.get(normalizedUsername);
  }

  // Check if in backoff period
  if (isInBackoff(normalizedUsername)) {
    return null;
  }

  // Check persistent storage cache if not loaded yet
  if (!persistentCacheLoaded) {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get([`loc_${normalizedUsername}`], (items) => resolve(items || {}));
      });
      const cached = result && result[`loc_${normalizedUsername}`];
      if (cached && cached.timestamp && typeof cached.timestamp === 'number') {
        if (Date.now() - cached.timestamp < CACHE_DURATION) {
          const sanitized = sanitizeLocation(cached.location);
          if (sanitized) {
            locationCache.set(normalizedUsername, sanitized);
            return sanitized;
          }
        }
      }
    } catch (e) {
      // ignore storage errors and continue to network fetch
    }
  }

  // Check if request is already pending
  if (pendingRequests.has(normalizedUsername)) {
    return pendingRequests.get(normalizedUsername);
  }

  // Check retry limit
  const failed = failedRequests.get(normalizedUsername);
  if (failed && failed.count >= MAX_RETRIES) {
    return null;
  }

  // Create queued request promise
  const fetchPromise = new Promise((resolve, reject) => {
    requestQueue.push({ username, resolve, reject });
    processRequestQueue();
  });

  pendingRequests.set(normalizedUsername, fetchPromise);
  return fetchPromise;
}

/**
 * Checks if location passes country filter
 */
function passesCountryFilter(location) {
  if (!settings.countryFilter || settings.countryFilter.length === 0) {
    return true; // No filter, show all
  }
  const lowerLocation = location.toLowerCase();
  return settings.countryFilter.some(country => 
    lowerLocation.includes(country.toLowerCase())
  );
}

/**
 * Creates and injects location badge next to username
 */
function injectLocationBadge(element, username, location) {
  try {
    // Check if display is enabled
    if (!settings.displayEnabled) return;

    // Check country filter
    if (!passesCountryFilter(location)) return;

    if (!location || !element) return;

    // Validate inputs
    if (typeof location !== 'string' || location.length === 0) return;

    // Check if badge already exists
    if (element.querySelector('.x-location-badge')) return;

    // Find the username container
    const usernameContainer = element.querySelector('[data-testid="User-Name"]');
    if (!usernameContainer) return;

    // Create location badge with original markup but apply color/icon from settings
    const badge = document.createElement('span');
    badge.className = 'x-location-badge';

    // Apply color (text/icon color) and a subtle translucent background derived from the color
    try {
      badge.style.color = settings.badgeColor || '#1d9bf0';
      const bg = hexToRgba(settings.badgeColor || '#1d9bf0', 0.09);
      badge.style.backgroundColor = bg;
    } catch (e) {
      // ignore style errors
    }

    // Icon: prefer emoji/icon from settings; fallback to original SVG pin
    if (settings.badgeIcon && settings.badgeIcon.trim().length > 0) {
      const iconSpan = document.createElement('span');
      iconSpan.textContent = settings.badgeIcon + ' ';
      iconSpan.style.marginRight = '4px';
      badge.appendChild(iconSpan);
    } else {
      // Create SVG icon (same as original)
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '14');
      svg.setAttribute('height', '14');
      svg.style.marginRight = '4px';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      badge.appendChild(svg);
    }

    // Add text content (safely escaped)
    const textNode = document.createTextNode(location);
    badge.appendChild(textNode);

    // Insert badge after username
    const usernameDivs = usernameContainer.querySelectorAll('div');
    if (usernameDivs.length > 0) {
      const targetDiv = usernameDivs[0];
      targetDiv.appendChild(badge);
    }
  } catch (error) {
    // Silently handle errors
  }
}

// Helper: convert hex color to rgba string with given alpha
function hexToRgba(hex, alpha) {
  try {
    let c = hex.replace('#', '');
    if (c.length === 3) {
      c = c.split('').map(ch => ch + ch).join('');
    }
    const bigint = parseInt(c, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } catch (e) {
    return hex;
  }
}

/**
 * Processes a single tweet element
 */
async function processTweet(tweetElement) {
  // Skip if we've already processed this exact tweet element
  if (processedTweets.has(tweetElement)) return;
  processedTweets.add(tweetElement);

  const username = extractUsername(tweetElement);
  if (!username) {
    return;
  }

  // Skip if already have this location (avoid redundant work)
  const normalizedUsername = username.toLowerCase();
  if (locationCache.has(normalizedUsername)) {
    const location = locationCache.get(normalizedUsername);
    if (location) {
      injectLocationBadge(tweetElement, username, location);
    }
    return;
  }

  const location = await fetchLocationData(username);
  if (location) {
    injectLocationBadge(tweetElement, username, location);
  }
}

/**
 * Processes all tweets currently visible on the page
 */
function processVisibleTweets() {
  // Find all tweet articles
  const tweets = document.querySelectorAll('article[data-testid="tweet"]');
  
  // Process in smaller batches to avoid queue overflow
  const BATCH_SIZE = 10;
  const tweetsArray = Array.from(tweets);
  
  for (let i = 0; i < tweetsArray.length; i += BATCH_SIZE) {
    const batch = tweetsArray.slice(i, i + BATCH_SIZE);
    setTimeout(() => {
      batch.forEach(tweet => processTweet(tweet));
    }, Math.floor(i / BATCH_SIZE) * 200); // Stagger batches by 200ms
  }
}

/**
 * Sets up MutationObserver to watch for new tweets (with debouncing)
 */
function observeTimeline() {
  let debounceTimeout;
  const processNewTweets = () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      processVisibleTweets();
    }, 500); // Increased debounce to reduce rapid-fire requests
  };

  const observer = new MutationObserver((mutations) => {
    let hasTweets = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) { // Element node
          if (node.getAttribute?.('data-testid') === 'tweet' || node.querySelectorAll?.('article[data-testid="tweet"]').length > 0) {
            hasTweets = true;
            break;
          }
        }
      }
      if (hasTweets) break;
    }
    if (hasTweets) {
      processNewTweets();
    }
  });

  // Start observing the main timeline
  const timeline = document.querySelector('main');
  if (timeline) {
    observer.observe(timeline, {
      childList: true,
      subtree: true
    });
  }

  // Process existing tweets immediately
  processVisibleTweets();
}

/**
 * Waits for tweets to appear on the page (handles async loading)
 */
function waitForTweets(maxAttempts = 4, interval = 250) {
  let attempts = 0;

  const checkForTweets = () => {
    attempts++;
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');

    if (tweets.length > 0) {
      observeTimeline();
      return true;
    }

    if (attempts < maxAttempts) {
      setTimeout(checkForTweets, interval);
    } else {
      // Still start observing even if no tweets yet
      observeTimeline();
    }
  };

  checkForTweets();
}

// Initialize when DOM is ready
function init() {
  waitForTweets();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Shorter delay to start faster
  setTimeout(init, 100);
}

// Re-process when navigating (SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    processedUsernames.clear();
    setTimeout(() => {
      processVisibleTweets();
    }, 1500);
  }
}).observe(document, { subtree: true, childList: true });