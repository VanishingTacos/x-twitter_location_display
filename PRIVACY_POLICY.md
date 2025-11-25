# Privacy Policy for MapChirp

**Last Updated: November 25, 2025**

## Introduction

MapChirp ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how MapChirp handles data when you use our browser extension.

## Our Core Privacy Principle

**MapChirp processes all data locally on your device. We do not collect, transmit, store, or have access to any of your personal information.**

## Data We Access

### Location Information from X/Twitter
- **What**: Publicly visible location strings from X/Twitter user profiles (e.g., "San Francisco, CA")
- **Source**: X/Twitter's public GraphQL API (AboutAccountQuery endpoint)
- **How Used**: Displayed as badges next to usernames in your timeline
- **Storage**: Cached locally on your device for 24 hours to improve performance
- **Privacy Note**: This information is already publicly visible on user profiles. We do not access private or non-public data.

### User Preferences
- **What**: Your extension settings (badge colors, icons, country filters, display preferences)
- **Storage**: Stored locally in your browser's extension storage
- **Privacy Note**: Never transmitted outside your device

## Data We Do NOT Collect

- ❌ Personal identification information (name, email, phone number)
- ❌ Authentication credentials or login tokens
- ❌ Browsing history
- ❌ Private messages or direct messages
- ❌ Tweet content or user interactions
- ❌ IP addresses or device identifiers
- ❌ Analytics or usage statistics
- ❌ Cookies for tracking purposes

## Third-Party Services

MapChirp makes requests to the following external services for functionality. These requests contain only the minimum data necessary:

### OpenStreetMap Nominatim (Geocoding)
- **Purpose**: Convert location strings to geographic coordinates for map display
- **Data Sent**: Location strings only (e.g., "San Francisco, CA")
- **Data Received**: Latitude and longitude coordinates
- **Privacy**: Nominatim is GDPR-compliant. We include User-Agent header for transparency. No user identification data sent.
- **When Used**: Only when you open the Map View feature

### OpenStreetMap Tiles
- **Purpose**: Display map imagery
- **Data Sent**: Standard HTTP requests for map tile images
- **Data Received**: PNG image files
- **Privacy**: Public map tiles, no user data required or transmitted
- **When Used**: Only when you open the Map View feature

### X/Twitter
- **Purpose**: Fetch publicly available location data
- **Data Sent**: Standard API requests using your existing X/Twitter session
- **Data Received**: Public profile information (location only)
- **Privacy**: Uses your existing X/Twitter authentication. We do not access or store your credentials.

## Data Storage and Retention

### Local Storage Only
- All data is stored in your browser's local extension storage (chrome.storage.local or browser.storage.local)
- Data never leaves your device
- Storage is isolated to the MapChirp extension

### Automatic Data Deletion
- Location cache entries expire and are deleted after 24 hours
- Geocoding cache is maintained until manually cleared
- Background script runs hourly cleanup to remove expired data

### User Control
You can clear all MapChirp data at any time:
- **Chrome**: Settings → Privacy and security → Site Settings → View permissions and data stored across sites → MapChirp → Clear data
- **Firefox**: about:preferences#privacy → Cookies and Site Data → Manage Data → MapChirp → Remove Selected

## Permissions Explained

### Storage Permission
Required to cache location data and save user preferences. Without this, the extension would exceed API rate limits and lose settings on every browser restart.

### Host Permissions
- **x.com, twitter.com**: Required to inject location badges and access X's public API
- **nominatim.openstreetmap.org**: Required for geocoding location strings
- **tile.openstreetmap.org**: Required to download map images

See our [Chrome Web Store Justification](CHROME_WEB_STORE_JUSTIFICATION.md) for detailed technical explanations.

## Data Security

### Security Measures
- Content Security Policy (CSP) enforced to prevent code injection
- No use of `eval()` or dynamic code execution
- Input sanitization on all user-generated content
- XSS prevention using safe DOM methods (textContent, createTextNode)
- Rate limiting prevents abuse of external APIs
- Exponential backoff for API error handling

### No Remote Code Execution
All extension code is packaged within the extension files. No code is downloaded or executed from remote sources.

## Children's Privacy

MapChirp does not knowingly collect data from anyone, including children under 13. Since we don't collect any personal information, we comply with COPPA and similar regulations by default.

## Changes to Privacy Policy

We may update this Privacy Policy to reflect changes in the extension or legal requirements. Updates will be posted with a new "Last Updated" date. Continued use after changes constitutes acceptance.

## Open Source Transparency

MapChirp is open source. You can review our code to verify our privacy practices:
- Repository: https://github.com/VanishingTacos/MapChirp

## Your Rights

### Data Access
You can view all data stored by MapChirp through your browser's developer tools (Application/Storage tab → Extension Storage).

### Data Deletion
You have full control to delete all MapChirp data at any time through browser settings.

### Data Portability
All data is stored in standard JSON format in local storage and can be exported using browser developer tools.

## No Advertising or Monetization

MapChirp is free and does not contain:
- Advertisements
- Affiliate links
- Tracking for marketing purposes
- Monetization of any kind

## Contact Information

For privacy questions or concerns:
- GitHub Issues: https://github.com/VanishingTacos/MapChirp/issues
- Email: me@vanishingtacos.com

## Compliance

MapChirp complies with:
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)
- Chrome Web Store Developer Program Policies
- Firefox Add-on Policies

## Summary

**MapChirp is privacy-first:**
- No data collection
- No tracking or analytics
- All processing happens locally on your device
- You maintain complete control over your data
- Open source for transparency and verification

---

**By using MapChirp, you acknowledge that you have read and understood this Privacy Policy.**
