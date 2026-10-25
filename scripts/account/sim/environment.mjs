// Isolierte Gesamtumgebung: echtes PostgreSQL (frische Datenbank) + simuliertes
// Supabase + simuliertes Stripe + der unveraenderte Worker vu-account.
// Nutzen: Integrationstests (workers/vu-account/tests) und der lokale
// Entwicklungsserver (scripts/account/dev-server.mjs).
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPg, createTestDatabase} from './pg.mjs';
import {createFakeSupabase, LOCAL_KEYS} from './fake-supabase.mjs';
import {createFakeStripe} from './fake-stripe.mjs';
import {createApp} from '../../../workers/vu-account/src/index.mjs';
import {resetCatalogCache} from '../../../workers/vu-account/src/billing.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const SIM = Object.freeze({
  supabase: 'http://supabase.sim', stripe: 'http://stripe.sim', brevo: 'http://brevo.sim', api: 'https://account.sim', site: 'https://research.sim',
});

export async function createEnvironment({adminUrl = process.env.PG_TEST_URL, envOverrides = {}, site = SIM.site, api = SIM.api,
  checkoutBase, portalBase, clock} = {}) {
  if (!adminUrl) throw new Error('PG_TEST_URL fehlt');
  const db = await createTestDatabase(adminUrl, ROOT);
  const pg = createPg(db.url);
  let offset = 0;
  const now = clock || (() => Date.now() + offset);
  const supabase = await createFakeSupabase({baseUrl: SIM.supabase, pg, now});
  const stripe = createFakeStripe({now, checkoutBase, portalBase});
  const mails = []; // simuliertes Brevo (Transaktions-E-Mails des Workers)
  const fetchImpl = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    if (req.url.startsWith(SIM.supabase)) return supabase.handle(req);
    if (req.url.startsWith(SIM.stripe)) return stripe.handle(req);
    if (req.url.startsWith(SIM.brevo)) {
      if (req.headers.get('api-key') !== 'brevo-sim-key') return new Response('{"code":"unauthorized"}', {status: 401});
      const mail = await req.json();
      mails.push({to: mail.to[0].email, subject: mail.subject, text: mail.textContent, html: mail.htmlContent, sender: mail.sender.email, at: new Date(now()).toISOString()});
      return new Response(JSON.stringify({messageId: `<sim-${mails.length}@brevo.sim>`}), {status: 201});
    }
    throw new Error('NETZWERK_IN_SIMULATION_VERBOTEN ' + req.url);
  };
  const env = {
    VU_ENVIRONMENT: 'development', VU_SITE_ORIGIN: site, VU_ACCOUNT_API_ORIGIN: api,
    SUPABASE_URL: SIM.supabase, SUPABASE_PUBLISHABLE_KEY: LOCAL_KEYS.publishable, SUPABASE_SECRET_KEY: LOCAL_KEYS.secret,
    STRIPE_SECRET_KEY: stripe.secretKey, STRIPE_WEBHOOK_SECRET: stripe.webhookSecret, STRIPE_API_BASE: SIM.stripe,
    BREVO_API_KEY: 'brevo-sim-key', BREVO_API_BASE: SIM.brevo, VU_MAIL_SENDER: 'konto@visionuniverse.de',
    VU_REGISTRATION_ENABLED: 'true', ...envOverrides,
  };
  const logs = [];
  resetCatalogCache();
  const app = createApp({env, fetchImpl, now, log: (level, message, fields) => logs.push({level, message, ...fields})});

  const webhook = (raw, signature) => app.handle(new Request(api + '/v1/billing/webhook/stripe', {method: 'POST',
    headers: {'Content-Type': 'application/json', 'Stripe-Signature': signature}, body: raw}));

  return {
    app, pg, db, supabase, stripe, env, logs, now, api, site, mails,
    lastMailTo: to => [...mails].reverse().find(m => m.to === to) || null,
    advance(ms) { offset += ms; },
    deliverWebhooks: opts => stripe.sim.deliver(webhook, opts),
    webhook,
    browser: () => createBrowser(app, {api, site}),
    async close() { await db.drop(); },
  };
}

// Ein Browser mit Cookie-Speicher fuer den API-Host - so, wie die Seite den Worker nutzt.
export function createBrowser(app, {api, site}) {
  const jar = new Map();
  function store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i).trim();
      const maxAge = attrs.map(a => a.trim()).find(a => /^max-age=/i.test(a));
      if (maxAge && Number(maxAge.split('=')[1]) <= 0) jar.delete(name);
      else jar.set(name, pair.slice(i + 1));
    }
  }
  async function request(method, path, body, {headers = {}, origin = site} = {}) {
    const h = {Origin: origin, 'X-VU-Client': 'web', ...headers};
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await app.handle(new Request(api + path, {method, headers: h, body: body === undefined ? undefined : JSON.stringify(body)}));
    store(res);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return {status: res.status, data, headers: res.headers};
  }
  return {
    jar, request,
    get: (p, o) => request('GET', p, undefined, o),
    post: (p, b = {}, o) => request('POST', p, b, o),
    patch: (p, b, o) => request('PATCH', p, b, o),
    // Einem Redirect des Workers (Callback) folgen, wie der Browser es taete.
    async open(url) {
      const h = jar.size ? {Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ')} : {};
      const res = await app.handle(new Request(url, {headers: h}));
      store(res);
      return {status: res.status, location: res.headers.get('Location')};
    },
  };
}
