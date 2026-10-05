/* assets/scroll-memory.js: Zurueck landet dort, wo man war; ein neuer Klick
   beginnt oben. Nachgebauter Browser (history mit Eintraegen, hashchange,
   requestAnimationFrame), dieselbe Datei wie im Release. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../../assets/scroll-memory.js", import.meta.url), "utf8");

function browser() {
  const listeners = {}, store = {};
  const eintraege = [{ url: "https://x/discover/#/", state: null }];
  let pos = 0, frames = [];
  const w = {
    scrollY: 0, innerHeight: 800,
    document: { documentElement: { scrollHeight: 20000 } },
    sessionStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((g) => g !== f); },
    requestAnimationFrame: (f) => frames.push(f),
    scrollTo: (x, y) => { w.scrollY = y; },
    history: {
      get state() { return eintraege[pos].state; },
      replaceState: (s) => { eintraege[pos].state = s; }
    },
    location: { get href() { return eintraege[pos].url; } }
  };
  const feuer = (t) => (listeners[t] || []).forEach((f) => f({}));
  const app = () => { w.scrollY = 0; };             /* die Seite: scrollTo(0,0) nach jedem Routenwechsel */
  return {
    w,
    klick(url) { eintraege.splice(pos + 1); eintraege.push({ url, state: null }); pos++; feuer("hashchange"); app(); },
    zurueck() { pos--; feuer("hashchange"); app(); },
    frames(n) { for (let i = 0; i < n && frames.length; i++) { const f = frames.shift(); f(); } }
  };
}

test("Zurueck stellt die Position wieder her, ein neuer Klick beginnt oben", () => {
  const b = browser();
  vm.runInNewContext(SRC, { window: b.w });
  b.w.scrollY = 2500;
  b.klick("https://x/discover/#/s/US_REAL/ECO");
  b.frames(50);
  assert.equal(b.w.scrollY, 0, "Detailseite beginnt oben");
  b.w.scrollY = 300;
  b.zurueck();
  assert.equal(b.w.scrollY, 0, "die Seite setzt erst auf 0 ...");
  b.frames(50);
  assert.equal(b.w.scrollY, 2500, "... das Modul stellt die Position wieder her");
});

test("Wartet, bis die Seite hoch genug ist; eine Eingabe bricht ab", () => {
  const b = browser();
  vm.runInNewContext(SRC, { window: b.w });
  b.w.scrollY = 5000;
  b.klick("https://x/discover/#/s/US_REAL/A");
  b.w.document.documentElement.scrollHeight = 1000;   /* noch nicht gerendert */
  b.zurueck();
  b.frames(5);
  assert.equal(b.w.scrollY, 0, "nicht ueber das Seitenende hinaus springen");
  b.w.document.documentElement.scrollHeight = 20000;
  b.frames(3);
  assert.equal(b.w.scrollY, 5000);
});

test("Ohne sessionStorage: kein Fehler, kein Sprung", () => {
  const b = browser();
  b.w.sessionStorage = { getItem() { throw new Error("blockiert"); }, setItem() { throw new Error("blockiert"); } };
  vm.runInNewContext(SRC, { window: b.w });
  b.w.scrollY = 1200;
  b.klick("https://x/discover/#/s/US_REAL/B");
  b.zurueck();
  b.frames(50);
  assert.equal(b.w.scrollY, 1200, "Position im Speicher des Tabs bleibt trotzdem erhalten");
});
