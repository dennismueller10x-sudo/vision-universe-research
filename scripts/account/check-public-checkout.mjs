#!/usr/bin/env node
// Vision Universe — darf der Produktions-Worker den Pro-Checkout oeffentlich anbieten?
//
//   node scripts/account/check-public-checkout.mjs [--toml=workers/vu-account/wrangler.toml]
//
// Prueft [env.production.vars] in wrangler.toml gegen die Rechtstexte im Code. VU_CHECKOUT_ACCESS "testers" oder "off"
// ist immer zulaessig. "public" nur, wenn ALLE Bedingungen erfuellt sind (docs/accounts/RECHTLICHE_ABNAHME.md):
//   1. Rechtstexte freigegeben: LEGAL_STATUS = 'freigegeben', Fassung ohne "entwurf", keine [[OFFEN]]/[[PRÜFEN]]-Stellen
//   2. VU_LEGAL_APPROVED = genau diese Fassung
//   3. STRIPE_LIVE_MODE_APPROVED = "true"
//   4. Umsatzsteuer ausgewiesen: STRIPE_TAX_MODE = automatic (Stripe Tax; RAM Consulting UG ist regelbesteuert,
//      docs/accounts/STEUER.md); "none" weist auf Belegen keine USt aus
// Der Deploy-Workflow bricht ab, wenn eine Bedingung fehlt. Ausgabe ohne Geheimnisse.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LEGAL_STATUS, LEGAL_VERSION, DOCS} from '../../workers/vu-account/src/legal/texts.mjs';

export function productionVars(toml) {
  const out = {};
  let inside = false;
  for (const line of toml.split('\n')) {
    if (/^\s*\[/.test(line)) { inside = /^\s*\[env\.production\.vars\]\s*$/.test(line); continue; }
    const m = inside && line.match(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function publicCheckoutProblems(vars, legal = {status: LEGAL_STATUS, version: LEGAL_VERSION, docs: DOCS}) {
  const access = vars.VU_CHECKOUT_ACCESS;
  if (access === 'testers' || access === 'off') return [];
  if (access !== 'public') return [`VU_CHECKOUT_ACCESS muss testers, off oder public sein (ist "${access ?? ''}")`];
  const problems = [];
  if (legal.status !== 'freigegeben') problems.push(`Rechtstexte nicht freigegeben (LEGAL_STATUS = '${legal.status}')`);
  if (/entwurf/i.test(legal.version)) problems.push(`Fassung ${legal.version} ist eine Entwurfsfassung`);
  if (/\[\[(OFFEN|PRÜFEN)/.test(JSON.stringify(legal.docs))) problems.push('Rechtstexte enthalten noch [[OFFEN]]/[[PRÜFEN]]-Stellen');
  if (vars.VU_LEGAL_APPROVED !== legal.version) problems.push(`VU_LEGAL_APPROVED ("${vars.VU_LEGAL_APPROVED ?? ''}") ist nicht die Fassung ${legal.version}`);
  if (vars.STRIPE_LIVE_MODE_APPROVED !== 'true') problems.push('STRIPE_LIVE_MODE_APPROVED ist nicht "true"');
  if (vars.STRIPE_TAX_MODE !== 'automatic') problems.push('STRIPE_TAX_MODE weist keine Umsatzsteuer aus ("automatic" noetig, Stripe Tax)');
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find(a => a.startsWith('--toml='));
  const vars = productionVars(readFileSync(arg ? arg.slice(7) : 'workers/vu-account/wrangler.toml', 'utf8'));
  const problems = publicCheckoutProblems(vars);
  console.log(`Checkout: ${vars.VU_CHECKOUT_ACCESS}; Rechtstexte ${LEGAL_VERSION} (${LEGAL_STATUS}); Steuer ${vars.STRIPE_TAX_MODE || '-'}`);
  for (const p of problems) console.error(`::error::Oeffentlicher Checkout: ${p}`);
  process.exit(problems.length ? 1 : 0);
}
