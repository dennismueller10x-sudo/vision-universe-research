#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — build-security-master-delisting-evidence.mjs

   Baut das SEC-Delisting-Register, das scripts/market/build-us-security-master.mjs
   als Eingabe liest (quant/config/security-master-delisting-evidence.json,
   Schema quant/engines/us-security-master.js#DELISTING_EVIDENCE_SCHEMA).

   Quelle: V10-Lebenszyklusfaelle. Einreichungs-Metadaten sind nur
   Kandidaten, niemals ein Klassenbeleg. Jeder spaetere Tages-/Wochenkurs
   blockiert INACTIVE (auch konstante Kurse). Fortfuehrung, Nachfolger,
   Klassen- oder Datumszweifel bleiben als Befund erhalten. Auswahl und
   Verbraucher muessen beide fail closed arbeiten.

   Ausfuehren:
     node scripts/market/build-security-master-delisting-evidence.mjs \
       --from <lifecycle-cases.json> [--source-ref <git-ref:pfad>] [--out <datei>]
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Master = require(join(root, "quant", "engines", "us-security-master.js"));
const Identity = require(join(root, "core", "identity.js"));

export const BUILDER_VERSION = "security-master-delisting-evidence-builder-1.1.0";

function addDays(date, n) {
  const d = new Date(Date.parse(date + "T00:00:00Z"));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function secIndexUrl(cik, accession) {
  if (!cik || !accession) return null;
  return "https://www.sec.gov/Archives/edgar/data/" + String(Number(cik)) + "/" + accession.replace(/-/g, "") + "/";
}

/** Abgeschlossene Delisting-Belege eines Falls, fruehester Wirksamkeitstag zuerst. */
export function completedDelistingEvidence(c) {
  const forms = c.forms || {};
  const held = (c.secTickersNow || []).includes(c.ticker);
  const out = [];
  for (const k of forms.k8_201_301 || []) {
    const items = String(k.items || "").split(",").map((x) => x.trim());
    if (items.includes("2.01") && items.includes("3.01")) {
      out.push({ form: "8-K_2.01+3.01", accession: k.accession, filingDate: k.filingDate, items: k.items });
    }
  }
  if (!held) {
    for (const f of forms.delisting || []) {
      if (f.form === "25" || f.form === "25-NSE") out.push({ form: "FORM_" + f.form, accession: f.accession, filingDate: f.filingDate });
    }
  }
  for (const e of out) e.effectiveDate = addDays(e.filingDate, Master.DELISTING_FORMS[e.form]);
  out.sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : a.accession < b.accession ? -1 : 1));
  return out;
}

/** Ein Fall -> {record} oder {reason}. */
export function selectCase(c) {
  if ((c.notes || []).includes("LIFECYCLE_SOURCE_CONFLICT")) return { reason: "LIFECYCLE_SOURCE_CONFLICT" };
  if (typeof c.ticker !== "string" || Identity.securityIdForTicker(c.ticker) !== c.securityId) return { reason: "IDENTITY_NOT_CANONICAL" };
  const ev = completedDelistingEvidence(c);
  if (!ev.length) return { reason: "NO_COMPLETED_DELISTING_EVIDENCE" };
  const first = ev[0];
  // A constant vendor tail is still a price observation. Never explain it away.
  const tails = [c.dailyTail, c.weeklyTail].filter(Boolean);
  if (tails.some(t => t.to > first.effectiveDate)) return { reason: "PRICE_AFTER_DELISTING" };
  if ((c.secTickersNow || []).length || c.terminal?.acquirerTicker || c.terminal?.stockRatio) {
    return { reason: "LISTING_CONTINUATION_OR_SUCCESSOR" };
  }
  // Item numbers and issuer CIK do not identify the affected security class,
  // completion date, or whether the filing merely moves an exchange listing.
  const scoped = (c.sources || []).find(s => s.accession === first.accession &&
    s.securityId === c.securityId && s.ticker === c.ticker &&
    s.event === "TERMINAL_DELISTING" && s.effectiveDate === first.effectiveDate &&
    s.successor === null && s.exchangeTransfer === false && s.classTitle && s.sha256 && s.url);
  if (!scoped) return { reason: "SECURITY_CLASS_AND_EFFECTIVE_DATE_UNVERIFIED" };
  const tail = c.dailyTail;
  if (!tail || !(tail.run >= Master.FROZEN_MIN_RUN)) return { reason: "SERIES_NOT_FROZEN" };
  if (tail.since > first.effectiveDate || tail.since > tail.to) return { reason: "SERIES_DATE_CONFLICT" };
  const source = (c.sources || []).find((s) => s.accession === first.accession);
  return {
    record: {
      ticker: c.ticker,
      securityId: c.securityId,
      cik: c.cik || null,
      issuer: c.issuer || null,
      form: first.form,
      accession: first.accession,
      filingDate: first.filingDate,
      effectiveDate: first.effectiveDate,
      url: (source && source.url) || secIndexUrl(c.cik, first.accession),
      frozenSince: tail.since,
      frozenRun: tail.run,
      frozenThrough: tail.to,
      corroboratingEvidence: ev.slice(1).map((e) => ({ form: e.form, accession: e.accession, filingDate: e.filingDate }))
    }
  };
}

export function buildRegister(cases, sourceMeta) {
  const records = [], rejected = {}, findings = [];
  for (const c of cases) {
    const r = selectCase(c);
    if (r.record) records.push(r.record);
    else { rejected[r.reason] = (rejected[r.reason] || 0) + 1;
      if (completedDelistingEvidence(c).length) findings.push({ ticker: c.ticker, reason: r.reason });
    }
  }
  records.sort((a, b) => (a.ticker < b.ticker ? -1 : 1));
  const doc = {
    schemaVersion: Master.DELISTING_EVIDENCE_SCHEMA,
    generatedBy: "scripts/market/build-security-master-delisting-evidence.mjs (" + BUILDER_VERSION + ")",
    consumer: "scripts/market/build-us-security-master.mjs -> quant/engines/us-security-master.js#indexDelistingEvidence",
    effect: "Nur ACTIVE/UNKNOWN -> INACTIVE, nie umgekehrt; nur Zeilen desselben Tickers mit Anbieter-startDate <= effectiveDate; erst ab effectiveDate.",
    rule: {
      candidatesOnly: "8-K mit Item 2.01 UND 3.01 (wirksam am Einreichungstag) oder Form 25/25-NSE (wirksam 10 Tage nach Einreichung, 17 CFR 240.12d2-2(d)(1)), Form 25 nur wenn die SEC den Ticker beim Abruf nicht mehr dem Emittenten zuordnet. Item 3.01 allein, Form 15 allein und Prospekte zaehlen nicht.",
      blocking: "Jeder Tages- oder Wochenkurs nach effectiveDate blockiert INACTIVE, auch bei konstantem Schluss. Klassenbezug, Datum und Ende ohne Nachfolger muessen im Beleg explizit bestaetigt sein; Boersen-/Tickerwechsel und Nachfolger bleiben ACTIVE mit Befund.",
      series: "Tagesreihe endet mit >= " + Master.FROZEN_MIN_RUN + " gleichen Schluessen; Endlauf beginnt spaetestens " + Master.FROZEN_GRACE_DAYS + " Tage nach dem Wirksamkeitstag des fruehesten Belegs.",
      excluded: "Faelle mit LIFECYCLE_SOURCE_CONFLICT; securityId nicht core/identity.js-konform."
    },
    source: sourceMeta,
    counts: { cases: cases.length, records: records.length, rejectedByReason: Object.fromEntries(Object.entries(rejected).sort()) },
    findings: findings.sort((a,b) => a.ticker.localeCompare(b.ticker)),
    records
  };
  Master.indexDelistingEvidence(doc); // dieselbe Pruefung wie im Erzeuger
  return doc;
}

function arg(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

function main() {
  const argv = process.argv.slice(2);
  const from = arg(argv, "--from");
  if (!from) { console.error("--from <lifecycle-cases.json> fehlt"); process.exit(2); }
  const out = resolve(arg(argv, "--out", join(root, "quant", "config", "security-master-delisting-evidence.json")));
  const bytes = readFileSync(from);
  const src = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(src.cases)) { console.error("Quelle ohne cases[]"); process.exit(2); }
  const doc = buildRegister(src.cases, {
    file: arg(argv, "--source-ref", "docs/quant-recovery/v10/population/lifecycle-cases.json"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    schemaVersion: src.schemaVersion || null,
    generatedAt: src.generatedAt || null,
    protocolSha256: src.protocolSha256 || null,
    secTickersNowNote: "secTickersNow ist der SEC-Tickerstand zum Abrufzeitpunkt der Quelle."
  });
  writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
  console.log(`${doc.counts.records} Eintraege aus ${doc.counts.cases} Faellen -> ${out}`);
  console.log("Ausgeschlossen: " + JSON.stringify(doc.counts.rejectedByReason));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
