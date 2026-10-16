/* Tageskurse fuer Backtest-Auswertungen - nur zur Laufzeit, nie im Artefakt.

   Quelle in dieser Reihenfolge:
     1. --work-dir DIR/tiingo/daily/<securityId>.json   kanonische Historie (runner-privat)
        -> SPLIT_ADJUSTED (Marken) und TOTAL_RETURN (Ergebnis, kanonisch rekonstruiert)
     2. quant/data/market/golden-preview/daily/<securityId>.json   (oeffentliche Vorschau, fuenf Titel)
     3. quant/data/market/discover-series/<securityId>.json   (oeffentlich, 1 Jahr, nur splitbereinigt)
   Jede Rueckgabe nennt ihre Quelle und ob Gesamtrendite vorliegt; eine
   Auswertung mischt nie zwei Renditebasen. */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const Canonical = require(join(ROOT, "quant/engines/technical/canonical-bars.js"));
const MarketQuality = require(join(ROOT, "quant/engines/market-quality.js"));
const CanonicalTR = require(join(ROOT, "quant/engines/canonical-total-return.js"));
const SurvivorshipControl = require(join(ROOT, "quant/engines/survivorship-control.js"));
const PriceValidity = require(join(ROOT, "quant/engines/canonical-price-validity.js"));

/* Gesamtrendite ist ab canonical-total-return-1.0.0 (Owner-Entscheidung
   03.10.2026) eine EIGENE Rekonstruktion aus Rohkurs, Splitfaktor und
   Bardividende (quant/engines/canonical-total-return.js). Die bereinigte
   Spalte des Anbieters ist nur noch Gegenprobe.

   tr            kanonische Gesamtrendite oder null (fail closed)
   trVerdict     {confirmed, state, reason, bucket, contract, lastGap}
                 - das Urteil der Rekonstruktion
   providerTr    Anbieterspalte, NUR wenn ihr alter Vertrag bestanden ist
                 (fuer den Vergleich PROVIDER_ADJUSTED_RETURN, nie Quelle)
   providerVerdict  der alte Vertrag (market-quality.js totalReturnVerdict)
   legacyTotalReturn  ganz alte Regel (jede Bar hat adjustedClose), Vorher-Messung

   opts.identity ist Pflicht fuer eine Gesamtrendite: ohne bestaetigte
   Listing-Identitaet gibt es keine (IDENTITY_UNCERTAIN). opts.role
   BENCHMARK_REFERENCE fuer SPY - dieselbe Engine, keine Sondermethodik.

   TEILREIHEN (canonical-price-validity-2.1.0, Review R8) - NUR auf Anforderung
   fromBarsPartial(payload, opts): lehnt die Rekonstruktion die Reihe ab einem
   bestimmten Tag ab (Sperre, Datenwiderspruch, Luecke), bleiben die gueltigen
   Kerzen davor erhalten: tr traegt Werte bis trValidUntil und NaN danach (und an
   einzelnen ungueltigen Kerzen), trCoverage "PREFIX". fromBars bleibt
   wie bisher (ganze Reihe oder null): die Studien uebernehmen Teilreihen
   erst in einem eigenen PR mit Vorher/Nachher (CLAUDE.md, Review F07/F08).
   Ganz ohne Gesamtrendite bleibt es bei fehlender Identitaet, einer veralteten
   Reihe (opts.asOf/maxStaleDays, unabhaengig vom Grund der Ablehnung geprueft)
   und fuer BENCHMARK_REFERENCE. opts.secEvents / opts.shares geben unabhaengige
   Corporate-Action-Belege mit (SEC). */
const WHOLE_SERIES_ONLY = new Set(["IDENTITY_UNCERTAIN", "NO_BARS", "STALE"]);
function partialSeries(sorted, dates, ctr, opts) {
  if (opts.role === "BENCHMARK_REFERENCE") return null;
  if (ctr.reconstructed && !Array.isArray(opts.secEvents)) return null;
  if (!ctr.reconstructed && WHOLE_SERIES_ONLY.has(ctr.reason)) return null;
  if (opts.asOf && Number.isFinite(opts.maxStaleDays) && sorted.length) {
    const lag = Math.round((Date.parse(opts.asOf) - Date.parse(String(sorted[sorted.length - 1].date).slice(0, 10))) / 864e5);
    if (lag > opts.maxStaleDays) return { tr: null, trCoverage: null, validity: null, stale: true };
  }
  const validity = PriceValidity.build(sorted, { identity: opts.identity, role: opts.role, delisted: opts.delisted, secEvents: opts.secEvents, shares: opts.shares });
  if (!validity.validUntil) return { tr: null, trCoverage: null, validity };
  return { tr: PriceValidity.alignTr(validity, dates), validity,
    trCoverage: validity.state === "FULL_VALID" ? "FULL" : validity.state === "VALID_PREFIX" ? "PREFIX" : "FULL_WITH_INVALID_BARS" };
}
export const TR_BASIS = "CANONICAL_TOTAL_RETURN";
export function fromBars(payload, opts = {}) {
  const bars = payload.bars || [];
  const actions = [];
  for (const b of bars) {
    if (b.splitFactor !== 1) actions.push({ type: "split", exDate: b.date, ratio: b.splitFactor });
    if (Number.isFinite(b.dividend) && b.dividend > 0) actions.push({ type: "dividend", exDate: b.date, amount: b.dividend });
  }
  const w = Canonical.fromPriceBars(bars, actions, { instrumentId: payload.ticker, source: "tiingo", sourceRevision: payload.updatedAt, currency: payload.currency || "USD", exchange: payload.exchange || "US" });
  const SA = w.SPLIT_ADJUSTED, PTR = w.TOTAL_RETURN || null;
  const legacyTotalReturn = !!PTR && bars.length > 0 && bars.every((_, i) => PTR.close[i] > 0);
  // Provider metadata selects Tiingo's ex-close reinvestment semantics for
  // the provider cross-check (old contract). Explicit caller options win.
  const provider = String(payload.provider || payload.provenance?.provider || payload.provenance?.source || "").toLowerCase();
  const trOptions = provider === "tiingo" ? { dividendConvention: "TIINGO_REINVESTMENT_CLOSE", ...opts } : opts;
  const providerVerdict = MarketQuality.totalReturnVerdict(bars, trOptions);
  const providerOk = legacyTotalReturn && providerVerdict.confirmed;
  const sorted = bars.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const ctr = CanonicalTR.reconstruct(sorted, { identity: opts.identity, role: opts.role, delisted: opts.delisted, asOf: opts.asOf, maxStaleDays: opts.maxStaleDays });
  const { tr: ctrSeries, priceReturnIndex, ...ctrInfo } = ctr;
  const trVerdict = { confirmed: ctr.reconstructed, state: ctr.state, reason: ctr.reason, bucket: ctr.bucket, contract: ctr.contract,
    lastGap: ctr.date || (ctr.firstGap && ctr.firstGap.to) || null };
  return { dates: sorted.map((b) => b.date), close: Float64Array.from(SA.close), high: Float64Array.from(SA.high),
    tr: ctr.reconstructed ? Float64Array.from(ctrSeries) : null, totalReturn: ctr.reconstructed, trBasis: ctr.reconstructed ? TR_BASIS : null,
    trVerdict, ctr: ctrInfo,
    providerTr: providerOk ? Float64Array.from(PTR.close) : null, providerVerdict, legacyTotalReturn };
}
export function fromBarsPartial(payload, opts = {}) {
  const d = fromBars(payload, opts);
  const sorted = (payload.bars || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const p = partialSeries(sorted, d.dates, d.ctr, opts);
  if (!p) return { ...d, trCoverage: d.totalReturn ? "FULL" : null, trValidUntil: d.totalReturn ? d.dates[d.dates.length - 1] : null };
  const hold = p.validity && p.validity.hold;
  return { ...d, tr: p.tr, totalReturn: p.tr !== null, trBasis: p.tr !== null ? TR_BASIS : null, trCoverage: p.trCoverage, trValidUntil: p.validity ? p.validity.validUntil : null,
    trVerdict: { ...d.trVerdict, coverage: p.trCoverage, validUntil: p.validity ? p.validity.validUntil : null, stale: p.stale === true,
      hold: hold ? { from: hold.from, observedAt: hold.observedAt, reason: hold.reason, evidenceClass: hold.evidenceClass } : null, validityContract: PriceValidity.VERSION } };
}

/* Die Arbeitsablage fuehrt je securityId nur das juengste Listing
   (guard-listing-continuity.mjs, Luecke > 365 Tage = neues Listing).
   Damit ist die Identitaet einer Reihe dort die des Produkttitels. */
export const WORKING_STORE_IDENTITY = { state: "CONFIRMED", via: "WORKING_STORE_CURRENT_LISTING" };

/* Nur das juengste Listing einer Reihe - dieselbe Regel wie die
   Veroeffentlichung der Kursreihen (survivorship-control.js
   currentListingSegment, Luecke > 365 Tage = neues Listing). Die Regel
   beim Abruf (guard-listing-continuity.mjs) sieht nur das Arbeitsfenster;
   liegt die Luecke aelter, traegt die dauerhafte Ablage noch das alte
   Listing davor. Gemessen 03.10.2026: 72 Titel der Signal-Studie. Ohne
   diesen Schnitt lehnt die Rekonstruktion sie als LISTING_DISCONTINUITY ab;
   mit ihm rechnet sie nur, was zum heutigen Titel gehoert. listingCut nennt
   den Schnitt, nie still. */
export function currentListingPayload(payload) {
  const bars = (payload.bars || []).slice().sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
  const seg = SurvivorshipControl.currentListingSegment(bars);
  return { ...payload, bars: seg.bars, listingCut: seg.cut };
}
/** Arbeitsablage oder Golden Preview: juengstes Listing, Identitaet bestaetigt. */
export function workingStoreFromBars(payload, opts = {}) {
  const p = currentListingPayload(payload);
  const d = fromBars(p, { identity: { ...WORKING_STORE_IDENTITY, listingCut: p.listingCut || null }, ...opts });
  return { ...d, listingCut: p.listingCut || null };
}
/* SPY ist ueber die Konfiguration (quant/config/tiingo-scale.json benchmark)
   eindeutig benannt; seine Rolle ist BENCHMARK_REFERENCE, nie Studientitel. */
export const BENCHMARK_IDENTITY = { state: "CONFIRMED", via: "BENCHMARK_CONFIG" };

/* Mischbasis-Sperre: eine Studie in Gesamtrendite traegt fuer JEDEN Titel
   (T.out) die kanonische Reihe (T.tr) und fuer SPY die kanonische SPY-Reihe
   - nie die Anbieterspalte und nie den Kurs. Wirft sonst. */
export function assertSingleBasis(list, spySeries, canonicalSpy) {
  for (const T of list) if (!T.tr || T.out !== T.tr) throw Error("MIXED_RETURN_BASIS " + (T.securityId || "?"));
  if (!canonicalSpy || spySeries !== canonicalSpy) throw Error("MIXED_RETURN_BASIS SPY");
}

export function dailyOf(securityId, workDir, { allowPublicPriceOnly = false, ...opts } = {}) {
  const tiingoOptions = { dividendConvention: "TIINGO_REINVESTMENT_CLOSE", ...opts };
  const priv = workDir ? join(workDir, "tiingo", "daily", securityId + ".json") : null;
  if (priv && existsSync(priv)) return { source: "CANONICAL_HISTORY", ...workingStoreFromBars(JSON.parse(readFileSync(priv, "utf8")), tiingoOptions) };
  const golden = join(ROOT, "quant/data/market/golden-preview/daily", securityId + ".json");
  if (existsSync(golden)) return { source: "GOLDEN_PREVIEW", ...workingStoreFromBars(JSON.parse(readFileSync(golden, "utf8")), tiingoOptions) };
  if (!allowPublicPriceOnly) return null;
  const pub = join(ROOT, "quant/data/market/discover-series", securityId + ".json");
  if (!existsSync(pub)) return null;
  const j = JSON.parse(readFileSync(pub, "utf8"));
  if (j.priceSeriesType !== "SPLIT_ADJUSTED") return null;
  const close = Float64Array.from(j.points.map((p) => p[1]));
  return { source: "DISCOVER_SERIES_1Y", dates: j.points.map((p) => p[0]), close, high: close, tr: null, totalReturn: false };
}
