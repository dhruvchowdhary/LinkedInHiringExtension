# LinkedIn Hiring Checker

A Chrome extension that scans your LinkedIn connections for people who are
hiring (or who work at a specific company), page by page through LinkedIn
people search, and lists them in the popup.

Published on the Chrome Web Store as
[LinkedIn Hiring Checker](https://chromewebstore.google.com/detail/linkedin-hiring-checker/ennbhaibhgmihghamihmjhnogjnngijd).

## How it works

1. Click **Search Connections** in the popup. Pick 1st / 2nd / 3rd-degree
   toggles and optionally type a company name (blank = search for "hiring").
2. The extension builds a LinkedIn people-search URL with those filters,
   opens it, and the content script scans each results page for headlines
   containing your search term.
3. While a page contains at least one match, it moves to the next page.
   The first page with no matches ends the run. Results accumulate in
   `chrome.storage.local` and are shown in the popup; **Stop** ends the run
   early.
4. When the run finishes (or any time after), **Copy all** puts the list on
   your clipboard as text, **Download CSV** saves it as
   `linkedin-hiring-results.csv` (name, connection, headline, profile URL),
   and **Clear** removes the saved results. A referral list you cannot
   take with you is not much use, so the results leave the popup with you.

## Install (load unpacked)

1. Open `chrome://extensions`, turn on **Developer mode**.
2. **Load unpacked** → select the `chrome_extension/` folder in this repo.
3. Open LinkedIn, click the extension icon, and search.

## Development

```bash
npm test        # Node test suite, no dependencies
npm run package # builds dist/linkedin-hiring-checker.zip for Web Store upload
```

CI (`.github/workflows/ci.yml`) runs the syntax checks, the tests, and the
package build on every push and PR.

## Files

- `chrome_extension/manifest.json` — Manifest V3, `activeTab` + `scripting`
  + `storage` permissions, LinkedIn host only.
- `chrome_extension/content.js` — runs on LinkedIn people-search pages:
  scans results, pages forward, stores matches.
- `chrome_extension/popup.js` / `popup.html` / `styles.css` — the popup UI.
- `scripts/package.js` — builds the Web Store zip and verifies it (manifest
  present and parsing, no `.DS_Store` inside).
- `tests/run-tests.js` — Node test suite for the content script and popup
  (`node tests/run-tests.js`, no dependencies). It stubs the Chrome APIs
  and a LinkedIn results page, and covers: a fresh run starting on page 1
  after an interrupted run, link-less results not crashing the scan,
  duplicate profiles across pages, headlines rendered as text (not HTML),
  the Stop flow reporting "Stopped", and Copy / Download CSV / Clear
  (including CSV quoting and the clipboard fallback).

## Privacy

Everything runs locally in your browser. Results are kept in
`chrome.storage.local` on your machine; nothing is sent anywhere except the
LinkedIn searches you trigger yourself.

## Limitations

- The scanner reads LinkedIn's results-page markup
  (`.reusable-search__result-container`, `.entity-result__primary-subtitle`,
  …). If LinkedIn renames those classes, scanning silently finds nothing
  until the selectors are updated.
- 3rd-degree searches can take a long time and return many results; the
  popup warns about this when the 3rd toggle is on.
- LinkedIn search itself caps how far back results go, so very large
  networks will not be fully scanned.
