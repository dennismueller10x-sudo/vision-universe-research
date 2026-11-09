#!/usr/bin/env node
'use strict';
// Kennzahlen-Hash ohne Laufzeitbezug (P0.7, backtest-metrics-hash-1.0.0).
//
// Warum: resultHash und envelopeHash des Research-Runners binden mittelbar die Laufzeit. runPortfolio
// (research-portfolio.cjs, Feld runtime.nodeBinaryHash) und runMonteCarlo (research-monte-carlo.cjs,
// calculationRuntime.binaryHash) schreiben Node-Version und den sha256 des Node-Binaers in ihr eigenes resultHash;
// dieses steht im Umschlag (methods[].result.resultHash, metrics.excess.versusPriceOnly.priceOnlyResultHash) und im
// Ergebnis (extras.engineResultHash). Zwei Node-Binaere liefern deshalb bei gleichen Zahlen verschiedene Hashes.
//
// Was: metricsHash(result) = sha256(kanonisches JSON der Kennzahlen-Projektion). Die Projektion nimmt aus dem
// Umschlag die Abschnitte period, events, portfolio, metrics, uncertainty, dataQuality, methods, limitations und
// status sowie kind und state des Ergebnisses. Entfernt werden rekursiv alle Hash-Felder (Name endet auf Hash oder
// Sha256, ausserdem inputHashes) und alle Laufzeitangaben (runtime, calculationRuntime, generation); in Texten
// eingebettete Hash-Praefixe (16 und mehr Hex-Zeichen, z. B. dataQuality.survivorship.control "population profile
// V10_PRIMARY (4b74f7564af9c70d)") werden durch "#" ersetzt. spec und
// identity bleiben draussen: Sie beschreiben Eingaben und Code, die das Ergebnis ueber inputHash ohnehin bindet.
// Damit misst der Hash genau die Zahlen und Texte, die eine Gegenrechnung oder eine zweite Laufzeit reproduzieren muss.
//
// Nur zusaetzlich: Diese Datei aendert keinen Runner, keinen bestehenden Hash, keine Demo, keinen Katalog und kein
// Bundle. Sie steht bewusst nicht in CODE_FILES des Runners (sonst wuerden die 16 Demos veralten).
//   node scripts/quant/research/backtest-metrics-hash.cjs <ergebnis.json>... [--dir <verzeichnis>] [--out <datei>]
// Ohne --out nach stdout.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'backtest-metrics-hash-1.0.0';
const SECTIONS = Object.freeze(['period', 'events', 'portfolio', 'metrics', 'uncertainty', 'dataQuality', 'methods', 'limitations', 'status']);
const RUNTIME_KEYS = Object.freeze(['runtime', 'calculationRuntime', 'generation', 'generationHash', 'inputHashes']);
const HASH_KEY = /(Hash|Sha256|sha256)$/;
const HEX_RUN = /[0-9a-f]{16,}/g;

function canonical(x) {
  if (x === null || typeof x === 'string' || typeof x === 'boolean') return JSON.stringify(x);
  if (typeof x === 'number') { if (!Number.isFinite(x)) throw Error('NON_FINITE_NUMBER'); return JSON.stringify(x); }
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).filter(k => x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(x[k])).join(',') + '}';
  throw Error('NON_JSON_VALUE');
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const dropKey = k => k === 'resultHash' || HASH_KEY.test(k) || RUNTIME_KEYS.includes(k);

function strip(x) {
  if (Array.isArray(x)) return x.map(strip);
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) if (!dropKey(k)) o[k] = strip(x[k]);
    return o;
  }
  return typeof x === 'string' ? x.replace(HEX_RUN, '#') : x;
}

/** Kennzahlen-Projektion eines Runner-Ergebnisses (backtest-runner-result-1.0.0) oder eines blanken Umschlags. */
function projection(result) {
  if (!result || typeof result !== 'object') throw Error('RESULT_NOT_AN_OBJECT');
  const env = result.envelope || (result.schemaVersion === 'backtest-result-2.0.0' ? result : null);
  if (!env) throw Error('ENVELOPE_MISSING');
  const body = { schemaVersion: VERSION, kind: result.kind || (env.spec && env.spec.kind) || null, state: (env.status && env.status.state) || null };
  for (const s of SECTIONS) body[s] = env[s] === undefined ? null : strip(env[s]);
  return body;
}
function metricsHash(result) { return sha(canonical(projection(result))); }

function main(argv) {
  const files = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' || argv[i] === '--out') { if (!argv[i + 1] || o[argv[i].slice(2)]) throw Error('INVALID_ARGUMENTS:' + argv[i]); o[argv[i].slice(2)] = argv[++i]; }
    else if (argv[i].startsWith('--')) throw Error('INVALID_ARGUMENTS:' + argv[i]);
    else files.push(argv[i]);
  }
  if (o.dir) for (const f of fs.readdirSync(o.dir).filter(f => f.endsWith('.json')).sort()) files.push(path.join(o.dir, f));
  if (!files.length) throw Error('NO_RESULT_FILES');
  const rows = files.map(f => { const r = JSON.parse(fs.readFileSync(f, 'utf8')); return { file: path.basename(f), kind: r.kind || null, state: r.state || null, resultHash: r.resultHash || null, envelopeHash: r.envelopeHash || null, metricsHash: metricsHash(r) }; });
  const text = JSON.stringify({ schemaVersion: VERSION, results: rows }, null, 1) + '\n';
  if (o.out) fs.writeFileSync(o.out, text); else process.stdout.write(text);
  return 0;
}
if (require.main === module) { try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { VERSION, SECTIONS, RUNTIME_KEYS, projection, metricsHash, canonical };
