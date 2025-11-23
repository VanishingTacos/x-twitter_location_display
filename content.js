// Cache for storing location data
const locationCache = new Map();

// Track which usernames we've already processed
const processedUsernames = new Set();

// Track which tweet elements we've already processed
const processedTweets = new WeakSet();

// Rate limiting: track ongoing requests to prevent duplicates
const pendingRequests = new Map();

// Rate limiting: maximum concurrent requests
const MAX_CONCURRENT_REQUESTS = 5;
let activeRequests = 0;

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
        locationCache.set(username.toLowerCase(), location);
      }
    } catch (e) {
      // Ignore errors
    }
  }

  return response;
};

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
 * Fetches location data using X's GraphQL API
 */
async function fetchLocationData(username) {
  // Validate username
  if (!isValidUsername(username)) {
    return null;
  }

  const normalizedUsername = username.toLowerCase();

  // Check cache first
  if (locationCache.has(normalizedUsername)) {
    return locationCache.get(normalizedUsername);
  }

  // Check if request is already pending for this username
  if (pendingRequests.has(normalizedUsername)) {
    return pendingRequests.get(normalizedUsername);
  }

  // Rate limiting: wait if too many concurrent requests
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  activeRequests++;

  // Create the fetch promise
  const fetchPromise = (async () => {
    try {
      // Get CSRF token from cookies
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
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
        credentials: 'include' // Include cookies for authentication
      });

      if (!response.ok) {
        locationCache.set(normalizedUsername, null);
        return null;
      }

      const data = await response.json();

      // Extract location from response with safe navigation
      const location = data?.data?.user_result_by_screen_name?.result?.about_profile?.account_based_in;

      if (location && typeof location === 'string' && location.trim().length > 0) {
        const sanitizedLocation = location.trim();
        locationCache.set(normalizedUsername, sanitizedLocation);
        return sanitizedLocation;
      } else {
        locationCache.set(normalizedUsername, null);
        return null;
      }

    } catch (error) {
      locationCache.set(normalizedUsername, null);
      return null;
    } finally {
      activeRequests--;
      pendingRequests.delete(normalizedUsername);
    }
  })();

  // Store pending request
  pendingRequests.set(normalizedUsername, fetchPromise);

  return fetchPromise;
}

/**
 * Creates and injects location badge next to username
 */
function injectLocationBadge(element, username, location) {
  try {
    if (!location || !element) return;

    // Validate inputs
    if (typeof location !== 'string' || location.length === 0) return;

    // Check if badge already exists
    if (element.querySelector('.x-location-badge')) return;

    // Find the username container
    const usernameContainer = element.querySelector('[data-testid="User-Name"]');
    if (!usernameContainer) return;

    // Create location badge with XSS protection
    const badge = document.createElement('span');
    badge.className = 'x-location-badge';

    // Create SVG icon
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.style.marginRight = '2px';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z');
    path.setAttribute('fill', 'currentColor');

    svg.appendChild(path);
    badge.appendChild(svg);

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
  tweets.forEach(tweet => processTweet(tweet));
}

/**
 * Sets up MutationObserver to watch for new tweets
 */
function observeTimeline() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element node
          // Check if it's a tweet
          if (node.getAttribute && node.getAttribute('data-testid') === 'tweet') {
            processTweet(node);
          }
          // Check if it contains tweets
          const tweets = node.querySelectorAll?.('article[data-testid="tweet"]');
          if (tweets && tweets.length > 0) {
            tweets.forEach(tweet => processTweet(tweet));
          }
        }
      });
    });
  });

  // Start observing the main timeline
  const timeline = document.querySelector('main');
  if (timeline) {
    observer.observe(timeline, {
      childList: true,
      subtree: true
    });
  }

  // Also process existing tweets
  processVisibleTweets();
}

/**
 * Waits for tweets to appear on the page (handles async loading)
 */
function waitForTweets(maxAttempts = 10, interval = 500) {
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
  // Small delay to ensure X's React app has started
  setTimeout(init, 1000);
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
