#!/usr/bin/env node
// Vision Universe — Abo-Abgleich Stripe -> Supabase.
//
// Stripe ist die fuehrende Quelle fuer Zahlungszustaende. Dieser Abgleich holt
// alle Abos (seitenweise) und spielt sie ueber dieselbe Datenbankfunktion ein
// wie der Webhook (billing_apply_subscription: Kunde->Nutzer, Preis->Tarif,
// Reihenfolge). Einsatz: verpasste Webhooks, Wiederherstellung nach
// Datenverlust, Kontrolle vor der Live-Freigabe. Liest nur bei Stripe.
//
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SECRET_KEY=… STRIPE_SECRET_KEY=sk_test_… \
//     node scripts/account/reconcile-stripe.mjs [--dry-run]
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formEncode} from '../../workers/vu-account/src/stripe.mjs';
import {createSupabase, createBillingStore} from '../../workers/vu-account/src/supabase.mjs';
import {normalizeStripeSubscription} from '../../workers/vu-account/src/providers/stripe-adapter.mjs';
import {loadConfig} from '../../workers/vu-account/src/config.mjs';

export async function reconcile({env, fetchImpl = fetch, dryRun = false, now = () => Date.now(), log = console.log}) {
  const cfg = loadConfig(env);
  if (cfg.stripe.mode === 'live' && !cfg.stripe.liveApproved) throw new Error('BILLING_LIVE_MODE_NOT_APPROVED');
  if (!['test', 'live'].includes(cfg.stripe.mode)) throw new Error('STRIPE_KEY_MISSING');
  const sb = createSupabase({url: cfg.supabase.url, publishableKey: cfg.supabase.publishableKey, secretKey: cfg.supabase.secretKey, fetchImpl});
  const store = createBillingStore(sb.service);
  const report = {seen: 0, applied: 0, stale: 0, failed: []};
  let after = null;
  for (;;) {
    const params = {status: 'all', limit: 100, expand: ['data.items.data.price'], ...(after ? {starting_after: after} : {})};
    const res = await fetchImpl(`${cfg.stripe.apiBase}/v1/subscriptions?${formEncode(params)}`,
      {headers: {Authorization: `Bearer ${cfg.stripe.secretKey}`, 'Stripe-Version': cfg.stripe.apiVersion}});
    if (!res.ok) throw new Error(`STRIPE_LIST_FAILED_${res.status}`);
    const page = await res.json();
    for (const sub of page.data || []) {
      report.seen++;
      try {
        const snapshot = normalizeStripeSubscription(sub, {stateAt: new Date(now()).toISOString()});
        if (dryRun) continue;
        const r = await store.applySubscription(snapshot);
        if (r.stale) report.stale++; else report.applied++;
      } catch (e) {
        report.failed.push({subscription: sub.id, code: String(e.upstreamMessage ? `${e.code}:${e.upstreamMessage}` : e.code || e.message).slice(0, 120)});
      }
    }
    if (!page.has_more || !page.data?.length) break;
    after = page.data[page.data.length - 1].id;
  }
  log(JSON.stringify(report));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await reconcile({env: process.env, dryRun: process.argv.includes('--dry-run')});
  process.exit(report.failed.length ? 1 : 0);
}
