#!/usr/bin/env node
// Vision Universe — aendert ein Deploy zahlungsrelevante Schalter gegenueber dem LAUFENDEN Worker?
//
//   node scripts/account/release-guard.mjs [--toml=workers/vu-account/wrangler.toml] [--api=https://konto.visionuniverse.de]
//
// Zahlungsrelevante Schalter und wann eine Aenderung die ausdrueckliche Owner-Freigabe braucht
// (docs/accounts/FREIGABEN.md). Nur was Zahlungen OEFFNET oder einen Schutz ENTFERNT, wartet auf den Owner;
// was einschraenkt oder einen gepruefte Schutz hinzufuegt, rollt automatisch aus:
//   checkout      off < testers < public       Erweitern (z. B. testers -> public) = Freigabe; Einschraenken = automatisch
//   liveApproved  false < true                 Live-Abrechnung einschalten = Freigabe; ausschalten = automatisch
//   autoProcess   false < true                 Kuendigungen automatisch ausfuehren = Freigabe; ausschalten = automatisch
//   tax           none -> automatic            Stripe Tax einschalten = automatisch (der Worker prueft vor jedem Checkout
//                                              fail closed: Preis inclusive, Stripe Tax aktiv); ausschalten = Freigabe
//   legalApproved                              allein ohne Zahlungswirkung (der Checkout-Zugang beruecksichtigt ihn schon)
// Preise, Zahlungsmethoden, Webhook, Portal und Secrets aendern sich hier nie - nur ueber die freigabepflichtigen
// Workflows (account-production-stripe.yml, account-production-deploy.yml); destruktive Migrationen ueber
// account-db-approved.yml.
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

const CHECKOUT_RANK = {off: 0, testers: 1, public: 2};
// Braucht diese Aenderung die Owner-Freigabe? Unbekannte Werte: immer ja (fail closed).
export function needsApproval({key, from, to}) {
  switch (key) {
    case 'checkout': return !(to in CHECKOUT_RANK) || !(from in CHECKOUT_RANK) || CHECKOUT_RANK[to] > CHECKOUT_RANK[from];
    case 'liveApproved': case 'autoProcess': return to !== false;
    case 'tax': return to !== 'automatic';
    case 'legalApproved': return false;
    default: return true;
  }
}

export function sensitiveChanges(desired, live) {
  return SENSITIVE.filter(k => desired[k] !== live[k]).map(k => {
    const c = {key: k, from: live[k], to: desired[k]};
    return {...c, approval: needsApproval(c)};
  });
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
    for (const c of changes) console.log(`${c.approval ? 'FREIGABE NOETIG' : 'automatisch (einschraenkend/geschuetzt)'}: ${c.key} ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`);
    const approval = changes.some(c => c.approval);
    console.log(approval ? 'Owner-Freigabe noetig.' : changes.length ? 'Keine freigabepflichtige Aenderung - automatisch.' : 'Keine zahlungsrelevante Aenderung - automatisch.');
    out(approval);
  } catch (e) {
    console.log(`Laufender Worker nicht pruefbar (${e.message}) - vorsichtshalber Owner-Freigabe.`);
    out(true);
  }
}
