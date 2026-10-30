#!/usr/bin/env node
// Vision Universe — aendert ein Deploy zahlungsrelevante Schalter gegenueber dem LAUFENDEN Worker?
//
//   node scripts/account/release-guard.mjs [--toml=workers/vu-account/wrangler.toml] [--api=https://konto.visionuniverse.de]
//
// Zahlungsrelevant (nur mit ausdruecklicher Owner-Freigabe, docs/accounts/FREIGABEN.md):
//   checkout      wer bezahlen darf (testers | off | public; wirksam erst mit freigegebenen Rechtstexten)
//   legalApproved Rechtstexte freigegeben und in der Konfiguration bestaetigt
//   tax           Umsatzsteuer im Checkout (none | automatic)
//   liveApproved  Stripe-Live-Abrechnung (STRIPE_LIVE_MODE_APPROVED)
//   autoProcess   Kuendigungen automatisch ausfuehren
// Verglichen wird die gewuenschte Konfiguration (wrangler.toml, dieselbe Auswertung wie im Worker: config.mjs) mit
// dem, was https://konto.visionuniverse.de/v1/health JETZT meldet - zustandslos, ohne Lauf-Historie. Code-Aenderungen
// sind keine Freigabe-Sache: sie laufen ueber Tests und CI.
// Ausgabe fuer GitHub Actions: changed=true|false (in $GITHUB_OUTPUT, falls gesetzt). Nicht erreichbar -> changed=true.
import {readFileSync, appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../../workers/vu-account/src/config.mjs';
import {productionVars} from './check-public-checkout.mjs';

export const SENSITIVE = ['checkout', 'legalApproved', 'tax', 'liveApproved', 'autoProcess'];

// Wie der Produktions-Worker die Werte auswertet (Live-Schluessel vorausgesetzt; der echte Schluessel ist ein Secret).
export function desiredState(vars) {
  const cfg = loadConfig({...vars, STRIPE_SECRET_KEY: 'rk_live_platzhalter'});
  return {checkout: cfg.stripe.checkoutAccess, legalApproved: cfg.legal.approved, tax: cfg.stripe.tax.mode,
    liveApproved: cfg.stripe.liveApproved, autoProcess: cfg.cancellation.autoProcess};
}

// Aeltere Worker melden tax/liveApproved noch nicht: dann gilt, was sie nachweislich hatten (kein Steuerausweis;
// Live-Abrechnung genau dann, wenn /v1/plans "live" meldet).
export function liveState(health, plans) {
  return {checkout: health.checkout, legalApproved: health.legalApproved === true, tax: health.tax ?? 'none',
    liveApproved: health.liveApproved ?? (plans?.mode === 'live'), autoProcess: health.autoProcess};
}

export function sensitiveChanges(desired, live) {
  return SENSITIVE.filter(k => desired[k] !== live[k]).map(k => ({key: k, from: live[k], to: desired[k]}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  const api = opt('api') || 'https://konto.visionuniverse.de';
  const out = v => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${v}\n`); };
  try {
    const desired = desiredState(productionVars(readFileSync(opt('toml') || 'workers/vu-account/wrangler.toml', 'utf8')));
    const get = async p => { const r = await fetch(api + p, {signal: AbortSignal.timeout(20000)}); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
    const live = liveState(await get('/v1/health'), await get('/v1/plans'));
    const changes = sensitiveChanges(desired, live);
    console.log(`Laufend: ${JSON.stringify(live)}`);
    console.log(`Gewuenscht: ${JSON.stringify(desired)}`);
    for (const c of changes) console.log(`ZAHLUNGSRELEVANT: ${c.key} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
    console.log(changes.length ? 'Owner-Freigabe noetig.' : 'Keine zahlungsrelevante Aenderung - automatisch.');
    out(changes.length > 0);
  } catch (e) {
    console.log(`Laufender Worker nicht pruefbar (${e.message}) - vorsichtshalber Owner-Freigabe.`);
    out(true);
  }
}
