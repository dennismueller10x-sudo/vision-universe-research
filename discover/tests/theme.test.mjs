import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const T = require("../engines/theme.js");

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)),
           removeItem: (k) => map.delete(k), map };
}
function fakeMedia(light) {
  const q = { matches: light, listeners: [], addEventListener(_, fn) { this.listeners.push(fn); } };
  return { mm: () => q, q };
}
function fakeDocument() {
  const attrs = {};
  const meta = { content: "#08080a", setAttribute(_, v) { this.content = v; } };
  const nav = { theme: null, setAttribute(_, v) { this.theme = v; } };
  return {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
    querySelector: (sel) => (sel.indexOf("meta") === 0 ? meta : sel === "vu-navigation" ? nav : null),
    attrs, meta, nav
  };
}

/* Owner 15.11.2026 (App-Konzept 2): Dunkel ist der Standard, Hell bleibt waehlbar. */
test("TH-1 Standard ist Dunkel auch auf einem hellen Geraet", () => {
  const doc = fakeDocument();
  const t = T.create({ storage: fakeStorage(), matchMedia: fakeMedia(true).mm, document: doc });
  assert.equal(t.mode(), "dark");
  assert.equal(t.resolved(), "dark");
  assert.equal(doc.attrs["data-theme"], "dark");
  assert.equal(doc.attrs["data-theme-mode"], "dark");
  assert.equal(doc.nav.theme, "dark");
});

test("TH-2 ein Wechsel des Geraetes schaltet Discover nicht um", () => {
  const doc = fakeDocument();
  const m = fakeMedia(false);
  const t = T.create({ storage: fakeStorage(), matchMedia: m.mm, document: doc });
  assert.equal(t.resolved(), "dark");
  assert.equal(t.mode(), "dark");
  assert.equal(doc.attrs["data-theme"], "dark");
  assert.equal(doc.meta.content, T.BAR.dark);
  m.q.matches = true;
  m.q.listeners.forEach((fn) => fn());
  assert.equal(doc.attrs["data-theme"], "dark");
  assert.equal(doc.meta.content, T.BAR.dark);
});

test("TH-2b eine gespeicherte helle Wahl bleibt hell", () => {
  const store = fakeStorage(); store.setItem(T.KEY, "light");
  const doc = fakeDocument();
  const t = T.create({ storage: store, matchMedia: fakeMedia(false).mm, document: doc });
  assert.equal(t.mode(), "light");
  assert.equal(doc.attrs["data-theme"], "light");
});

test("TH-3 eine Wahl bleibt gespeichert und ueberlebt den Neustart", () => {
  const store = fakeStorage();
  const doc = fakeDocument();
  const t = T.create({ storage: store, matchMedia: fakeMedia(true).mm, document: doc });
  assert.equal(t.set("dark"), true);
  assert.equal(store.getItem(T.KEY), "dark");
  assert.equal(doc.attrs["data-theme"], "dark");
  assert.equal(doc.attrs["data-theme-mode"], "dark");
  const t2 = T.create({ storage: store, matchMedia: fakeMedia(true).mm, document: fakeDocument() });
  assert.equal(t2.mode(), "dark");
  assert.equal(t2.resolved(), "dark");
});

test("TH-4 eine ausdrueckliche dunkle Wahl bleibt bei Geraetewechsel dunkel", () => {
  const doc = fakeDocument();
  const m = fakeMedia(false);
  const t = T.create({ storage: fakeStorage(), matchMedia: m.mm, document: doc });
  t.set("dark");
  m.q.matches = true;
  m.q.listeners.forEach((fn) => fn());
  assert.equal(doc.attrs["data-theme"], "dark");
});

test("TH-5 zurueck zu Hell speichert die ausdrueckliche Wahl", () => {
  const store = fakeStorage();
  const t = T.create({ storage: store, matchMedia: fakeMedia(false).mm, document: fakeDocument() });
  t.set("dark");
  t.set("light");
  assert.equal(store.getItem(T.KEY), "light");
  assert.equal(t.resolved(), "light");
});

test("TH-6 cycle wechselt Hell und Dunkel; System und Unbekanntes werden abgelehnt", () => {
  const t = T.create({ storage: fakeStorage(), matchMedia: fakeMedia(false).mm, document: fakeDocument() });
  assert.equal(t.cycle(), "light");
  assert.equal(t.cycle(), "dark");
  assert.equal(t.set("system"), false);
  assert.equal(t.set("sepia"), false);
  assert.equal(t.mode(), "dark");
});

test("TH-7 ohne Speicher und ohne Medienabfrage: dunkel, ohne Fehler", () => {
  const t = T.create({});
  assert.equal(t.mode(), "dark");
  assert.equal(t.resolved(), "dark");
  assert.equal(t.set("light"), true);
  assert.equal(t.resolved(), "light");
});

test("TH-8 ein kaputter Speicher kippt nichts", () => {
  const store = { getItem() { throw new Error("gesperrt"); }, setItem() { throw new Error("gesperrt"); }, removeItem() { throw new Error("gesperrt"); } };
  const t = T.create({ storage: store, matchMedia: fakeMedia(true).mm, document: fakeDocument() });
  assert.equal(t.mode(), "dark");
  assert.equal(t.set("light"), true);
  assert.equal(t.resolved(), "light");
});

test("TH-9 Zuhoerer bekommen Modus und Ergebnis", () => {
  const t = T.create({ storage: fakeStorage(), matchMedia: fakeMedia(false).mm, document: fakeDocument() });
  const seen = [];
  t.onChange((e) => seen.push(e));
  t.set("light");
  assert.deepEqual(seen, [{ mode: "light", resolved: "light" }]);
  assert.deepEqual(T.MODES, ["light", "dark"]);
  assert.equal(T.label("light"), "Hell");
  assert.equal(T.label("dark"), "Dunkel");
});
