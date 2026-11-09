// Reproduction harness for LinkedInHiringExtension bugs.
// Verification suite for the LinkedInHiringExtension fixes.
// Loads the REAL chrome_extension/content.js and popup.js from disk into a
// stubbed Chrome-extension environment (no Chrome, no LinkedIn needed) and
// exercises the exact flows a user hits. Each test first failed against the
// original code (see git history) and passes against the fixed code.
//
// Run: node tests/run-tests.js   (exit code 0 = all pass)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const EXT = path.join(__dirname, "..", "chrome_extension");
const contentSrc = fs.readFileSync(path.join(EXT, "content.js"), "utf8");
const popupSrc = fs.readFileSync(path.join(EXT, "popup.js"), "utf8");

// ---------- stubs ----------
function makeStorage(initial) {
  const store = { ...(initial || {}) };
  return {
    _store: store,
    get(keys, cb) {
      const out = {};
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) if (k in store) out[k] = store[k];
      cb(out);
    },
    set(obj, cb) {
      Object.assign(store, obj);
      if (cb) cb();
    },
    remove(keys, cb) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete store[k];
      if (cb) cb();
    },
  };
}

function makeEl(id) {
  const el = {
    id: id || "",
    children: [],
    style: {},
    dataset: {},
    _text: "",
    _html: "",
    _classes: new Set(),
    _listeners: {},
    value: "",
    classList: {
      add: (c) => el._classes.add(c),
      remove: (c) => el._classes.delete(c),
      toggle: (c) => (el._classes.has(c) ? el._classes.delete(c) : el._classes.add(c)),
      contains: (c) => el._classes.has(c),
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    removeChild(child) {
      const i = el.children.indexOf(child);
      if (i !== -1) el.children.splice(i, 1);
      return child;
    },
    select() {},
    addEventListener(evt, fn) {
      (el._listeners[evt] = el._listeners[evt] || []).push(fn);
    },
    click() {
      (el._listeners.click || []).forEach((fn) => fn({ currentTarget: el }));
    },
  };
  Object.defineProperty(el, "textContent", {
    get() {
      if (el.children.length) return el.children.map((c) => c.textContent).join("");
      return el._text;
    },
    set(v) {
      el._text = String(v);
      el.children = [];
    },
  });
  Object.defineProperty(el, "innerHTML", {
    get() {
      return el._html;
    },
    set(v) {
      el._html = String(v);
      el.children = [];
    },
  });
  return el;
}

// Fake LinkedIn search-result item.
function makeItem({ name, headline, link, connection }) {
  return {
    querySelector(sel) {
      if (sel.includes("primary-subtitle")) return { textContent: headline };
      if (sel.includes("title-text > a span")) return { textContent: name };
      if (sel.includes("badge-text")) return { textContent: connection || "• 1st" };
      if (sel.includes("title-text > a")) return link === null ? null : { href: link };
      return null;
    },
  };
}

let failures = 0;
function check(label, cond, detail) {
  console.log(`${cond ? "PASS  " : "FAIL  "} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

// ---------- BUG 1: stale page counter across runs ----------
// Scenario: run 1 is interrupted mid-scan (tab closed) at page 3.
// Run 2 starts: popup.js startHiringCheck() clears chrome.storage.local
// (including "currentPage"), then content.js loads on the search page.
function runContentScript({ storageInit, localStorageInit, items, url }) {
  const storage = makeStorage(storageInit);
  const ls = { ...(localStorageInit || {}) };
  const sentMessages = [];
  const navigations = [];
  const timers = [];
  const location = {};
  let currentHref = url || "https://www.linkedin.com/search/results/people/?keywords=hiring";
  Object.defineProperty(location, "href", {
    get: () => currentHref,
    set: (v) => {
      navTarget = v;
      currentHref = v;
    },
  });
  let navTarget = null;
  const sandbox = {
    console,
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    localStorage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => {
        ls[k] = String(v);
      },
      removeItem: (k) => {
        delete ls[k];
      },
    },
    document: { querySelectorAll: () => items },
    chrome: {
      storage: { local: storage },
      runtime: { sendMessage: (m) => sentMessages.push(m) },
    },
    window: {},
  };
  sandbox.window.location = location;
  vm.createContext(sandbox);
  let threw = null;
  try {
    vm.runInContext(contentSrc, sandbox, { filename: "content.js" });
  } catch (e) {
    threw = e;
  }
  // Drain timers (the 2s "wait before next page" hop).
  while (timers.length) timers.shift()();
  return { storage, ls, sentMessages, navTarget, location, threw };
}

console.log("--- Bug 1: stale page counter (interrupted run, then fresh run) ---");
{
  // Run 1 interrupted at page 3: localStorage still holds currentPage=3.
  // Popup's startHiringCheck clears chrome.storage.local first (as it does).
  const r = runContentScript({
    storageInit: { searchUrl: "https://www.linkedin.com/search/results/people/?keywords=hiring", searchTerm: "hiring" },
    localStorageInit: { currentPage: "3" },
    items: [makeItem({ name: "Alice", headline: "hiring engineers", link: "https://www.linkedin.com/in/alice", connection: "• 1st" })],
  });
  // After finding a match on "page 3", the script hops to the next page.
  // The bug: it started at page 3 at all (pages 1-2 never scanned this run).
  // A stale localStorage.currentPage=3 must be ignored entirely: the fixed
  // code keeps the counter in chrome.storage.local, which the popup clears
  // at the start of a run, so this run starts on page 1 and hops to page 2.
  const usesLocalStorage = /localStorage\.(getItem|setItem|removeItem)/.test(contentSrc);
  const wentToPage2 = r.navTarget && r.navTarget.includes("page=2");
  console.log(`  content.js still reads localStorage: ${usesLocalStorage}`);
  console.log(`  after a match on page 1, it navigated to: ${r.navTarget}`);
  check("FIX 1: fresh run starts on page 1 despite stale localStorage=3", !usesLocalStorage && wentToPage2 && !r.threw, `navigated to ${r.navTarget}`);
}

console.log("--- Bug 2: crash when a matching result has no profile link ---");
{
  const r = runContentScript({
    storageInit: { searchUrl: "https://www.linkedin.com/search/results/people/?keywords=hiring", searchTerm: "hiring" },
    localStorageInit: {},
    items: [
      makeItem({ name: "LinkedIn Member", headline: "hiring now", link: null, connection: "• 2nd" }),
      makeItem({ name: "Bob", headline: "hiring engineers", link: "https://www.linkedin.com/in/bob", connection: "• 1st" }),
    ],
  });
  const saved = r.storage._store.hiringResults || [];
  console.log(`  content.js threw: ${r.threw ? r.threw.message : "nothing"}`);
  console.log(`  saved results: ${JSON.stringify(saved.map((s) => s.name))}`);
  check("FIX 2: link-less result skipped, rest of page still scanned (Bob saved)", !r.threw && saved.length === 1 && saved[0].name === "Bob", `saved=${JSON.stringify(saved.map((s) => s.name))}`);
}

console.log("--- Bug 3: duplicate results across pages ---");
{
  // Page 1 saves Alice; page 2 shows Alice again (LinkedIn overlap) + Carol.
  const storage = makeStorage({
    searchUrl: "https://www.linkedin.com/search/results/people/?keywords=hiring",
    searchTerm: "hiring",
    hiringResults: [{ name: "Alice", headline: "hiring engineers", profileLink: "https://www.linkedin.com/in/alice", connectionLevel: "1st" }],
  });
  const alice = makeItem({ name: "Alice", headline: "hiring engineers", link: "https://www.linkedin.com/in/alice", connection: "• 1st" });
  const carol = makeItem({ name: "Carol", headline: "hiring designers", link: "https://www.linkedin.com/in/carol", connection: "• 2nd" });
  const sandbox = {
    console,
    setTimeout: () => 0,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: { querySelectorAll: () => [alice, carol] },
    chrome: { storage: { local: storage }, runtime: { sendMessage: () => {} } },
    window: { location: { href: "https://www.linkedin.com/search/results/people/?keywords=hiring" } },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(contentSrc, sandbox, { filename: "content.js" });
  } catch (e) {
    console.log(`  content.js threw: ${e.message}`);
  }
  const saved = storage._store.hiringResults || [];
  const aliceCount = saved.filter((s) => s.profileLink === "https://www.linkedin.com/in/alice").length;
  console.log(`  saved: ${saved.length} entries, Alice appears ${aliceCount}x`);
  check("FIX 3: same profile listed once across pages", aliceCount === 1 && saved.length === 2);
}

// ---------- popup runner (shared by the popup tests) ----------
function loadPopup({ withClipboard = true } = {}) {
  const els = {};
  const created = [];
  const clipboard = { text: null };
  const blobs = [];
  const execCommands = [];
  const docStub = {
    _listeners: {},
    body: makeEl("body"),
    addEventListener: (evt, fn) => {
      docStub._listeners[evt] = fn;
    },
    createElement: (tag) => {
      const el = makeEl(tag);
      created.push(el);
      return el;
    },
    createTextNode: (text) => ({ textContent: String(text), nodeType: 3 }),
    execCommand: (cmd) => {
      execCommands.push(cmd);
      return true;
    },
    getElementById: (id) => (els[id] = els[id] || makeEl(id)),
  };
  const storage = makeStorage({});
  let onMessage = null;
  const sandbox = {
    console,
    document: docStub,
    navigator: withClipboard
      ? { clipboard: { writeText: (t) => { clipboard.text = t; return { then: (ok) => { ok(); } }; } } }
      : {},
    Blob: class {
      constructor(parts) {
        blobs.push(parts.join(""));
      }
    },
    URL: {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
    },
    chrome: {
      storage: { local: storage },
      tabs: { query: () => {}, update: () => {} },
      runtime: { onMessage: { addListener: (fn) => { onMessage = fn; } } },
      scripting: {},
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(popupSrc, sandbox, { filename: "popup.js" });
  docStub._listeners.DOMContentLoaded();
  return { els, created, clipboard, blobs, execCommands, storage, onMessage, docStub };
}

console.log("--- Bug 4: popup renders names/headlines as raw HTML ---");
{
  const { els, onMessage } = loadPopup();
  const payload = '<img src=x onerror=alert(1)>';
  onMessage({ action: "updateResults", results: [{ name: "Eve", headline: payload, profileLink: "https://www.linkedin.com/in/eve", connectionLevel: "1st" }] }, {}, () => {});
  const resultsDiv = els.results;
  const childHtml = (resultsDiv.children[0] && resultsDiv.children[0]._html) || "";
  const leaked = childHtml.includes("<img src=x");
  const renderedText = (resultsDiv.children[0] && resultsDiv.children[0].textContent) || "";
  console.log(`  rendered child HTML: ${childHtml}`);
  console.log(`  rendered text: ${renderedText}`);
  check("FIX 4: headline rendered as text, not HTML (no innerHTML injection)", !leaked && renderedText.includes("<img src=x onerror=alert(1)>"));
}

console.log("--- Export: Copy all / Download CSV / Clear ---");
{
  const sample = [
    { name: "Alice", headline: 'Hiring "rockstars", apply now', profileLink: "https://www.linkedin.com/in/alice", connectionLevel: "1st" },
    { name: "Bob", headline: "hiring engineers", profileLink: "https://www.linkedin.com/in/bob", connectionLevel: "2nd" },
  ];
  const { els, created, clipboard, blobs, storage, onMessage } = loadPopup();
  onMessage({ action: "updateResults", results: sample }, {}, () => {});
  check("footer shows with a count", els["results-footer"].style.display === "block" && els["results-count"].textContent === "2 connections", els["results-count"].textContent);

  els["copy-results"].click();
  const expectedText = [
    'Alice (1st) — Hiring "rockstars", apply now — https://www.linkedin.com/in/alice',
    "Bob (2nd) — hiring engineers — https://www.linkedin.com/in/bob",
  ].join("\n");
  check("Copy all writes the results as text", clipboard.text === expectedText, JSON.stringify(clipboard.text));

  els["download-results"].click();
  const expectedCsv =
    "Name,Connection,Headline,Profile\n" +
    'Alice,1st,"Hiring ""rockstars"", apply now",https://www.linkedin.com/in/alice\n' +
    "Bob,2nd,hiring engineers,https://www.linkedin.com/in/bob\n";
  const anchor = created.find((el) => el.download === "linkedin-hiring-results.csv");
  check("Download CSV writes quoted CSV", blobs[0] === expectedCsv, JSON.stringify(blobs[0]));
  check("Download CSV names the file", !!anchor && anchor.download === "linkedin-hiring-results.csv" && anchor.href === "blob:test", anchor ? `${anchor.download} ${anchor.href}` : "no anchor");

  storage._store.hiringResults = sample;
  els["clear-results"].click();
  check("Clear removes stored results and empties the list", !("hiringResults" in storage._store) && els.results.children.length === 0 && els.results._html === "No results found." && els["results-footer"].style.display === "none");
}

console.log("--- Export fallback: copy without navigator.clipboard ---");
{
  const sample = [
    { name: "Alice", headline: "hiring engineers", profileLink: "https://www.linkedin.com/in/alice", connectionLevel: "1st" },
  ];
  const { els, execCommands, docStub, onMessage } = loadPopup({ withClipboard: false });
  onMessage({ action: "updateResults", results: sample }, {}, () => {});
  els["copy-results"].click();
  const textarea = docStub.body.children.find((c) => c.id === "textarea");
  check("fallback copies via a temporary textarea + execCommand", execCommands.includes("copy") && !textarea, `execCommand=${JSON.stringify(execCommands)}`);
}

console.log("--- Extra: stop flow reports 'Stopped' ---");
{
  const r = runContentScript({
    storageInit: { stopScript: true, searchTerm: "hiring", hiringResults: [{ name: "Alice", headline: "hiring", profileLink: "https://www.linkedin.com/in/alice", connectionLevel: "1st" }] },
    localStorageInit: {},
    items: [],
  });
  const status = (r.sentMessages.find((m) => m.action === "updateStatus") || {}).status || "";
  console.log(`  status sent: ${status}`);
  check("FIX 5: stopping reports 'Stopped', not 'Complete'", status.startsWith("Stopped"), status);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
