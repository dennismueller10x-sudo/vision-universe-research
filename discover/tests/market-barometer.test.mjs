/* Discover — Marktbarometer in zwei Minuten (ui/market-barometer.js):
   jede Zahl aus Artefakt und Pruefungs-Auszug, keine Handlungsaufforderung. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const MP = require("../../quant/engines/multi-asset/market-pulse.js");
const PULSE = JSON.parse(readFileSync(new URL("../../quant/data/market/intelligence/market-pulse.json", import.meta.url), "utf8"));
const EV = JSON.parse(readFileSync(new URL("../../quant/data/market/validation/market-pulse-evidence.json", import.meta.url), "utf8"));

function load() {
  const el = (tag, attrs, kids) => {
    const n = { tag, attrs: attrs || {}, children: (kids || []).filter(Boolean) };
    n.appendChild = (c) => { n.children.push(c); return c; };
    n.querySelectorAll = () => [];
    return n;
  };
  const ctx = { QuantShell: { el, clear: (n) => { n.children = []; } }, VUMarketPulse: MP, Intl, Date, Math, String, Object, Array, JSON, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../ui/market-intelligence.js", import.meta.url), "utf8"), ctx);
  vm.runInContext(readFileSync(new URL("../ui/market-barometer.js", import.meta.url), "utf8"), ctx);
  return ctx.VUDiscover.MarketBarometer;
}
const MB = load();
const J = (x) => JSON.parse(JSON.stringify(x));
function text(n) { if (!n) return ""; if (typeof n === "string") return n; return [n.attrs && n.attrs.text, n.text, ...(n.children || []).map(text)].filter(Boolean).join(" "); }
function find(n, pred, out = []) { if (!n || typeof n !== "object") return out; if (pred(n)) out.push(n); (n.children || []).forEach((c) => find(c, pred, out)); return out; }
const byId = (teile, id) => teile.find((t) => t.attrs && t.attrs.id === id);

const JETZT = new Date("2026-09-29T10:00:00Z");
const HIST = JSON.parse(readFileSync(new URL("../../quant/data/market/intelligence/market-pulse-history.json", import.meta.url), "utf8"));
test("Marktbarometer: Teile in fester Reihenfolge, Details als eigene Unterseite", () => {
  const teile = MB.render(J(PULSE), J(EV), JETZT);
  const ids = teile.map((t) => t.attrs.id || t.attrs.class);
  assert.deepEqual(J(ids.slice(0, 9)), ["bm-heute", "bm-krisen", "bm-erholung", "bm-chance", "bm-vergleich", "bm-warum", "bm-wende", "bm-stufen", "bm-kalender"]);
  assert.equal(teile[9].attrs.href, "#/maerkte/einordnung/details");
});

test("Stresstest: direkt nach Heute, jede Krise als Tabellenzeile, Median-Kennzahlen, Grenze bei Boeden", () => {
  const k = byId(MB.render(J(PULSE), J(EV), JETZT), "bm-krisen");
  const t = text(k);
  assert.equal(find(k, (n) => n.tag === "tr").length, EV.crises.length + 1, "Kopfzeile + eine Zeile je Krise");
  const corona = EV.crises.find((x) => x.id === "2020");
  assert.match(t, /Corona-Crash/);
  assert.match(t, new RegExp("−" + Math.round(Math.abs(corona.fall)) + "\\u00a0%"));
  assert.match(t, new RegExp(EV.crises.filter((x) => x.firstWarning).length + " von " + EV.crises.length));
  const st = MB.stresstest(J(EV));
  const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  assert.equal(st.danach, med(EV.crises.filter((x) => x.firstWarning).map((x) => x.firstWarning.restAfter)));
  assert.match(t, /Böden erkennt es nicht/);
  assert.match(t, /sagt weder den ersten Tag eines Absturzes noch den Boden voraus/);
  assert.match(t, /das Barometer gab es damals noch nicht/);
  assert.match(t, /hätte das Barometer früh erkannt/);
});

test("Kalender-Kontext: getrennt vom Barometer, aktueller Monat und Zyklusjahr markiert, Fallzahlen", () => {
  const c = byId(MB.render(J(PULSE), J(EV), JETZT), "bm-kalender");
  const t = text(c);
  assert.match(t, /kein Teil des Barometers/);
  assert.equal(MB.zyklusJahr(2026), 2);
  assert.equal(MB.zyklusJahr(2028), 4);
  assert.match(t, /Jetzt: September 2026 · Midterm-Jahr/);
  const vor = EV.calendar.forward12.byCycleMonth.find((x) => x.cycleYear === 2 && x.month === 9);
  assert.match(t, new RegExp(vor.n + " Fälle"));
  assert.equal(find(c, (n) => n.attrs && /\bis-jetzt\b/.test(n.attrs.class || "") && /bm-monat\b/.test(n.attrs.class || "")).length, 1);
  assert.equal(find(c, (n) => n.attrs && /\bis-jetzt\b/.test(n.attrs.class || "") && /bm-zjahr\b/.test(n.attrs.class || "")).length, 1);
});

test("Heute: Stufe als Wetter, fuenf Stufen in der Leiste", () => {
  const h = byId(MB.render(J(PULSE), J(EV)), "bm-heute");
  const env = PULSE.environment;
  assert.match(text(h), new RegExp(env.label));
  assert.match(text(h), new RegExp(MB.WETTER[env.level].wort));
  assert.equal(find(h, (n) => n.tag === "li").length, env.scale.length);
});

test("Was hiess das frueher: vier grosse Zahlen genau aus dem Auszug", () => {
  const c = byId(MB.render(J(PULSE), J(EV)), "bm-chance");
  const lvl = Math.min(PULSE.environment.level, EV.levels[EV.levels.length - 1].level);
  const j1 = EV.longTerm.find((t) => t.days === 252).levels.find((x) => x.level === lvl);
  const j5 = EV.longTerm.find((t) => t.days === 1260).levels.find((x) => x.level === lvl);
  const zahlen = find(c, (n) => n.attrs && typeof n.attrs.class === "string" && n.attrs.class.split(" ").includes("bm-zahl"));
  assert.equal(zahlen.length, 4);
  const t = text(c);
  assert.match(t, new RegExp(j1.positiveShare + "\\u00a0% lagen nach 1 Jahr im Plus"));
  assert.match(t, new RegExp("\\+" + String(Math.round(j5.medianReturn)) + "\\u00a0% typisch nach 5 Jahren"));
  assert.match(t, /Kurz gesagt:/);
});

test("Vergleich: vier Ansichten, Werte je Stufe aus dem Auszug, ehrlicher Hinweis bei 5 Jahren", () => {
  const plus = MB.reihe(J(EV), "plus"), schlecht = MB.reihe(J(EV), "schlecht"), risiko = MB.reihe(J(EV), "risiko"), fuenf = MB.reihe(J(EV), "fuenf");
  const j1 = EV.longTerm.find((t) => t.days === 252);
  assert.deepEqual(J(plus.map((x) => x.wert)), j1.levels.map((x) => x.positiveShare));
  assert.ok(schlecht.every((x) => x.wert >= 0 && /^−|^0/.test(x.text)));
  assert.deepEqual(J(risiko.map((x) => x.wert)), EV.levels.map((x) => x.drawdownShare));
  assert.match(MB.fazitAnsicht("fuenf", fuenf), /nicht belastbar/);
  const v = byId(MB.render(J(PULSE), J(EV)), "bm-vergleich");
  assert.equal(find(v, (n) => n.tag === "button").length, 4);
});

test("Ohne Auszug: keine historischen Zahlen, nur Stand, Gruende, Wende, Stufen", () => {
  const teile = MB.render(J(PULSE), null, JETZT);
  const ids = teile.map((t) => t.attrs.id).filter(Boolean);
  assert.ok(!ids.includes("bm-chance") && !ids.includes("bm-vergleich") && !ids.includes("bm-krisen") && !ids.includes("bm-kalender"));
  assert.ok(ids.includes("bm-heute"));
  assert.doesNotMatch(teile.map(text).join(" "), /im Plus/);
  assert.equal(MB.render({ environment: { level: null } }, J(EV)), null);
});

test("Keine Handlungsaufforderung, Quelle und Hinweis sichtbar", () => {
  const t = MB.render(J(PULSE), J(EV)).map(text).join(" ");
  assert.doesNotMatch(t, /\b(jetzt )?(kaufen|verkaufen)\b|Kaufsignal|sollten Sie|\d+\s*\/\s*100/i);
  assert.match(t, /Kenneth R\. French Data Library/);
  assert.match(t, /kein verlässlicher Hinweis auf künftige/);
  assert.match(t, /Keine Anlageberatung/);
});

test("Fruehe Erholungszeichen: eigenes Zeichen, Bilanz aus dem Auszug, Live-Zustand aus Risiko und Breitenhistorie", () => {
  const e = byId(MB.render(J(PULSE), J(EV), JETZT, J(HIST)), "bm-erholung");
  const t = text(e);
  assert.match(t, /kein Teil des Barometers/);
  assert.match(t, new RegExp(EV.recovery.firstFalse + " von " + EV.recovery.withSignal));
  assert.match(t, /kein Signal zum Handeln/);
  assert.doesNotMatch(t, /Kaufsignal|\bkaufen\b/i);
  const rule = EV.recovery.rule;
  const pulse = (dd) => ({ dimensions: { RISK: { evidence: [{ key: "drawdown52w", value: dd }] } } });
  assert.equal(MB.erholungLive(pulse(-5), null, rule).zustand, "inaktiv");
  const tage = (xs) => ({ days: xs.map((v, i) => ({ date: "2026-01-" + String(i + 1).padStart(2, "0"), metrics: { above50Pct: v } })) });
  assert.equal(MB.erholungLive(pulse(-25), tage([10, 12]), rule).zustand, "zu-wenig");
  assert.equal(MB.erholungLive(pulse(-25), tage(Array(25).fill(15)), rule).zustand, "baer");
  const schub = MB.erholungLive(pulse(-25), tage(Array(24).fill(15).concat([70])), rule);
  assert.equal(schub.zustand, "zeichen");
  assert.equal(schub.seit, "2026-01-25");
});

test("Im Klartext (Uebersicht): Bedeutung der Stufe, Zahlen aus dem Auszug neben dem Schnitt aller Tage", () => {
  const p = J(PULSE), lv = p.environment.level;
  const k = MB.klartext(p, J(EV));
  assert.equal(k.attrs.id, "maerkte-klartext");
  const t = text(k);
  const j1 = EV.longTerm.find((x) => x.days === 252);
  const a = j1.levels.find((x) => x.level === lv) || j1.levels.at(-1);
  assert.ok(t.includes(MB.KLARTEXT[lv]));
  assert.match(t, new RegExp(Math.round(a.positiveShare) + "\\u00a0% lagen nach 1 Jahr im Plus"));
  assert.match(t, new RegExp("Schnitt aller Tage: " + Math.round(j1.all.positiveShare) + "\\u00a0%"));
  assert.match(t, /in einem schlechten Jahr \(1 von 10\)/);
  assert.match(t, /Vergangene Ergebnisse sind kein verlässlicher Hinweis/);
  assert.doesNotMatch(t, /Kaufsignal|kaufen|verkaufen|sollten Sie/i);
  assert.equal(MB.klartext(p, null), null, "ohne Auszug keine Zahlen");
});
