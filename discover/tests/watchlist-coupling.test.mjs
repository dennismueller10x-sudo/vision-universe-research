/* Discover · lokaler Watchlist-Knopf, angemeldet an die Konto-Watchlist gekoppelt (docs/accounts/WATCHLIST.md §5, §11). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const app = readFileSync(join(ROOT, "discover", "app.js"), "utf8");

test("Knopf liest und schreibt nur ueber die gekoppelte Liste; ohne Komponente rein lokal", () => {
  const button = app.slice(app.indexOf("function watchButton(root,symbol)"), app.indexOf("D.EuropeView.attachApp"));
  assert.match(app, /const localWatch=\{has:s=>watchlist\(\)\.includes\(s\),toggle:saveWatchlist\};/);
  assert.match(app, /function watchStore\(\)\{const W=window\.VUWatchButton;return W&&W\.couple\?W\.couple\(localWatch\):localWatch;\}/);
  assert.match(button, /watchStore\(\)\.has\(symbol\)/);
  assert.match(button, /watchStore\(\)\.toggle\(symbol\)/);
  assert.ok(!/saveWatchlist|localStorage/.test(button), "kein Schreiben am Kopplungsweg vorbei");
  assert.match(button, /vu-watchlist-ready/, "neu zeichnen, sobald der Kontostand geladen ist");
  const html = readFileSync(join(ROOT, "discover", "index.html"), "utf8");
  assert.ok(html.includes('<script src="/assets/watchlist-button.js" defer></script>'));
});

test("Ohne Anmeldung bleiben bestehende lokale Eintraege unveraendert erhalten", async () => {
  const require = createRequire(import.meta.url);
  globalThis.VUCore = globalThis.VUCore || {};
  globalThis.VUCore.Identity = require(join(ROOT, "core", "identity.js"));
  const B = require(join(ROOT, "assets", "watchlist-button.js"));
  B._reset(); B._ready(Promise.resolve(false));
  const stored = ["NVDA", "AAPL"], local = { has: s => stored.includes(s), toggle: s => { const i = stored.indexOf(s); if (i < 0) stored.unshift(s); else stored.splice(i, 1); return i < 0; } };
  const s = B.couple(local);
  assert.equal(s.has("NVDA"), true);
  assert.equal(s.toggle("MSFT"), true);
  assert.equal((await s.lastSync).state, "LOCAL_ONLY");
  assert.deepEqual(stored, ["MSFT", "NVDA", "AAPL"]);
});
