#!/usr/bin/env node
/* Mission VII — Zusammenfuehrung der Doppelextraktion (A, B, ggf. Schiedsdurchgang C) zu Konsens-Referenzzeilen (Nachtrag 7 f).

   Regeln wie Phase 2 (Nachtraege 2–4, PRACTITIONER_SCALING_LOG.md):
     • Kernfeld-Abgleich A↔B mit dual-extraction.mjs (compareCoreFields); Abweichung → C; C UNDECIDABLE → UNKNOWN.
     • C-Skip: A und B einig im Zeitrahmen INTRADAY/MIXED/UNKNOWN → EXCLUDED (§2.2) ohne C.
     • Ausschluss (§3) nur, wenn A und B unabhaengig ausschliessen; nur einer → C.
     • Sicherheit nach confidenceFor (HIGH nur bei voller Uebereinstimmung); < 2 bekannte Kernfelder → LOW → CANDIDATE.
     • Status: Zeitrahmen ≠ 1D/1W/1M → EXCLUDED; Instrument ohne VU-Reihe, VU-Reihe deckt Stichtag nicht ab (§2.4),
       Plausibilitaetsband (Nachtrag 4) oder LOW → CANDIDATE; sonst INCLUDED.
   Die Extraktoren sehen nie Ausgangsfaelle, VU-Ausgaben oder spaetere Kurse; dieses Skript liest nur Kurse bis zum Stichtag
   (barsUntil) fuer Abdeckung, Skala und Plausibilitaet. Ausgangsfaelle werden nur ueber ihre Fallkennung verknuepft.

   node scripts/technical/practitioner/consensus-assemble.mjs <work.json> <pass-dir> */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PV1, validateReference, effectiveMapping, loadInstrumentMap, loadSourceRegistry, plausibilityChecks, buildCaseId, normSym, round } from "./lib.mjs";
import { computeAnalysisCutoff } from "./cutoff.mjs";
import { compareCoreFields, coreValue, CORE_FIELDS, confidenceFor, instrumentKeyOf } from "./dual-extraction.mjs";
import { barsUntil, MIN_BARS } from "./replay.mjs";

const CONS = join(PV1, "consensus");
const cap = (s, n = 400) => (s == null ? s : String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
const readP = (dir, q, p) => { const f = join(dir, q, p + ".json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
const TF_OK = new Set(["1D", "1W", "1M"]);
const TF_REASON = {
  INTRADAY: "§2.2: Zeitrahmen INTRADAY (Primaerzaehlung im 1H-/4H-/5min-Chart) – mit VU-Tages-/Wochenreihen nicht exakt rekonstruierbar",
  MIXED: "§2.2: Zeitrahmen MIXED – Primaerzaehlung auf mehrere Zeitrahmen inkl. Intraday verteilt; VU-Wiedergabe nur 1D/1W/1M",
  UNKNOWN: "§2.2: Zeitrahmen UNKNOWN – kein eindeutiger Chart-Zeitrahmen der Primaerzaehlung; VU-Wiedergabe nur 1D/1W/1M"
};
const EXCL_TEXT = { RETROSPECTIVE: "Rueckblick", NO_STRUCTURE: "keine Zaehlung/Muster/Invalidation/Zielzone", NO_FOCUS_INSTRUMENT: "keine Analyse des Zielinstruments", NON_ANALYSIS: "keine Analyse (Werbung/Lehrbeispiel)" };

/* Wellenlabels wie Phase 2 (Korrektur 5): fuehrendes Token ("3 (of 3)" → "3"), eingekreiste Ziffern ("⑤" → "((5))"),
   "circled 5" → "((5))", Doppellabels ("2,B", "2 or B") → UNKNOWN statt Raten. */
const CIRCLED = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "Ⓐ": "A", "Ⓑ": "B", "Ⓒ": "C", "Ⓓ": "D", "Ⓔ": "E", "Ⓦ": "W", "Ⓧ": "X", "Ⓨ": "Y", "Ⓩ": "Z" };
export function normLabel(l) {
  if (l == null || l === "UNKNOWN") return l;
  let s = String(l).trim();
  if (/[,/]|\bor\b|\boder\b/i.test(s)) return "UNKNOWN";
  const c = /^circled\s+([0-9A-Za-z]+)/i.exec(s); if (c) return "((" + c[1] + "))";
  if (CIRCLED[s[0]] !== undefined) return "((" + CIRCLED[s[0]] + "))";
  const m = /^(\S+)\s+\((of|von)\b/i.exec(s); if (m) s = m[1];
  return s;
}
const normPass = (p) => { if (!p || !p.primary) return p; const q = JSON.parse(JSON.stringify(p)); q.primary.currentWave = normLabel(q.primary.currentWave); return q; };
/** leerer Durchgang (Quelle nicht erreicht) → alle Kernfelder null */
const blank = (p) => (p && p.reachable === false ? Object.assign({}, p, { primary: {}, directionalBias: null, invalidation: null, timeframe: null, instrument: {} }) : normPass(p));

/** Endgueltige Kernfelder aus A (Basis), bei Abweichung aus C */
function finalize(A, B, C, agree) {
  const base = JSON.parse(JSON.stringify(A.reachable === false ? B : A));
  const d = (C && C.decisions) || {}, notes = [];
  const und = (x) => !x || x.basis === "UNDECIDABLE";
  for (const f of CORE_FIELDS) {
    if (agree[f] === true || agree[f] === "NOT_STATED") continue;
    const x = d[f];
    if (f === "family") { if (und(x)) { base.primary.pattern = "UNKNOWN"; base.primary.family = "UNKNOWN"; } else Object.assign(base.primary, { pattern: x.value.pattern, family: x.value.family }); }
    if (f === "currentWave") { if (und(x)) { base.primary.currentWave = "UNKNOWN"; base.primary.currentWaveRole = "UNKNOWN"; } else Object.assign(base.primary, x.value, { currentWave: normLabel(x.value.currentWave) }); }
    if (f === "direction") base.directionalBias = und(x) ? "UNKNOWN" : x.value;
    if (f === "invalidation") base.invalidation = und(x) ? null : x.value;
    if (f === "timeframe") base.timeframe = und(x) ? "UNKNOWN" : x.value;
    if (f === "instrument") {
      if (und(x)) base.instrument = Object.assign({}, base.instrument, { asShown: "UNKNOWN" });
      else {
        /* wie Phase 2 (Korrektur 1, Namensabgleich): C bestaetigt das Instrument; ist C's Schreibweise nicht abbildbar, gilt die
           erste abbildbare Schreibweise von A/B mit gleichem Typ */
        const cands = [x.value, A.instrument, B.instrument].filter((i) => i && i.asShown && (!x.value.instrumentType || i.instrumentType === x.value.instrumentType));
        const hit = cands.find((i) => { const k = instrumentKeyOf(i); return k && k.resolved && k.resolved.mapId; });
        base.instrument = Object.assign({}, base.instrument, hit || x.value);
      }
    }
    notes.push(`${f}=${x ? (typeof x.value === "object" && x.value ? JSON.stringify(x.value) : x.value) : "UNKNOWN"} (${x ? x.basis : "UNDECIDABLE"})`);
  }
  return { base, notes };
}
/* Fehlende Wellenlabels → null, unbekannte Muster-Enums → UNKNOWN (Schema) */
const PATTERNS = new Set(["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL", "ZIGZAG", "FLAT", "TRIANGLE", "WXY", "DOUBLE_ZIGZAG", "TRIPLE_ZIGZAG", "COMBINATION", "UNKNOWN"]);
const enumOr = (v, set, d) => (set.includes(v) ? v : d);
const zones = (a) => (Array.isArray(a) ? a : []).filter((z) => z && Number.isFinite(z.low) || Number.isFinite(z && z.high)).map((z) => {
  const lo = Number.isFinite(z.low) ? z.low : z.high, hi = Number.isFinite(z.high) ? z.high : z.low;
  return { low: Math.min(lo, hi), high: Math.max(lo, hi), label: cap(z.label, 200) ?? null };
});

export function assemble(w, A, B, C, opts = {}) {
  const map = opts.map || loadInstrumentMap(), registry = opts.registry || loadSourceRegistry();
  const amb = ["Extraktion: LLM-dual aus Primaerquelle, nicht menschlich geprueft (Nachtrag 2 Punkt 5)",
    "Ergebnis bekannt: beide Extraktoren (LLM) haben allgemeines Hintergrundwissen zum spaeteren Verlauf; laut eigener Angabe nicht verwendet (Nachtrag 2 Punkt 4)",
    `Mission VII (Nachtrag 7): verknuepfte Konsens-Referenz, Fokusinstrument ${w.focus}`];
  const a = blank(A), b = blank(B);
  const agree = compareCoreFields(a, b, map);
  const bothUnreach = A.reachable === false && B.reachable === false;
  const exA = A.reachable !== false ? A.exclude : null, exB = B.reachable !== false ? B.exclude : null;
  let { base, notes } = finalize(a, b, C, agree);
  let status = null, exclusionReason = null;
  if (C && C.decisions && C.decisions.exclude && C.decisions.exclude.basis !== "UNDECIDABLE") notes.push(`exclude=${C.decisions.exclude.value} (${C.decisions.exclude.basis})`);
  if (C && C.decisions && C.decisions.reachable) notes.push(`reachable=${C.decisions.reachable.value} (${C.decisions.reachable.basis})`);
  if (notes.length) amb.push(cap("Schiedsdurchgang C: " + notes.join("; ")));
  /* Ausschlussgruende */
  if (bothUnreach) { status = "EXCLUDED"; exclusionReason = cap("SOURCE_UNREACHABLE (A und B): " + (A.unreachableNote || B.unreachableNote || "Inhalt nicht erreichbar")); }
  else if (exA && exB) { status = "EXCLUDED"; exclusionReason = cap(`§3 (A und B unabhaengig): ${EXCL_TEXT[exA] || exA} — ${A.excludeNote || B.excludeNote || ""}`); }
  else if ((exA || exB) && C && C.decisions && C.decisions.exclude && C.decisions.exclude.basis !== "UNDECIDABLE" && C.decisions.exclude.value) {
    status = "EXCLUDED"; exclusionReason = cap(`§3 (Schiedsdurchgang C): ${EXCL_TEXT[C.decisions.exclude.value] || C.decisions.exclude.value} — ${C.decisions.exclude.note || ""}`);
  }
  if (!status && !TF_OK.has(base.timeframe)) { status = "EXCLUDED"; exclusionReason = TF_REASON[base.timeframe] || TF_REASON.UNKNOWN; }
  /* Instrument / Abbildung */
  const ik = instrumentKeyOf(base.instrument || {}, map);
  const res = ik && ik.resolved && ik.resolved.mapId ? ik.resolved : null;
  const instrumentType = ik && ik.resolved ? ik.instrumentType : enumOr(base.instrument && base.instrument.instrumentType, ["STOCK", "ETF", "INDEX_CASH", "FUTURE", "CFD", "CRYPTO_SPOT", "FX", "COMMODITY_SPOT"], "UNKNOWN");
  const instrument = { asShown: cap(res ? ik.token : (base.instrument && base.instrument.asShown) || "UNKNOWN", 120), instrumentType: res ? ik.instrumentType : instrumentType,
    priceAdjustment: enumOr(base.instrument && base.instrument.priceAdjustment, ["SPLIT_ADJUSTED", "UNADJUSTED", "TOTAL_RETURN"], "UNKNOWN"),
    vuSymbol: res ? res.vuSymbol : null, mappingQuality: res ? res.mappingQuality : "UNMAPPED", levelScale: null };
  if (res && instrument.instrumentType === "UNKNOWN" && base.instrument && base.instrument.instrumentType) instrument.instrumentType = ik.instrumentType;
  /* Zeitstempel */
  const pm = w.pageMeta || {};
  let publication;
  if (w.sourceId === "tiedje") publication = { timestamp: pm.datePublished.replace(/:\d\d([+-])/, "$1"), timestampPrecision: "MINUTE", timezone: "Europe/Berlin", basis: "stock3-Artikel JSON-LD datePublished (Plattform-Metadaten)", editedAfterPublication: pm.dateModified ? "UNKNOWN" : "NO", editNote: pm.dateModified ? cap("JSON-LD dateModified " + pm.dateModified) : null };
  else if (w.sourceId === "ewf") {
    const t0 = Date.parse(pm.date_gmt + "Z"), t1 = Date.parse(pm.modified_gmt + "Z"), edited = t1 - t0 > 60 * 60e3;
    publication = { timestamp: pm.date_gmt.slice(0, 16) + "+00:00", timestampPrecision: "MINUTE", timezone: "UTC", basis: "WordPress-REST date_gmt (Plattform-Metadaten)", editedAfterPublication: edited ? "UNKNOWN" : "NO",
      editNote: edited ? `WordPress modified_gmt ${pm.modified_gmt} > 60 min nach Veroeffentlichung (Nachtrag 3 Punkt 3)` : null };
  } else publication = { timestamp: w.frameTs.slice(0, 16) + "+00:00", timestampPrecision: "MINUTE", timezone: "UTC", basis: "TradingView-API created_at (Plattform-Metadaten)", editedAfterPublication: "NO", editNote: null };
  const editFlag = publication.editedAfterPublication === "UNKNOWN";
  /* Sicherheit */
  const finalPass = { primary: base.primary || {}, directionalBias: base.directionalBias, invalidation: base.invalidation, timeframe: base.timeframe, instrument: base.instrument };
  const finalKnown = CORE_FIELDS.filter((f) => coreValue(finalPass, f, map) !== null && !(f === "currentWave" && finalPass.primary.currentWave === "UNKNOWN")).length;
  const passSelf = [A.selfConfidence, B.selfConfidence];
  let confidence = confidenceFor({ agreementAB: agree, finalKnown, evidenced: true, editFlag, passSelf });
  if (passSelf.every((x) => x === "LOW")) confidence = "LOW";
  if (status === "EXCLUDED" && (bothUnreach)) confidence = "LOW";
  const p = base.primary || {};
  const cw = p.currentWave && p.currentWave !== "UNKNOWN" ? String(p.currentWave) : p.currentWave === "UNKNOWN" ? "UNKNOWN" : null;
  const primary = { pattern: enumOr(p.pattern, [...PATTERNS], "UNKNOWN"), family: enumOr(p.family, ["MOTIVE", "CORRECTIVE"], "UNKNOWN"), degreeLabel: cap(p.degreeLabel, 60) ?? null,
    degreeRank: Number.isInteger(p.degreeRank) ? p.degreeRank : null, currentWave: cw, currentWaveRole: enumOr(p.currentWaveRole, ["MOTIVE", "CORRECTIVE"], "UNKNOWN"),
    state: enumOr(p.state, ["DEVELOPING", "CONFIRMED_COMPLETE"], "UNKNOWN"), waveStartDate: /^\d{4}-\d\d-\d\d$/.test(p.waveStartDate || "") ? p.waveStartDate : null,
    waveStartPrice: Number.isFinite(p.waveStartPrice) ? p.waveStartPrice : null, nextMoveAfterCurrent: enumOr(p.nextMoveAfterCurrent, ["UP", "DOWN", "SIDEWAYS"], "UNKNOWN") };
  const inv = base.invalidation && Number.isFinite(base.invalidation.price) ? { price: base.invalidation.price, direction: base.invalidation.direction === "above" ? "above" : "below", basis: enumOr(base.invalidation.basis, ["CLOSE", "INTRADAY"], "UNKNOWN") } : null;
  const date = publication.timestamp.slice(0, 10).replace(/-/g, "");
  const symTag = (instrument.vuSymbol || normSym(instrument.asShown) || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const row = {
    referenceId: `pr_${w.sourceId}_${date}_${symTag}_mc`, caseId: null, version: 1, revisionOf: null, viewKind: "ORIGINAL_PUBLISHED", sourceId: w.sourceId,
    sourceType: "WEBSITE", sourceUrl: w.url, crossPosts: [], publication, instrument, timeframe: enumOr(base.timeframe, ["1D", "1W", "1M", "INTRADAY", "MIXED"], "UNKNOWN"), analysisCutoff: null, analysisWindow: null,
    elliottSchool: enumOr(base.elliottSchool, ["CLASSICAL", "PRACTITIONER_SPECIFIC", "NEOWAVE"], "UNKNOWN_MIXED"), primary,
    alternatives: (base.alternatives || []).slice(0, 4).map((x) => ({ pattern: cap(x.pattern || "UNKNOWN", 60), currentWave: cap(x.currentWave, 40) ?? null, directionalBias: enumOr(x.directionalBias, ["UP", "DOWN", "SIDEWAYS"], "UNKNOWN"), trigger: Number.isFinite(x.trigger) ? x.trigger : null, note: cap(x.note, 300) ?? null })),
    directionalBias: enumOr(base.directionalBias, ["UP", "DOWN", "SIDEWAYS"], "UNKNOWN"), structuralScenario: cap(base.structuralScenario) ?? null,
    keySupportZones: zones(base.keySupportZones), entryZones: zones(base.entryZones), targetZones: zones(base.targetZones), invalidation: inv,
    commentarySummary: cap(base.commentarySummary || (A.reachable === false ? "Inhalt nicht erreichbar." : "—")),
    extraction: { confidence, extractor: "llm-dual", method: "LLM_DUAL_INDEPENDENT_PRIMARY", secondPass: null, ambiguities: amb,
      passes: { a: w.qid + "-A", b: w.qid + "-B", adjudication: C ? w.qid + "-C" : null, coreFieldAgreement: agree } },
    evidence: [], referenceQuality: { HIGH: "A", MEDIUM: "B", LOW: "C" }[confidence], status: "CANDIDATE", exclusionReason: null, split: "UNASSIGNED"
  };
  for (const [tag, P] of [["A", A], ["B", B]]) for (const e of (P.evidence || []).slice(0, 8)) row.evidence.push({ field: cap(e.field || "?", 80), locator: cap(e.locator, 120) ?? null, note: cap(tag + ": " + (e.note || ""), 200) });
  if (!row.evidence.length) row.evidence.push({ field: "source", locator: null, note: cap("A/B: " + (A.unreachableNote || A.excludeNote || "keine Fundstelle"), 200) });
  for (const [tag, P] of [["A", A], ["B", B]]) for (const s of (P.ambiguities || []).slice(0, 4)) amb.push(cap(`${tag}: ${s}`));
  if (A.usedOwnMarketKnowledge || B.usedOwnMarketKnowledge) amb.push("Hinweis: ein Durchgang meldet Nutzung eigenen Marktwissens");
  /* Stichtag */
  const m0 = effectiveMapping(row, map);
  row.analysisCutoff = computeAnalysisCutoff(publication, m0.market).analysisCutoff;
  row.caseId = buildCaseId(row);
  /* Abdeckung, Skala, Plausibilitaet: nur Kurse bis Stichtag */
  const reasons = [];
  if (!status && instrument.vuSymbol) {
    const m = effectiveMapping(row, map);
    const proj = { vuSymbol: m.vuSymbol, seriesSource: m.seriesSource, market: m.market, timeframe: row.timeframe, analysisCutoff: row.analysisCutoff };
    const built = barsUntil(proj, row.analysisCutoff), daily = barsUntil(Object.assign({}, proj, { timeframe: "1D" }), row.analysisCutoff);
    const close = daily.bars.length ? daily.bars[daily.bars.length - 1][1] : null;
    const prices = [A.chartLastPrice, B.chartLastPrice].filter((x) => Number.isFinite(x) && x > 0), chart = prices.length ? prices[0] : null;
    if (close && chart) {
      const ratio = close / chart;
      if (instrument.mappingQuality === "EXACT") { instrument.levelScale = Math.abs(ratio - 1) > 0.05 ? round(ratio, 6) : 1; if (instrument.levelScale !== 1) amb.push(cap(`levelScale ${instrument.levelScale}: Chart-Kurs ${chart} weicht > 5 % vom VU-Schluss ${round(close, 4)} am Stichtag ab (Split/Skalierung oder Kursbewegung)`)); }
      else instrument.levelScale = round(ratio, 6);
    }
    const mm = effectiveMapping(row, map);
    if (built.bars.length < MIN_BARS[built.tf]) reasons.push(`§2.4: VU-Reihe deckt den Stichtag im Zeitrahmen ${row.timeframe} nicht ab (${built.bars.length} Bars bis ${built.limit}; mindestens ${MIN_BARS[built.tf]}) – Kandidat, bis eine laengere Reihe vorliegt`);
    else if (close) {
      const pl = plausibilityChecks(row, { closeAtCutoff: close, levelScale: mm.levelsComparable ? mm.levelScale : null });
      if (pl.errors.length) reasons.push(cap(`Plausibilitaet (${row.timeframe === "1D" ? "±60 %" : "−90 %/+400 %"}, Nachtrag 4) verletzt: ` + pl.errors.join("; ")));
    }
  } else if (!status) reasons.push("Instrument ohne VU-Reihe (UNMAPPED) – Kandidat");
  if (!status) {
    if (confidence === "LOW") reasons.push("Sicherheit LOW (weniger als zwei bekannte Kernfelder bzw. beide Durchgaenge LOW) – nur Kandidat");
    const v = validateReference(Object.assign({}, row, { status: "INCLUDED" }), { registry, map });   // als INCLUDED pruefen (§2.3 greift nur dort)
    if (v.errors.length) reasons.push(cap("Validierung: " + v.errors.join("; ")));
    status = reasons.length ? "CANDIDATE" : "INCLUDED";
  }
  for (const r of reasons) amb.push(cap(r));
  row.status = status; row.exclusionReason = exclusionReason;
  row.extraction.ambiguities = amb.slice(0, 16);
  return { row, agree, reasons, usedC: !!C };
}

/** Bedarf fuer Schiedsdurchgang: Liste strittiger Felder (leer = kein C) */
export function disputedFields(A, B, map = loadInstrumentMap()) {
  const a = blank(A), b = blank(B), agree = compareCoreFields(a, b, map), out = [];
  const tfA = a.timeframe, skip = agree.timeframe === true && !TF_OK.has(tfA);
  if (A.reachable === false && B.reachable === false) return [];
  if (skip) return [];
  if ((A.reachable !== false && A.exclude) && (B.reachable !== false && B.exclude)) return [];
  for (const f of CORE_FIELDS) if (agree[f] === false) out.push(f);
  if (!!(A.reachable !== false && A.exclude) !== !!(B.reachable !== false && B.exclude)) out.push("exclude");
  if ((A.reachable === false) !== (B.reachable === false)) out.push("reachable");
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [workF, dir] = process.argv.slice(2), work = JSON.parse(readFileSync(workF, "utf8"));
  const rows = [], links = {}, sealed = {}, log = [];
  const ids = new Map();
  for (const w of work) {
    let row = null, rec = { qid: w.qid, sourceId: w.sourceId, phase: w.phase };
    if (w.access !== "PUBLIC") rec.status = "UNREACHABLE";
    else {
      const A = readP(dir, w.qid, "A"), B = readP(dir, w.qid, "B"), C = readP(dir, w.qid, "C");
      if (!A || !B) rec.status = "NOT_PROCESSED";
      else {
        const need = disputedFields(A, B);
        if (need.length && !C) { rec.status = "NEEDS_C"; rec.need = need; }
        else {
          const r = assemble(w, A, B, need.length ? C : null);
          row = r.row;
          const n = (ids.get(row.referenceId) || 0) + 1; ids.set(row.referenceId, n); if (n > 1) row.referenceId += "_" + n;
          rows.push(row);
          Object.assign(rec, { status: row.status, referenceId: row.referenceId, confidence: row.extraction.confidence, timeframe: row.timeframe, vuSymbol: row.instrument.vuSymbol, agree: r.agree, usedC: r.usedC, exclusionReason: row.exclusionReason, reasons: r.reasons });
        }
      }
    }
    for (const l of w.links) {
      const link = { referenceId: row ? row.referenceId : null, sourceId: w.sourceId, family: w.family, lag: l.lag, windowTradingDays: l.windowTradingDays, sealedAnchor: l.sealedAnchor,
        status: row ? row.status : rec.status, anchorInstrumentMatch: row ? row.instrument.vuSymbol === l.anchorCaseId.split("|")[1] : null };
      (l.sealedAnchor ? sealed : links)[l.anchorCaseId] = ((l.sealedAnchor ? sealed : links)[l.anchorCaseId] || []).concat([link]);
    }
    log.push(rec);
  }
  mkdirSync(join(CONS, "sealed"), { recursive: true });
  writeFileSync(join(CONS, "references.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  writeFileSync(join(CONS, "links.json"), JSON.stringify(links, null, 1) + "\n");
  writeFileSync(join(CONS, "sealed/links-sealed.json"), JSON.stringify(sealed, null, 1) + "\n");
  writeFileSync(join(dir, "assemble-log.json"), JSON.stringify(log, null, 1));
  const by = (a, f) => a.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
  console.log(JSON.stringify({ rows: rows.length, status: by(log, (x) => x.status), needC: log.filter((x) => x.status === "NEEDS_C").map((x) => x.qid + ":" + x.need.join(",")) }, null, 1));
}
