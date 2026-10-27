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
  assert.match(button, /if \(!configured\(\)\) return false;/, "ohne Endpunkt nichts weiter");
  assert.match(button, /if \(!session\(\)\) return true;/, "ohne Anmeldung kein /konto/account-api.js");
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

/* Kopplung lokaler "Beobachten"-Listen (Discover, Quant) an die Konto-Watchlist. */
function localStore(initial) {
  const list = [...initial];
  return { list: () => list.slice(), has: t => list.includes(t), toggle: t => { const i = list.indexOf(t); if (i >= 0) list.splice(i, 1); else list.unshift(t); return i < 0; }, raw: list };
}
const IDS = { NVDA: "vu_d57074b4128184", MSFT: "vu_aaaa1111bbbb", AAPL: "vu_cccc2222dddd" };
function signedInAccount(items, calls, fail) {
  return {
    available: () => true, message: () => "",
    get: async () => { calls.push(["GET"]); return { ok: true, status: 200, data: { items } }; },
    post: async (path, body) => { calls.push([path, body.instrumentId]); return fail ? { ok: false, status: 409, state: fail } : { ok: true, status: 200, data: {} }; }
  };
}
/* Merker "angemeldet" aus konto/account-api.js (localStorage); ohne ihn fragt das Lesezeichen die Konto-API nie an. */
function signIn(on) {
  if (on) globalThis.localStorage = { getItem: k => (k === "vu-account-session-v1" ? "1" : null), setItem() {}, removeItem() {} };
  else delete globalThis.localStorage;
}
function withMaster() {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ instruments: Object.entries(IDS).map(([symbol, instrumentId]) => ({ symbol, instrumentId, active: true })) }) });
}

test("Kopplung ohne Konten oder ohne Anmeldung: rein lokal, keine Anfrage", async () => {
  for (const acc of [{ available: () => false }, { available: () => true, message: () => "", get: async () => ({ ok: false, status: 401 }), post: async () => { throw Error("kein Schreiben"); } }]) {
    B._reset(); globalThis.VUAccount = acc; B._ready(Promise.resolve(acc.available()));
    const s = B.couple(localStore(["NVDA"]));
    assert.equal(s.has("NVDA"), true); assert.equal(s.has("MSFT"), false);
    assert.equal(s.toggle("MSFT"), true); assert.deepEqual(s.raw, ["MSFT", "NVDA"]);
    assert.equal((await s.lastSync).state, "LOCAL_ONLY");
    assert.equal(s.toggle("NVDA"), false); assert.deepEqual(s.raw, ["MSFT"]);
    assert.equal(B.couple(s), s, "idempotent");
  }
  delete globalThis.VUAccount;
});

test("Kopplung angemeldet: Zustand = lokal ODER Konto, ein Klick schreibt beide gleich, nichts wird von selbst uebernommen", async () => {
  B._reset(); withMaster(); signIn(true); const calls = [];
  globalThis.VUAccount = signedInAccount([{ instrumentId: IDS.MSFT, ticker: "MSFT" }], calls); B._ready(Promise.resolve(true));
  const s = B.couple(localStore(["NVDA"]));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls, [["GET"]], "nur gelesen: der lokale Eintrag NVDA wird nicht hochgeladen");
  assert.equal(s.has("MSFT"), true, "im Konto"); assert.equal(s.has("NVDA"), true, "nur lokal bleibt sichtbar");
  assert.equal(s.toggle("AAPL"), true); assert.equal((await s.lastSync).state, "ADDED");
  assert.deepEqual(s.raw, ["AAPL", "NVDA"]); assert.deepEqual(calls.at(-1), ["/v1/watchlist/items", IDS.AAPL]);
  assert.equal(s.toggle("MSFT"), false, "nur im Konto: Klick entfernt dort"); assert.equal((await s.lastSync).state, "REMOVED");
  assert.deepEqual(s.raw, ["AAPL", "NVDA"], "lokal unberuehrt"); assert.deepEqual(calls.at(-1), ["/v1/watchlist/items/remove", IDS.MSFT]);
  assert.equal(s.toggle("NVDA"), false); assert.equal((await s.lastSync).state, "UNCHANGED", "nicht im Konto: nichts zu entfernen");
  assert.deepEqual(s.raw, ["AAPL"]); assert.equal(s.has("MSFT"), false); assert.equal(s.has("AAPL"), true);
  delete globalThis.VUAccount; signIn(false);
});

test("Kopplung: Fehler im Konto (Tarifgrenze) laesst die lokale Liste wie geklickt", async () => {
  B._reset(); withMaster(); signIn(true); const calls = [];
  globalThis.VUAccount = signedInAccount([], calls, "WATCHLIST_ITEMS_LIMIT_REACHED"); B._ready(Promise.resolve(true));
  const s = B.couple(localStore([]));
  assert.equal(s.toggle("AAPL"), true);
  assert.deepEqual(await s.lastSync, { ok: false, state: "WATCHLIST_ITEMS_LIMIT_REACHED" });
  assert.deepEqual(s.raw, ["AAPL"]); assert.equal(s.has("AAPL"), true, "lokal gespeichert");
  delete globalThis.VUAccount; signIn(false);
});

test("Konten an, ohne Merker \"angemeldet\": keine Konto-Anfrage, lokale Liste unveraendert (Ressourcenbudgets)", async () => {
  B._reset(); signIn(false); const calls = [];
  globalThis.VUAccount = signedInAccount([{ instrumentId: IDS.MSFT, ticker: "MSFT" }], calls); B._ready(Promise.resolve(true));
  const s = B.couple(localStore(["NVDA"]));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(s.has("MSFT"), false, "Kontostand wird nicht gelesen");
  assert.equal(s.toggle("AAPL"), true); assert.equal((await s.lastSync).state, "LOCAL_ONLY");
  assert.deepEqual(calls, [], "keine Anfrage an die Konto-API");
  assert.deepEqual(s.raw, ["AAPL", "NVDA"]);
  delete globalThis.VUAccount;
});

test("Quant: QX.watch wird im Browser gekoppelt, ohne gesperrte Quant-Dateien zu aendern", () => {
  const button = readFileSync(join(ROOT, "assets", "watchlist-button.js"), "utf8");
  assert.match(button, /if \(root\.QX && root\.QX\.watch\) couple\(root\.QX\.watch\);/);
  const html = readFileSync(join(ROOT, "quant", "index.html"), "utf8");
  assert.ok(html.indexOf('<script src="/quant/app/ui.js"></script>') < html.indexOf('<script src="/assets/watchlist-button.js"></script>'), "QX steht vorher");
  assert.ok(html.indexOf('<script src="/assets/watchlist-button.js"></script>') < html.indexOf('<script src="/quant/app/page-stock.js"></script>'), "vor dem ersten Zeichnen");
  const lock = JSON.parse(readFileSync(join(ROOT, "docs/quant-recovery/v51/ui-protection.json"), "utf8"));
  for (const f of ["quant/app/ui.js", "quant/app/page-stock.js", "quant/app/pages.js", "quant/index.html"])
    assert.equal(createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex"), lock.files[f], f);
});
