// Insights: Google-Search-Console-Bericht für den Tageslauf (intern, nicht ausgeliefert).
//   GSC_SERVICE_ACCOUNT_JSON='<json>' node products/insights/search-console.mjs --out <datei> [--ohne-sitemap] [--ohne-pruefung]
// Meldet sich mit dem Dienstkonto an (JWT, RS256, ohne Abhängigkeiten), reicht die Insights-Sitemap ein, prüft für die
// neuesten Artikel den Indexierungsstand (URL-Prüfung) und holt Klicks, Impressionen, Klickrate und Position der letzten
// 28 Tage je Seite, je Suchbegriff und je Tag. Der Workflow content.yml (Teil search-console) legt den Bericht in den
// Datenzweig (seo/search-console/latest.json, core/registry/data-branch.json internal); der Tageslauf liest ihn dort.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PROPERTY = 'sc-domain:visionuniverse.de';
export const BASIS = 'https://research.visionuniverse.de';
export const SITEMAP = BASIS + '/insights/sitemap.xml';
const SCOPE = 'https://www.googleapis.com/auth/webmasters';
const MAX_PRUEFUNGEN = 30;

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function jwt(konto, jetzt = Math.floor(Date.now() / 1000)) {
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const inhalt = b64url(JSON.stringify({ iss: konto.client_email, scope: SCOPE, aud: konto.token_uri || 'https://oauth2.googleapis.com/token', iat: jetzt, exp: jetzt + 3600 }));
  const sig = crypto.createSign('RSA-SHA256').update(kopf + '.' + inhalt).sign(konto.private_key);
  return kopf + '.' + inhalt + '.' + b64url(sig);
}

async function token(konto) {
  const r = await fetch(konto.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt(konto) }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Anmeldung bei Google gescheitert: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

function api(tok) {
  return async (methode, url, body) => {
    const r = await fetch(url, { method: methode, headers: { authorization: 'Bearer ' + tok, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    const j = text ? JSON.parse(text) : {};
    if (!r.ok) throw new Error(`${methode} ${url.replace(/\?.*/, '')}: ${r.status} ${j.error?.message || text.slice(0, 200)}`);
    return j;
  };
}

const tag = (d) => d.toISOString().slice(0, 10);
const runde = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
const zeile = (r) => ({ klicks: r.clicks, impressionen: r.impressions, ctr: runde(r.ctr * 100, 1), position: runde(r.position, 1) });

// Für Tests ohne Netz: wandelt Antworten der Search-Analytics-API in den Bericht.
export function auswerten({ seiten = [], begriffe = [], tage = [], gesamt = [] }) {
  return {
    insights: gesamt[0] ? zeile(gesamt[0]) : { klicks: 0, impressionen: 0, ctr: 0, position: null },
    seiten: seiten.map((r) => ({ url: r.keys[0].replace(BASIS, ''), ...zeile(r) })),
    begriffe: begriffe.map((r) => ({ begriff: r.keys[0], url: r.keys[1].replace(BASIS, ''), ...zeile(r) })),
    tage: tage.map((r) => ({ datum: r.keys[0], ...zeile(r) })),
  };
}

async function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const out = arg('--out');
  if (!out) throw new Error('--out <datei> fehlt');
  const roh = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!roh) throw new Error('GSC_SERVICE_ACCOUNT_JSON fehlt');
  const konto = JSON.parse(roh);
  const call = api(await token(konto));
  const site = encodeURIComponent(PROPERTY);
  const wm = 'https://www.googleapis.com/webmasters/v3/sites/' + site;
  const bericht = { schema: 'vu-search-console-1', erzeugt: new Date().toISOString(), property: PROPERTY, konto: konto.client_email, hinweise: [] };

  if (!process.argv.includes('--ohne-sitemap')) {
    try { await call('PUT', wm + '/sitemaps/' + encodeURIComponent(SITEMAP)); bericht.sitemapEingereicht = SITEMAP; }
    catch (e) { bericht.hinweise.push('Sitemap: ' + e.message); }
  }
  try {
    const s = await call('GET', wm + '/sitemaps');
    bericht.sitemaps = (s.sitemap || []).map((x) => ({ pfad: x.path, gelesen: x.lastDownloaded || null, ausstehend: !!x.isPending, fehler: Number(x.errors || 0), warnungen: Number(x.warnings || 0), eingereicht: (x.contents || []).reduce((a, c) => a + Number(c.submitted || 0), 0) }));
  } catch (e) { bericht.hinweise.push('Sitemaps: ' + e.message); }

  // Search Analytics: Daten liegen 2–3 Tage zurück; Fenster 28 Tage bis gestern.
  const bis = new Date(Date.now() - 864e5), von = new Date(Date.now() - 28 * 864e5);
  bericht.zeitraum = { von: tag(von), bis: tag(bis) };
  const filter = [{ filters: [{ dimension: 'page', operator: 'contains', expression: BASIS + '/insights/' }] }];
  const q = (dimensions, rowLimit) => call('POST', wm + '/searchAnalytics/query', { startDate: tag(von), endDate: tag(bis), dimensions, dimensionFilterGroups: filter, rowLimit, dataState: 'all' }).then((r) => r.rows || []);
  try {
    const [gesamt, seiten, begriffe, tage] = await Promise.all([q([], 1), q(['page'], 200), q(['query', 'page'], 200), q(['date'], 40)]);
    Object.assign(bericht, auswerten({ gesamt, seiten, begriffe, tage }));
    const dom = await call('POST', wm + '/searchAnalytics/query', { startDate: tag(von), endDate: tag(bis), dimensions: [], rowLimit: 1, dataState: 'all' });
    bericht.domainGesamt = dom.rows?.[0] ? zeile(dom.rows[0]) : null;
  } catch (e) { bericht.hinweise.push('Suchanalyse: ' + e.message); }

  // URL-Prüfung (Kontingent 2.000 je Tag): Übersicht und die neuesten Artikel.
  if (!process.argv.includes('--ohne-pruefung')) {
    const liste = JSON.parse(fs.readFileSync(path.join(root, 'insights/artikel.json'), 'utf8')).artikel;
    const urls = ['/insights/', ...[...liste].sort((a, b) => b.datum.localeCompare(a.datum)).map((a) => a.href)].slice(0, MAX_PRUEFUNGEN);
    bericht.indexierung = [];
    for (const u of urls) {
      try {
        const r = await call('POST', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: BASIS + u, siteUrl: PROPERTY, languageCode: 'de-DE' });
        const x = r.inspectionResult?.indexStatusResult || {};
        bericht.indexierung.push({ url: u, urteil: x.verdict || null, stand: x.coverageState || null, zuletztGecrawlt: x.lastCrawlTime || null, robots: x.robotsTxtState || null, indexierbar: x.indexingState || null, kanonisch: x.googleCanonical || null });
      } catch (e) { bericht.indexierung.push({ url: u, fehler: e.message }); }
    }
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bericht, null, 1) + '\n');
  const ix = bericht.indexierung || [];
  console.log(`Search Console ${bericht.zeitraum.von} bis ${bericht.zeitraum.bis}: Insights ${bericht.insights?.klicks ?? '?'} Klicks, ${bericht.insights?.impressionen ?? '?'} Impressionen; indexiert ${ix.filter((x) => x.urteil === 'PASS').length}/${ix.length}`);
  for (const x of ix) console.log(`  ${x.url}: ${x.fehler ? 'Fehler ' + x.fehler : (x.urteil || '?') + ' · ' + (x.stand || '?') + (x.zuletztGecrawlt ? ' · gecrawlt ' + x.zuletztGecrawlt.slice(0, 10) : '')}`);
  for (const s of bericht.sitemaps || []) console.log(`  Sitemap ${s.pfad}: gelesen ${s.gelesen || 'noch nicht'}, ${s.eingereicht} Adressen, ${s.fehler} Fehler`);
  for (const h of bericht.hinweise) console.log('Hinweis: ' + h);
  if (bericht.hinweise.length && !bericht.insights && !ix.some((x) => !x.fehler)) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
