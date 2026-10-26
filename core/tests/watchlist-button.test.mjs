/* Core · Lesezeichen im Aktienkopf (assets/watchlist-button.js) und sein Einbau in assets/stock-navigator.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
globalThis.VUCore = globalThis.VUCore || {};
globalThis.VUCore.Identity = require(join(ROOT, "core", "identity.js"));
const B = require(join(ROOT, "assets", "watchlist-button.js"));

const shard = instruments => async () => ({ ok: true, json: async () => ({ instruments }) });

test("ohne Freigabe: nichts zeichnen, nichts laden", async () => {
  B._reset();
  globalThis.VUAccount = { available: () => false };
  let fetched = false;
  assert.equal(await B.mount({ ownerDocument: {} }, { ticker: "NVDA", fetch: () => { fetched = true; } }), null);
  assert.equal(fetched, false);
  delete globalThis.VUAccount;
  assert.equal(B.enabled(), false);
});

test("Kennung aus dem Company Master: genau ein aktives Listing, sonst keine", async () => {
  B._reset();
  const id = await B.resolveInstrument("NVDA", shard([{ symbol: "NVDA", active: true, instrumentId: "vu_d57074b4128184" }, { symbol: "NVDS", active: true, instrumentId: "vu_aaaaaaaaaaaa" }]));
  assert.equal(id, "vu_d57074b4128184");
  B._reset();
  assert.equal(await B.resolveInstrument("BGC", shard([{ symbol: "BGC", active: true, instrumentId: "vu_111111" }, { symbol: "BGC", active: true, instrumentId: "vu_222222" }])), null, "mehrdeutig");
  B._reset();
  assert.equal(await B.resolveInstrument("OLD", shard([{ symbol: "OLD", active: false, instrumentId: "vu_333333" }])), null, "delistet");
  assert.equal(await B.resolveInstrument("../x", shard([])), null, "ungueltiger Ticker");
});

test("Eigenstaendig: Navigator unberuehrt, Freigabe zuerst, Einbau nur in freien Produktseiten", () => {
  const lock = JSON.parse(readFileSync(join(ROOT, "docs/quant-recovery/v51/ui-protection.json"), "utf8"));
  assert.ok(lock.files["assets/stock-navigator.js"], "Navigator ist byte-gesperrt");
  const button = readFileSync(join(ROOT, "assets", "watchlist-button.js"), "utf8");
  assert.match(button, /if \(!c \|\| !c\.endpoint\) return false;/, "ohne Endpunkt nichts weiter");
  assert.ok(button.indexOf('"/konto/config.js"') < button.indexOf('"/konto/account-api.js"'));
  const code = button.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(code), "keine HTML-Strings");
  assert.match(code, /"\/v1\/watchlist\/items"/);
  assert.match(code, /\/konto\/anmelden\/\?next=/);
  for (const page of ["fundamental/index.html", "hedgefonds/index.html"]) {
    const html = readFileSync(join(ROOT, page), "utf8");
    assert.ok(!lock.files[page], page + " ist nicht gesperrt");
    assert.ok(html.indexOf("/assets/stock-navigator.js") < html.indexOf("/assets/watchlist-button.js"), page);
  }
  /* Eine gesperrte Seite darf das Lesezeichen nur tragen, wenn die Sperrdatei genau diesen Stand freigegeben hat (PR #951). */
  for (const [page, sha] of Object.entries(lock.files)) {
    if (!/\.html$/.test(page)) continue;
    const bytes = readFileSync(join(ROOT, page));
    if (bytes.includes("watchlist-button")) assert.equal(createHash("sha256").update(bytes).digest("hex"), sha, "gesperrte Seite ohne Freigabe geaendert: " + page);
  }
});
