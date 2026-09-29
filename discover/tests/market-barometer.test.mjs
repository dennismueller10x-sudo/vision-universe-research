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

test("Marktbarometer: sieben Teile in fester Reihenfolge, Details als eigene Unterseite", () => {
  const teile = MB.render(J(PULSE), J(EV));
  const ids = teile.map((t) => t.attrs.id || t.attrs.class);
  assert.deepEqual(J(ids.slice(0, 6)), ["bm-heute", "bm-chance", "bm-vergleich", "bm-warum", "bm-wende", "bm-stufen"]);
  assert.equal(teile[6].attrs.href, "#/maerkte/einordnung/details");
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
  const teile = MB.render(J(PULSE), null);
  const ids = teile.map((t) => t.attrs.id).filter(Boolean);
  assert.ok(!ids.includes("bm-chance") && !ids.includes("bm-vergleich"));
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
