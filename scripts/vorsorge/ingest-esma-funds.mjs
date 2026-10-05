/* =========================================================================
   VISION UNIVERSE VORSORGE — ingest-esma-funds.mjs   (vorsorge-esma-funds-1.0.0)

   AMTLICHER UCITS-STATUS FUER EUROPAEISCHE ETF-ANTEILKLASSEN

   Quelle: ESMA-Register "Cross-border distribution of funds" (Verordnung (EU)
   2019/1156, Art. 12) - Solr-Kern esma_registers_funds_cbdif. Je Fonds:
   Rechtsrahmen (UCITS/AIF/...), Name, Verwaltungsgesellschaft, Herkunfts-
   staat, zustaendige Aufsicht, Status, Vertriebslaender (Notifizierungen).
   Nutzung: "Reproduction of all information on this site (REGISTERS
   information) is authorised ... provided the source is acknowledged";
   transformierte Daten sind als transformiert zu kennzeichnen.

   Das Register fuehrt KEINE ISIN. Zuordnung zu den FIRDS-Anteilklassen
   (vorsorge/data/eu/etf-eu-index.json) ueber den Fondsnamen:
     - normalisierter Registername muss Wortanfang des Anteilklassennamens sein
       (z. B. "ishares core msci world ucits etf" -> "... ucits etf usd acc"),
     - mindestens 3 Woerter, laengster Treffer gewinnt,
     - Domizil muss uebereinstimmen; mehrdeutige Treffer werden verworfen.
   Konfidenz MEDIUM (Namensabgleich), nie "primaer verifiziert".

   Ausgabe: vorsorge/data/eu/etf-eu-ucits.json (spaltenweise, je ISIN)
   GitHub Actions, Marker [vorsorge-fundamentals].
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UA = "VisionUniverse-Research/1.0 (+https://research.visionuniverse.de)";
const BASE = "https://registers.esma.europa.eu/solr/esma_registers_funds_cbdif/select?wt=json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url) {
  for (let a = 1; a <= 4; a++) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(90000) }); if (r.ok) return await r.json(); if (r.status < 500 && r.status !== 429) throw new Error("HTTP " + r.status); }
    catch (e) { if (a === 4) throw e; }
    await sleep(3000 * a);
  }
}

export function normName(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[–—]/g, "-").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
/* Woerter, die nach dem Fondsnamen nur die Anteilklasse beschreiben (Waehrung, Ertragsverwendung, Absicherung,
   Klassen-/Anteilsbezeichnung, Handelsplatz-Zusatz "at XXXX"). Alles andere heisst: anderer Fonds. */
const CLASS_WORDS = new Set(["usd", "eur", "gbp", "chf", "jpy", "sek", "nok", "dkk", "cad", "aud", "hkd", "sgd", "mxn", "pln", "czk", "huf", "cnh", "cny",
  "acc", "accumulating", "accumulation", "accumulate", "dist", "distributing", "distribution", "distributes", "capitalisation", "capitalization", "cap", "inc", "income",
  "hedged", "hdg", "hgd", "unhedged", "unhgd", "h", "class", "share", "shares", "shs", "reg", "registered", "inhaber", "anteile", "namens", "ant", "on", "o", "n",
  "ucits", "etf", "etfs", "fund", "cmn", "series", "a", "b", "c", "d", "i", "ii", "iii", "x", "s", "de", "ie", "lu", "the", "units", "unit", "monthly", "quarterly", "annual"]);
export function residualIsShareClass(words) {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "at" && /^[a-z]{4}$/.test(words[i + 1] || "")) { i++; continue; }   // " AT ETFP" (Handelsplatz)
    if (CLASS_WORDS.has(w) || /^[0-9][a-z]{1,2}$/.test(w)) continue;           // 1C, 2D, 1CD
    return false;
  }
  return true;
}
/** Passt der Anteilklassenname zum (ueber die LEI gefundenen) Registerfonds? FIRDS-Namen sind oft abgekuerzt
    ("JPM", "Em.Markts.") oder veraltet (Umbenennung) - das allein ist kein Widerspruch. Widerspruch heisst: Zahlen
    im Anteilklassennamen, die der Fondsname nicht hat (z. B. "TIPS 0-5" gegen "TIPS" - LEI des Schwesterfonds). */
export function consistentWithFund(className, fundName) {
  const reg = new Set(normName(fundName).split(" "));
  return normName(className).split(" ").filter((w) => /^[0-9]+$/.test(w)).every((w) => reg.has(w));
}
/** Laengster Registername, der Wortanfang des Anteilklassennamens ist und nach dem nur Anteilklassen-Woerter folgen; gleiches Domizil; eindeutig. */
export function matchFund(shareClassName, domicile, index) {
  const tokens = normName(shareClassName).split(" ");
  for (let n = tokens.length; n >= 3; n--) {
    const cands = index.get(tokens.slice(0, n).join(" "));
    if (!cands) continue;
    if (!residualIsShareClass(tokens.slice(n))) return null;   // Rest beschreibt einen anderen Fonds (z. B. "... USA" vs. "... USA SRI Climate")
    const same = domicile ? cands.filter((c) => c.domicile === domicile) : [];
    if (same.length === 1) return same[0];
    if (same.length > 1) return null;          // mehrdeutig
    // Treffer mit abweichendem Domizil: nicht zuordnen (kein Raten), kuerzere Praefixe weiter pruefen
  }
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("ingest-esma-funds.mjs")) {
  /* ---- 1. UCITS-Fonds (Elterndokumente) seitenweise */
  const FL = "id,funds_national_name,funds_legal_framework_name,funds_manager_nat_name,funds_manager_nat_code,funds_domicile_cou_code,funds_ca_cou_code,funds_status_code_name,funds_host_country_codes,funds_last_update_date";
  const funds = [];
  let start = 0, total = null;
  do {
    const j = await json(`${BASE}&q=type_s:parent&fq=funds_legal_framework_name:UCITS&fl=${FL}&rows=1000&start=${start}&sort=id%20asc`);
    total = j.response.numFound; funds.push(...j.response.docs); start += 1000;
    await sleep(500);
  } while (start < total);
  console.log("UCITS-Fonds im ESMA-Register:", funds.length, "von", total);

  /* ---- 2. Abgleich mit den FIRDS-ETF-Anteilklassen */
  const eu = JSON.parse(readFileSync(join(root, "vorsorge/data/eu/etf-eu-index.json"), "utf8"));
  const fi = (k) => eu.fields.indexOf(k);
  const index = new Map();
  for (const f of funds) {
    const k = normName(f.funds_national_name); if (k.split(" ").length < 3) continue;
    const rec = { id: f.id, name: f.funds_national_name, domicile: f.funds_domicile_cou_code || null, manager: f.funds_manager_nat_name || null,
      /* Land der zustaendigen Aufsicht (ISO-Code) */ authority: f.funds_ca_cou_code || null, status: f.funds_status_code_name || null, hosts: new Set(f.funds_host_country_codes || []), updated: (f.funds_last_update_date || "").slice(0, 10) || null };
    if (!index.has(k)) index.set(k, []); index.get(k).push(rec);
  }
  const matched = new Map();   // isin -> rec
  // Zuerst ueber den rechtlichen Fondsnamen laut GLEIF (aktueller Teilfondsname zur Fonds-LEI), dann ueber den FIRDS-Namen.
  // Eine falsch gemeldete LEI (Schwesterfonds) wird verworfen, wenn der Anteilklassenname Zahlen enthaelt, die der Fonds nicht
  // hat, oder wenn der Anteilklassenname selbst eindeutig einem anderen Registerfonds entspricht (Widerspruch -> keine Zuordnung).
  for (const r of eu.rows) {
    const name = r[fi("name")], legal = r[fi("issuerLegalName")], dom = r[fi("domicile")];
    const byName = matchFund(name, dom, index);
    let m = legal ? matchFund(legal, dom, index) : null;
    if (m && !consistentWithFund(name, m.name)) m = null;
    if (m && byName && byName.id !== m.id) m = null;   // beide plausibel, aber verschieden: nicht raten
    else if (!m) m = byName;
    if (m && m.status && m.status !== "Active") m = null;   // inaktive Registereintraege nicht als aktuellen Status zeigen
    if (m) matched.set(r[0], m);
  }
  console.log("ETF-Anteilklassen mit Registertreffer:", matched.size, "von", eu.rows.length);

  /* ---- 3. Vertriebslaender aus den Notifizierungen (Kindsdokumente) der getroffenen Fonds */
  const ids = [...new Set([...matched.values()].map((m) => m.id))];
  const byId = new Map([...matched.values()].map((m) => [m.id, m]));
  let childFields = null;
  for (let i = 0; i < ids.length; i += 80) {
    const q = encodeURIComponent("_root_:(" + ids.slice(i, i + 80).join(" OR ") + ")");
    const j = await json(`${BASE}&q=${q}&fq=type_s:child&rows=5000`);
    for (const c of j.response.docs) {
      if (!childFields) childFields = Object.keys(c);
      const rec = byId.get(String(c._root_)); if (!rec) continue;
      for (const [k, v] of Object.entries(c)) if (/host.*cou.*code/i.test(k) && !/name/i.test(k)) [].concat(v).forEach((x) => typeof x === "string" && /^[A-Z]{2}$/.test(x) && rec.hosts.add(x));
    }
    await sleep(400);
  }
  console.log("Felder der Notifizierungen:", (childFields || []).join(","));

  /* ---- 4. Ausgabe */
  const fields = ["isin", "ucits", "fundName", "manager", "homeState", "authority", "status", "hostCountries", "registerUpdated", "match"];
  const rows = [...matched.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([isin, m]) =>
    [isin, true, m.name, m.manager, m.domicile, m.authority, m.status, [...m.hosts].sort().join(" "), m.updated, "NAME_PREFIX_SAME_DOMICILE"]);
  const out = { schemaVersion: "vu-vorsorge-eu-ucits-1.0.0", runDate: new Date().toISOString().slice(0, 10), source: "ESMA Register Cross-border distribution of funds (Reg. (EU) 2019/1156)",
    attribution: "Quelle: ESMA Registers (Fonds im grenzüberschreitenden Vertrieb), transformiert von Vision Universe.",
    method: "Zuordnung ueber den Fondsnamen (Wortanfang) und gleiches Domizil; Konfidenz MEDIUM. Das Register fuehrt keine ISIN.",
    hostCountriesNote: "Vertriebslaender laut den im Register gemeldeten Notifizierungen; aeltere Notifizierungen fehlen teils. Nur positive Aussagen sind belastbar.",
    ucitsFundsInRegister: funds.length, fields, rows };
  writeFileSync(join(root, "vorsorge/data/eu/etf-eu-ucits.json"), JSON.stringify(out));
  const de = rows.filter((r) => r[7].split(" ").includes("DE")).length;
  console.log("Ausgabe:", rows.length, "Anteilklassen mit amtlichem UCITS-Status;", de, "mit Vertriebsnotifizierung fuer Deutschland");
}
