#!/usr/bin/env node
// Vision Universe — Nutzerreise Free und Pro im echten Browser gegen die lokale Simulation.
//
//   node scripts/account/dev-server.mjs --port=8792 --checkout-access=testers &      (braucht PG_TEST_URL)
//   node scripts/account/journey-qa.mjs --url=http://localhost:8792 --out=/tmp/journey-qa [--engine=webkit]
//
// Wie in der Produktion: Pro-Checkout nur fuer Konten mit Rolle billing_tester (VU_CHECKOUT_ACCESS = "testers").
// Geprueft werden:
//   Free   /preise/ -> Free -> Registrierung -> Bestaetigung -> Willkommensseite -> Mein Dashboard -> Watchlist
//          hinzufuegen/entfernen/rueckgaengig -> Abmelden -> Anmelden -> Willkommensseite -> Daten bleiben
//   Pro    ohne Freigabe: Bestaetigungslink auf anderem Geraet -> Anmeldung -> direkt Pro-Bestaetigung (keine zweite
//          Tarifwahl) -> verstaendlicher Hinweis statt gesperrter Checkbox -> "Mit Free weiter"
//   Pro    Tester (iPhone-Profil): Wahl ueberdauert Geraetewechsel (aus dem Konto) -> Checkbox per Tippen ->
//          Abbruch -> Free bleibt, keine erneute Aufforderung -> "Pro auswaehlen" -> Zahlung -> Webhook -> Pro ->
//          Willkommensseite -> Kuendigung -> Laufzeitende -> Free
//   SEPA   verzoegerte Bestaetigung: erst Free mit Hinweis, nach Bestaetigung Pro
//   Trennung  ein zweites Konto sieht die Watchlist des ersten nicht
// Je Seite: kein waagrechter Ueberlauf, Eingaben >= 16px, Bedienflaechen >= 36px, keine Konsolenfehler.
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';

const arg = (name, fallback) => (process.argv.find(a => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const base = arg('url', 'http://localhost:8792');
const out = arg('out', '/tmp/journey-qa');
const engine = arg('engine', 'chromium');
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
await mkdir(out, {recursive: true});

const browser = await pw[engine].launch();
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FEHL'} ${what}`); };
const PASSWORD = 'Sicheres-Passwort-26';
const stamp = Date.now();
const mail = name => `${name}-${engine}-${stamp}@example.test`;
const consoleErrors = [];

async function context(kind, theme = 'light') {
  const opts = kind === 'mobile'
    ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: engine === 'chromium', hasTouch: true,
      userAgent: engine === 'webkit' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : undefined}
    : kind === 'small' ? {viewport: {width: 320, height: 640}, hasTouch: true} : {viewport: {width: 1280, height: 900}};
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(t => { try { localStorage.setItem('vu-discover-theme-v1', t); } catch (e) {} }, theme);
  const page = await ctx.newPage();
  page.on('console', m => {
    // 401 der Sitzungspruefung und absichtlich provozierte 403/409 meldet der Browser selbst als Fehler.
    if (m.type() === 'error' && !/status of (401|403|404|409)/.test(m.text())) consoleErrors.push(`${kind}: ${m.text()}`);
  });
  page.on('pageerror', e => consoleErrors.push(`${kind}: ${e}`));
  return {ctx, page};
}

async function audit(page, label) {
  // Die Willkommensseite bleibt gestalterisch unveraendert (Owner-Vorgabe); geprueft wird dort der neue Einstieg.
  const scope = new URL(page.url()).pathname === '/willkommen/' ? '.wk-mine' : 'main';
  const r = await page.evaluate(scope => {
    const w = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth > w + 1;
    const q = sel => [...document.querySelectorAll(sel.split(',').map(x => scope + ' ' + x.trim()).join(','))];
    const small = q('input:not([type=checkbox]):not([hidden]), select')
      .filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id);
    const tiny = q('button, .ka-btn, .wk-mine-main, .wk-mine-account')
      .filter(e => e.offsetParent && e.getBoundingClientRect().height < (scope === 'main' ? 36 : 44)).map(e => e.textContent.trim().slice(0, 30));
    const clipped = q('h1, h2, .ka-btn, .md-tile b, .wk-mine-copy strong')
      .filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').map(e => e.textContent.trim().slice(0, 30));
    return {overflow, small, tiny, clipped};
  }, scope);
  check(!r.overflow, `${label}: kein waagrechter Ueberlauf`);
  check(!r.small.length, `${label}: Eingaben >= 16px ${r.small.join(',')}`);
  check(!r.tiny.length, `${label}: Bedienflaechen gross genug ${r.tiny.join(',')}`);
  check(!r.clipped.length, `${label}: keine abgeschnittenen Texte ${r.clipped.join(',')}`);
}
const shot = (page, name) => page.screenshot({path: `${out}/${engine}-${name}.png`, fullPage: true});

const NEWSLETTER_ON = Boolean((await (await fetch(base + '/v1/plans')).json()).newsletter);
async function register(page, email, {from = 'preise', plan = 'free', newsletter = false} = {}) {
  if (from === 'preise') {
    await page.goto(`${base}/preise/`);
    await page.waitForFunction(() => !document.querySelector('[data-price=pro][aria-busy]'));
    await page.click(plan === 'pro' ? '#pr-choose-pro' : '#pr-choose-free');
    await page.waitForURL(new RegExp(`/konto/registrieren/\\?plan=${plan}`));
  }
  await page.fill('#email', email);
  await page.fill('#display-name', 'QA ' + plan);
  await page.fill('#password', PASSWORD);
  await page.check('#terms');
  if (newsletter) {
    await page.waitForSelector('#newsletter-field:not([hidden])');
    check(!(await page.isChecked('#newsletter')), 'Newsletter nicht vorausgewaehlt');
    await page.check('#newsletter');
  }
  await page.click('#ka-register button[type=submit]');
  await page.waitForFunction(() => !document.getElementById('ka-register-done').hidden || document.getElementById('ka-status').getAttribute('data-kind') === 'error');
  // Die Simulation meldet jede Anfrage als 127.0.0.1: je Lauf ein frischer Testserver (signup 5/h je IP bleibt unveraendert).
  if (await page.isHidden('#ka-register-done')) throw new Error('REGISTRIERUNG_FEHLGESCHLAGEN: ' + await page.textContent('#ka-status'));
}
// Bestaetigungslink aus dem simulierten Postfach (je Adresse), im angegebenen Browser oeffnen.
async function confirmLink(page, email) {
  await page.goto(`${base}/__dev/mail`);
  await page.locator('.box', {hasText: email}).locator('a.btn').first().click();
}
async function login(page, email, next) {
  await page.goto(`${base}/konto/anmelden/${next ? '?next=' + encodeURIComponent(next) : ''}`);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('#ka-login button[type=submit]');
}
async function logout(page) {
  await page.goto(`${base}/konto/`);
  await page.waitForSelector('#ka-account:not([hidden])');
  await page.click('#ka-logout');
  await page.waitForURL(/\/konto\/anmelden\//);
}
const me = page => page.evaluate(async b => (await fetch(b + '/v1/me', {credentials: 'include', headers: {'X-VU-Client': 'web'}})).json(), base);

// ============================================================ Free
{
  const {ctx, page} = await context('desktop');
  const email = mail('free');
  await register(page, email, {plan: 'free'});
  check(await page.isHidden('#ka-plan-hint'), 'Free: kein Pro-Hinweis bei der Registrierung');
  await confirmLink(page, email);
  await page.waitForURL(/\/willkommen\/$/);
  check((await page.textContent('#wk-flash')).includes('bestätigt'), 'Free: nach Bestaetigung direkt Willkommensseite mit Rueckmeldung');
  check(await page.isVisible('#wk-dashboard') && await page.isVisible('#wk-account'), 'Willkommensseite: Mein Dashboard und Konto sichtbar, getrennt');
  check(await page.isVisible('#wk-hero-play') && await page.isVisible('#wk-products'), 'Willkommensseite: Video und Produktwelten unveraendert da');
  await shot(page, 'free-01-willkommen');
  await page.click('#wk-dashboard');
  await page.waitForURL(/\/mein-dashboard\/$/);
  await page.waitForSelector('#md-app:not([hidden])');
  check((await page.textContent('#md-hello')).includes('QA free'), 'Dashboard: persoenliche Begruessung');
  check((await page.textContent('#md-plan')) === 'Free', 'Dashboard: Tarif Free');
  check(await page.isVisible('#md-watch-empty'), 'Dashboard: Leerstaat fuer neue Nutzer');
  check(await page.locator('.md-tile').count() >= 4, 'Dashboard: Schnellzugriffe');
  await audit(page, 'Dashboard leer');
  await shot(page, 'free-02-dashboard-leer');
  // Hinzufuegen ueber die Suche
  await page.fill('#md-add', 'AAPL');
  await page.waitForSelector('#md-results:not([hidden]) .wl-result');
  await page.click('#md-results .wl-result >> nth=0');
  await page.waitForSelector('.md-row .md-row-main');
  const first = await page.textContent('.md-row .md-ticker');
  check(/AAPL/.test(first), `Watchlist: hinzugefuegt (${first})`);
  check(/\/s\/US_REAL\/AAPL|#\/AAPL|aktie\/AAPL/.test(await page.getAttribute('.md-row a.md-row-main', 'href') || ''), 'Watchlist: Link zur Aktie');
  await page.fill('#md-add', 'MSFT');
  await page.waitForSelector('#md-results:not([hidden]) .wl-result');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.md-row .md-row-main').length === 2);
  check(true, 'Watchlist: zweite Aktie per Tastatur');
  // Entfernen und rueckgaengig
  await page.click('.md-row >> nth=0 >> .md-remove');
  await page.waitForFunction(() => document.querySelectorAll('.md-row .md-row-main').length === 1);
  check((await page.textContent('#ka-status')).includes('entfernt'), 'Watchlist: entfernt');
  await page.click('#ka-status .md-undo');
  await page.waitForFunction(() => document.querySelectorAll('.md-row .md-row-main').length === 2);
  check(true, 'Watchlist: rueckgaengig');
  await page.click('.md-row >> nth=0 >> .md-remove');
  await page.waitForFunction(() => document.querySelectorAll('.md-row .md-row-main').length === 1);
  await audit(page, 'Dashboard mit Watchlist');
  await shot(page, 'free-03-dashboard');
  // Detailansicht unter der bisherigen Adresse
  await page.click('#md-watch-all');
  await page.waitForURL(/\/konto\/watchlist\/$/);
  await page.waitForSelector('#wl-app:not([hidden])');
  check(await page.locator('.wl-row').count() === 1, 'bestehende Watchlist-Adresse funktioniert (Detailansicht)');
  check(await page.isVisible('.ka-crumbs a[href="/mein-dashboard/"]'), 'Watchlist: zurueck zu Mein Dashboard');
  // Abmelden, anmelden -> Willkommensseite; Daten bleiben
  await logout(page);
  await login(page, email);
  await page.waitForURL(/\/willkommen\/$/);
  check(true, 'Anmeldung ohne Ziel: Willkommensseite');
  await page.goto(`${base}/mein-dashboard/`);
  await page.waitForSelector('#md-app:not([hidden])');
  check(await page.locator('.md-row .md-row-main').count() === 1, 'gespeicherte Daten bleiben nach erneuter Anmeldung');
  // Kontoseite: Einstellungen statt Investment-Inhalten
  await page.goto(`${base}/konto/`);
  await page.waitForSelector('#ka-account:not([hidden])');
  check(!(await page.$('.ka-nav a[href="/konto/watchlist/"]')) && await page.isVisible('.ka-nav a.ka-nav-out[href="/mein-dashboard/"]'),
    'Konto: Watchlist ueber Mein Dashboard, Kontonavigation nur Konto');
  check(await page.isHidden('#ka-pro-pending'), 'Konto Free: kein Pro-Hinweis');
  await audit(page, 'Konto');
  await shot(page, 'free-04-konto');
  // Deep Link ohne Sitzung -> Anmeldung -> zurueck zum Ziel
  await logout(page);
  await page.goto(`${base}/mein-dashboard/`);
  await page.waitForURL(/\/konto\/anmelden\/\?next=%2Fmein-dashboard%2F/);
  check(true, 'Dashboard ohne Anmeldung: zur Anmeldung, keine persoenlichen Daten');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('#ka-login button[type=submit]');
  await page.waitForURL(/\/mein-dashboard\/$/);
  check(true, 'Deep Link bleibt nach der Anmeldung erhalten');
  await ctx.close();

  // Trennung der Konten: ein zweites Konto sieht nichts vom ersten.
  const other = await context('desktop');
  const otherMail = mail('andere');
  // Mit Newsletter-Haken, falls angeboten (Pruefung weiter unten, ohne weitere Registrierung: 5/h je IP).
  await register(other.page, otherMail, {plan: 'free', newsletter: NEWSLETTER_ON});
  await confirmLink(other.page, otherMail);
  await other.page.waitForURL(/\/willkommen\//);
  await other.page.goto(`${base}/mein-dashboard/`);
  await other.page.waitForSelector('#md-app:not([hidden])');
  check(await other.page.isVisible('#md-watch-empty') && !(await other.page.$('.md-row .md-row-main')), 'zweites Konto: eigene, leere Watchlist');
  await other.ctx.close();
}

// ============================================================ Pro ohne Freigabe (anderes Geraet)
{
  const phone = await context('mobile');
  const email = mail('pro-ohne-freigabe');
  await register(phone.page, email, {plan: 'pro'});
  check(await phone.page.isVisible('#ka-plan-hint'), 'Pro: Hinweis bei der Registrierung');
  await phone.ctx.close();
  // Bestaetigungslink auf einem anderen Geraet: Adresse bestaetigt, Anmeldung, dann direkt die Pro-Bestaetigung.
  const laptop = await context('desktop');
  await confirmLink(laptop.page, email);
  await laptop.page.waitForURL(/\/konto\/anmelden\/\?status=verified_other_device&plan=pro/);
  await laptop.page.fill('#email', email);
  await laptop.page.fill('#password', PASSWORD);
  await laptop.page.click('#ka-login button[type=submit]');
  await laptop.page.waitForURL(/\/konto\/tarife\/\?plan=pro$/);
  await laptop.page.waitForSelector('#ka-confirm[data-state=not-open]');
  check(await laptop.page.isVisible('#ka-confirm-blocked') && (await laptop.page.textContent('#ka-blocked-title')).includes('noch nicht buchbar'),
    'ohne Tester-Freigabe: eigener, verstaendlicher Hinweis');
  check(await laptop.page.isHidden('#ka-confirm-terms') && await laptop.page.isHidden('#ka-checkout'), 'keine scheinbar defekte Checkbox, kein Zahlknopf');
  check(await laptop.page.isHidden('#ka-status') || !(await laptop.page.textContent('#ka-status')).includes('noch nicht buchbar'),
    'Hinweis steht in der Bestaetigung, nicht ausserhalb des Bildschirms');
  await audit(laptop.page, 'Pro ohne Freigabe');
  await shot(laptop.page, 'pro-01-ohne-freigabe');
  await laptop.page.click('#ka-continue-free');
  await laptop.page.waitForURL(/\/willkommen\/$/);
  check((await me(laptop.page)).planIntent === null, '"Mit Free weiter": Wahl im Konto verworfen');
  await logout(laptop.page);
  await login(laptop.page, email);
  await laptop.page.waitForURL(/\/willkommen\/$/);
  check(true, 'danach normale Anmeldung zur Willkommensseite');
  await laptop.ctx.close();
}

// ============================================================ Pro als Tester (iPhone-Profil)
{
  const email = mail('pro-tester');
  const a = await context('mobile');
  await register(a.page, email, {plan: 'pro'});
  await confirmLink(a.page, email);
  await a.page.waitForURL(/\/konto\/tarife\/\?plan=pro&status=verified/);
  await a.page.waitForSelector('#ka-confirm[data-state]:not([data-state=loading])');
  check(await a.page.getAttribute('#ka-confirm', 'data-state') === 'not-open', 'Tester vor der Freigabe: Hinweis');
  await a.ctx.close();
  await fetch(`${base}/__dev/tester?email=${encodeURIComponent(email)}`, {method: 'POST'});

  // Neues Geraet, kein lokaler Speicher, kein Link-Parameter: die Wahl kommt aus dem Konto.
  for (const theme of ['dark']) {
    const {ctx, page} = await context('mobile', theme);
    await login(page, email);
    await page.waitForURL(/\/konto\/tarife\/\?plan=pro$/);
    await page.waitForSelector('#ka-confirm[data-state=ready]');
    check(true, `Geraetewechsel: direkt Pro-Bestaetigung ohne zweite Tarifwahl (${theme})`);
    check(!(await page.isDisabled('#ka-confirm-terms')), 'Checkbox bedienbar');
    check(await page.isDisabled('#ka-checkout'), 'Zahlung erst nach Bestaetigung');
    await audit(page, `Pro bestaetigen mobil ${theme}`);
    await shot(page, `pro-02-bestaetigen-${theme}`);
    // Tippen auf den Text der Bestaetigung (Label) setzt den Haken; erneutes Tippen auf das Kaestchen nimmt ihn weg.
    await page.tap('label[for=ka-confirm-terms] > span');
    check(await page.isChecked('#ka-confirm-terms') && !(await page.isDisabled('#ka-checkout')), 'Tippen auf den Text: Haken gesetzt, Zahlung frei');
    await page.tap('#ka-confirm-terms');
    check(!(await page.isChecked('#ka-confirm-terms')) && await page.isDisabled('#ka-checkout'), 'Tippen auf das Kaestchen: Haken entfernt, Zahlung gesperrt');
    await page.tap('#ka-confirm-terms');
    check(await page.isChecked('#ka-confirm-terms'), 'Tippen auf das Kaestchen: Haken gesetzt');
    const hit = await page.evaluate(() => {
      const r = document.getElementById('ka-confirm-terms').getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top && (top.id === 'ka-confirm-terms' || top.closest('label[for=ka-confirm-terms]') !== null);
    });
    check(hit, 'kein Overlay ueber der Checkbox');
    await shot(page, `pro-03-bestaetigt-${theme}`);
    // Abbruch bei Stripe
    await page.tap('#ka-checkout');
    await page.waitForURL(/\/__dev\/checkout\//);
    await page.click('text=Abbrechen');
    await page.waitForURL(/\/konto\/tarife\/\?checkout=canceled/);
    await page.waitForSelector('.ka-plan[data-plan=free][data-current=true]');
    check(await page.isHidden('#ka-confirm'), 'Abbruch: keine erneute Aufforderung');
    check((await me(page)).entitlements.plan_id === 'free' && (await me(page)).planIntent === null, 'Abbruch: Konto bleibt Free, Wahl verworfen');
    await audit(page, `Abbruch mobil ${theme}`);
    // Abmelden/Anmelden fuehrt nicht wieder zur Zahlung.
    await logout(page);
    await login(page, email);
    await page.waitForURL(/\/willkommen\/$/);
    check(true, 'nach Abbruch: Anmeldung zur Willkommensseite');
    // Eindeutige Aktion "Pro auswaehlen"
    await page.goto(`${base}/konto/tarife/`);
    await page.waitForSelector('.ka-plan[data-plan=free][data-current=true]');
    await page.tap('#ka-choose-pro');
    await page.waitForSelector('#ka-confirm[data-state=ready]');
    await page.tap('label[for=ka-confirm-terms] > span');
    await page.tap('#ka-checkout');
    await page.waitForURL(/\/__dev\/checkout\//);
    await page.click('text=Zahlungspflichtig abonnieren');
    await page.waitForURL(/\/konto\/abo\/\?checkout=success/);
    await page.waitForURL(/\/willkommen\/$/, {timeout: 20000});
    check((await page.textContent('#wk-flash')).includes('Pro-Abonnement ist aktiv'), 'Zahlung (Webhook) bestaetigt -> Willkommensseite');
    check((await me(page)).entitlements.plan_id === 'pro', 'Pro gilt laut Server');
    await shot(page, `pro-04-willkommen-${theme}`);
    await page.goto(`${base}/mein-dashboard/`);
    await page.waitForSelector('#md-app:not([hidden])');
    check((await page.textContent('#md-plan')) === 'Pro', 'Dashboard: Pro');
    await audit(page, `Dashboard mobil ${theme}`);
    await shot(page, `pro-05-dashboard-${theme}`);
    // Kein zweites Abo
    await page.goto(`${base}/konto/tarife/?plan=pro`);
    await page.waitForSelector('.ka-plan[data-plan=pro][data-current=true]');
    check(await page.isHidden('#ka-confirm') && !(await page.$('#ka-choose-pro')), 'kein Doppelabo');
    // Kuendigung und Rueckfall auf Free
    await page.goto(`${base}/konto/kuendigen/`);
    await page.waitForSelector('#ka-cancel-signed-in:not([hidden])');
    await page.tap('#ka-cancel-now');
    await page.waitForSelector('#ka-cancel-done:not([hidden])');
    await page.goto(`${base}/konto/abo/`);
    await page.waitForSelector('#ka-sub .ka-kv');
    check((await page.textContent('#ka-sub')).includes('Endet am'), 'gekuendigt zum Laufzeitende, bis dahin Pro');
    await page.click('text=Zahlung, Rechnungen und Kündigung verwalten');
    await page.waitForURL(/\/__dev\/portal\//);
    await page.click('text=Laufzeitende erreichen');
    await page.waitForURL(/\/__dev\/portal\//);
    check((await me(page)).entitlements.plan_id === 'free', 'nach Laufzeitende automatisch Free');
    await page.goto(`${base}/mein-dashboard/`);
    await page.waitForSelector('#md-app:not([hidden])');
    check((await page.textContent('#md-plan')) === 'Free', 'Dashboard: wieder Free');
    await ctx.close();
  }
}

// ============================================================ SEPA (verzoegerte Bestaetigung)
{
  const email = mail('sepa');
  const {ctx, page} = await context('desktop');
  await page.goto(`${base}/konto/registrieren/`);
  await register(page, email, {from: 'direct'});
  await confirmLink(page, email);
  await page.waitForURL(/\/willkommen\//);
  await fetch(`${base}/__dev/tester?email=${encodeURIComponent(email)}`, {method: 'POST'});
  await page.goto(`${base}/konto/tarife/`);
  await page.waitForSelector('.ka-plan[data-plan=free][data-current=true]');
  await page.click('#ka-choose-pro');
  await page.waitForSelector('#ka-confirm[data-state=ready]');
  await page.check('#ka-confirm-terms');
  await page.click('#ka-checkout');
  await page.waitForURL(/\/__dev\/checkout\//);
  await page.click('text=SEPA-Lastschrift');
  await page.waitForURL(/\/konto\/abo\/\?checkout=success/);
  await page.waitForFunction(() => document.getElementById('ka-status').textContent.includes('SEPA'), null, {timeout: 25000});
  check((await me(page)).entitlements.plan_id === 'free', 'SEPA in Bearbeitung: noch Free');
  check(await page.isVisible('#ka-sub a[href="/willkommen/"]'), 'SEPA: Weg zur Willkommensseite');
  await audit(page, 'SEPA ausstehend');
  await shot(page, 'sepa-01-ausstehend');
  await fetch(`${base}/__dev/sepa/latest/paid`, {method: 'POST'});
  check((await me(page)).entitlements.plan_id === 'pro', 'SEPA bestaetigt: Pro');
  await ctx.close();
}

// ============================================================ Rechtliches, Kuendigen, Widerrufen (oeffentlich, ohne Anmeldung)
{
  const {ctx, page} = await context('mobile', 'dark');
  for (const p of ['/rechtliches/', '/rechtliches/agb', '/rechtliches/widerrufsbelehrung', '/rechtliches/datenschutz', '/rechtliches/impressum']) {
    await page.goto(base + p);
    check((await page.textContent('.draft')).includes('noch nicht rechtlich freigegeben'), `${p}: als Entwurf gekennzeichnet`);
    const r = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    check(r, `${p}: kein waagrechter Ueberlauf (mobil)`);
  }
  await page.goto(base + '/widerrufen');
  check((await page.textContent('h1')) === 'Vertrag widerrufen', 'Widerrufsfunktion: Beschriftung „Vertrag widerrufen“');
  await page.fill('input[name=fullName]', 'QA Widerruf');
  await page.fill('input[name=email]', mail('widerruf'));
  await page.tap('button[type=submit]');
  await page.waitForSelector('text=Widerruf bestätigen');
  await shot(page, 'recht-01-widerruf-bestaetigen');
  await page.tap('button:has-text("Widerruf bestätigen")');
  await page.waitForSelector('text=Dein Widerruf ist eingegangen');
  check((await page.textContent('dl')).includes('versendet'), 'Widerruf: Eingangsbestaetigung per E-Mail versendet');
  await shot(page, 'recht-02-widerruf-eingegangen');
  await page.goto(base + '/kuendigen');
  await page.fill('input[name=fullName]', 'QA Kuendigung');
  await page.fill('input[name=email]', mail('kuendigung'));
  await page.tap('button:has-text("Jetzt kündigen")');
  await page.waitForSelector('text=Deine Kündigung ist eingegangen');
  check(true, 'Kuendigungsfunktion ohne Anmeldung');
  await ctx.close();
}

// ============================================================ Newsletter (nur wenn der Testserver ihn anbietet: --newsletter)
if (NEWSLETTER_ON) {
  const {ctx, page} = await context('desktop');
  const email = mail('andere');
  await login(page, email);
  await page.waitForURL(/\/willkommen\//);
  await fetch(`${base}/__dev/cron`, {method: 'POST'});
  await page.goto(`${base}/konto/einstellungen/`);
  await page.waitForSelector('#ka-settings-wrap:not([hidden])');
  check((await page.textContent('#ka-newsletter-status')).includes('bitte bestätige'), 'nach Registrierung mit Haken: Bestaetigung ausstehend (Double-Opt-in)');
  await fetch(`${base}/__dev/brevo/confirm?email=${encodeURIComponent(email)}`, {method: 'POST'});
  await fetch(`${base}/__dev/cron`, {method: 'POST'});
  await page.reload();
  await page.waitForSelector('#ka-settings-wrap:not([hidden])');
  check((await page.textContent('#ka-newsletter-status')).includes('Du erhältst den Newsletter'), 'nach Klick in der DOI-Mail: bestaetigt');
  await audit(page, 'Einstellungen Newsletter');
  await shot(page, 'newsletter-01-bestaetigt');
  await page.click('#ka-newsletter-toggle');
  await page.waitForFunction(() => document.getElementById('ka-newsletter-status').textContent.includes('abbestellt'));
  check(true, 'Abmeldung im Konto');
  await page.click('#ka-newsletter-toggle');
  await page.waitForFunction(() => document.getElementById('ka-newsletter-status').textContent.includes('bitte bestätige'));
  check(true, 'erneute Bestellung: wieder Double-Opt-in');
  await ctx.close();
}

// ============================================================ Kleine Bildschirme, hell und dunkel
for (const theme of ['light', 'dark']) {
  const {ctx, page} = await context('small', theme);
  for (const path of ['/preise/', '/konto/registrieren/?plan=pro', '/konto/anmelden/', '/willkommen/']) {
    await page.goto(base + path);
    await page.waitForLoadState('networkidle');
    await audit(page, `320px ${theme} ${path}`);
  }
  await page.screenshot({path: `${out}/${engine}-320-${theme}-willkommen.png`});
  await ctx.close();
}

check(!consoleErrors.length, `keine Konsolenfehler ${consoleErrors.slice(0, 3).join(' | ')}`);
await browser.close();
console.log(problems.length ? `\n${problems.length} Problem(e).` : '\nAlle Pruefungen der Nutzerreise bestanden.');
process.exit(problems.length ? 1 : 0);
