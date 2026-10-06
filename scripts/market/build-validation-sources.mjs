#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/build-validation-sources.mjs

   Wandelt frei zugaengliche Forschungsdaten in die Quelldateien der
   Markt-Validierung um. Ruft selbst nichts ab: die Rohdateien laedt der
   Workflow "Markt-Validierung: Quelldaten" (manuell, ohne Schluessel,
   ohne Kosten) und legt sie in zwei Verzeichnissen ab.

     node scripts/market/build-validation-sources.mjs --french <dir> --fred <dir> [--out <dir>]

   Erwartet in <french> (entpackt, Kenneth R. French Data Library):
     F-F_Research_Data_Factors_daily.csv   Markt minus Zins, Zins (Prozent je Tag)
     6_Portfolios_2x3_daily.csv            Groesse x Buchwert/Marktwert
     49_Industry_Portfolios_daily.csv      49 Branchen
   Erwartet in <fred> (fredgraph.csv, oeffentlich):
     SAHMREALTIME.csv, T10Y3M.csv

   Schreibt nach --out (Standard docs/market-validation/sources/, per
   .gitignore ausgeschlossen - das Repository ist oeffentlich, die Rohdaten
   werden nicht weiterverbreitet):
     french-daily.json, fred-sahmrealtime.json, fred-t10y3m.json
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DEFAULT = join(root, "docs/market-validation/sources");

/** Erster Block einer French-CSV: Kopfzeile (",A,B,...") und Tageszeilen
    (YYYYMMDD, Werte in Prozent). Spaetere Bloecke (gleichgewichtet,
    Anzahl Firmen ...) werden ignoriert. -99.99/-999 = fehlend. */
export function parseFrenchCsv(text) {
  const lines = text.split(/\r?\n/);
  let h = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*,/.test(lines[i]) && i + 1 < lines.length && /^\s*\d{8}\s*,/.test(lines[i + 1])) { h = i; break; }
  }
  if (h < 0) throw new Error("French-CSV: keine Kopfzeile mit Tageswerten gefunden");
  const columns = lines[h].split(",").slice(1).map((c) => c.trim());
  const rows = [];
  for (let i = h + 1; i < lines.length; i++) {
    const m = /^\s*(\d{4})(\d{2})(\d{2})\s*,(.*)$/.exec(lines[i]);
    if (!m) break;
    const vals = m[4].split(",").map((v) => { const x = Number(v.trim()); return Number.isFinite(x) && x > -99.99 ? x : null; });
    if (vals.length !== columns.length) throw new Error("French-CSV: Zeile " + (i + 1) + " hat " + vals.length + " statt " + columns.length + " Werte");
    rows.push({ date: `${m[1]}-${m[2]}-${m[3]}`, vals });
  }
  if (!rows.length) throw new Error("French-CSV: keine Tageszeilen");
  return { columns, rows };
}

/** Tagesrenditen in Prozent -> Indexreihe ab 100 (nur Tage mit Wert). */
export function cumulate(rows, col) {
  const out = [];
  let v = 100;
  for (const r of rows) {
    const x = r.vals[col];
    if (x === null) continue;
    v *= 1 + x / 100;
    out.push([r.date, Math.round(v * 1e6) / 1e6]);
  }
  return out;
}

/** Anteil der Branchen ueber ihrer 50- bzw. 200-Tage-Linie (Nenner:
    Branchen mit mindestens 200 Tageswerten bis zum Tag). Dieselbe Regel
    wie die Breite im Produkt, nur mit Branchen statt Einzelaktien. */
export function industryBreadth(rows, minHistory = 200) {
  const n = rows[0].vals.length;
  const lvl = Array.from({ length: n }, () => []);
  const idx = new Array(n).fill(100);
  const s50 = new Array(n).fill(0), s200 = new Array(n).fill(0);
  const out = [];
  for (const r of rows) {
    let e = 0, a50 = 0, a200 = 0;
    for (let k = 0; k < n; k++) {
      const x = r.vals[k];
      if (x === null) continue;
      idx[k] *= 1 + x / 100;
      const L = lvl[k];
      L.push(idx[k]);
      s50[k] += idx[k]; s200[k] += idx[k];
      if (L.length > 50) s50[k] -= L[L.length - 51];
      if (L.length > 200) s200[k] -= L[L.length - 201];
      if (L.length > 201) L.shift();
      if (L.length >= minHistory) {
        e++;
        if (idx[k] > s50[k] / 50) a50++;
        if (idx[k] > s200[k] / 200) a200++;
      }
    }
    if (e > 0) out.push({ date: r.date, evaluated: e, above50Pct: Math.round((1000 * a50) / e) / 10, above200Pct: Math.round((1000 * a200) / e) / 10 });
  }
  return out;
}

/** fredgraph.csv: "DATE|observation_date,SERIES", "." = fehlend. */
export function parseFredCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!/date/i.test(lines[0])) throw new Error("FRED-CSV: unerwartete Kopfzeile");
  const points = [];
  for (const l of lines.slice(1)) {
    const [d, v] = l.split(",");
    const x = Number(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v !== "." && Number.isFinite(x)) points.push([d, x]);
  }
  if (!points.length) throw new Error("FRED-CSV: keine Werte");
  return points;
}

function findFile(dir, re) {
  const f = readdirSync(dir).find((x) => re.test(x));
  if (!f) throw new Error("Datei fehlt in " + dir + ": " + re);
  return readFileSync(join(dir, f), "latin1");
}

function colOf(columns, re, label) {
  const i = columns.findIndex((c) => re.test(c.replace(/\s+/g, " ")));
  if (i < 0) throw new Error("Spalte fehlt: " + label + " in [" + columns.join(", ") + "]");
  return i;
}

export function buildFrench(dir, retrievedAt) {
  const ff = parseFrenchCsv(findFile(dir, /^F-F_Research_Data_Factors_daily\.csv$/i));
  const mkt = colOf(ff.columns, /^Mkt-RF$/i, "Mkt-RF"), rf = colOf(ff.columns, /^RF$/i, "RF");
  /* Gesamtmarkt inklusive Ausschuettungen = Ueberrendite + Zins. */
  const marketRows = ff.rows.map((r) => ({ date: r.date, vals: [r.vals[mkt] === null || r.vals[rf] === null ? null : r.vals[mkt] + r.vals[rf]] }));
  const six = parseFrenchCsv(findFile(dir, /^6_Portfolios_2x3_daily\.csv$/i));
  const ind = parseFrenchCsv(findFile(dir, /^49_Industry_Portfolios_daily\.csv$/i));
  const pick = {
    BIG_LOBM: colOf(six.columns, /^BIG LoBM$/i, "BIG LoBM"),
    BIG_MEDBM: colOf(six.columns, /^ME2 BM2$/i, "ME2 BM2"),
    SMALL_MEDBM: colOf(six.columns, /^ME1 BM2$/i, "ME1 BM2")
  };
  const series = { MARKET: cumulate(marketRows, 0) };
  for (const [k, c] of Object.entries(pick)) series[k] = cumulate(six.rows, c);
  return {
    schemaVersion: "vu-market-validation-french-1.0.0",
    source: "Kenneth R. French Data Library (Tuck School of Business, Dartmouth): F-F_Research_Data_Factors_daily, 6_Portfolios_2x3_daily, 49_Industry_Portfolios_daily (wertgewichtet)",
    citation: "Fama, E. F. und French, K. R.; Daten: Kenneth R. French Data Library, https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
    retrievedAt,
    units: "Indexreihen ab 100 aus Tagesrenditen inklusive Ausschüttungen",
    trackerRoles: { QQQ: "BIG_LOBM", DIA: "BIG_MEDBM", IWM: "SMALL_MEDBM" },
    trackerRoleNotes: {
      SPY: "MARKET – US-Gesamtmarkt (Mkt-RF + RF, alle Aktien an NYSE, AMEX, NASDAQ, wertgewichtet)",
      QQQ: "BIG_LOBM – große Werte mit niedrigem Buchwert/Marktwert (Wachstum), Näherung für einen wachstumslastigen Large-Cap-Index",
      DIA: "BIG_MEDBM – große Werte mit mittlerem Buchwert/Marktwert, Näherung für Standardwerte",
      IWM: "SMALL_MEDBM – kleine Werte mit mittlerem Buchwert/Marktwert, Näherung für Nebenwerte"
    },
    series,
    industryBreadth: industryBreadth(ind.rows),
    industryBreadthNote: "49 Branchenportfolios statt Einzelaktien: Anteil der Branchen über ihrer 50- bzw. 200-Tage-Linie; breit, wenn beide über 50 %, schmal, wenn beide unter 50 %. Gröber als die Produkt-Breite (Einzeltitel), dafür ohne Survivorship-Verzerrung.",
    riskFreeDaily: ff.rows.filter((r) => r.vals[rf] !== null).map((r) => [r.date, Math.round((r.vals[rf] / 100) * 1e8) / 1e8])
  };
}

function main() {
  const a = process.argv.slice(2);
  const arg = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const retrievedAt = new Date().toISOString();
  const OUT = arg("--out") || OUT_DEFAULT;
  mkdirSync(OUT, { recursive: true });
  const french = arg("--french"), fred = arg("--fred");
  if (french) {
    const f = buildFrench(french, retrievedAt);
    writeFileSync(join(OUT, "french-daily.json"), JSON.stringify(f) + "\n");
    console.log("french-daily.json:", f.series.MARKET[0][0], "bis", f.series.MARKET.at(-1)[0], "·", f.industryBreadth.length, "Breitentage");
  }
  if (fred) {
    for (const id of ["SAHMREALTIME", "T10Y3M"]) {
      const p = join(fred, id + ".csv");
      if (!existsSync(p)) { console.log("fehlt:", p); continue; }
      const points = parseFredCsv(readFileSync(p, "utf8"));
      writeFileSync(join(OUT, "fred-" + id.toLowerCase() + ".json"), JSON.stringify({
        schemaVersion: "vu-market-validation-fred-1.0.0", series: id,
        source: "Federal Reserve Bank of St. Louis, FRED, https://fred.stlouisfed.org/series/" + id, retrievedAt, points }) + "\n");
      console.log("fred-" + id.toLowerCase() + ".json:", points[0][0], "bis", points.at(-1)[0], "·", points.length, "Werte");
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
