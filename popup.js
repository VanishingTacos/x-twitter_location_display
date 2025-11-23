// State management
let currentState = 'follow'; // 'follow', 'activation', 'main'

// Update stats when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  await checkExtensionState();
  setupEventListeners();
});

/**
 * Checks the current state of the extension and shows appropriate section
 */
async function checkExtensionState() {
  chrome.storage.local.get(['extensionActivated', 'followClickedTime'], (result) => {
    if (result.extensionActivated) {
      // User has completed both steps - show main section
      showSection('main');
      updateStats();
    } else if (result.followClickedTime) {
      // User has clicked follow - check if 6 seconds have passed
      const elapsed = Date.now() - result.followClickedTime;
      const waitTime = 6000; // 6 seconds

      if (elapsed >= waitTime) {
        // 6 seconds have passed - show activation section
        showSection('activation');
      } else {
        // Still waiting - show follow section with countdown
        showSection('follow');
        startCountdown(Math.ceil((waitTime - elapsed) / 1000));
      }
    } else {
      // User hasn't followed yet - show follow section
      showSection('follow');
    }
  });
}

/**
 * Shows the specified section and hides others
 */
function showSection(section) {
  currentState = section;

  // Hide all sections
  document.getElementById('followSection').classList.remove('active');
  document.getElementById('activationSection').classList.remove('active');
  document.getElementById('mainSection').classList.remove('active');

  // Show the requested section
  if (section === 'follow') {
    document.getElementById('followSection').classList.add('active');
  } else if (section === 'activation') {
    document.getElementById('activationSection').classList.add('active');
  } else if (section === 'main') {
    document.getElementById('mainSection').classList.add('active');
  }
}

/**
 * Sets up all event listeners
 */
function setupEventListeners() {
  // Follow button
  const followButton = document.getElementById('followButton');
  if (followButton) {
    followButton.addEventListener('click', handleFollowClick);
  }

  // Activate button
  const activateButton = document.getElementById('activateButton');
  if (activateButton) {
    activateButton.addEventListener('click', handleActivateClick);
  }

  // Clear cache button
  const clearCacheButton = document.getElementById('clearCache');
  if (clearCacheButton) {
    clearCacheButton.addEventListener('click', clearCache);
  }

  // Options button
  const optionsButton = document.getElementById('openOptions');
  if (optionsButton) {
    optionsButton.addEventListener('click', openOptions);
  }
}

/**
 * Handles follow button click - saves timestamp immediately
 */
function handleFollowClick(e) {
  // Save the timestamp immediately (before popup closes)
  chrome.storage.local.set({ followClickedTime: Date.now() });

  // The link will open in new tab and popup will close
  // When user reopens popup, checkExtensionState will handle the countdown
}

/**
 * Starts countdown with specified seconds remaining
 */
function startCountdown(secondsLeft) {
  const followButton = document.getElementById('followButton');
  const countdownDiv = document.getElementById('countdown');

  if (!followButton || !countdownDiv) return;

  // Disable button and update text
  followButton.style.pointerEvents = 'none';
  followButton.style.opacity = '0.6';
  followButton.textContent = 'Follow Clicked ✓';

  // Update countdown display
  const updateDisplay = () => {
    if (secondsLeft > 0) {
      countdownDiv.textContent = `Unlocking in ${secondsLeft} second${secondsLeft !== 1 ? 's' : ''}...`;
    } else {
      countdownDiv.textContent = 'Ready! 🎉';
      // Small delay before showing activation section
      setTimeout(() => {
        showSection('activation');
      }, 500);
    }
  };

  updateDisplay();

  // Continue countdown
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft >= 0) {
      updateDisplay();
    }
    if (secondsLeft < 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);
}

/**
 * Handles activate button click
 */
function handleActivateClick() {
  // Mark extension as activated (UI state only - extension always works)
  chrome.storage.local.set({ extensionActivated: true }, () => {
    // Show main section
    showSection('main');
    updateStats();

    // Show success message
    const activateButton = document.getElementById('activateButton');
    if (activateButton) {
      activateButton.textContent = 'Activated! ✓';
      activateButton.disabled = true;
    }
  });
}

/**
 * Updates the statistics displayed in popup
 */
async function updateStats() {
  chrome.storage.local.get(null, (items) => {
    // Count cache entries
    const cacheEntries = Object.keys(items).filter(key => key.startsWith('loc_'));
    const cacheCountElement = document.getElementById('cacheCount');
    if (cacheCountElement) {
      cacheCountElement.textContent = cacheEntries.length;
    }

    // Update status
    const statusElement = document.getElementById('status');
    if (statusElement) {
      statusElement.textContent = 'Active';
      statusElement.style.color = '#00ba7c';
    }
  });
}

/**
 * Clears the location cache
 */
function clearCache() {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(key => key.startsWith('loc_'));

    if (keysToRemove.length === 0) {
      alert('Cache is already empty!');
      return;
    }

    chrome.storage.local.remove(keysToRemove, () => {
      alert(`Cleared ${keysToRemove.length} cached locations!`);
      updateStats();
    });
  });
}

/**
 * Opens options page (placeholder for future settings)
 */
function openOptions() {
  alert('Settings coming soon!\n\nFuture features:\n- Toggle location display\n- Customize badge style\n- Filter specific countries\n- Export location data');
}
