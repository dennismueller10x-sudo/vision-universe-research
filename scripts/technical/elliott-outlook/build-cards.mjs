#!/usr/bin/env node
/* =========================================================================
   Elliott-Wochenausblick (Elliott-Neustart Schritt 6, Owner 22.11.2026): je Leitmarkt eine Bildkarte (1080 × 1350, SVG, optional PNG)
   und ein Bildtext aus dem veroeffentlichten Chartbild-Produkt (v3/markets). Rechnet nichts: Wellen, Zone, Pfad und Ungueltig-Marke
   stehen so im Produkt. Kein Anbieteraufruf, keine Kosten, keine Veroeffentlichung: die Dateien gehen nur nach --out; gepostet wird
   ausschliesslich ueber das Approval Center nach Freigabe des Owners (docs/studio/README.md, Regeln 1 und 6).
   Wortwahl (docs/legal/WORTWAHL.md): keine Kursziele, „Zone laut Methode“, „Modell, keine Prognose“.

     node scripts/technical/elliott-outlook/build-cards.mjs --out /tmp/ausblick [--only BTCUSD,SPY] [--png]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const V3 = join(ROOT, "quant/data/technical-intelligence/v3");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const W = 1080, H = 1350, BG = "#08080a", INK = "#f4f5f1", MUTE = "#9a9b96", LIME = "#c8f531", RED = "#ff5a5f", PANEL = "#141416";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PATTERN = { IMPULSE: "Impuls", ZIGZAG: "Zickzack", FLAT: "Flache Korrektur", TRIANGLE: "Dreieck", WXY: "Doppelte Korrektur", DOUBLE_ZIGZAG: "Doppel-Zickzack", TRIPLE_ZIGZAG: "Dreifach-Zickzack", LEADING_DIAGONAL: "Anfangsdiagonale", ENDING_DIAGONAL: "Enddiagonale" };
const GRADE_TXT = { A: "Klarheit A · sehr klare Struktur", B: "Klarheit B · klare Struktur", C: "Klarheit C · mittlere Klarheit", D: "Klarheit D · mehrere Zählungen möglich" };

/** Preis deutsch, Stellen nach Groessenordnung. */
export function priceDe(v) {
  if (!Number.isFinite(v)) return "–";
  const d = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 1 ? 2 : 4;
  return v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d }) + " $";
}
export function gradeOf(app, cl) { const lv = app || "LOW"; return lv === "HIGH" && cl === "HIGH" ? "A" : lv === "HIGH" || (lv === "MODERATE" && cl === "HIGH") ? "B" : lv === "MODERATE" ? "C" : "D"; }
/** Zeilenumbruch nach Woertern (Bildkarte, ca. 27 Zeichen je Zeile bei 58 px). */
export function wrap(text, max) {
  const out = []; let cur = "";
  for (const w of String(text).split(" ")) { if (cur && (cur + " " + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  if (cur) out.push(cur);
  return out;
}
const dateDe = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || "") ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : "–");

/** Lesart als Text (Hook, Zeilen, Bildtext) aus einem Produkt-Payload. */
export function readingOf(p) {
  const E = p.pro && p.pro.elliott, c = E && E.primary;
  if (!c) return null;
  const pat = PATTERN[c.pattern] || c.patternName || c.pattern;
  const wave = c.complete ? null : (c.currentWave && c.currentWave.label) || null;
  const dir = c.complete ? c.nextMove : c.currentWave && c.currentWave.direction;
  const dirWord = dir === "UP" ? "aufwärts" : dir === "DOWN" ? "abwärts" : "seitwärts";
  const inv = (p.overlays && (p.overlays.invalidations || []).find((x) => x.scenario === "PRIMARY")) || null;
  const app = E.applicability ? (E.applicability.abstain ? "LOW" : E.applicability.level) : "LOW";
  const grade = gradeOf(app, E.clarityLevel);
  const what = c.complete ? pat + " abgeschlossen" : pat + " · Welle " + wave + " läuft";
  const invTxt = inv ? "ungültig bei Wochenschluss " + (inv.direction === "above" ? "über " : "unter ") + priceDe(inv.price) : null;
  const name = p.market ? p.market.name : p.symbol;
  /* Hook: aktuelle Welle plus Richtung des Plans (Szenario der Hauptlesart; Zone und Pfad zeigen dorthin). Laeuft die Welle gegen den Plan,
     heisst es „Welle C läuft – danach aufwärts?“, sonst „Welle 3 aufwärts – ungültig erst unter …“. */
  const sc = (p.scenarios || []).find((x) => x.kind === "PRIMARY") || null;
  const planDir = sc && sc.direction === "BULLISH" ? "UP" : sc && sc.direction === "BEARISH" ? "DOWN" : dir;
  const planWord = planDir === "UP" ? "aufwärts" : planDir === "DOWN" ? "abwärts" : "seitwärts";
  const short = inv ? "ungültig erst " + (inv.direction === "above" ? "über " : "unter ") + priceDe(inv.price) : null;
  const hook = name + ": " + (c.complete ? pat + " fertig – jetzt " + planWord + "?"
    : planDir === dir ? "Welle " + wave + " " + dirWord + (short ? " – " + short : "") : "Welle " + wave + " läuft – danach " + planWord + "?");
  return { name, what, dir: planDir, dirWord: planWord, inv, invTxt, grade, gradeTxt: GRADE_TXT[grade], hook, close: p.price && p.price.close, asOf: p.asOf };
}

/** Bildkarte als SVG (Kursverlauf der letzten 156 Wochen, Wellen der Hauptlesart, Zone, Pfad, Ungueltig-Marke). */
export function cardSvg(p, r) {
  const ch = p.chart || {}, n = (ch.close || []).length, from = Math.max(0, n - 156);
  const ts = (ch.timestamps || []).slice(from), cl = (ch.close || []).slice(from);
  const ov = p.overlays || {}, waves = ((ov.waves && ov.waves.primary) || []).filter((w) => w.time >= ts[0]);
  const zone = (ov.zones || []).find((z) => z.scenario === "PRIMARY" && (z.kind === "ENTRY" || z.kind === "DEEPER"));
  const path = (ov.projectedPaths || []).find((x) => x.scenario === "PRIMARY");
  const X0 = 70, X1 = 840, XF = 1010, Y0 = 470, Y1 = 1060;
  const vals = cl.concat(waves.map((w) => w.price), r.inv ? [r.inv.price] : [], zone ? [zone.low, zone.high] : [], path ? path.points.map((q) => q.price) : []).filter(Number.isFinite);
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const x = (i) => X0 + (i / Math.max(1, cl.length - 1)) * (X1 - X0), y = (v) => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0);
  const idx = (t) => { const k = ts.indexOf(t); return k >= 0 ? k : ts.findIndex((d) => d >= t); };
  const line = cl.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join("");
  let g = "";
  if (zone) g += `<rect x="${X1 - 120}" y="${y(zone.high).toFixed(1)}" width="${XF - X1 + 120}" height="${Math.max(4, y(zone.low) - y(zone.high)).toFixed(1)}" rx="8" fill="${LIME}" opacity=".22"/><text x="${XF}" y="${(y(zone.low) + 36).toFixed(1)}" text-anchor="end" font-size="26" fill="${LIME}">Zone laut Methode</text>`;
  if (r.inv) g += `<line x1="${X0}" x2="${XF}" y1="${y(r.inv.price).toFixed(1)}" y2="${y(r.inv.price).toFixed(1)}" stroke="${RED}" stroke-width="3" stroke-dasharray="12 10"/><text x="${X0}" y="${(y(r.inv.price) + (r.inv.direction === "above" ? -14 : 36)).toFixed(1)}" font-size="28" fill="${RED}">Ungültig ${r.inv.direction === "above" ? "über" : "unter"} ${esc(priceDe(r.inv.price))}</text>`;
  g += `<path d="${line}" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
  if (path && path.points.length > 1) {
    const steps = path.points.length - 1, px = (k) => X1 + (k / steps) * (XF - X1);
    g += `<path d="${path.points.map((q, k) => (k ? "L" : "M") + px(k).toFixed(1) + " " + y(q.price).toFixed(1)).join("")}" fill="none" stroke="${LIME}" stroke-width="5" stroke-dasharray="14 12" stroke-linecap="round"/>`;
  }
  const placed = [];
  waves.forEach((w, k) => {
    const i = idx(w.time); if (i < 0) return;
    const up = k > 0 ? w.price > waves[k - 1].price : (w.fromPrice !== undefined ? w.price > w.fromPrice : true);
    let yy = y(w.price) + (up ? -34 : 54);
    /* Marken weichen einander aus: liegt eine schon gesetzte Marke naeher als 56 px, eine Stufe weiter weg vom Kurs */
    for (let tries = 0; tries < 4 && placed.some((q) => Math.abs(q[0] - x(i)) < 56 && Math.abs(q[1] - yy) < 56); tries++) yy += up ? -58 : 58;
    placed.push([x(i), yy]);
    const last = k === waves.length - 1;
    g += `<circle cx="${x(i).toFixed(1)}" cy="${y(w.price).toFixed(1)}" r="8" fill="${last ? LIME : INK}"/><circle cx="${x(i).toFixed(1)}" cy="${(yy - 10).toFixed(1)}" r="26" fill="${last ? LIME : PANEL}" stroke="${last ? LIME : INK}" stroke-width="2"/><text x="${x(i).toFixed(1)}" y="${yy.toFixed(1)}" text-anchor="middle" font-size="28" font-weight="800" fill="${last ? BG : INK}" style="stroke:none">${esc(w.label)}</text>`;
  });
  const hook = wrap(r.hook, 27).slice(0, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Helvetica, Arial, sans-serif">
<style>text{paint-order:stroke;stroke:${BG};stroke-width:8px;stroke-linejoin:round}</style>
<rect width="${W}" height="${H}" fill="${BG}"/>
<text x="70" y="110" font-size="30" font-weight="700" fill="${LIME}">Elliott-Wochenausblick · ${esc(dateDe(r.asOf))}</text>
${hook.map((h, i) => `<text x="70" y="${180 + i * 66}" font-size="58" font-weight="800" fill="${INK}">${esc(h)}</text>`).join("")}
<text x="70" y="${180 + hook.length * 66 + 10}" font-size="32" fill="${MUTE}">${esc(r.what)} · Wochenschluss ${esc(priceDe(r.close))}</text>
${g}
<rect x="70" y="1110" width="940" height="120" rx="24" fill="${PANEL}"/>
<text x="104" y="1162" font-size="32" font-weight="700" fill="${INK}" style="stroke:${PANEL}">${esc(r.gradeTxt)}</text>
<text x="104" y="1206" font-size="28" fill="${MUTE}" style="stroke:${PANEL}">${esc(r.invTxt ? "Lesart " + r.invTxt : "Lesart ohne Ungültig-Marke")}</text>
<text x="70" y="1290" font-size="26" fill="${MUTE}">Vision Universe · Modell, keine Prognose</text>
</svg>`;
}

/** Bildtext (max. 2200 Zeichen; Quellen und Hinweise stehen hier, nicht im Bild). */
export function captionOf(p, r) {
  const src = p.market && p.market.via ? p.market.via + (p.market.source && p.market.source.attribution ? " · " + p.market.source.attribution : "") : p.symbol;
  return [r.hook, "",
    "Hauptlesart: " + r.what + ". " + (r.invTxt ? "Die Lesart ist " + r.invTxt + "." : ""),
    r.gradeTxt + ". Die Zone laut Methode und der Pfad sind ein Szenario ohne Zeitangabe.", "",
    "Alle Märkte und Aktien mit Wellen, Zonen und Ungültig-Marken: Vision-Universe-App (bald verfügbar).", "",
    "Modell, keine Prognose, keine Anlageberatung. Quelle: " + src.replace(" · Daten: ", " · ") + ", Wochenschluss " + dateDe(r.asOf) + "."].join("\n").slice(0, 2200);
}

async function main() {
  const OUT = arg("out", null); if (!OUT) { console.error("--out fehlt"); process.exit(2); }
  const idxF = join(V3, "markets", "index.json");
  if (!existsSync(idxF)) { console.error("v3/markets/index.json fehlt (Chartbild-Build mit Leitmärkten)"); process.exit(1); }
  const only = arg("only", null) ? new Set(arg("only").split(",")) : null;
  mkdirSync(OUT, { recursive: true });
  const rows = JSON.parse(readFileSync(idxF, "utf8")).rows.filter((x) => !x.withheld && (!only || only.has(x.t)));
  const made = [];
  for (const row of rows) {
    const doc = JSON.parse(gunzipSync(readFileSync(join(V3, "markets", row.t + ".json.gz"))).toString("utf8")), p = doc.instruments[row.t];
    const r = p && readingOf(p); if (!r) continue;
    writeFileSync(join(OUT, row.t + ".svg"), cardSvg(p, r));
    writeFileSync(join(OUT, row.t + ".txt"), captionOf(p, r) + "\n");
    made.push({ id: row.t, hook: r.hook, grade: r.grade, asOf: r.asOf });
  }
  if (process.argv.includes("--png") && made.length) {
    const { chromium } = createRequire(import.meta.url)("playwright");
    const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: W, height: H } });
    for (const m of made) { await pg.setContent(`<html><body style="margin:0">${readFileSync(join(OUT, m.id + ".svg"), "utf8")}</body></html>`); await pg.screenshot({ path: join(OUT, m.id + ".png") }); }
    await b.close();
  }
  writeFileSync(join(OUT, "ausblick.json"), JSON.stringify({ schema: "vu-elliott-ausblick-1", generatedAt: new Date().toISOString(), cards: made }, null, 1));
  console.log(made.length + " Karten nach " + OUT);
}
if (process.argv[1] && process.argv[1].endsWith("build-cards.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
