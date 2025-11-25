# 🗺️ MapChirp

**Visualize the geographic landscape of X/Twitter conversations**

MapChirp is a privacy-focused browser extension that enriches your X/Twitter experience by displaying user location information directly in your timeline and providing interactive geographic visualizations of the communities you engage with.

> **Status**: MapChirp is currently awaiting approval for the Chrome Web Store and Firefox Add-ons. In the meantime, you can install it manually following the instructions below.

## 🌟 Overview

In an increasingly global digital discourse, understanding the geographic context of conversations can provide valuable insights. MapChirp seamlessly integrates location data into your X/Twitter experience, revealing patterns and connections across the communities you follow.

### Key Features

#### 📍 **Inline Location Badges**
- Location information appears directly next to usernames in your timeline
- Customizable badge appearance (colors, icons)
- Country filtering to focus on specific regions
- Smart caching minimizes API calls and respects rate limits

#### 🗺️ **Interactive Map Visualization**
- Beautiful canvas-based maps using OpenStreetMap tiles
- Automatic zoom and centering to fit all cached locations
- Smart label placement prevents overlapping
- Aggregates multiple users at the same location
- Comprehensive user list overlay
- All data processed locally - your privacy is protected

#### ⚙️ **Intelligent Data Management**
- Sophisticated rate limiting with exponential backoff
- Request queuing to prevent API throttling
- 24-hour persistent cache reduces redundant requests
- Batch processing for smooth scrolling performance
- Automatic cache cleanup to maintain efficiency

## 🏗️ Architecture

MapChirp is built with a focus on performance, reliability, and user privacy:

### Content Script (`content.js`)
- **Request Queue System**: Processes location requests with controlled concurrency (max 3 concurrent, 300ms intervals)
- **Exponential Backoff**: Automatically handles API failures with increasing retry delays (2s → 4s → 8s → 60s max)
- **Rate Limit Detection**: Monitors for HTTP 429 responses and enters 30-second cooldown periods
- **Batch Processing**: Tweets processed in groups of 10 with 200ms stagger to prevent queue overflow
- **Debounced Observer**: 500ms debounce on timeline changes reduces rapid-fire processing
- **Persistent Storage**: Locations cached with timestamps for 24-hour retention

### Background Script (`background.js`)
- Manages periodic cache cleanup (hourly)
- Handles cross-session data persistence
- Lightweight and efficient resource usage

### Map Rendering (`map.js`)
- **OSM Tile Integration**: Renders maps using OpenStreetMap tiles (no API keys required)
- **Intelligent Zoom Calculation**: Automatically fits all points with appropriate padding
- **Smart Geocoding**: Nominatim geocoding with aggressive local caching
- **Label Collision Detection**: Algorithm prevents overlapping location labels
- **Point Aggregation**: Groups users at identical coordinates for clarity
- **Loading States**: Smooth overlay with spinner during tile loading and geocoding

### Browser Compatibility
- **Chrome**: Direct fetch interception for seamless data capture
- **Firefox**: Injected page script (`page_inject.js`) to monitor network requests within content security policy constraints

## 📂 Project Structure

```
MapChirp/
├── Chrome/                    # Chrome extension files
│   ├── manifest.json         # Extension manifest (Manifest V3)
│   ├── background.js         # Service worker for cache management
│   ├── content.js            # Main content script with rate limiting
│   ├── map.js                # Interactive map visualization
│   ├── popup.html/js         # Extension popup interface
│   ├── options.html/js       # Settings configuration page
│   └── styles.css            # UI styling
├── firefox/                   # Firefox extension files
│   ├── manifest.json         # Firefox-specific manifest (Manifest V2)
│   ├── background.js         # Background script for cache management
│   ├── content.js            # Content script with Firefox-specific adaptations
│   ├── page_inject.js        # Page context script for fetch interception
│   ├── map.js                # Map visualization (OSM-based)
│   ├── popup.html/js         # Extension popup
│   ├── options.html/js       # Settings page
│   └── styles.css            # UI styling
├── package.sh                 # Build script for creating distribution zips
├── LICENSE                    # Project license
└── README.md                  # This file
```

## 🚀 Installation

### Chrome

1. Clone or download this repository
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `Chrome/` directory
6. The extension icon should appear in your toolbar

### Firefox

#### Option A: Temporary Installation (Development)
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select any file inside the `firefox/` directory (e.g., `manifest.json`)
4. Extension will remain active until browser restart

#### Option B: Permanent Installation (Packaged)
1. Run `./package.sh` to create `mapchirp-firefox.zip`
2. Navigate to `about:addons`
3. Click the gear icon → **Install Add-on From File...**
4. Select the generated zip file
5. Note: Firefox may require signing for permanent installation

## 💡 Usage

### Viewing Location Badges

1. Navigate to [x.com](https://x.com) or [twitter.com](https://twitter.com)
2. Location badges will automatically appear next to usernames in your timeline
3. Locations are fetched using X's GraphQL API and cached locally

### Customizing Appearance

1. Click the MapChirp extension icon in your toolbar
2. Select **Options** or **Settings**
3. Configure:
   - **Badge color**: Customize the badge background tint
   - **Text color**: Adjust badge text/icon color
   - **Icon**: Choose an emoji or symbol for the location indicator
   - **Country filter**: Show only users from specific countries
   - **Display toggle**: Enable/disable location badges

### Exploring the Map

1. Click the MapChirp extension icon
2. Select **Open Map View**
3. The map automatically displays all cached user locations
4. Features:
   - Auto-zoom to fit all points optimally
   - Hover-friendly labels with collision avoidance
   - User list overlay showing all displayed accounts
   - Aggregated markers for multiple users at same location
5. Refresh as your cache grows to see new locations

## 🔒 Privacy & Performance

### Privacy First
- **All processing happens locally** - your data never leaves your browser
- Location information is fetched directly from X's API (data they already have)
- No external analytics or tracking
- No telemetry or usage statistics
- Cache stored locally using browser storage APIs

### Performance Optimizations
- **Sophisticated Rate Limiting**: Prevents API throttling and ensures smooth operation
- **Intelligent Caching**: 24-hour cache duration reduces redundant requests by ~95%
- **Batch Processing**: Prevents browser slowdown during rapid scrolling
- **Debounced Updates**: Reduces unnecessary processing on dynamic timelines
- **Exponential Backoff**: Gracefully handles temporary failures
- **Request Queuing**: Maintains order and prevents race conditions

## 🛠️ Development

### Prerequisites
- Basic understanding of browser extension architecture
- Familiarity with JavaScript (ES6+)
- Chrome or Firefox browser

### Building & Packaging

```bash
# Make packaging script executable (first time only)
chmod +x package.sh

# Create distribution zips
./package.sh
```

This generates:
- `mapchirp-chrome.zip` - Ready for Chrome Web Store upload
- `mapchirp-firefox.zip` - Ready for Firefox Add-ons submission

### Debugging

**Chrome:**
- Content script: Right-click page → Inspect → Console tab
- Background script: `chrome://extensions/` → MapChirp → Inspect views: service worker
- Popup: Right-click extension icon → Inspect

**Firefox:**
- Content script: Right-click page → Inspect Element → Console
- Background script: `about:debugging#/runtime/this-firefox` → MapChirp → Inspect
- Popup: Click extension → right-click popup → Inspect

### Key Technical Insights

#### Rate Limiting Strategy
The extension implements a multi-layered rate limiting approach:
1. **Concurrency Control**: Max 3 simultaneous requests
2. **Time-based Throttling**: 300ms minimum between requests
3. **Exponential Backoff**: Failed requests trigger increasing delays
4. **Rate Limit Detection**: Automatic 30s cooldown on HTTP 429
5. **Request Queue**: FIFO processing prevents request loss

#### Cache Strategy
```
Check Flow:
1. In-memory Map cache (instant)
2. Browser storage (if not preloaded, ~10ms)
3. Network request (queued, rate-limited)
```

#### Browser-Specific Adaptations
- **Chrome**: Direct `window.fetch` override for seamless interception
- **Firefox**: Separate page context script due to CSP restrictions
- Both use unified caching and rate limiting logic

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Issues
- Check existing issues first
- Provide browser version and extension version
- Include console logs if applicable
- Describe steps to reproduce

### Submitting Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes in **both** `Chrome/` and `firefox/` directories when applicable
4. Test on both browsers
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request with detailed description

### Development Guidelines
- Maintain consistent code style with existing codebase
- Keep Chrome and Firefox versions in sync
- Add comments for complex logic
- Test rate limiting behavior thoroughly
- Verify cache persistence across sessions

## 📜 License

This project is licensed under the terms specified in the `LICENSE` file.

## 🙏 Acknowledgments

- **OpenStreetMap**: Map tiles and geographic data
- **Nominatim**: Geocoding services
- **X/Twitter**: GraphQL API for location data

## 📮 Support

For questions, issues, or feature requests, please use the GitHub Issues tab.

---

**Note**: This extension is not affiliated with or endorsed by X Corp or Twitter, Inc. It's an independent tool created to enhance user experience on the platform.

