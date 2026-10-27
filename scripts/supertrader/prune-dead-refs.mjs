#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — Supertrader · prune-dead-refs.mjs

   BEREINIGUNGSMODUS: ENTFALLENE TITEL AUSWEISEN, SONST NICHTS

   Anlass (27.10.2026, BZH): Der Nachtlauf committet das neue Discover-
   Universum im Job `refresh`. Scheitert danach `materialize` oder der
   Frische-Vertrag, stoesst die Kette Supertrader zu Recht nicht an - die
   Signale zeigen dann bis zum naechsten vollen Lauf auf einen Titel ohne
   Discover-Seite (toter Link, core/tests/state/supertrader-discover.test.mjs
   rot fuer jeden PR).

   Dieser Modus behebt genau diesen Zustand, ohne die Validierung des vollen
   Builds zu umgehen:
     - liest KEINE Marktdaten, Kurse, Materialisierung oder Anbieter;
       Eingaben sind nur das Discover-Universum (stock-index + meta.json)
       und die bereits committeten Supertrader-Artefakte;
     - erzeugt keine Signale, loescht keine, aendert keinen Signalwert,
       Einstieg, Stop, Rang, Ledger, Stand (asOf) oder Zaehler;
     - ergaenzt ausschliesslich discoverAvailability.unavailable um Titel,
       die das gueltige Universum nicht mehr fuehrt - derselbe Ausweis, den
       der volle Build schreibt (Owner-Regel 04.10.2026, LOGI: Signale
       bleiben, die Seite zeigt einen Hinweis statt des Links);
     - nimmt nie einen Ausweis zurueck: ein wieder auftauchendes Kuerzel
       kann ein neues Listing sein (Kuerzel-Neuvergabe). Das entscheidet
       erst der volle Build;
     - bricht ab (Exit 2, nichts geschrieben), wenn Universum oder
       Supertrader-Stand unvollstaendig, widerspruechlich oder
       unplausibel sind.

   Geschrieben werden nur signals.json, signals-core.json und die
   Aktienausschnitte stock/<SYM>.json der neu ausgewiesenen Titel. Erst
   alle Dateien in Temporaerdateien, dann Umbenennen; signals.json zuletzt.
   Bricht der Lauf dazwischen ab, rechnet ein erneuter Lauf aus der
   unveraenderten signals.json dasselbe Ergebnis (idempotent).

   Aufruf:
     node scripts/supertrader/prune-dead-refs.mjs [--root=.] [--dry-run]
   Exit: 0 = ausgewiesen oder nichts zu tun, 2 = Abbruch (fail closed).
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { discoverAvailability, symbolsIn, trend52Symbols } from './build.mjs';

const Identity = createRequire(import.meta.url)('../../core/identity.js');

export const LIMITS = {
  minUniverse: 1000,      /* weniger Titel: Universum unvollstaendig */
  maxNewAbsolute: 25,     /* mehr neu entfallene Signal-Titel auf einmal: unplausibel */
  maxNewShare: 0.02       /* ... oder mehr als 2 % der geprueften Titel */
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE = 'discover/data/stock-index/US_REAL.json';

class Abbruch extends Error {
  constructor(code, detail) { super(code + ': ' + detail); this.code = code; this.detail = detail; }
}
const abbruch = (code, detail) => { throw new Abbruch(code, detail); };

function lies(datei, code) {
  let text;
  try { text = fs.readFileSync(datei, 'utf8'); } catch { abbruch(code, 'fehlt: ' + datei); }
  try { return { text, json: JSON.parse(text) }; } catch { abbruch(code, 'kein gueltiges JSON: ' + datei); }
}

/** Ist das Universum vollstaendig und in sich stimmig? Liefert die Symbolmenge. */
export function validateUniverse(index, meta, signalsAsOf) {
  if (!index || index.universeId !== 'US_REAL' || !Array.isArray(index.symbols)) abbruch('UNIVERSE_INVALID', 'stock-index/US_REAL.json ohne universeId US_REAL oder ohne symbols');
  const syms = index.symbols;
  if (syms.length < LIMITS.minUniverse) abbruch('UNIVERSE_INCOMPLETE', syms.length + ' Titel (< ' + LIMITS.minUniverse + ')');
  if (index.count !== syms.length) abbruch('UNIVERSE_INVALID', 'count ' + index.count + ' != ' + syms.length + ' Symbole');
  const ids = new Map();
  for (const s of syms) {
    if (typeof s !== 'string' || Identity.normalizeTicker(s) !== s) abbruch('UNIVERSE_INVALID', 'kein kanonisches Kuerzel: ' + JSON.stringify(s));
    const id = Identity.securityIdForTicker(s);
    if (ids.has(id)) abbruch('IDENTITY_AMBIGUOUS', ids.get(id) === s ? 'Kuerzel doppelt: ' + s : s + ' und ' + ids.get(id) + ' teilen ' + id);
    ids.set(id, s);
  }
  const u = meta && Array.isArray(meta.universes) ? meta.universes.find((x) => x && x.universeId === 'US_REAL') : null;
  if (!u) abbruch('UNIVERSE_UNVALIDATED', 'discover/data/meta.json ohne US_REAL');
  if (u.securities !== syms.length || u.withPriceSeries !== syms.length) abbruch('UNIVERSE_UNVALIDATED', 'meta.json: securities ' + u.securities + ', withPriceSeries ' + u.withPriceSeries + ', Index ' + syms.length);
  if (!ISO_DATE.test(String(u.asOf)) || !Number.isFinite(Date.parse(u.generatedAt))) abbruch('UNIVERSE_UNVALIDATED', 'meta.json: asOf/generatedAt fehlen');
  if (u.asOf < signalsAsOf) abbruch('UNIVERSE_OLDER', 'Universum ' + u.asOf + ' aelter als Supertrader ' + signalsAsOf);
  return { symbols: new Set(syms), securityIds: ids, asOf: u.asOf, generatedAt: u.generatedAt };
}

/** Reine Entscheidung (ohne Dateizugriff): welche Titel sind neu auszuweisen? */
export function planPrune({ signals, core, build, trend52, universe }) {
  const av = signals && signals.discoverAvailability;
  if (!signals || !signals.bySymbol || !av || !Array.isArray(av.unavailable)) abbruch('STATE_INVALID', 'signals.json ohne bySymbol oder discoverAvailability');
  if (av.source !== SOURCE) abbruch('STATE_INVALID', 'discoverAvailability.source ' + av.source);
  if (!ISO_DATE.test(String(signals.asOf)) || signals.asOf !== (build && build.asOf) || signals.asOf !== (core && core.asOf)) abbruch('STATE_INCONSISTENT', 'Stand signals ' + signals.asOf + ', build ' + (build && build.asOf) + ', core ' + (core && core.asOf));
  if (JSON.stringify(core.discoverAvailability) !== JSON.stringify(av)) abbruch('STATE_INCONSISTENT', 'signals-core.json traegt einen anderen Ausweis als signals.json');
  /* Dieselbe Titelmenge wie der volle Build (build.mjs: bySymbol + VU-Trendfolge + Teilpruefungen). */
  const geprueft = [...new Set([...Object.keys(signals.bySymbol), ...trend52Symbols(trend52), ...symbolsIn(signals.partialChecks)])].sort();
  if (geprueft.length !== av.checked) abbruch('STATE_INCONSISTENT', geprueft.length + ' Titel mit Supertrader-Seite, Ausweis prueft ' + av.checked);
  /* Identitaet: Ausweis nur bei exakt fehlendem Kuerzel (so verlinkt die Seite, so prueft der Zustandstest).
     Fehlt das Kuerzel, aber dieselbe kanonische securityId steht im Universum (BRK.B / BRK-B):
     nicht raten, abbrechen. */
  const fehlend = discoverAvailability(geprueft, [...universe.symbols]).unavailable;
  const mehrdeutig = fehlend.filter((s) => { const t = Identity.normalizeTicker(s); return t && universe.securityIds.has(Identity.securityIdForTicker(t)); });
  if (mehrdeutig.length) abbruch('IDENTITY_AMBIGUOUS', 'Kuerzel fehlt, kanonische securityId steht im Universum: ' + mehrdeutig.join(', '));
  const bisher = new Set(av.unavailable);
  const neu = fehlend.filter((s) => !bisher.has(s));
  const grenze = Math.min(LIMITS.maxNewAbsolute, Math.max(1, Math.floor(av.checked * LIMITS.maxNewShare)));
  if (neu.length > grenze) abbruch('UNIVERSE_SHRINK_IMPLAUSIBLE', neu.length + ' neu entfallene Signal-Titel auf einmal (Grenze ' + grenze + '): ' + neu.slice(0, 12).join(', '));
  /* Nie zuruecknehmen: wieder gefuehrte Kuerzel bleiben ausgewiesen, bis der volle Build entscheidet. */
  const wieder = av.unavailable.filter((s) => universe.symbols.has(s));
  return { neu, unavailable: [...new Set([...av.unavailable, ...neu])].sort(), wieder, checked: av.checked };
}

/* Ein Objekt gilt als unveraendert, wenn es ohne den Ausweis byte-gleich ist. */
const ohneAusweis = (o) => JSON.stringify({ ...o, discoverAvailability: o.discoverAvailability ? { ...o.discoverAvailability, unavailable: null } : o.discoverAvailability });

export function prune({ root, dryRun = false }) {
  const data = path.join(root, 'supertrader', 'data');
  const sig = lies(path.join(data, 'signals.json'), 'STATE_INVALID');
  const core = lies(path.join(data, 'signals-core.json'), 'STATE_INVALID');
  const build = lies(path.join(data, 'build.json'), 'STATE_INVALID');
  const t52 = lies(path.join(data, 'trend52.json'), 'STATE_INVALID');
  const index = lies(path.join(root, 'discover', 'data', 'stock-index', 'US_REAL.json'), 'UNIVERSE_INVALID');
  const meta = lies(path.join(root, 'discover', 'data', 'meta.json'), 'UNIVERSE_UNVALIDATED');
  const universe = validateUniverse(index.json, meta.json, sig.json.asOf);
  const plan = planPrune({ signals: sig.json, core: core.json, build: build.json, trend52: t52.json, universe });
  const bericht = { action: plan.neu.length ? 'PRUNE' : 'NOOP', asOf: sig.json.asOf, universeAsOf: universe.asOf, added: plan.neu, unavailable: plan.unavailable, stillMarkedButListed: plan.wieder, files: [] };
  if (!plan.neu.length) return bericht;

  /* Neue Inhalte vollstaendig berechnen und pruefen, bevor irgendetwas geschrieben wird. */
  const schreiben = [];
  const mitAusweis = (obj, unavailable) => ({ ...obj, discoverAvailability: { ...obj.discoverAvailability, unavailable } });
  const neuSig = mitAusweis(sig.json, plan.unavailable);
  const neuCore = mitAusweis(core.json, plan.unavailable);
  for (const sym of plan.neu) {
    const datei = path.join(data, 'stock', sym + '.json');
    const s = lies(datei, 'STATE_INVALID');
    const a = s.json.discoverAvailability;
    if (s.json.symbol !== sym || !a || !Array.isArray(a.unavailable) || a.unavailable.length) abbruch('STATE_INCONSISTENT', 'Ausschnitt ' + sym + ' ohne passenden Ausweis');
    schreiben.push({ datei, alt: s, neu: mitAusweis(s.json, [sym]) });
  }
  schreiben.push({ datei: path.join(data, 'signals-core.json'), alt: core, neu: neuCore });
  schreiben.push({ datei: path.join(data, 'signals.json'), alt: sig, neu: neuSig }); /* zuletzt */
  for (const w of schreiben) {
    if (ohneAusweis(w.neu) !== ohneAusweis(w.alt.json)) abbruch('INTERNAL', 'mehr als der Ausweis geaendert: ' + w.datei);
    if (JSON.stringify(w.alt.json) + '\n' !== w.alt.text) abbruch('STATE_INVALID', 'nicht im Build-Format (JSON + Zeilenende): ' + w.datei);
  }
  bericht.files = schreiben.map((w) => path.relative(root, w.datei));
  if (dryRun) return bericht;

  const tmp = schreiben.map((w) => w.datei + '.prune-' + process.pid + '.tmp');
  try {
    schreiben.forEach((w, i) => fs.writeFileSync(tmp[i], JSON.stringify(w.neu) + '\n'));
  } catch (e) {
    for (const t of tmp) { try { fs.rmSync(t, { force: true }); } catch { /* aufraeumen */ } }
    abbruch('WRITE_FAILED', String(e && e.message || e));
  }
  schreiben.forEach((w, i) => fs.renameSync(tmp[i], w.datei));
  return bericht;
}

export function main(argv, env = process.env) {
  const args = Object.fromEntries(argv.map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true]; }));
  const root = path.resolve(args.root || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  let bericht, code = 0;
  try { bericht = prune({ root, dryRun: !!args['dry-run'] }); }
  catch (e) {
    if (!(e instanceof Abbruch)) throw e;
    bericht = { action: 'ABORT', reason: e.code, detail: e.detail };
    console.log('::error title=Supertrader-Bereinigung::' + e.code + ' - ' + e.detail);
    code = 2;
  }
  console.log(JSON.stringify(bericht));
  if (env.GITHUB_STEP_SUMMARY) {
    const z = ['### Supertrader · entfallene Titel ausweisen', '', '| Feld | Wert |', '|---|---|', '| Ergebnis | ' + bericht.action + (bericht.reason ? ' / ' + bericht.reason : '') + ' |'];
    if (bericht.detail) z.push('| Grund | ' + bericht.detail + ' |');
    if (bericht.added) z.push('| Neu ausgewiesen | ' + (bericht.added.join(', ') || '-') + ' |', '| Stand Supertrader / Universum | ' + bericht.asOf + ' / ' + bericht.universeAsOf + ' |');
    try { fs.appendFileSync(env.GITHUB_STEP_SUMMARY, z.join('\n') + '\n'); } catch { /* ohne Summary */ }
  }
  return code;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
