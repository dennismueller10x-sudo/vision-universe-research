#!/usr/bin/env node
// Vision Universe — Entwicklungsumgebung Ende-zu-Ende pruefen (nur lesend).
//
//   VU_ACCOUNT_API_ORIGIN=https://… SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_… \
//   STRIPE_SETUP_KEY=sk_test_… BREVO_API_KEY=… VU_MAIL_SENDER=… node scripts/account/dev-doctor.mjs
//
// Prueft Worker (/v1/health, /v1/plans), Supabase (plan_prices zeigen auf echte
// Test-Preise), Stripe (Preise im Testmodus mit passendem Betrag, Webhook aktiv
// und mit allen Ereignissen) und Brevo. Fehlt ein Zugang, wird der Teil als
// "uebersprungen" gemeldet. Exit 1 bei einem Fehler. Gibt keine Werte aus.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTestKey, API_VERSION, WEBHOOK_EVENTS} from './stripe-test-setup.mjs';
import {checkBrevo} from './brevo-check.mjs';

export async function doctor(env, {fetchImpl = fetch} = {}) {
  const results = [];
  const ok = (area, msg) => results.push({area, level: 'ok', msg});
  const fail = (area, msg) => results.push({area, level: 'error', msg});
  const skip = (area, msg) => results.push({area, level: 'skip', msg});
  const getJson = async (url, headers = {}) => {
    const res = await fetchImpl(url, {headers: {Accept: 'application/json', ...headers}});
    return {status: res.status, body: await res.json().catch(() => null)};
  };
  const api = String(env.VU_ACCOUNT_API_ORIGIN || '');

  let catalog = null;
  if (!/^https:\/\/[a-z0-9.-]+$/.test(api)) skip('worker', 'VU_ACCOUNT_API_ORIGIN nicht gesetzt (Worker noch nicht ausgerollt)');
  else {
    try {
      const h = (await getJson(`${api}/v1/health`)).body || {};
      if (h.state !== 'OK') fail('worker', '/v1/health antwortet nicht mit OK');
      else {
        h.accounts ? ok('worker', 'Konten angeschlossen (Supabase)') : fail('worker', 'Konten nicht angeschlossen (SUPABASE_* fehlt im Worker)');
        h.autoProcess === false ? ok('worker', 'Kuendigungen ohne Anmeldung werden nicht automatisch ausgefuehrt') : fail('worker', 'VU_CANCELLATION_AUTO_PROCESS ist nicht false');
        h.mail ? ok('worker', 'E-Mail-Versand konfiguriert') : fail('worker', 'E-Mail-Versand nicht konfiguriert (BREVO_API_KEY/VU_MAIL_SENDER)');
        h.cancellations === 'ok' ? ok('worker', 'Kuendigungen: nichts ueberfaellig') : fail('worker', `Kuendigungen: ${h.cancellations}`);
      }
      const p = await getJson(`${api}/v1/plans`);
      catalog = p.body;
      if (p.status !== 200 || !catalog) fail('worker', `/v1/plans: ${p.status}`);
      else if (catalog.mode !== 'test') fail('worker', 'Stripe-Modus ist nicht "test"');
      else ok('worker', 'Tarife im Testmodus');
    } catch (e) { fail('worker', `nicht erreichbar (${e.message})`); }
  }

  let rows = null;
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) skip('supabase', 'SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY nicht gesetzt');
  else {
    const r = await getJson(`${env.SUPABASE_URL}/rest/v1/plan_prices?provider=eq.stripe&livemode=is.false&active=is.true&select=id,provider_price_id,unit_amount,currency,billing_interval`,
      {apikey: env.SUPABASE_PUBLISHABLE_KEY}).catch(e => ({status: 0, error: e.message}));
    if (r.status !== 200 || !Array.isArray(r.body)) fail('supabase', `plan_prices nicht lesbar (${r.status}; Migrationen eingespielt?)`);
    else {
      rows = r.body;
      const placeholders = rows.filter(x => !/^price_[A-Za-z0-9]{8,}$/.test(x.provider_price_id) || x.provider_price_id.startsWith('price_test_'));
      rows.length === 4 ? ok('supabase', '4 Test-Preise eingetragen') : fail('supabase', `${rows.length} statt 4 Test-Preisen`);
      placeholders.length ? fail('supabase', `Platzhalter statt echter Stripe-Preise: ${placeholders.map(x => x.id).join(', ')}`) : ok('supabase', 'Preise zeigen auf echte Stripe-IDs');
    }
  }

  if (!env.STRIPE_SETUP_KEY) skip('stripe', 'STRIPE_SETUP_KEY nicht gesetzt');
  else {
    try {
      assertTestKey(env.STRIPE_SETUP_KEY);
      const sget = path => getJson(`https://api.stripe.com${path}`, {Authorization: `Bearer ${env.STRIPE_SETUP_KEY}`, 'Stripe-Version': API_VERSION});
      for (const row of rows || []) {
        const {status, body} = await sget(`/v1/prices/${encodeURIComponent(row.provider_price_id)}`);
        if (status !== 200) { fail('stripe', `${row.id}: Preis in Stripe nicht gefunden`); continue; }
        const fits = body.livemode === false && body.active && body.unit_amount === row.unit_amount
          && body.currency === row.currency.toLowerCase() && body.recurring?.interval === row.billing_interval;
        fits ? ok('stripe', `${row.id}: passt`) : fail('stripe', `${row.id}: Betrag/Intervall/Modus weicht ab`);
      }
      if (/^https:\/\//.test(api)) {
        const hooks = (await sget('/v1/webhook_endpoints?limit=100')).body?.data || [];
        const hook = hooks.find(h => h.url === `${api}/v1/billing/webhook/stripe`);
        if (!hook) fail('stripe', 'kein Webhook auf den Worker');
        else {
          const missing = WEBHOOK_EVENTS.filter(e => !hook.enabled_events.includes(e) && !hook.enabled_events.includes('*'));
          hook.status === 'enabled' && !missing.length ? ok('stripe', 'Webhook aktiv, alle Ereignisse') : fail('stripe', `Webhook: Status ${hook.status}, fehlend: ${missing.join(', ') || '-'}`);
        }
      }
    } catch (e) { fail('stripe', e.message); }
  }

  if (!env.BREVO_API_KEY) skip('brevo', 'BREVO_API_KEY nicht gesetzt');
  else {
    const b = await checkBrevo({apiKey: env.BREVO_API_KEY, sender: env.VU_MAIL_SENDER, fetchImpl});
    b.ok ? ok('brevo', 'Schluessel, Absender und Domain in Ordnung') : b.problems.forEach(p => fail('brevo', p));
  }
  return {ok: !results.some(r => r.level === 'error'), results};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  doctor(process.env).then(({ok, results}) => {
    const mark = {ok: 'OK  ', error: 'FEHLER', skip: '--  '};
    for (const r of results) console.log(`${mark[r.level]} ${r.area.padEnd(8)} ${r.msg}`);
    if (!ok) process.exit(1);
  });
}
