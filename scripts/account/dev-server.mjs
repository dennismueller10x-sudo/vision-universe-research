#!/usr/bin/env node
// Vision Universe — lokale Konto- und Abo-Umgebung (nur Entwicklung).
//
//   PG_TEST_URL=postgresql://postgres@localhost:5432/postgres node scripts/account/dev-server.mjs [--port=8790]
//
// Ein Port fuer alles, nur auf 127.0.0.1:
//   /konto/…            die echten Kontoseiten aus dem Repository
//   /v1/…               der unveraenderte Worker vu-account
//   /__dev/             Uebersicht: simuliertes Postfach, Checkout, Kundenportal
// Supabase und Stripe sind simuliert (scripts/account/sim/), die Datenbank ist
// eine frische PostgreSQL-Datenbank mit allen Migrationen. Keine Verbindung zu
// echten Diensten, keine echten Konten, keine Zahlungen.
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEnvironment} from './sim/environment.mjs';
import {SIM_PRICES} from './sim/fake-stripe.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number((process.argv.find(a => a.startsWith('--port=')) || '--port=8790').slice(7));
const origin = `http://localhost:${port}`;
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};

const env = await createEnvironment({site: origin, api: origin, checkoutBase: `${origin}/__dev/checkout`, portalBase: `${origin}/__dev/portal`,
  envOverrides: {VU_COOKIE_SECURE: 'false', VU_ALLOWED_ORIGINS: origin, STRIPE_CHECKOUT_HOSTS: 'localhost'}});
const {sim} = env.stripe;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function page(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Simulation</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px;background:#f5f5f5;color:#111}
.box{background:#fff;border:1px solid #ddd;border-radius:16px;padding:20px;margin:16px 0}button,a.btn{font:inherit;min-height:44px;padding:10px 18px;border-radius:999px;border:1px solid #111;background:#c8f531;color:#111;cursor:pointer;text-decoration:none;display:inline-block;margin:4px 6px 4px 0}
button.alt{background:#fff}.warn{background:#fff3cd;border-color:#e0b100}code{background:#eee;padding:1px 5px;border-radius:5px}</style></head>
<body><p class="box warn"><strong>Lokale Simulation.</strong> Kein echtes Stripe, kein echtes Supabase, keine Zahlung.</p><h1>${esc(title)}</h1>${body}
<p><a href="/__dev/">Simulation</a> · <a href="/konto/">Konto</a></p></body></html>`;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

async function toWorker(req, url) {
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  if (!headers.has('origin') && req.method !== 'GET') headers.set('origin', origin);
  headers.set('CF-Connecting-IP', '127.0.0.1');
  return env.app.handle(new Request(origin + url.pathname + url.search, {method: req.method, headers, body}));
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const redirect = (res, to) => { res.writeHead(303, {Location: to}); res.end(); };
const html = (res, text) => { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(text); };

async function devRoute(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['__dev', …]
  if (parts.length === 1) {
    return html(res, page('Konto-Simulation', `<div class="box"><p>Vorgeschlagener Ablauf:</p><ol>
<li><a href="/konto/registrieren/">Konto erstellen</a> (Registrierung ist in der Simulation offen)</li>
<li><a href="/__dev/mail">Postfach</a> öffnen und den Bestätigungslink anklicken</li>
<li><a href="/konto/tarife/">Tarif wählen</a> → simulierter Checkout → Zahlung erfolgreich oder fehlgeschlagen</li>
<li><a href="/konto/abo/">Abonnement</a>: Kundenportal (Tarifwechsel, Zahlungsausfall, Kündigung), <a href="/konto/kuendigen/">Kündigungsbutton</a></li>
<li><a href="/konto/einstellungen/">Einstellungen</a>: Datenexport, Passwort, Konto löschen</li></ol>
<p>Webhook-Ereignisse bisher: ${sim.events.length} (zugestellt: ${sim.events.filter(e => e.delivered).length}). <a href="/__dev/events">Ansehen</a></p></div>`));
  }
  if (parts[1] === 'mail') {
    const rows = [...env.supabase.outbox].reverse().map(m => `<div class="box"><p><strong>${esc(m.type === 'signup' ? 'E-Mail bestätigen' : 'Passwort zurücksetzen')}</strong> an ${esc(m.to)} · ${esc(m.sentAt)}</p>
<a class="btn" href="/__dev/verify?link=${encodeURIComponent(m.link)}">Link öffnen</a></div>`).join('');
    return html(res, page('Postfach', rows || '<p class="box">Noch keine E-Mails.</p>'));
  }
  if (parts[1] === 'verify') {
    const link = url.searchParams.get('link') || '';
    if (!link.startsWith(env.supabase.baseUrl + '/auth/v1/verify?')) return html(res, page('Link', '<p>Unbekannter Link.</p>'));
    const r = await env.supabase.handle(new Request(link));
    return redirect(res, r.headers.get('Location'));
  }
  if (parts[1] === 'events') {
    const rows = [...sim.events].reverse().map(e => `<li><code>${esc(e.type)}</code> ${esc(e.id)} ${e.delivered ? '✓' : '…'}</li>`).join('');
    return html(res, page('Stripe-Ereignisse (signiert zugestellt)', `<ul class="box">${rows || '<li>keine</li>'}</ul>`));
  }
  if (parts[1] === 'checkout' && parts[2]) {
    const session = sim.sessions.get(parts[2]);
    if (!session) return html(res, page('Checkout', '<p>Unbekannte Sitzung.</p>'));
    if (req.method === 'POST') {
      const action = parts[3];
      if (action === 'cancel' || session.status !== 'open') return redirect(res, session.cancel_url);
      sim.completeCheckout(session.id, {paid: action === 'pay'});
      await env.deliverWebhooks();
      return redirect(res, action === 'pay' ? session.success_url.replace('{CHECKOUT_SESSION_ID}', session.id) : session.cancel_url);
    }
    const price = session.line_items[0].price;
    return html(res, page('Simulierter Stripe Checkout', `<div class="box"><p>Abonnement: <code>${esc(price)}</code> · ${esc((SIM_PRICES[price]?.amount / 100).toFixed(2))} € / ${esc(SIM_PRICES[price]?.interval === 'year' ? 'Jahr' : 'Monat')}</p>
<form method="post" action="/__dev/checkout/${esc(session.id)}/pay"><button>Zahlungspflichtig abonnieren (Zahlung erfolgreich)</button></form>
<form method="post" action="/__dev/checkout/${esc(session.id)}/fail"><button class="alt">Karte wird abgelehnt</button></form>
<form method="post" action="/__dev/checkout/${esc(session.id)}/cancel"><button class="alt">Abbrechen</button></form></div>`));
  }
  if (parts[1] === 'portal' && parts[2]) {
    const customer = parts[2];
    const subs = [...sim.subscriptions.values()].filter(s => s.customer === customer);
    if (req.method === 'POST') {
      const sub = sim.subscriptions.get(parts[3]);
      const action = parts[4];
      if (sub && sub.customer === customer) {
        if (action === 'renew-ok') sim.renew(sub.id, {paid: true});
        if (action === 'renew-fail') sim.renew(sub.id, {paid: false});
        if (action === 'unpaid') sim.markUnpaid(sub.id);
        if (action === 'cancel') sim.scheduleCancel(sub.id);
        if (action === 'end') sim.endPeriod(sub.id);
        if (SIM_PRICES[action]) sim.changePrice(sub.id, action);
        await env.deliverWebhooks();
      }
      return redirect(res, `/__dev/portal/${customer}`);
    }
    const actions = s => ['renew-ok', 'renew-fail', 'unpaid', 'cancel', 'end', ...Object.keys(SIM_PRICES)].map(a =>
      `<form method="post" action="/__dev/portal/${esc(customer)}/${esc(s.id)}/${esc(a)}" style="display:inline"><button class="alt">${esc({
        'renew-ok': 'Verlängerung bezahlt', 'renew-fail': 'Verlängerung fehlgeschlagen', unpaid: 'Endgültig unbezahlt',
        cancel: 'Zum Laufzeitende kündigen', end: 'Laufzeitende erreichen'}[a] || 'Wechsel zu ' + a)}</button></form>`).join('');
    const list = subs.map(s => `<div class="box"><p><code>${esc(s.id)}</code> · Status <strong>${esc(s.status)}</strong> · Preis <code>${esc(s.items.data[0].price.id)}</code>${s.cancel_at_period_end ? ' · gekündigt zum Laufzeitende' : ''}</p>${actions(s)}</div>`).join('');
    return html(res, page('Simuliertes Kundenportal', (list || '<p class="box">Keine Abonnements.</p>') + `<p><a class="btn" href="/konto/abo/">Zurück zu Vision Universe</a></p>`));
  }
  return html(res, page('Nicht gefunden', ''));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/v1/')) return await send(res, await toWorker(req, url));
    if (url.pathname === '/__dev' || url.pathname.startsWith('/__dev/')) return await devRoute(req, res, url);
    if (url.pathname === '/konto/config.js') {
      res.writeHead(200, {'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store'});
      return res.end(`globalThis.VU_ACCOUNT_CONFIG = ${JSON.stringify({endpoint: origin, localSimulation: true})};`);
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, path);
    if (!file.startsWith(ROOT) || /(^|\/)\.|\/(scripts|docs|supabase|providers)\//.test(path)) { res.writeHead(404); return res.end(); }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file).catch(() => null);
    if (!data) { res.writeHead(404); return res.end('nicht gefunden'); }
    res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(data);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end('Fehler');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Konto-Simulation laeuft: ${origin}/__dev/   (Datenbank ${env.db.name}, Strg+C beendet und loescht sie)`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await env.close(); process.exit(0); });
