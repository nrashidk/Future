const {join} = require('path');

/**
 * Puppeteer configuration.
 *
 * Pins the browser cache to a PROJECT-RELATIVE directory instead of the default
 * `$HOME/.cache/puppeteer`. Render's build phase and runtime phase do not
 * reliably share a $HOME, so a home-relative cache can put the downloaded
 * browser somewhere `launch()` will not look for it.
 *
 * cosmiconfig (a puppeteer dependency) loads this file for BOTH
 * `npx puppeteer browsers install` and the runtime `puppeteer.launch()`, so
 * install and launch resolve the same path from a single source of truth — no
 * PUPPETEER_CACHE_DIR env var, nothing to drift in a dashboard.
 *
 * Deliberately does NOT set `executablePath`/`chrome.version`. Both the install
 * CLI and the launcher fall back to PUPPETEER_REVISIONS.chrome (the version
 * pinned by the installed puppeteer package), so bumping puppeteer moves the
 * install target and the launch target together. Pinning a version here — or via
 * PUPPETEER_EXECUTABLE_PATH, or `browsers install chrome@stable` — reintroduces
 * the drift that broke PDF generation: the pin goes stale the next time Chrome
 * stable rolls forward, and setting executablePath also silently suppresses
 * puppeteer's managed download (skipDownload).
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
