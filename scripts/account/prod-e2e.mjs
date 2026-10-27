#!/usr/bin/env node
// Vision Universe — Konten Ende-zu-Ende auf der Produktionsinfrastruktur.
//
// Laeuft gegen den ausgerollten Worker (https://konto.visionuniverse.de) und
// die Produktionsdatenbank, nur mit eigenen, kurzlebigen Testkonten:
//   - Testadressen e2e-<lauf>-a|b@<VU_E2E_DOMAIN> kommen auf die Positivliste
//     der Datenbank (registration_allowlist), die Registrierung bleibt fuer
//     alle anderen geschlossen.
//   - Die Konten werden ueber die Auth-Admin-API bestaetigt angelegt (kein
//     Postfach noetig) und am Ende ueber die Konto-API geloescht.
//   - Plus/Pro werden ueber eine manuelle Freigabe (billing.entitlement_overrides)
//     geprueft, nicht ueber eine Zahlung.
// Prueft: Registrierungssperre, Login/Logout, Sitzung, Passwort-Reset-Anfrage,
// Watchlist (Anlegen, zweites Geraet, Tarifgrenze Free), Trennung zweier Konten,
// Berechtigungen Free/Plus/Pro, Abrechnung ohne Live-Freigabe (503), Webhook
// ohne gueltige Signatur (abgewiesen), Datenexport, Kontoloeschung.
// Gibt keine Geheimnisse, Passwoerter oder Tokens aus.
//
//   VU_ACCOUNT_API_ORIGIN SUPABASE_URL SUPABASE_SECRET_KEY VU_SITE_ORIGIN VU_E2E_DOMAIN
//   VU_E2E_SQL (Befehl, der SQL auf stdin ausfuehrt, z. B. "psql $DB_URL -v ON_ERROR_STOP=1 -q")
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Kleiner Cookie-Speicher je "Geraet"; nur Name=Wert, Attribute werden ignoriert.
export class Jar {
  constructor() { this.c = new Map(); }
  take(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const [pair, ...attrs] = raw.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim(), value = pair.slice(i + 1).trim();
      const expired = attrs.some(a => /^\s*max-age=0\s*$/i.test(a));
      if (expired || !value) this.c.delete(name); else this.c.set(name, value);
    }
  }
  header() { return [...this.c].map(([k, v]) => `${k}=${v}`).join('; '); }
}

export function pickInstruments(n, root = ROOT) {
  const dir = resolve(root, 'quant/data/universe/instruments');
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    for (const i of d.instruments || []) {
      if (i.active === false || !/^vu_[a-f0-9]{6,32}$/.test(i.instrumentId) || !/^[A-Z0-9.-]{1,24}$/.test(i.symbol)) continue;
      out.push({instrumentId: i.instrumentId, ticker: i.symbol});
      if (out.length >= n) return out;
    }
  }
  return out;
}

export const strongPassword = () => 'Vu-' + randomBytes(12).toString('base64url') + '9aZ';

export function createClient({api, site, fetchImpl = fetch}) {
  return function device() {
    const jar = new Jar();
    return async (method, path, body) => {
      const headers = {Accept: 'application/json', Origin: site};
      if (method !== 'GET') { headers['X-VU-Client'] = 'web'; headers['Content-Type'] = 'application/json'; }
      const cookie = jar.header();
      if (cookie) headers.Cookie = cookie;
      const res = await fetchImpl(api + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual'});
      jar.take(res);
      const data = await res.json().catch(() => null);
      return {status: res.status, body: data};
    };
  };
}

export async function runE2E(env, {fetchImpl = fetch, sql, log = console.log} = {}) {
  const api = env.VU_ACCOUNT_API_ORIGIN, site = env.VU_SITE_ORIGIN, sb = env.SUPABASE_URL, key = env.SUPABASE_SECRET_KEY;
  for (const [k, v] of Object.entries({VU_ACCOUNT_API_ORIGIN: api, VU_SITE_ORIGIN: site, SUPABASE_URL: sb, SUPABASE_SECRET_KEY: key, VU_E2E_DOMAIN: env.VU_E2E_DOMAIN}))
    if (!v) throw new Error(`${k} fehlt`);
  const results = [];
  const check = (name, ok, detail = '') => { results.push({name, ok: !!ok, detail}); log(`${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` - ${detail}` : ''}`); };
  const admin = (method, path, body) => fetchImpl(`${sb}/auth/v1/admin${path}`, {method,
    headers: {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: body && JSON.stringify(body)})
    .then(async r => ({status: r.status, body: await r.json().catch(() => null)}));
  const rest = (method, path, body) => fetchImpl(`${sb}/rest/v1${path}`, {method,
    headers: {apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal'}, body: body && JSON.stringify(body)})
    .then(r => r.status);
  const device = createClient({api, site, fetchImpl});

  const run = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const mail = s => `e2e-${run}-${s}@${env.VU_E2E_DOMAIN}`.toLowerCase();
  const users = {a: {email: mail('a'), password: strongPassword()}, b: {email: mail('b'), password: strongPassword()}};
  const ids = [];
  try {
    // 1. Worker erreichbar, Registrierung geschlossen
    const pub = device();
    const h = await pub('GET', '/v1/health');
    check('Worker /v1/health', h.status === 200 && h.body?.accounts === true && h.body?.autoProcess === false,
      `accounts=${h.body?.accounts} mail=${h.body?.mail} autoProcess=${h.body?.autoProcess}`);
    const closed = await pub('POST', '/v1/auth/signup', {email: mail('fremd'), password: strongPassword(), acceptTerms: true});
    check('Registrierung fuer nicht freigegebene Adresse gesperrt', closed.status === 403 && closed.body?.state === 'REGISTRATION_CLOSED', String(closed.status));
    const plans = await pub('GET', '/v1/plans');
    check('Tarife abrufbar', plans.status === 200, `mode=${plans.body?.mode}`);

    // 2. Testkonten anlegen (Positivliste nur fuer diese beiden Adressen)
    for (const u of Object.values(users)) {
      const st = await rest('POST', '/registration_allowlist', {email: u.email});
      if (st >= 300) throw new Error(`Positivliste: ${st}`);
      const r = await admin('POST', '/users', {email: u.email, password: u.password, email_confirm: true});
      if (r.status >= 300 || !r.body?.id) throw new Error(`Testkonto anlegen: ${r.status}`);
      u.id = r.body.id; ids.push(u.id);
    }
    check('Testkonten bestaetigt angelegt (Auth-Hook liess nur Positivliste durch)', ids.length === 2);

    // 3. Login, Sitzung, zweites Geraet
    const a1 = device(), a2 = device(), b1 = device();
    const bad = await a1('POST', '/v1/auth/login', {email: users.a.email, password: users.a.password + 'x'});
    check('Falsches Passwort abgewiesen', bad.status === 401, String(bad.status));
    const la = await a1('POST', '/v1/auth/login', {email: users.a.email, password: users.a.password});
    check('Login A', la.status === 200 && la.body?.authenticated === true, String(la.status));
    const s = await a1('GET', '/v1/session');
    check('Sitzung A (HttpOnly-Cookie)', s.body?.authenticated === true && s.body?.user?.id === users.a.id);
    const me = await a1('GET', '/v1/me');
    check('Profil A', me.status === 200 && me.body?.user?.email === users.a.email);

    // 4. Watchlist: anlegen, zweites Geraet, Free-Grenze
    const inst = pickInstruments(21);
    let added = 0;
    for (const it of inst.slice(0, 3)) if ((await a1('POST', '/v1/watchlist/items', it)).status < 300) added++;
    check('Watchlist A: 3 Titel gespeichert', added === 3);
    await a2('POST', '/v1/auth/login', {email: users.a.email, password: users.a.password});
    const l2 = await a2('GET', '/v1/watchlist');
    const got = new Set((l2.body?.items || []).map(i => i.instrumentId));
    check('Zweites Geraet sieht dieselbe Watchlist', inst.slice(0, 3).every(i => got.has(i.instrumentId)), `${got.size} Titel`);
    const freeLimit = l2.body?.limits?.items;
    if (inst.length >= 21) {
      for (const it of inst.slice(3, 20)) await a2('POST', '/v1/watchlist/items', it);
      const over = await a2('POST', '/v1/watchlist/items', inst[20]);
      check('Free-Grenze 20 Titel greift', over.status === 409, `${over.status} ${over.body?.state || ''} (Grenze ${freeLimit})`);
    }

    // 5. Trennung der Konten
    const lb = await b1('POST', '/v1/auth/login', {email: users.b.email, password: users.b.password});
    check('Login B', lb.status === 200);
    const listB = await b1('GET', '/v1/watchlist');
    check('B sieht keine Titel von A', (listB.body?.items || []).length === 0, `${(listB.body?.items || []).length} Titel`);
    const rm = await b1('POST', '/v1/watchlist/items/remove', inst[0]);
    const listA = await a1('GET', '/v1/watchlist');
    check('B kann Titel von A nicht entfernen', (listA.body?.items || []).some(i => i.instrumentId === inst[0].instrumentId), `Antwort ${rm.status}`);
    const rowsA = await fetchImpl(`${sb}/rest/v1/watchlist_items?select=instrument_id`, {headers: {apikey: env.SUPABASE_PUBLISHABLE_KEY || key}});
    if (env.SUPABASE_PUBLISHABLE_KEY) check('Ohne Anmeldung keine Watchlist-Zeilen (RLS)', ((await rowsA.json().catch(() => [])) || []).length === 0);

    // 6. Berechtigungen Free/Plus/Pro (manuelle Freigabe statt Zahlung)
    const feat = async (dev, f) => (await dev('GET', `/v1/entitlements/check?feature=${f}`)).body || {};
    const f0 = await feat(a1, 'quant.screener.full');
    check('Free: quant.screener.full gesperrt', f0.allowed === false, `plan=${f0.plan}`);
    if (sql) {
      sql(`insert into billing.entitlement_overrides (user_id, plan_id, reason, valid_until) values ('${users.a.id}', 'plus', 'E2E ${run}', now() + interval '1 hour');`);
      const f1 = await feat(a1, 'quant.screener.full'), f1b = await feat(a1, 'supertrader.signals');
      check('Plus: Screener frei, Supertrader-Signale gesperrt', f1.allowed === true && f1b.allowed === false, `plan=${f1.plan}`);
      sql(`insert into billing.entitlement_overrides (user_id, plan_id, reason, valid_until) values ('${users.a.id}', 'pro', 'E2E ${run}', now() + interval '1 hour');`);
      const f2 = await feat(a1, 'supertrader.signals');
      check('Pro: Supertrader-Signale frei', f2.allowed === true, `plan=${f2.plan}`);
      const fb = await feat(b1, 'quant.screener.full');
      check('Freigabe von A wirkt nicht fuer B', fb.allowed === false, `plan=${fb.plan}`);
    } else check('Plus/Pro (manuelle Freigabe)', false, 'VU_E2E_SQL fehlt - uebersprungen');

    // 7. Abrechnung ohne Live-Freigabe, Webhook ohne Signatur
    const co = await a1('POST', '/v1/billing/checkout', {price: 'plus_month_live'});
    check('Checkout gesperrt, solange keine Live-Freigabe/Preise', co.status >= 400 && co.status !== 500, `${co.status} ${co.body?.state || ''}`);
    const wh = await fetchImpl(`${api}/v1/billing/webhook/stripe`, {method: 'POST', headers: {'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=00'},
      body: JSON.stringify({id: 'evt_e2e', type: 'customer.subscription.updated', livemode: true})});
    // Ohne Live-Freigabe 503 (Abrechnung aus), danach 400 (Signatur ungueltig) - nie 2xx.
    check('Stripe-Webhook ohne gueltige Signatur abgewiesen', [400, 503].includes(wh.status), String(wh.status));

    // 8. Passwort-Reset anfragen, Export, Logout
    const rec = await device()('POST', '/v1/auth/recover', {email: users.a.email});
    check('Passwort-Reset angefordert (E-Mail ueber Supabase/Brevo)', rec.status === 202, String(rec.status));
    const ex = await a1('GET', '/v1/me/export');
    check('Datenexport A', ex.status === 200);
    const lo = await a2('POST', '/v1/auth/logout', {});
    const s2 = await a2('GET', '/v1/session');
    check('Logout beendet die Sitzung', lo.status === 200 && s2.body?.authenticated === false);

    // 9. Kontoloeschung ueber die Konto-API
    for (const [u, dev] of [[users.a, a1], [users.b, b1]]) {
      const d = await dev('POST', '/v1/me/delete', {confirm: 'LOESCHEN', currentPassword: u.password});
      check(`Konto ${u === users.a ? 'A' : 'B'} geloescht`, d.status === 200 && d.body?.state === 'ACCOUNT_DELETED', String(d.status));
      if (d.status === 200) ids.splice(ids.indexOf(u.id), 1);
    }
  } finally {
    for (const id of ids) await admin('DELETE', `/users/${id}`);
    for (const u of Object.values(users)) await rest('DELETE', `/registration_allowlist?email=eq.${encodeURIComponent(u.email)}`);
    const left = await fetchImpl(`${sb}/rest/v1/registration_allowlist?select=email&email=like.e2e-${run}-*`,
      {headers: {apikey: key, Authorization: `Bearer ${key}`}}).then(r => r.json()).catch(() => null);
    check('Aufgeraeumt: keine Testadresse mehr auf der Positivliste', Array.isArray(left) && left.length === 0);
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cmd = process.env.VU_E2E_SQL;
  const sql = cmd ? q => { const r = spawnSync('bash', ['-c', cmd], {input: q, encoding: 'utf8'}); if (r.status !== 0) throw new Error('SQL fehlgeschlagen'); } : null;
  runE2E(process.env, {sql}).then(r => {
    const bad = r.filter(x => !x.ok);
    console.log(`\n${r.length - bad.length}/${r.length} Pruefungen bestanden`);
    process.exit(bad.length ? 1 : 0);
  }).catch(e => { console.error('Abbruch:', e.message); process.exit(1); });
}
