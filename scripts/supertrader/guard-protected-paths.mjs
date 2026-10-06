#!/usr/bin/env node
// Supertrader — Architektur-Gate A.
//
// Discovery und Quant 2.0 duerfen durch Supertrader NICHT veraendert werden.
// Dieser Guard vergleicht den Branch mit der Basis und erlaubt ausschliesslich
// Pfade der Supertrader-Produktwelt. Jede andere Aenderung laesst CI scheitern.
//
// Aufruf: node scripts/supertrader/guard-protected-paths.mjs [--base=origin/main]
import { execFileSync } from 'node:child_process';

const ALLOWED = [
  /^supertrader\//,
  /^scripts\/supertrader\//,
  /^docs\/SUPERTRADER_[A-Z0-9_]+\.md$/,
  /^\.github\/workflows\/supertrader-[a-z0-9-]+\.yml$/,
];
const PROTECTED = [/^discover\//, /^discover-v2\//, /^quant\//, /^vu2\//, /^scripts\/(discover|vu2|quant|market|technical)\//, /^assets\//, /^api\//, /^server\//, /^worker\//, /^providers\//];

const base = (process.argv.find((a) => a.startsWith('--base=')) || '--base=origin/main').slice(7);
const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { encoding: 'utf8' }).trim();
const changed = execFileSync('git', ['diff', '--name-only', mergeBase, 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const offenders = changed.filter((f) => !ALLOWED.some((r) => r.test(f)));
const protectedHits = changed.filter((f) => PROTECTED.some((r) => r.test(f)));
console.log(`Supertrader Gate A: ${changed.length} geaenderte Dateien gegen ${base} (${mergeBase.slice(0, 9)})`);
console.log(`  DISCOVERY_CHANGED=${protectedHits.some((f) => /^(discover|discover-v2|scripts\/discover)\//.test(f))}`);
console.log(`  QUANT_2_CHANGED=${protectedHits.some((f) => /^(quant|vu2|scripts\/(vu2|quant))\//.test(f))}`);
if (offenders.length) {
  console.error('Nicht erlaubte Aenderungen ausserhalb der Supertrader-Welt:');
  for (const f of offenders) console.error('  ' + f);
  process.exit(1);
}
console.log('  OK: nur Supertrader-Pfade veraendert.');
