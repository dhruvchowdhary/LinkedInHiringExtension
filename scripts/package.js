// Builds the Chrome Web Store upload zip from chrome_extension/.
// Run: npm run package   (writes dist/linkedin-hiring-checker.zip)
// Verifies the zip afterwards: manifest.json must be present and parse,
// and no .DS_Store or other junk may be inside.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "chrome_extension");
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "linkedin-hiring-checker.zip");

function sh(cmd, args, opts) {
  return execFileSync(cmd, args, { encoding: "utf8", ...(opts || {}) });
}

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) throw new Error("expected manifest_version 3");

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

// -X strips extended attributes (macOS metadata); -r recurses.
sh("zip", ["-X", "-r", OUT, "."], { cwd: SRC });

const listing = sh("unzip", ["-l", OUT]);
if (!listing.includes("manifest.json")) throw new Error("manifest.json missing from zip");
if (/\.DS_Store/.test(listing)) throw new Error(".DS_Store leaked into zip");
console.log(`wrote ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes)`);
console.log(listing.trim());
