#!/usr/bin/env node
// Vision Universe — Konfiguration fuer den oeffentlichen Produktivstart in EINEM Schritt setzen (lokal, ohne Netz).
//
//   node scripts/account/go-live-config.mjs --legal-version=vu-recht-2026-11-10-1 --tax=txr_… \
//     --checkout=public [--brevo-sync=true] [--newsletter=true] [--dry-run] [--root=<Repo-Wurzel>]
//
// Aendert nur:
//   workers/vu-account/src/legal/texts.mjs   LEGAL_VERSION, LEGAL_STATUS = 'freigegeben' (nur mit --legal-version)
//   workers/vu-account/wrangler.toml         [env.production.vars]: VU_LEGAL_APPROVED, STRIPE_TAX_MODE,
//                                            VU_CHECKOUT_ACCESS, VU_BREVO_SYNC, VU_NEWSLETTER
// Verweigert die Freigabe, solange die Texte [[OFFEN]]/[[PRÜFEN]] enthalten (die Inhalte ersetzt ein Mensch nach der
// rechtlichen Abnahme), und prueft das Ergebnis mit derselben Regel wie der Deploy-Workflow (check-public-checkout.mjs).
// Danach: Tests, ein PR, ein Deploy. Siehe docs/accounts/PRODUKTIONSPLAN.md.
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionVars, publicCheckoutProblems} from './check-public-checkout.mjs';

const TEXTS = 'workers/vu-account/src/legal/texts.mjs';
const TOML = 'workers/vu-account/wrangler.toml';

export function setProductionVar(toml, key, value) {
  const lines = toml.split('\n');
  let inside = false, done = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) { inside = /^\s*\[env\.production\.vars\]\s*$/.test(lines[i]); continue; }
    if (inside && new RegExp(`^${key}\\s*=`).test(lines[i])) { lines[i] = `${key} = "${value}"`; done = true; }
  }
  if (!done) throw new Error(`${key} fehlt in [env.production.vars]`);
  return lines.join('\n');
}

export function goLiveConfig({root, legalVersion, tax, checkout, brevoSync, newsletter, dryRun = false}) {
  const textsPath = join(root, TEXTS), tomlPath = join(root, TOML);
  let texts = readFileSync(textsPath, 'utf8');
  let toml = readFileSync(tomlPath, 'utf8');
  const changes = [];
  if (legalVersion) {
    if (!/^vu-recht-\d{4}-\d{2}-\d{2}-\d+$/.test(legalVersion)) throw new Error('--legal-version: Form vu-recht-JJJJ-MM-TT-N, ohne "entwurf"');
    const body = texts.slice(texts.indexOf('export const DOCS'));
    if (/\[\[(OFFEN|PRÜFEN)|OPEN\(|CHECK\(/.test(body)) throw new Error('Rechtstexte enthalten noch [[OFFEN]]/[[PRÜFEN]] (OPEN(…)/CHECK(…)) – erst nach der Abnahme ersetzen');
    texts = texts.replace(/export const LEGAL_VERSION = '[^']*';/, `export const LEGAL_VERSION = '${legalVersion}';`)
      .replace(/export const LEGAL_STATUS = '[^']*';/, `export const LEGAL_STATUS = 'freigegeben';`);
    toml = setProductionVar(toml, 'VU_LEGAL_APPROVED', legalVersion);
    changes.push(`Rechtstexte ${legalVersion} freigegeben`);
  }
  if (tax) { toml = setProductionVar(toml, 'STRIPE_TAX_MODE', tax); changes.push(`STRIPE_TAX_MODE = ${tax}`); }
  if (checkout) { toml = setProductionVar(toml, 'VU_CHECKOUT_ACCESS', checkout); changes.push(`VU_CHECKOUT_ACCESS = ${checkout}`); }
  for (const [key, v] of [['VU_BREVO_SYNC', brevoSync], ['VU_NEWSLETTER', newsletter]]) {
    if (v === undefined) continue;
    if (!['true', 'false'].includes(v)) throw new Error(`${key}: true oder false`);
    toml = setProductionVar(toml, key, v);
    changes.push(`${key} = ${v}`);
  }
  const vars = productionVars(toml);
  const legal = {status: /LEGAL_STATUS = 'freigegeben'/.test(texts) ? 'freigegeben' : 'entwurf',
    version: texts.match(/export const LEGAL_VERSION = '([^']*)'/)[1],
    docs: texts.slice(texts.indexOf('export const DOCS')).replace(/OPEN\(|CHECK\(/g, '[[OFFEN: ')};
  const problems = publicCheckoutProblems(vars, legal);
  if (problems.length) throw new Error(`Nicht zulaessig: ${problems.join('; ')}`);
  if (!dryRun) { writeFileSync(textsPath, texts); writeFileSync(tomlPath, toml); }
  return {changes, vars};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : undefined; };
  try {
    const r = goLiveConfig({root: opt('root') || process.cwd(), legalVersion: opt('legal-version'), tax: opt('tax'), checkout: opt('checkout'),
      brevoSync: opt('brevo-sync'), newsletter: opt('newsletter'), dryRun: process.argv.includes('--dry-run')});
    for (const c of r.changes) console.log(`${process.argv.includes('--dry-run') ? '[Probelauf] ' : ''}${c}`);
    console.log('Pruefung wie im Deploy-Workflow: zulaessig.');
  } catch (e) { console.error(`FEHLER: ${e.message}`); process.exit(1); }
}
