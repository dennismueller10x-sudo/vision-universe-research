/* Diagnose fuer die Produktions-QA im Browser (live-production-qa.mjs, production-off-qa.mjs).
 *
 * Bisher enthielt der Fehlerbericht keine Browser-Konsole, keine fehlgeschlagenen Requests und keine Auslieferungs-Header
 * (Lauf 38442805914: "Gerade nicht erreichbar", responses: [], errors: []). Dieses Modul sammelt sie, ohne Assertions
 * oder Timeouts zu beruehren.
 *
 * Keine Geheimnisse: nur eine Allowlist von Antwort-Headern (kein set-cookie, kein authorization), URLs ohne Query ausser
 * dem Release-Stempel ?v=, Seitentext begrenzt. Der Aufrufer redigiert den fertigen Bericht zusaetzlich mit seiner
 * Geheimnisliste. Bewusst KEIN Playwright-Trace: er zeichnet die Argumente von addInitScript auf, und das enthaelt den
 * aus dem Zugangspasswort abgeleiteten Zugangsschluessel; Screenshot, Request-Protokoll und Seitenzustand genuegen.
 */
export const RESPONSE_HEADERS = ['age', 'x-cache', 'x-cache-hits', 'x-served-by', 'last-modified', 'etag', 'content-type', 'content-length', 'cache-control'];

export function safeUrl(url, origin = '') {
 try {
  const u = new URL(url);
  const v = u.searchParams.get('v');
  return (u.origin === origin ? '' : u.origin) + u.pathname + (v ? '?v=' + v.slice(0, 32) : '');
 } catch { return String(url).slice(0, 200); }
}

export function pickHeaders(headers) {
 const out = {};
 for (const key of RESPONSE_HEADERS) if (headers && headers[key] != null) out[key] = String(headers[key]).slice(0, 200);
 return out;
}

const CRITICAL = /\.(?:js|css|json)$/;

/**
 * Haengt Listener an eine Playwright-Seite. Gibt die gesammelten Listen zurueck (werden laufend gefuellt).
 * console: nur type 'error'; failed: requestfailed; http: Antworten >= 400 desselben Ursprungs;
 * served: Skript-/Daten-Antworten desselben Ursprungs (Status + Header) - zeigt, welcher Stand ausgeliefert wurde.
 */
export function attachDiagnostics(page, {origin = '', limit = 60} = {}) {
 const d = {console: [], pageErrors: [], failed: [], http: [], served: []};
 const push = (list, item) => { if (list.length < limit) list.push(item); };
 page.on('console', m => { if (m.type() === 'error') push(d.console, String(m.text()).slice(0, 300)); });
 page.on('pageerror', e => push(d.pageErrors, String(e?.message ?? e).slice(0, 300)));
 page.on('requestfailed', r => push(d.failed, {url: safeUrl(r.url(), origin), error: String(r.failure?.()?.errorText || '').slice(0, 120)}));
 page.on('response', r => {
  const url = r.url();
  if (!origin || !url.startsWith(origin)) return;
  const status = r.status(), entry = {url: safeUrl(url, origin), status, headers: pickHeaders(r.headers?.())};
  if (status >= 400) push(d.http, entry);
  else if (CRITICAL.test(new URL(url).pathname)) push(d.served, entry);
 });
 return d;
}

/** Seitenzustand im Fehlerfall (im Browser ausgewertet; liest weder localStorage noch Cookies). */
export function pageStateInBrowser() {
 const q = s => document.querySelector(s);
 const meta = q('meta[name="vu-release"]');
 let lazy = {present: false};
 try {
  const L = globalThis.VUDiscover && globalThis.VUDiscover.Lazy;
  if (L) lazy = {present: true, stamp: L.stamp(), detailSources: L.sources('detail').length};
 } catch (e) { lazy = {present: true, error: String(e && e.message).slice(0, 120)}; }
 let reloadFlag = null;
 try { reloadFlag = sessionStorage.getItem('vu-lazy-reload'); } catch { /* ohne Speicher */ }
 let resources = [];
 try {
  resources = performance.getEntriesByType('resource')
   .filter(e => e.name.startsWith(location.origin) && /\.(?:js|css)(?:\?|$)/.test(e.name))
   .map(e => ({n: e.name.slice(location.origin.length).slice(0, 160), s: e.responseStatus || 0}));
 } catch { /* ohne Resource Timing */ }
 const suspicious = resources.filter(r => r.s === 0 || r.s >= 400);
 const h2 = q('main h2, .dx-message h2, h2');
 return {
  href: location.pathname + location.hash, readyState: document.readyState,
  metaRelease: meta ? meta.content : null, metaProduct: meta ? meta.dataset.product : null,
  lazy, lazyReloadFlag: reloadFlag, accessGate: !!q('#research-access-gate'),
  heading: h2 ? h2.innerText.slice(0, 120) : null, ciSections: document.querySelectorAll('.ci-company-intelligence').length,
  vuCompanyIntelligenceRollout: globalThis.VUCompanyIntelligenceRollout ? {stage: globalThis.VUCompanyIntelligenceRollout.stage, productionOff: globalThis.VUCompanyIntelligenceRollout.productionOff} : null,
  scriptResources: resources.length, scriptResourcesSuspicious: suspicious.slice(0, 40), text: document.body.innerText.slice(0, 400)
 };
}

/** Begrenzt jede Diagnose-Abfrage; ein haengender Browser darf den Fehlerbericht nicht verhindern. */
export const bounded = (promise, fallback, ms = 5000) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);

export async function collectFailure(page, diagnostics, {screenshotPath, ms = 5000} = {}) {
 if (!page) return {page: null, diagnostics};
 const state = await bounded(page.evaluate(pageStateInBrowser).catch(e => ({error: String(e?.message).slice(0, 200)})), null, ms);
 let screenshot = null;
 if (screenshotPath) screenshot = await bounded(page.screenshot({path: screenshotPath}).then(() => screenshotPath).catch(() => null), null, ms);
 return {page: state, diagnostics, screenshot};
}
