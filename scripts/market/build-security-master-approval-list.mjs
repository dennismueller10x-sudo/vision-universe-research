#!/usr/bin/env node
/**
 * Quellengebundene Freigabeliste für den Übernahme-Gate-Lauf 1.1.0 → 1.3.0 (Owner-Entscheidung 30.10.2026).
 *
 * Liest einen Probelauf der Wochenaktualisierung (CI-Artefakt von .github/workflows/security-master-weekly.yml mit
 * commit=false) und den committeten Ausgangsstand, klassiert JEDE Änderung, die das Gate zählt, mit Beleg und schreibt:
 *  - die Sonderfreigabe security-master-approved-changes-1.1.0 (nur Einträge mit Urteil APPROVABLE), gebunden an
 *    fromVersion, toVersion und den SHA-256 des Ausgangsstamms wie 1.0.0;
 *  - optional die vollständige Klassierung (--classification-out) und die Prüftabellen (--markdown-out).
 * Nicht freigabefähige Einträge stehen nur in Klassierung und Tabellen; sie zählen im Gate weiter gegen die
 * unveränderten Grenzen. Kein Netzzugriff, schreibt nur nach --out / --classification-out / --markdown-out.
 *
 *   node scripts/market/build-security-master-approval-list.mjs --gate-report <sm-gate.json> --prev <dir> --next <dir>
 *        --out <approval.json> [--prev-names <file>] [--next-names <file>] [--base-approval <1.0.0-Datei>]
 *        [--sec <company_tickers_exchange.json>] [--sec-as-of YYYY-MM-DD] [--delisting-register <json>]
 *        [--delisting-register-ref <text>] [--classification-out <json>] [--markdown-out <md>]
 *        [--accept-duplicate <canonical_id> --accept-duplicate-ref <Fundstelle der Owner-Entscheidung>]
 *        [--canonical-evidence <json>]  Belegregister einzelner canonical_id-Wechsel (Börsenrückzug in den Freiverkehr)
 *        [--series-dir <dir>]   eigene Tagesreihen (Standard quant/data/market/discover-series, nur gelesen)
 *
 * --prev/--next: Verzeichnisse mit us-security-master.json (next zusätzlich reconciliation.json für die Lauf-ID).
 * --prev muss die Bytes des committeten Stamms enthalten (der SHA-256 bindet die Freigabe), wie im Workflow
 * („Committeten Stand sichern“). Weicht ein neuer Probelauf ab (Anbieterbewegung), wird die Liste neu erzeugt.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { compareMasters, compareNames, baselineIndex, identityFindings, APPROVED_CHANGES_SCHEMA_V11 } from "./security-master-refresh-gate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BUILDER_VERSION = "security-master-approval-list-1.0.0";
const RECENT_RESTART_DAYS = 60;
const EXCHANGE_FAMILY = { NASDAQ: "Nasdaq", NYSE: "NYSE", "NYSE MKT": "NYSE", AMEX: "NYSE", "NYSE ARCA": "NYSE", BATS: "CBOE", OTCMKTS: "OTC", PINK: "OTC", OTCBB: "OTC", EXPM: "OTC" };
const LISTED = new Set(["Nasdaq", "NYSE", "CBOE", "TXSE"]);
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const days = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${String(from).slice(0, 10)}T00:00:00Z`)) / 864e5;
const rowText = (r) => `${r.exchange}:${r.start_date || "?"}..${r.end_date || "offen"} ${r.active_status} ${r.instrument_type}${r.eligible_us_equity ? " geeignet" : ""}`;

/** SEC-Tickerliste (company_tickers_exchange.json) als Ticker → {cik, name, exchange}. */
export function indexSec(sec) {
  const by = new Map();
  if (!sec || !Array.isArray(sec.data)) return by;
  const f = sec.fields || ["cik", "name", "ticker", "exchange"], ix = (k) => f.indexOf(k);
  for (const d of sec.data) by.set(String(d[ix("ticker")]).toUpperCase(), { cik: String(d[ix("cik")]).padStart(10, "0"), name: d[ix("name")], exchange: d[ix("exchange")] ?? null });
  return by;
}

/**
 * Abgleich einer Ergebniszeile mit der SEC-Liste. row = die aktive Zeile nach der Änderung (oder null).
 * CONFIRMS: SEC führt den Ticker an derselben Börsenfamilie; CONTRADICTS: SEC widerspricht (andere Börse, oder ein
 * Börsenlisting, wo der Anbieter keines mehr meldet); NOT_LISTED / CONSISTENT: kein Widerspruch, keine Bestätigung.
 */
export function secCheck(row, ticker, secBy) {
  const s = secBy.get(String(ticker).toUpperCase()) || null;
  const ref = s ? `${ticker} → CIK ${s.cik} ${s.name} (${s.exchange ?? "ohne Börse"})` : `${ticker} nicht gelistet`;
  if (!row || row.active_status !== "ACTIVE") return { status: s && LISTED.has(s.exchange) ? "CONTRADICTS" : "CONSISTENT", ref, sec: s };
  const fam = EXCHANGE_FAMILY[String(row.exchange || "").toUpperCase()] || null;
  if (fam === "OTC") return { status: s && LISTED.has(s.exchange) ? "CONTRADICTS" : "CONSISTENT", ref, sec: s };
  if (!s) return { status: "NOT_LISTED", ref, sec: s };
  return { status: s.exchange === fam ? "CONFIRMS" : "CONTRADICTS", ref, sec: s };
}
/** Freigabe verlangt bei einer aktiven Stammaktie an einer Börse die SEC-Bestätigung, sonst nur: kein Widerspruch. */
const secOk = (row, chk) => (row && row.active_status === "ACTIVE" && row.instrument_type === "EQUITY_COMMON" && EXCHANGE_FAMILY[String(row.exchange || "").toUpperCase()] !== "OTC") ? chk.status === "CONFIRMS" : chk.status !== "CONTRADICTS";

/** Klassiert einen canonical_id-Wechsel einer Bestands-securityId (rein). */
export function classifyCanonical(P, N, { today, secBy }) {
  const pc = new Set(P.map((r) => r.canonical_id)), nc = new Set(N.map((r) => r.canonical_id));
  const kept = [...pc].every((c) => nc.has(c)), added = N.filter((r) => !pc.has(r.canonical_id)), removed = P.filter((r) => !nc.has(r.canonical_id));
  const active = N.filter((r) => r.active_status === "ACTIVE"), ticker = P[0].ticker;
  const provider = `prev [${P.map(rowText).join("; ")}] → next [${N.map(rowText).join("; ")}]`;
  const out = (cls, approvable, reason, row = active[0] || null) => {
    const chk = secCheck(row, ticker, secBy);
    const ok = approvable && secOk(row, chk);
    return { class: cls, approvable: ok, reason: ok ? reason : approvable ? `${reason}; SEC ${chk.status === "CONTRADICTS" ? "widerspricht" : "bestätigt nicht"} (${chk.ref})` : reason, provider, sec: chk };
  };
  if (N.some((r) => r.ticker !== ticker)) return out("UNCLEAR_TICKER_MISMATCH", false, "Zeilen mit anderem Ticker unter derselben securityId");
  if (active.length > 1) return out("TWO_ACTIVE_LISTINGS", false, `zwei aktive Anbieterzeilen (${active.map((r) => r.canonical_id).join(", ")}); welches Listing gilt, ist offen, die ältere Zeile altert erst nach 30 Tagen aus`);
  if (kept && added.length) {
    const newest = added.reduce((a, b) => (String(b.start_date) > String(a.start_date) ? b : a));
    const others = N.filter((r) => r !== newest), maxEnd = others.map((r) => String(r.end_date || "9999")).sort().at(-1);
    const single = active.length === 0 || active[0] === newest;
    if (single && String(newest.start_date) > maxEnd) {
      const reuse = days(maxEnd, newest.start_date) > 365 || newest.instrument_type !== P[0].instrument_type;
      return out(reuse ? "TICKER_REUSE_NEW_LISTING" : "LISTING_RESTART", true,
        `Anbieter trennt die bisher zusammengefasste Zeile: altes Listing endet ${maxEnd}, neues beginnt ${newest.start_date} (${newest.instrument_type}); securityId folgt nach core/identity.js dem Ticker, also dem laufenden Listing`, active[0] || null);
    }
    return out("UNCLEAR_OVERLAP", false, "neue Zeile überschneidet ein bestehendes Listing");
  }
  if (!kept && !added.length && removed.every((r) => r.active_status !== "ACTIVE") && N.every((r) => pc.has(r.canonical_id)))
    return out("HISTORICAL_ROW_DROPPED", true, `Anbieter führt die schon inaktive Altzeile ${removed.map((r) => r.canonical_id).join(", ")} nicht mehr; die laufende Zeile bleibt unverändert`);
  if (P.length === 1 && N.length === 1 && removed.length === 1 && added.length === 1) {
    const p = P[0], n = N[0], famP = EXCHANGE_FAMILY[String(p.exchange).toUpperCase()], famN = EXCHANGE_FAMILY[String(n.exchange).toUpperCase()];
    const recent = days(n.start_date, today) <= RECENT_RESTART_DAYS;
    if (p.start_date === n.start_date && p.exchange !== n.exchange) {
      if (famN === "OTC") return out("MOVED_TO_OTC", true, `gleiches Listing (Beginn ${n.start_date}) von ${p.exchange} nach ${n.exchange} verlegt (Börsenrückzug in den Freiverkehr)`, n);
      if (famP === famN) return out("EXCHANGE_LABEL_RENAMED", true, `gleiches Listing (Beginn ${n.start_date}), Börsenbezeichnung ${p.exchange} → ${n.exchange} (dieselbe Börsenfamilie ${famN})`, n);
      return out("EXCHANGE_TRANSFER", true, `gleiches Listing (Beginn ${n.start_date}), Börsenwechsel ${p.exchange} → ${n.exchange}`, n);
    }
    if (recent) return out("PROVIDER_HISTORY_RESTARTED", false, `Altzeile (Beginn ${p.start_date}) beim Anbieter entfallen, neue Zeile erst seit ${n.start_date}: ob dasselbe Wertpapier fortgeführt wird (Reverse Split, Umfirmierung, CUSIP-Wechsel) oder ein anderer Emittent den Ticker übernommen hat, belegt die Anbieterliste nicht`, n);
    if (p.exchange === n.exchange) return out("START_DATE_RESTATED", true, `gleiches Listing an ${n.exchange}, Anbieter korrigiert den Beginn ${p.start_date} → ${n.start_date}`, n);
    return out("UNCLEAR_REPLACEMENT", false, `Altzeile entfallen, ersetzt durch ein Listing an anderer Börse mit anderem Beginn (${p.exchange} ${p.start_date} → ${n.exchange} ${n.start_date}); die Anbieterliste belegt das Ende des alten Listings nicht`, n);
  }
  return out("UNCLEAR", false, "Muster nicht eindeutig");
}

/** Klassiert eine Deaktivierung (aktiv → inaktiv) einer Bestands-securityId (rein). */
export function classifyDeactivation(P, N, { secBy, register, canonical, seriesEnd = () => null }) {
  const ticker = P[0].ticker, chk = secCheck(null, ticker, secBy), reg = register.get(P[0].baseline_security_id) || null;
  const same = P.length === N.length && P.every((r) => N.some((n) => n.canonical_id === r.canonical_id && n.end_date === r.end_date));
  const provider = `prev [${P.map(rowText).join("; ")}] → next [${N.map(rowText).join("; ")}]`;
  const cls = canonical ? `WITH_CANONICAL_CHANGE:${canonical.class}` : same ? "PROVIDER_ENDDATE_AGED" : "PROVIDER_ENDDATE_RESTATED";
  let approvable = chk.status !== "CONTRADICTS", reason = same ? "Anbieter-Enddatum unverändert, inzwischen älter als 30 Tage (Schwelle des Erzeugers)" : `Anbieter meldet als letztes Handelsdatum ${N.map((r) => r.end_date).join(", ")} (älter als 30 Tage)`;
  if (canonical && !canonical.approvable) { approvable = false; reason = `folgt aus dem nicht freigabefähigen canonical_id-Wechsel (${canonical.class})`; }
  if (chk.status === "CONTRADICTS") reason = `SEC führt den Ticker weiter an einer Börse (${chk.ref})`;
  // eigene veröffentlichte Tagesreihe läuft über das Anbieter-Ende hinaus: Kurse gehören einem laufenden Listing → Identitätsbefund
  const end = N.map((r) => r.end_date).filter(Boolean).sort().at(-1) ?? null, own = seriesEnd(P[0].baseline_security_id);
  if (own && end && own > end) { approvable = false; reason = `eigene Tagesreihe (discover-series) läuft bis ${own}, Anbieter-Ende ${end}: Kurse stammen von einem laufenden Listing (Ticker-Wiederverwendung oder Anbieterkorrektur), Identitätsbefund statt Delisting`; }
  return { seriesEnd: own, class: cls, approvable, reason, provider, sec: chk, form25: reg && { form: reg.form, accession: reg.accession, filingDate: reg.filingDate, effectiveDate: reg.effectiveDate, url: reg.url } };
}

/** Name-Wechsel (rein): nur Ergänzung oder Umfirmierung desselben Emittenten (CIK), bestätigt durch die Quelle. */
export function classifyName(change, prevRow, nextRow, secBy) {
  const s = secBy.get(String(nextRow.ticker || "").toUpperCase()) || null, cikN = nextRow.cik || null, cikP = prevRow.cik || null;
  const cand = nextRow.candidates || {}, srcName = (cand[nextRow.nameSource] || {}).name ?? null;
  const secRef = s ? `${nextRow.ticker} → CIK ${s.cik} ${s.name} (${s.exchange ?? "ohne Börse"})` : `${nextRow.ticker} nicht gelistet`;
  if (change.to === null) return { class: "NAME_REMOVED", approvable: false, reason: "Name entfällt", sec: secRef };
  if (cikP && cikN && cikP !== cikN) return { class: "ISSUER_CIK_CHANGED", approvable: false, reason: `CIK ${cikP} → ${cikN}: anderer Emittent unter dem Ticker (z. B. Fusion oder SPAC-Abschluss), Namenswechsel ist eine Identitätsfrage`, sec: secRef };
  const viaSec = nextRow.nameSource === "SEC_COMPANY_TICKERS";
  if (viaSec && !(s && s.cik === cikN)) return { class: change.from === null ? "NAME_ADDED" : "NAME_RENAMED", approvable: false, reason: `SEC-Liste bestätigt Ticker/CIK nicht (${secRef})`, sec: secRef };
  if (!viaSec && srcName !== change.to) return { class: "NAME_RENAMED", approvable: false, reason: "neuer Name steht nicht in der angegebenen Quelle", sec: secRef };
  if (change.from === null) return { class: "NAME_ADDED_SEC", approvable: true, reason: `Name neu aus SEC company_tickers_exchange (CIK ${cikN}); der committete Namensstand wurde ohne SEC-Abgleich gebaut (stats.sec = null)`, sec: secRef };
  return { class: viaSec ? "RENAMED_SAME_CIK_SEC" : "RENAMED_SAME_CIK_PROVIDER", approvable: true, reason: `Umfirmierung desselben Emittenten (CIK ${cikN || cikP}); Quelle ${nextRow.nameSource}`, sec: secRef };
}

/**
 * Belegregister für einzelne canonical_id-Wechsel (quant/config/security-master-canonical-change-evidence.json).
 * Es macht einen sonst nicht freigabefähigen Wechsel nur dann freigabefähig, wenn ALLES passt: gleiche securityId,
 * Ticker, exakt dieselben canonical_ids vorher/nachher, dieselbe Builder-Klasse, Zielzeile im Freiverkehr, dieselbe
 * Emittenten-CIK wie im committeten Namensstand (und in der SEC-Liste, falls sie den Ticker führt), Ereignis nicht in
 * der Zukunft und die verlangten SEC-Meldungen mit Zitat. Sonst bleibt das Urteil des Builders unverändert, und der
 * Eintrag erscheint als nicht angewandt. Ein formal fehlerhaftes Register bricht ab (fail closed).
 * Zugelassen sind nur Börsenrückzüge in den Freiverkehr: kein Tickerwechsel, keine Zusammenführung von Listings.
 */
export const CANONICAL_EVIDENCE_SCHEMA = "security-master-canonical-change-evidence-1.0.0";
const EVIDENCE_RULES = {
  // gleiches Listing, nur Börse → Freiverkehr; SEC-Liste führt die Börse noch (Liste hinkt nach)
  MOVED_TO_OTC: { cls: "MOVED_TO_OTC_SEC_EVIDENCE", needForms: [["8-K", "3.01"]], startMatchDays: null },
  // Anbieter beginnt die Reihe im Freiverkehr neu; Form 25 der Börse und 8-K mit Wirksamkeit = neuer Beginn
  PROVIDER_HISTORY_RESTARTED: { cls: "DELISTED_TO_OTC_SEC_EVIDENCE", needForms: [["8-K", "3.01"], ["25-NSE", null]], startMatchDays: 3 },
};
const EVIDENCE_KEYS = ["securityId", "ticker", "cik", "builderClass", "fromCanonicalId", "toCanonicalId", "event", "filings", "reviewedAt"];
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Register → Map securityId → Eintrag. null → null. Wirft bei jedem Formfehler. */
export function indexCanonicalEvidence(doc) {
  if (doc === null || doc === undefined) return null;
  const fail = (m) => { throw new Error(`CANONICAL_EVIDENCE_INVALID: ${m}`); };
  if (!doc || doc.schemaVersion !== CANONICAL_EVIDENCE_SCHEMA) fail(`schemaVersion ${CANONICAL_EVIDENCE_SCHEMA} erwartet`);
  if (!Array.isArray(doc.records)) fail("records[] fehlt");
  const by = new Map();
  doc.records.forEach((r, i) => {
    const bad = (m) => fail(`records[${i}] ${m}`);
    if (!r || typeof r !== "object" || Array.isArray(r)) bad("kein Objekt");
    for (const k of Object.keys(r)) if (!EVIDENCE_KEYS.includes(k)) bad(`unbekanntes Feld ${k}`);
    for (const k of EVIDENCE_KEYS) if (r[k] === undefined || r[k] === null) bad(`Pflichtfeld ${k} fehlt`);
    if (!/^ref_[A-Z0-9_]+$/.test(r.securityId) || typeof r.ticker !== "string" || !r.ticker) bad("securityId/ticker");
    if (!/^\d{10}$/.test(r.cik)) bad("cik");
    if (!EVIDENCE_RULES[r.builderClass]) bad(`builderClass ${r.builderClass} nicht zugelassen`);
    for (const k of ["fromCanonicalId", "toCanonicalId"]) if (typeof r[k] !== "string" || !/^tiingo:[^|]+:[^|]+:\d{4}-\d{2}-\d{2}$/.test(r[k])) bad(`${k} (genau eine canonical_id)`);
    if (r.fromCanonicalId.split(":")[2] !== r.ticker || r.toCanonicalId.split(":")[2] !== r.ticker) bad("canonical_id passt nicht zum Ticker (Tickerwechsel sind ausgeschlossen)");
    if (!r.event || typeof r.event.kind !== "string" || !isDay(r.event.effectiveDate)) bad("event");
    if (!isDay(r.reviewedAt)) bad("reviewedAt");
    if (!Array.isArray(r.filings) || !r.filings.length) bad("filings[] fehlt");
    r.filings.forEach((f, j) => {
      if (!f || typeof f.form !== "string" || !/^\d{10}-\d{2}-\d{6}$/.test(f.accession || "") || !isDay(f.filingDate) || !/^\d{10}$/.test(f.cik || "") || !/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\//.test(f.url || "")) bad(`filings[${j}] braucht form, accession, filingDate, cik, url (sec.gov)`);
      if (!Array.isArray(f.items)) bad(`filings[${j}].items[] fehlt`);
      if (f.form === "8-K" && (typeof f.quote !== "string" || f.quote.length < 40)) bad(`filings[${j}] 8-K ohne Zitat`);
    });
    if (by.has(r.securityId)) bad(`securityId ${r.securityId} doppelt`);
    by.set(r.securityId, r);
  });
  return by;
}

/** Wendet einen Registereintrag auf einen klassierten canonical_id-Wechsel an (rein). → {c, applied, reason} */
export function applyCanonicalEvidence(c, rec, { P, N, today, secBy, prevCik }) {
  const no = (reason) => ({ c, applied: false, reason });
  const rule = EVIDENCE_RULES[rec.builderClass];
  if (c.approvable) return no("ALREADY_APPROVABLE");
  if (c.class !== rec.builderClass) return no(`CLASS_MISMATCH:${c.class}`);
  if (c.from !== rec.fromCanonicalId || c.to !== rec.toCanonicalId) return no("CANONICAL_IDS_MISMATCH");
  if (P[0].ticker !== rec.ticker || N.some((r) => r.ticker !== rec.ticker)) return no("TICKER_MISMATCH");
  const from = P.find((r) => r.canonical_id === rec.fromCanonicalId), to = N.find((r) => r.canonical_id === rec.toCanonicalId);
  if (!from || !to || N.length !== 1) return no("ROWS_NOT_FOUND");
  if (EXCHANGE_FAMILY[String(to.exchange).toUpperCase()] !== "OTC") return no("TARGET_NOT_OTC");
  if (from.instrument_type !== to.instrument_type) return no("INSTRUMENT_TYPE_CHANGED");
  if (!prevCik || prevCik !== rec.cik) return no(`CIK_NOT_CONFIRMED_BY_COMMITTED_NAMES:${prevCik || "keine"}`);
  const s = secBy.get(String(rec.ticker).toUpperCase());
  if (s && s.cik !== rec.cik) return no(`SEC_LIST_OTHER_CIK:${s.cik}`);
  if (rec.event.effectiveDate > today) return no("EVENT_IN_FUTURE");
  if (rule.startMatchDays !== null && Math.abs(days(rec.event.effectiveDate, to.start_date)) > rule.startMatchDays) return no("START_DATE_NOT_AT_EVENT");
  for (const [form, item] of rule.needForms) {
    const f = rec.filings.find((x) => x.form === form && x.cik === rec.cik && x.filingDate <= today && (!item || x.items.includes(item)));
    if (!f) return no(`FILING_MISSING:${form}${item ? " " + item : ""}`);
  }
  const k8 = rec.filings.find((x) => x.form === "8-K" && x.items.includes("3.01"));
  const others = rec.filings.filter((x) => x !== k8).map((x) => `${x.form} ${x.accession} (${x.filingDate})`).join(", ");
  const out = { ...c, class: rule.cls, approvable: true,
    reason: `${c.reason.replace(/; SEC (widerspricht|bestätigt nicht) \(.*\)$/, "")}; SEC-Beleg derselben CIK ${rec.cik}: ${rec.event.kind} wirksam ${rec.event.effectiveDate}, 8-K ${k8.accession} (${k8.filingDate}, Item 3.01: „${k8.quote}“)${others ? `; weitere Meldungen: ${others}` : ""}${s ? `; die SEC-Tickerliste führt noch ${s.exchange} (Stand der Liste, vor dem Rückzug)` : ""}`,
    secEvidence: { cik: rec.cik, event: rec.event, filings: rec.filings.map((x) => ({ form: x.form, accession: x.accession, filingDate: x.filingDate, url: x.url })) } };
  return { c: out, applied: true, reason: null };
}

/** Kern (rein): Klassierung aller vom Gate gezählten Änderungen und Freigabeliste 1.1.0. */
export function buildApprovalList({ prevBytes, prev, next, prevNames = null, nextNames = null, baseApproval = null, sec = null, secAsOf = null, secSha256 = null, register = null, registerRef = null, runId = null, gateReport = null, acceptDuplicates = [], seriesEnd = () => null, canonicalEvidence = null, canonicalEvidenceRef = null }) {
  const today = String(next.today || next.generatedAt || "").slice(0, 10), secBy = indexSec(sec);
  const reg = new Map((register?.records || []).map((r) => [r.securityId, r]));
  const cmp = compareMasters(prev, next), a = baselineIndex(prev), b = baselineIndex(next);
  if (gateReport?.report?.counts) for (const [k, v] of Object.entries(gateReport.report.counts)) if (cmp[k] && cmp[k].length !== v) throw new Error(`Gate-Bericht passt nicht zu prev/next: ${k} ${v} ≠ ${cmp[k].length}`);
  const run = runId ? `Lauf ${runId}` : "Probelauf";
  const provSrc = `tiingo supported_tickers.csv (${run}, sm-next/us-security-master.json gegen committeten Stamm ${prev.version})`;
  const secSrc = `sec company_tickers_exchange.json (${secAsOf || "Abrufdatum unbekannt"}${secSha256 ? `, sha256 ${secSha256.slice(0, 12)}` : ""})`;
  const ev = (source, ref) => ({ source, ref });
  const evProvSec = (c) => ev(`${provSrc}; ${secSrc}`, `${c.provider} | SEC: ${c.sec.ref}`);

  const evIdx = indexCanonicalEvidence(canonicalEvidence), evUsed = new Map();
  const prevCikBy = new Map((prevNames?.rows || []).map((r) => [r.securityId, r.cik || null])), prevCikOf = (id) => prevCikBy.get(id) || null;
  const canonical = cmp.canonicalIdChanges.map((x) => {
    let c = { ...x, ...classifyCanonical(a.get(x.securityId), b.get(x.securityId), { today, secBy }) };
    const r = reg.get(x.securityId), e = evIdx && evIdx.get(x.securityId);
    if (e) {
      const res = applyCanonicalEvidence(c, e, { P: a.get(x.securityId), N: b.get(x.securityId), today, secBy, prevCik: prevCikOf(x.securityId) });
      evUsed.set(x.securityId, res); c = res.c;
    }
    if (!r) return c;
    c.form25 = { form: r.form, accession: r.accession, filingDate: r.filingDate, effectiveDate: r.effectiveDate, url: r.url };
    // SEC-Delisting-Beleg gegen eine weiterhin aktive Börsenzeile = Widerspruch (Freiverkehr ist damit vereinbar)
    const live = b.get(x.securityId).find((z) => z.active_status === "ACTIVE" && EXCHANGE_FAMILY[String(z.exchange).toUpperCase()] !== "OTC");
    if (live && c.approvable) { c.approvable = false; c.reason += `; SEC-Delisting-Beleg ${r.form} (wirksam ${r.effectiveDate}) widerspricht der aktiven Zeile an ${live.exchange}`; }
    else if (live) c.reason += `; zudem SEC-Delisting-Beleg ${r.form} (wirksam ${r.effectiveDate}) gegen die aktive Zeile an ${live.exchange}`;
    return c;
  });
  const canBy = new Map(canonical.map((c) => [c.securityId, c]));
  const deactivations = cmp.deactivations.map((x) => ({ securityId: x.securityId, from: "ACTIVE", to: "INACTIVE", ticker: x.ticker, ...classifyDeactivation(a.get(x.securityId), b.get(x.securityId), { secBy, register: reg, canonical: canBy.get(x.securityId), seriesEnd }) }));
  const deBy = new Map(deactivations.map((d) => [d.securityId, d]));
  const baseKey = (x) => `${x.securityId}|${x.from}|${x.to}`;
  const baseType = new Set((baseApproval?.instrumentTypeChanges || []).map(baseKey)), baseElig = new Set((baseApproval?.eligibilityFlips || []).map(baseKey));
  const causeOf = (id) => [canBy.get(id) && ["canonical_id", canBy.get(id)], deBy.get(id) && ["Deaktivierung", deBy.get(id)]].filter(Boolean);
  const derived = (x, base, label) => {
    if (base.has(baseKey(x))) return { ...x, class: "APPROVED_1_0_0", approvable: true, reason: "bereits freigegeben (Sonderfreigabe 1.0.0, Klassifiziererwechsel)" };
    const causes = causeOf(x.securityId);
    if (!causes.length && label === "Eignungswechsel" && x.from === true && x.to === false) {
      // mehrzeilige securityId: die geeignete Zeile ist mit unverändertem Anbieter-Enddatum über 30 Tage gealtert
      const P = a.get(x.securityId), N = b.get(x.securityId);
      const aged = P.filter((r) => r.eligible_us_equity === true).every((r) => N.some((n) => n.canonical_id === r.canonical_id && n.end_date === r.end_date && n.active_status !== "ACTIVE"));
      const sameSet = P.length === N.length && P.every((r) => N.some((n) => n.canonical_id === r.canonical_id));
      if (aged && sameSet) {
        const chk = secCheck(N.find((r) => r.eligible_us_equity === true) || null, P[0].ticker, secBy), ok = chk.status !== "CONTRADICTS";
        return { ...x, class: "ELIGIBLE_ROW_AGED_OUT", approvable: ok, reason: ok ? "geeignete Zeile einer mehrzeiligen securityId mit unverändertem Anbieter-Enddatum über 30 Tage gealtert; die securityId bleibt über eine andere (nicht geeignete) Zeile aktiv" : `SEC führt den Ticker weiter an einer Börse (${chk.ref})`,
          provider: `prev [${P.map(rowText).join("; ")}] → next [${N.map(rowText).join("; ")}]`, sec: chk };
      }
    }
    if (!causes.length) return { ...x, class: "UNEXPLAINED", approvable: false, reason: `${label} ohne zugeordnete Ursache in diesem Lauf (weder Klassifiziererliste 1.0.0 noch canonical_id-Wechsel noch Deaktivierung)` };
    const ok = causes.every(([, c]) => c.approvable);
    return { ...x, class: `CAUSED_BY:${causes.map(([k, c]) => `${k}=${c.class}`).join("+")}`, approvable: ok, reason: ok ? `Folge von ${causes.map(([k]) => k).join(" und ")} (freigabefähig)` : `Folge von ${causes.filter(([, c]) => !c.approvable).map(([k, c]) => `${k} (${c.class}, nicht freigabefähig)`).join(" und ")}`, provider: causes[0][1].provider, sec: causes[0][1].sec };
  };
  const instrumentTypeChanges = cmp.instrumentTypeChanges.map((x) => derived(x, baseType, "Typwechsel"));
  const eligibilityFlips = cmp.eligibilityFlips.map((x) => derived(x, baseElig, "Eignungswechsel"));
  const tickerChanges = cmp.tickerChanges.map((x) => ({ ...x, class: "UNREVIEWED", approvable: false, reason: "Tickerwechsel je securityId widerspricht core/identity.js (securityId aus dem Ticker); kein Freigabeweg" }));

  // G6: neue doppelte canonical_id
  const knownDup = new Set(identityFindings(prev).duplicateCanonicalIds);
  const newDup = identityFindings(next).duplicateCanonicalIds.filter((k) => !knownDup.has(k)).map((k) => {
    const rows = next.rows.filter((r) => r.canonical_id === k), prevRows = prev.rows.filter((r) => r.canonical_id === k);
    const ids = [...new Set(rows.map((r) => r.baseline_security_id).filter(Boolean))].sort().join("|");
    const identical = rows.every((r) => r.ticker === rows[0].ticker && r.exchange === rows[0].exchange && r.start_date === rows[0].start_date);
    const ends = rows.map((r) => `${r.end_date} ${r.active_status}`).join(" / ");
    return { canonicalId: k, securityId: ids, from: prevRows.length, to: rows.length, class: identical ? "PROVIDER_DUPLICATE_ROW" : "UNCLEAR_DUPLICATE", approvable: false,
      reason: `Anbieterliste führt ${rows.length} Zeilen mit identischem Ticker, Börse und Beginn (${rows[0].ticker} ${rows[0].exchange} ${rows[0].start_date}), nur das Enddatum unterscheidet sich (${ends}). Der Erzeuger hängt beide an ${ids || "keine securityId"}; damit hätte die securityId zwei Zeilen (BASELINE_MATCH_AMBIGUOUS, nicht mehr backtestfähig: weekly-real-adapter verlangt genau eine Zeile). Eine Freigabe würde diesen Fehler übernehmen; Behebung im Erzeuger (gleiche canonical_id zusammenführen) oder beim Anbieter`,
      provider: `next [${rows.map(rowText).join("; ")}] prev [${prevRows.map(rowText).join("; ")}]`, sec: secCheck(rows.find((r) => r.active_status === "ACTIVE") || null, rows[0].ticker, secBy) };
  });

  // Doppelte canonical_id ist nie automatisch freigabefähig; nur auf ausdrückliche Owner-Entscheidung (--accept-duplicate)
  for (const d of newDup) { const acc = acceptDuplicates.find((x) => x.canonicalId === d.canonicalId); if (acc) Object.assign(d, { class: `OWNER_ACCEPTED:${d.class}`, approvable: true, ownerRef: acc.ref, reason: `Owner übernimmt die Anbieter-Doppelzeile bewusst (${acc.ref}); Folgen: ${d.reason}` }); }

  // G9: Namen
  let names = [];
  if (prevNames && nextNames) {
    const nc = compareNames(prevNames, nextNames), pBy = new Map(prevNames.rows.map((r) => [r.securityId, r])), nBy = new Map(nextNames.rows.map((r) => [r.securityId, r]));
    names = nc.nameChanges.map((x) => ({ securityId: x.securityId, from: x.from, to: x.to, ...classifyName(x, pBy.get(x.securityId), nBy.get(x.securityId), secBy), nameSource: x.source }));
  }

  const pickEntry = (x, evidence) => ({ securityId: x.securityId, from: x.from, to: x.to, evidence, class: x.class });
  const baseEv = ev("docs/data/security-master/v130-approved-changes.json (security-master-approved-changes-1.0.0, Owner P1/P3 28.10.2026)", "docs/data/security-master/v130-switch-evidence.json");
  const derivedEv = (x) => x.class === "APPROVED_1_0_0" ? baseEv : ev(`${provSrc}; ${secSrc}`, `${x.reason} | ${x.provider || ""} | SEC: ${x.sec?.ref ?? "–"}`);
  const approval = {
    schema: APPROVED_CHANGES_SCHEMA_V11,
    purpose: "AUFHOLLAUF 1.1.0 → 1.3.0: exakt abgegrenzte, quellengebundene Freigabeliste (Owner-Entscheidung 30.10.2026); Entwurf bis zur gesonderten Owner-Freigabe",
    generatedBy: `scripts/market/build-security-master-approval-list.mjs (${BUILDER_VERSION})`,
    fromVersion: prev.version, toVersion: next.version, prevMasterSha256: sha256(prevBytes),
    sourceRun: { runId, nextGeneratedAt: next.generatedAt, today, secAsOf, secSha256, delistingRegister: registerRef, ...(evIdx ? { canonicalEvidence: { ref: canonicalEvidenceRef, records: evIdx.size, applied: [...evUsed].filter(([, v]) => v.applied).map(([k]) => k).sort(), notApplied: [...evIdx.keys()].filter((k) => !(evUsed.get(k) || {}).applied).sort().map((k) => ({ securityId: k, reason: evUsed.has(k) ? evUsed.get(k).reason : "NO_CANONICAL_CHANGE_IN_RUN" })) } } : {}) },
    instrumentTypeChanges: instrumentTypeChanges.filter((x) => x.approvable).map((x) => pickEntry(x, derivedEv(x))),
    eligibilityFlips: eligibilityFlips.filter((x) => x.approvable).map((x) => pickEntry(x, derivedEv(x))),
    deactivations: deactivations.filter((x) => x.approvable).map((x) => pickEntry(x, x.form25 ? ev(`${provSrc}; ${secSrc}; SEC ${x.form25.form} (${registerRef || "Delisting-Register"})`, `${x.provider} | SEC: ${x.sec.ref} | ${x.form25.form} ${x.form25.accession} eingereicht ${x.form25.filingDate}, wirksam ${x.form25.effectiveDate}: ${x.form25.url}`) : evProvSec(x))),
    canonicalIdChanges: canonical.filter((x) => x.approvable).map((x) => pickEntry(x, x.secEvidence ? ev(`${provSrc}; ${secSrc}; SEC-Belegregister ${canonicalEvidenceRef || "(ohne Fundstelle)"}`, `${x.reason} | ${x.provider} | ${x.secEvidence.filings.map((f) => `${f.form} ${f.accession}: ${f.url}`).join(" ; ")}`) : x.form25 ? ev(`${provSrc}; ${secSrc}; SEC ${x.form25.form} (${registerRef || "Delisting-Register"})`, `${x.provider} | SEC: ${x.sec.ref} | ${x.form25.form} ${x.form25.accession} eingereicht ${x.form25.filingDate}, wirksam ${x.form25.effectiveDate}: ${x.form25.url}`) : evProvSec(x))),
    tickerChanges: [],
    newDuplicateCanonicalIds: newDup.filter((x) => x.approvable).map((x) => ({ canonicalId: x.canonicalId, securityId: x.securityId, from: x.from, to: x.to, evidence: ev(`Owner-Entscheidung (--accept-duplicate); ${provSrc}`, `${x.ownerRef} | ${x.provider}`), class: x.class })),
    nameChanges: names.filter((x) => x.approvable).map((x) => pickEntry(x, ev(x.class === "RENAMED_SAME_CIK_PROVIDER" ? `quant/data/market/security-master/company-names.json (${run}), Quelle ${x.nameSource}; ${secSrc}` : `${secSrc}; company-names.json (${run})`, `${x.reason} | SEC: ${x.sec}`))),
  };
  const all = { instrumentTypeChanges, eligibilityFlips, deactivations, canonicalIdChanges: canonical, tickerChanges, newDuplicateCanonicalIds: newDup, nameChanges: names };
  const counts = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { total: v.length, approvable: v.filter((x) => x.approvable).length, notApprovable: v.filter((x) => !x.approvable).length,
    byClass: v.reduce((m, x) => { const c = String(x.class).replace(/^CAUSED_BY:.*/, (s) => s.split("=")[0] + "=" + (x.approvable ? "freigabefähig" : "nicht")); m[c] = (m[c] || 0) + 1; return m; }, {}) }]));
  approval.counts = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, { total: v.total, approved: v.approvable, notApproved: v.notApprovable }]));
  return { approval, classification: { version: BUILDER_VERSION, today, counts, items: all } };
}

const esc = (s) => String(s ?? "–").replace(/\|/g, "\\|").replace(/\n/g, " ");
/** Prüftabellen: alle nicht freigabefähigen Einträge vollständig, freigabefähige je Klasse als Stichprobe. */
export function listsMarkdown(classification, { sample = 8 } = {}) {
  const L = [];
  const titles = { canonicalIdChanges: "canonical_id-Wechsel", deactivations: "Deaktivierungen (aktiv → inaktiv)", eligibilityFlips: "Eignungswechsel", instrumentTypeChanges: "Instrumenttyp-Wechsel", newDuplicateCanonicalIds: "Neue doppelte canonical_id (G6)", nameChanges: "Namenswechsel (G9)", tickerChanges: "Tickerwechsel je securityId" };
  for (const [k, title] of Object.entries(titles)) {
    const v = classification.items[k], c = classification.counts[k];
    L.push(`### ${title}: ${c.total} gesamt, ${c.approvable} freigabefähig, ${c.notApprovable} nicht freigabefähig`, "");
    if (!v.length) { L.push("Keine.", ""); continue; }
    L.push("| Klasse | Anzahl |", "|---|---:|", ...Object.entries(c.byClass).sort((x, y) => y[1] - x[1]).map(([cl, n]) => `| ${esc(cl)} | ${n} |`), "");
    const no = v.filter((x) => !x.approvable);
    if (no.length) {
      L.push(`**Nicht freigabefähig (vollständig, ${no.length}):**`, "", "| securityId | von | nach | Klasse | Grund |", "|---|---|---|---|---|");
      for (const x of no) L.push(`| ${esc(x.securityId || x.canonicalId)} | ${esc(x.from)} | ${esc(x.to)} | ${esc(x.class)} | ${esc(x.reason)} |`);
      L.push("");
    }
    const yes = v.filter((x) => x.approvable && x.class !== "APPROVED_1_0_0");
    if (yes.length) {
      const byC = new Map(); for (const x of yes) { if (!byC.has(x.class)) byC.set(x.class, []); byC.get(x.class).push(x); }
      L.push(`**Freigabefähig (Stichprobe je Klasse, höchstens ${sample}; vollständig in der Freigabedatei):**`, "", "| securityId | von | nach | Klasse | Beleg |", "|---|---|---|---|---|");
      for (const [, xs] of byC) for (const x of xs.slice(0, sample)) L.push(`| ${esc(x.securityId)} | ${esc(x.from)} | ${esc(x.to)} | ${esc(x.class)} | ${esc(x.provider ? `${x.provider} · SEC: ${x.sec?.ref ?? x.sec}` : `${x.reason} · SEC: ${x.sec?.ref ?? x.sec}`)} |`);
      L.push("");
    }
  }
  return L.join("\n");
}

function main() {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const need = ["--prev", "--next", "--out"].filter((k) => !arg(k));
  if (need.length) { console.error(`fehlt: ${need.join(", ")}`); process.exit(2); }
  const J = (p) => JSON.parse(readFileSync(p, "utf8")), opt = (k) => (arg(k) && existsSync(arg(k)) ? J(arg(k)) : null);
  const prevBytes = readFileSync(join(arg("--prev"), "us-security-master.json")), next = J(join(arg("--next"), "us-security-master.json"));
  const recPath = join(arg("--next"), "reconciliation.json"), rec = existsSync(recPath) ? J(recPath) : null;
  const secBytes = arg("--sec") ? readFileSync(arg("--sec")) : null;
  const res = buildApprovalList({
    prevBytes, prev: JSON.parse(prevBytes.toString("utf8")), next, prevNames: opt("--prev-names"), nextNames: opt("--next-names"), baseApproval: opt("--base-approval"),
    sec: secBytes && JSON.parse(secBytes.toString("utf8")), secAsOf: arg("--sec-as-of"), secSha256: secBytes && sha256(secBytes),
    register: opt("--delisting-register"), registerRef: arg("--delisting-register-ref"), runId: rec?.run?.runId ?? null, gateReport: opt("--gate-report"),
    seriesEnd: (id) => { const p = join(arg("--series-dir") || join(ROOT, "quant/data/market/discover-series"), `${id}.json`); try { const s = existsSync(p) ? J(p) : null; return s && typeof s.to === "string" ? s.to.slice(0, 10) : null; } catch { return null; } },
    ...(() => {
      const f = arg("--canonical-evidence");
      if (!f) return {};
      if (!existsSync(f)) throw new Error(`Belegregister fehlt: ${f}`);
      const bytes = readFileSync(f);
      return { canonicalEvidence: JSON.parse(bytes.toString("utf8")), canonicalEvidenceRef: `${f.startsWith(ROOT + "/") ? f.slice(ROOT.length + 1) : f} sha256 ${sha256(bytes)}` };
    })(),
    acceptDuplicates: arg("--accept-duplicate") ? [{ canonicalId: arg("--accept-duplicate"), ref: arg("--accept-duplicate-ref") || "Owner-Freigabe ohne Fundstelle" }] : [],
  });
  writeFileSync(arg("--out"), JSON.stringify(res.approval, null, 2) + "\n");
  if (arg("--classification-out")) writeFileSync(arg("--classification-out"), JSON.stringify(res.classification, null, 2) + "\n");
  if (arg("--markdown-out")) writeFileSync(arg("--markdown-out"), listsMarkdown(res.classification) + "\n");
  for (const [k, v] of Object.entries(res.classification.counts)) console.log(`${k}: ${v.total} gesamt, ${v.approvable} freigabefähig, ${v.notApprovable} nicht · ${JSON.stringify(v.byClass)}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
