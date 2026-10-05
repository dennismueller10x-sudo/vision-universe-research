/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-xetra-refdata.mjs   (vorsorge-xetra-ref-1.0.0)

   XETRA-REFERENZDATEN FUER ETFS (Deutsche Boerse, oeffentliche Downloads)

   1. "All tradable instruments" (t7-xetr-allTradableInstruments.csv, taeglich):
      ISIN, WKN, Mnemonic, Instrumenttyp, Produktgruppe.
   2. "ETFs & ETPs" Stammdatenblatt (XLSX): Produkttyp, Produktfamilie,
      laufende Kosten (ONGOING CHARGES), Ertragsverwendung, Replikation,
      Fondswaehrung, Handelswaehrung, Benchmark.

   RECHTE (docs/ETF_DATA_RIGHTS.md): Der Disclaimer der Deutschen Boerse regelt
   Haftung, Links und Marken, enthaelt aber weder eine Erlaubnis noch ein Verbot
   der Weiterverwendung. Die systematische Uebernahme eines wesentlichen Teils
   der Liste beruehrt das Datenbankherstellerrecht (§ 87b UrhG).
   Status: UNKNOWN -> standardmaessig NICHT veroeffentlicht. Ohne Freigabe
   schreibt der Lauf nur Abdeckungszahlen (keine Werte):
     vorsorge/data/sources/xetra-refdata-stats.json
   Mit Freigabe (Umgebungsvariable VU_PUBLISH_XETRA_REFDATA=1, erst nach
   schriftlicher Bestaetigung der Deutschen Boerse) zusaetzlich:
     vorsorge/data/eu/etf-eu-xetra.json
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const F = require(join(root, "vorsorge/engines/etf-fundamentals.js"));
const UA = "VisionUniverse-Research/1.0 (+https://research.visionuniverse.de)";
const HOST = "https://www.cashmarket.deutsche-boerse.com";

/* ------------------------------------------------ Normalisierung (getestet) */
/** "0,07%" | "0.07 %" | "0.07" -> 0.0007 ; Werte > 5 (%) oder < 0 -> null (unplausibel). Ohne Prozentangabe gilt die Spalte als Prozent. */
export function ongoingCharges(raw) {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".").replace(/%$/, "");
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return v >= 0 && v <= 5 ? Math.round(v * 1e5) / 1e7 : null;
}
const REPL = [[/full/i, "PHYSICAL_FULL"], [/optimi[sz]ed|sampl/i, "PHYSICAL_SAMPLING"], [/swap|synth/i, "SYNTHETIC_SWAP"], [/hybrid/i, "HYBRID"]];
export function replication(raw) { const s = String(raw ?? "").trim(); if (!s) return null; for (const [re, v] of REPL) if (re.test(s)) return v; return "OTHER"; }
export function useOfProfits(raw) {
  const s = String(raw ?? "").trim(); if (!s) return null;
  if (/accumul|thesaur|capitali/i.test(s)) return "ACCUMULATING";
  if (/distribut|aussch/i.test(s)) return "DISTRIBUTING";
  return "OTHER";
}
export function productType(raw) { const s = String(raw ?? "").trim().toUpperCase(); return s === "ETF" ? "ETF" : s === "ACTIVE ETF" ? "ACTIVE_ETF" : s === "ETN" ? "ETN" : s === "ETC" ? "ETC" : s || null; }
export function parseInstrumentsCsv(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const hi = lines.findIndex((l) => /(^|;)ISIN(;|$)/.test(l));
  if (hi < 0) throw new Error("Instrumentenliste: keine Kopfzeile mit ISIN");
  const head = lines[hi].split(";"), ix = (k) => head.indexOf(k);
  const need = ["ISIN", "WKN", "Mnemonic", "Instrument Type", "Product Assignment Group"];
  const miss = need.filter((k) => ix(k) < 0); if (miss.length) throw new Error("Instrumentenliste: Spalten fehlen: " + miss.join(", "));
  const asOf = (lines.slice(0, hi).join(" ").match(/(\d{2})\.(\d{2})\.(\d{4})/) || []).slice(1);
  const out = new Map(), wknShapes = {};
  for (const l of lines.slice(hi + 1)) {
    const c = l.split(";").map((x) => x.replace(/^"|"$/g, "").trim()); if (c[ix("Instrument Type")] !== "ETF") continue;
    const isin = c[ix("ISIN")], wkn = String(c[ix("WKN")] || "").trim().toUpperCase();
    if (!F.isValidIsin(isin)) continue;
    if (wkn && !F.isValidWkn(wkn)) { const shape = wkn.replace(/[A-Z]/g, "A").replace(/[0-9]/g, "9"); wknShapes[shape] = (wknShapes[shape] || 0) + 1; }
    out.set(isin, { isin, wkn: F.isValidWkn(wkn) ? wkn : null, mnemonic: c[ix("Mnemonic")] || null, group: c[ix("Product Assignment Group")] || null });
  }
  return { asOf: asOf.length ? asOf[2] + "-" + asOf[1] + "-" + asOf[0] : null, rows: out, wknRejectedShapes: wknShapes, headerWkn: head.filter((h) => /WKN/i.test(h)) };
}
export function parseMasterRows(rows) {
  const hi = rows.findIndex((r) => r.some((c) => String(c).trim().toUpperCase() === "ISIN"));
  if (hi < 0) throw new Error("Stammdatenblatt: keine Kopfzeile mit ISIN");
  const head = rows[hi].map((h) => String(h).trim().toUpperCase()), ix = (k) => head.indexOf(k);
  const need = ["ISIN", "PRODUCT TYPE", "ONGOING CHARGES"];
  const miss = need.filter((k) => ix(k) < 0); if (miss.length) throw new Error("Stammdatenblatt: Spalten fehlen: " + miss.join(", "));
  const asOf = (rows.slice(0, hi).flat().join(" ").match(/(\d{2})\/(\d{2})\/(\d{4})/) || []).slice(1);
  const out = new Map();
  for (const r of rows.slice(hi + 1)) {
    const isin = String(r[ix("ISIN")] ?? "").trim(); if (!F.isValidIsin(isin)) continue;
    const get = (k) => (ix(k) >= 0 ? String(r[ix(k)] ?? "").trim() || null : null);
    out.set(isin, { isin, productType: productType(get("PRODUCT TYPE")), name: get("PRODUCT NAME"), family: get("PRODUCT FAMILY"), symbol: get("XETRA SYMBOL"),
      ongoingCharges: ongoingCharges(get("ONGOING CHARGES")), ongoingChargesRaw: get("ONGOING CHARGES"), distribution: useOfProfits(get("USE OF PROFITS")),
      replication: replication(get("REPLICATION METHOD")), fundCurrency: get("FUND CURRENCY"), tradingCurrency: get("TRADING CURRENCY"), benchmark: get("BENCHMARK") });
  }
  // Datum im Kopf "As of 05/10/2026" = TT/MM/JJJJ
  return { asOf: asOf.length ? asOf[2] + "-" + asOf[1] + "-" + asOf[0] : null, rows: out };
}

/* -------------------------------------------------------------- Lauf */
if (process.argv[1] && process.argv[1].endsWith("ingest-xetra-refdata.mjs")) {
  const get = async (url, binary) => { const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120000) }); if (!r.ok) throw new Error("HTTP " + r.status + " " + url); return binary ? Buffer.from(await r.arrayBuffer()) : r.text(); };
  const linkOf = (html, re) => (String(html).match(re) || [])[0];
  const p1 = await get(HOST + "/cash-en/trading/Tradable-Instruments-Xetra/Downloads");
  const csvPath = linkOf(p1, /\/resource\/blob\/[0-9]+\/[0-9a-f]+\/data\/t7-xetr-allTradableInstruments\.csv/i);
  const p2 = await get(HOST + "/cash-en/Data-Tech/statistics/etf-etp-statistics/etp-list");
  const xlsPath = linkOf(p2, /\/resource\/blob\/[0-9]+\/[0-9a-f]+\/data\/[^"'\s]+\.xlsx?/i);
  if (!csvPath || !xlsPath) throw new Error("Download-Links nicht gefunden (Seitenaufbau geaendert?)");
  const inst = parseInstrumentsCsv(await get(HOST + csvPath));
  const { readXlsx } = await import(join(root, "scripts/vorsorge/adapters/xlsx.mjs"));
  const master = parseMasterRows(readXlsx(await get(HOST + xlsPath, true)).rows);
  const eu = JSON.parse(readFileSync(join(root, "vorsorge/data/eu/etf-eu-index.json"), "utf8"));
  const euIsins = new Set(eu.rows.map((r) => r[0]));
  const etfs = [...master.rows.values()].filter((r) => r.productType === "ETF" || r.productType === "ACTIVE_ETF");
  const n = (f) => etfs.filter(f).length;
  const stats = { schemaVersion: "vu-xetra-refdata-stats-1.0.0", source: "Deutsche Boerse: Xetra All Tradable Instruments (CSV), ETFs & ETPs Master Data Sheet (XLSX)",
    legalUsageStatus: "UNKNOWN", published: process.env.VU_PUBLISH_XETRA_REFDATA === "1",
    note: "Keine Erlaubnis oder Verbot in den veroeffentlichten Bedingungen; Datenbankherstellerrecht beachten. Ohne schriftliche Bestaetigung nur Abdeckungszahlen.",
    instrumentsAsOf: inst.asOf, masterAsOf: master.asOf, instrumentsEtfRows: inst.rows.size, masterRows: master.rows.size, masterEtfs: etfs.length,
    coverage: { ongoingCharges: n((r) => r.ongoingCharges !== null), distribution: n((r) => r.distribution && r.distribution !== "OTHER"), replication: n((r) => r.replication && r.replication !== "OTHER"),
      benchmark: n((r) => r.benchmark), fundCurrency: n((r) => r.fundCurrency), wkn: [...inst.rows.values()].filter((r) => r.wkn).length,
      inFirdsIndex: etfs.filter((r) => euIsins.has(r.isin)).length, wknInFirdsIndex: [...inst.rows.values()].filter((r) => r.wkn && euIsins.has(r.isin)).length },
    rejected: { wknShapes: inst.wknRejectedShapes, wknHeaders: inst.headerWkn, ongoingChargesUnparsable: n((r) => r.ongoingChargesRaw && r.ongoingCharges === null) },
    distributions: { replication: Object.entries(etfs.reduce((m, r) => ((m[r.replication || "null"] = (m[r.replication || "null"] || 0) + 1), m), {})), distribution: Object.entries(etfs.reduce((m, r) => ((m[r.distribution || "null"] = (m[r.distribution || "null"] || 0) + 1), m), {})) } };
  writeFileSync(join(root, "vorsorge/data/sources/xetra-refdata-stats.json"), JSON.stringify(stats, null, 1) + "\n");
  console.log(JSON.stringify(stats.coverage), "veroeffentlicht:", stats.published);
  if (stats.published) {
    const fields = ["isin", "wkn", "mnemonic", "productType", "family", "ongoingCharges", "distribution", "replication", "fundCurrency", "tradingCurrency", "benchmark"];
    const isins = [...new Set([...etfs.map((r) => r.isin), ...[...inst.rows.keys()]])].sort();
    const rows = isins.map((i) => { const m = master.rows.get(i) || {}, x = inst.rows.get(i) || {}; return [i, x.wkn || null, x.mnemonic || m.symbol || null, m.productType || "ETF", m.family || null, m.ongoingCharges ?? null, m.distribution || null, m.replication || null, m.fundCurrency || null, m.tradingCurrency || null, m.benchmark || null]; });
    writeFileSync(join(root, "vorsorge/data/eu/etf-eu-xetra.json"), JSON.stringify({ schemaVersion: "vu-vorsorge-eu-xetra-1.0.0", source: stats.source, attribution: "Quelle: Deutsche Börse AG (Xetra), transformiert von Vision Universe.", instrumentsAsOf: inst.asOf, masterAsOf: master.asOf, fields, rows }));
  }
}
