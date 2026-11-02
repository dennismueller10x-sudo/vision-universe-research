#!/usr/bin/env node
// Survivorship im oeffentlichen Rahmen: was sich ohne privates Archiv belegen laesst (survivorship-public-frame-1.0.0). Nur Research.
//
// P3.1 (survivorship-sensitivity.cjs) misst den Effekt delisteter Titel erst mit den privaten Reihen. Dieser Bericht
// misst vorher, wie gross die Luecke im oeffentlichen Rahmen ist:
//   A. Rahmen     V10_LIFECYCLE (oeffentlich, Identitaets-, Kapitalmassnahmen- und Lebenszyklus-Evidenz): Listings mit
//                 Lebenszyklus-Nachweis, davon beendet (lastTradeDate), nach Kategorie.
//   B. Bestand    oeffentliche Metadaten ohne Reihen: Delisting-Register V13 (docs/quant-recovery/v13/delisted/register-1.0.0.json,
//                 Zaehlung je Status und Endjahr-Bucket), Rahmenumfang F1 laut research-population.cjs REFERENCES und
//                 quant/data/product/survivorship-control-v1.json (Inventar des privaten Abrufs, nur Zaehlungen).
//   C. Ereignisse dieselbe Mustervorlage wie P4.1 (Kursrendite, unveraenderte Engine runPatternStudy) auf zwei Schichten:
//                 alle beendeten Listings des Rahmens (Vollerhebung) und eine Stichprobe der uebrigen (sha256(seed:id),
//                 Standard 1000). Gezaehlt: Ereignisse, Zustaende, Zensurquote, Ereignisse mit Listing-Ende nach dem
//                 Signal (irgendwann bzw. innerhalb des Horizonts) und die Hochrechnung auf den Rahmen.
//                 Die Engine laeuft in Bloecken zu 100 Listings (Werkbudget); Kontrollen vom selben Datum werden deshalb
//                 nicht ausgewertet (matchedExcess fehlt bewusst).
// Keine Ereigniszeilen, keine Kurse, keine Titelnamen im Bericht. Kein Gate-Eingang (survivorship bleibt unverdrahtet, FV-5).
//
//   node scripts/quant/research/survivorship-public-frame.mjs --out <bericht.json> [--limit N|all] [--seed text]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as PTR from "./pattern-total-return.mjs";
import { hashOrder } from "./pattern-total-return-population.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const R = require("./backtest-runner.cjs");
const S = require("../../../quant/engines/research-studies.cjs");

export const VERSION = "survivorship-public-frame-1.0.0";
export const PROFILE = "V10_LIFECYCLE";
export const DEFAULT_SEED = "p31-public-frame-1";
export const DEFAULT_LIMIT = 1000;
export const CHUNK = 100;
export const REGISTER = "docs/quant-recovery/v13/delisted/register-1.0.0.json";
export const INVENTORY = "quant/data/product/survivorship-control-v1.json";
const GENERATED = ["quant/data", "discover/data", "supertrader/data", "social/data"];

const fail = (code, detail) => { const e = new Error(code + (detail !== undefined ? ":" + detail : "")); e.code = code; throw e; };
const sha = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : R.canonical(x)).digest("hex");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const share = (a, b) => (b ? a / b : null);

/** Ende eines Listings laut Lebenszyklus (nur belegte Enden). */
export const endOf = (doc) => (doc.listingLifecycle && doc.listingLifecycle.lastTradeDate) || null;

/** Ereignisse einer Schicht, in Bloecken (Werkbudget der Engine). runStudy(input) -> windowed Ergebnis. */
export function stratumEvents({ spec, calendar, ids, docOf, runStudy, chunk = CHUNK }) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const listings = ids.slice(i, i + chunk).map((id) => PTR.engineListing(id, { ...docOf(id), points: docOf(id).points.filter((p) => p[0] <= spec.asOf) }, null));
    const res = runStudy(PTR.studyInput(spec, calendar, listings, "PRICE_RETURN"));
    for (const e of res.events) out.push({ issuerId: e.issuerId, signalDate: e.signalDate, expectedExitDate: e.expectedExitDate, state: e.state, reasons: e.reasons || [], netReturn: e.netReturn });
  }
  return out;
}

/** Kennzahlen einer Schicht. endById: Map(id -> lastTradeDate|null). */
export function stratumSummary(events, titles, endById) {
  const states = {}, reasons = {};
  for (const e of events) { states[e.state] = (states[e.state] || 0) + 1; if (e.state === "CENSORED") for (const r of e.reasons) reasons[r] = (reasons[r] || 0) + 1; }
  const decided = events.filter((e) => e.state === "OBSERVED" || e.state === "CENSORED");
  const endAfter = events.filter((e) => { const end = endById.get(e.issuerId); return end && end >= e.signalDate; });
  const endWithin = endAfter.filter((e) => endById.get(e.issuerId) < e.expectedExitDate);
  const withEvents = new Set(events.map((e) => e.issuerId));
  const endedAfterSignalTitles = new Set(endAfter.map((e) => e.issuerId));
  const obs = events.filter((e) => e.state === "OBSERVED").map((e) => e.netReturn);
  return {
    titles, titlesWithEvents: withEvents.size, events: events.length, states, censoredReasons: reasons,
    censoringRate: share(states.CENSORED || 0, decided.length),
    eventsWithListingEndAfterSignal: endAfter.length, eventsWithListingEndWithinHorizon: endWithin.length,
    censoredAmongEndWithinHorizon: endWithin.filter((e) => e.state === "CENSORED").length,
    titlesWithListingEndAfterASignal: endedAfterSignalTitles.size, shareOfTitlesWithEvents: share(endedAfterSignalTitles.size, withEvents.size),
    observedMeanNetReturn: mean(obs), observedN: obs.length
  };
}

/** Oeffentliche Bestandszahlen ohne Reihen. */
export function publicInventory({ register, inventory, references, window }) {
  const fromY = +window.from.slice(0, 4), toY = +window.to.slice(0, 4);
  const overlaps = (bucket) => { if (!bucket) return false; const [a, b] = bucket.split("-").map(Number); return b >= fromY && a <= toY; };
  const col = (name) => register.columns.indexOf(name);
  const st = col("status"), endB = col("endYearBucket");
  const qualifiedEndInWindow = register.rows.filter((r) => r[st] === "QUALIFIED" && overlaps(r[endB])).length;
  const inv = inventory && inventory.delisted ? inventory.delisted : null;
  return {
    register: { file: REGISTER, schemaVersion: register.schemaVersion, endedChains: register.rows.length, byStatus: register.counts, qualifiedWithEndBucketOverlappingWindow: qualifiedEndInWindow, seriesPublic: false },
    framesByReference: references,
    privateFetchInventory: inv ? { file: INVENTORY, asOf: inv.asOf, delistedListings: inv.delistedListings, usableForStudy: inv.usableForStudy, totalReturnConfirmed: inv.totalReturn && inv.totalReturn.TOTAL_RETURN_CONFIRMED, window: inv.window && inv.window.from, seriesPublic: false } : null
  };
}

/**
 * Kern. frame { ids, calendar, docOf }; runStudy(input) -> windowed Ergebnis; register/inventory/references wie oben;
 * privateState: Verfuegbarkeit des Profils mit delisteten Reihen.
 */
export function computeSurvivorship({ spec, frame, runStudy, register, inventory, references, privateState, seed = DEFAULT_SEED, limit = DEFAULT_LIMIT }) {
  const docs = new Map(frame.ids.map((id) => [id, frame.docOf(id)]));
  const endById = new Map(frame.ids.map((id) => [id, endOf(docs.get(id))]));
  const withLifecycle = frame.ids.filter((id) => docs.get(id).listingLifecycle).length;
  const ended = frame.ids.filter((id) => endById.get(id)).sort();
  const survivors = frame.ids.filter((id) => !endById.get(id));
  const sample = limit === "all" ? hashOrder(survivors, seed) : hashOrder(survivors, seed).slice(0, limit);
  const byCategory = {};
  for (const id of ended) { const lc = docs.get(id).listingLifecycle, k = (lc.status || "UNKNOWN") + "|" + (lc.category || "UNKNOWN"); byCategory[k] = (byCategory[k] || 0) + 1; }
  const endedInWindow = ended.filter((id) => endById.get(id) >= spec.window.from && endById.get(id) <= spec.window.to).length;
  const evEnded = stratumEvents({ spec, calendar: frame.calendar, ids: ended, docOf: (id) => docs.get(id), runStudy });
  const evSample = stratumEvents({ spec, calendar: frame.calendar, ids: sample, docOf: (id) => docs.get(id), runStudy });
  const sEnded = stratumSummary(evEnded, ended.length, endById), sSample = stratumSummary(evSample, sample.length, endById);
  const weight = sample.length ? survivors.length / sample.length : null;
  const estSurvivorEvents = weight === null ? null : sSample.events * weight;
  const estCensored = weight === null ? null : (sEnded.states.CENSORED || 0) + (sSample.states.CENSORED || 0) * weight;
  const estDecided = weight === null ? null : ((sEnded.states.OBSERVED || 0) + (sEnded.states.CENSORED || 0)) + ((sSample.states.OBSERVED || 0) + (sSample.states.CENSORED || 0)) * weight;
  const inv = publicInventory({ register, inventory, references, window: spec.window });
  const f1 = references && references.V13_DELISTED_F1 ? references.V13_DELISTED_F1.frame : null, f0 = references && references.V10_LIFECYCLE ? references.V10_LIFECYCLE.frame : null;
  const body = {
    schemaVersion: VERSION, evidenceKind: "RESEARCH_SURVIVORSHIP_PUBLIC_FRAME", certification: "NOT_CERTIFIED", productionApproved: false, gateInput: false, claim: "NO_ALPHA_OR_CERTIFICATION_CLAIM",
    template: spec.id, window: spec.window, asOf: spec.asOf, pattern: { id: spec.engine.pattern.id, version: spec.engine.pattern.version }, horizonBars: spec.engine.horizonBars, cooldownBars: spec.engine.cooldownBars, returnBasis: "PRICE_RETURN",
    contracts: { engine: S.VERSION, runner: R.VERSION, base: PTR.VERSION },
    frame: { profile: PROFILE, listings: frame.ids.length, withLifecycleEvidence: withLifecycle, endedListings: ended.length, endedShare: share(ended.length, frame.ids.length), endedInWindow, endedByStatusAndCategory: Object.fromEntries(Object.keys(byCategory).sort().map((k) => [k, byCategory[k]])) },
    publicInventory: inv,
    gap: {
      publicFrameEndedVsQualifiedRegister: { publicEnded: ended.length, registerQualified: register.counts.QUALIFIED, share: share(ended.length, register.counts.QUALIFIED) },
      publicFrameEndedVsPrivateUsable: inv.privateFetchInventory ? { publicEnded: ended.length, privateUsable: inv.privateFetchInventory.usableForStudy, share: share(ended.length, inv.privateFetchInventory.usableForStudy) } : null,
      frameGrowthWithDelistedF1: f0 && f1 ? { f0, f1, addedListings: f1 - f0, addedShareOfF1: share(f1 - f0, f1) } : null,
      privateProfile: privateState
    },
    events: {
      design: { strata: "beendete Listings des Rahmens (Vollerhebung) + Stichprobe der uebrigen", selection: "sha256(seed + ':' + securityId) aufsteigend", seed, limit, chunk: CHUNK, survivorWeight: weight },
      ended: sEnded, survivorSample: sSample,
      frameEstimate: weight === null ? null : {
        events: sEnded.events + estSurvivorEvents, shareFromEndedListings: share(sEnded.events, sEnded.events + estSurvivorEvents),
        shareWithListingEndAfterSignal: share(sEnded.eventsWithListingEndAfterSignal, sEnded.events + estSurvivorEvents),
        shareWithListingEndWithinHorizon: share(sEnded.eventsWithListingEndWithinHorizon, sEnded.events + estSurvivorEvents),
        censoringRate: share(estCensored, estDecided), rule: "beendete Listings voll, uebrige mit Gewicht Rahmen/Stichprobe"
      }
    },
    reading: "Der oeffentliche Rahmen ist fast ein reiner Ueberlebenden-Rahmen: Delistete Titel stehen nur als Zaehlung in Registern, ihre Reihen sind privat. Die Zensurquote misst nur, was im Rahmen endet, nicht den Ueberlebenden-Effekt. Der Effekt selbst braucht P3.1 mit den privaten Reihen (Ablauf R2, Freigabe FV-5)."
  };
  return { ...body, reportHash: sha(body) };
}

function parse(argv) {
  const o = {};
  const flags = { "--out": "out", "--limit": "limit", "--seed": "seed" };
  for (let i = 0; i < argv.length; i++) { const k = flags[argv[i]]; if (!k || !argv[i + 1] || o[k] !== undefined) fail("INVALID_ARGUMENTS", argv[i]); o[k] = argv[++i]; }
  if (!o.out) fail("OUT_REQUIRED");
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith("..") && GENERATED.some((g) => rel === g || rel.startsWith(g + path.sep))) fail("OUT_INSIDE_GENERATED_DATA", rel);
  if (o.limit !== undefined && o.limit !== "all" && !(/^\d+$/.test(o.limit) && +o.limit > 0)) fail("INVALID_LIMIT", o.limit);
  return o;
}

export function main(argv = process.argv.slice(2), io = { log: (s) => console.log(s) }) {
  const o = parse(argv);
  const spec = PTR.specFor({ tickers: "_" });
  const Pop = require("./research-population.cjs");
  const pop = Pop.buildPopulation({ profile: PROFILE });
  const frame = { ids: [...pop.listings.keys()].sort(), calendar: pop.calendar.filter((d) => d <= spec.asOf), docOf: (id) => pop.listings.get(id) };
  const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
  const refs = Object.fromEntries(Object.entries(Pop.REFERENCES || {}).map(([k, v]) => [k, { frame: v.frame, source: v.source }]));
  const av = Pop.availability("V13_DELISTED_F1", {});
  const rep = computeSurvivorship({ spec, frame, runStudy: (input) => R.windowed(S.runPatternStudy(input), spec.window, S), register: read(REGISTER),
    inventory: fs.existsSync(path.join(ROOT, INVENTORY)) ? read(INVENTORY) : null, references: refs,
    privateState: { profile: av.profile, status: av.status }, seed: o.seed || DEFAULT_SEED, limit: o.limit === "all" ? "all" : o.limit ? +o.limit : DEFAULT_LIMIT });
  const tmp = o.out + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(rep, null, 1) + "\n"); fs.renameSync(tmp, o.out);
  io.log("[survivorship-public-frame] Rahmen " + rep.frame.listings + ", beendet " + rep.frame.endedListings + ", Ereignisse beendet/Stichprobe " + rep.events.ended.events + "/" + rep.events.survivorSample.events + " · " + o.out);
  return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
