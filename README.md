# MapChirp

A small browser extension (Chrome & Firefox) that displays location information for X/Twitter content. This repo contains both Chrome and Firefox manifest and extension code under the `Chrome/` and `firefox/` folders.

**Features**
- Browser extension support for Chrome and Firefox.
- Injects UI into Twitter/X pages to display location information.

**Repository structure**
- `Chrome/` — files for the Chrome extension (manifest.json, background.js, content.js, popup.html, options.html, styles.css).
- `firefox/` — files for the Firefox extension (manifest.json, background.js, content.js, page_inject.js, popup.html, options.html, styles.css).
- `LICENSE` — project license.

**Installation (Chrome)**
1. Open `chrome://extensions/` in Chrome.
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select the `Chrome/` directory from this repository.
4. The extension should load; open its popup or visit Twitter/X to see injected location info.

**Installation (Firefox - temporary)**
1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click "Load Temporary Add-on..." and choose the `firefox/manifest.json` file (or any file inside the `firefox/` directory).
3. The extension will be installed temporarily; reload pages or open Twitter/X to see it in action.

**Usage**
- Open Twitter/X and look for the extension UI injected into tweets or use the extension popup to control settings.
- Use `options.html` (Options page) to configure preferences if available.

**Development**
- To debug: open the browser extension inspector (Extensions page -> Inspect views) or the regular page console for content script logs.
- When making cross-browser changes, check `manifest.json` differences between `Chrome/` and `firefox/`.

**Contributing**
- Open issues for bugs or feature requests.
- Submit pull requests against `main` with a clear description and tests or reproduction steps when possible.

**License**
See the `LICENSE` file at the repository root.

---

