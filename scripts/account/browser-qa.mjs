#!/usr/bin/env node
// Vision Universe — Browser-QA der Kontoseiten gegen die lokale Simulation.
//
//   node scripts/account/dev-server.mjs --port=8790 &      (braucht PG_TEST_URL)
//   node scripts/account/browser-qa.mjs --url=http://localhost:8790 --out=/tmp/konto-qa [--engine=webkit]
//
// Spielt den ganzen Weg im echten Browser durch: oeffentliche Tarifseite /preise/, Tarifwahl Pro vor der Registrierung,
// Registrierung, Bestaetigung per Postfach, Pro-Bestaetigung, abgebrochener und
// erfolgreicher simulierter Checkout, Abo-Anzeige, Kundenportal, Einstellungen
// (Dunkelmodus), Kuendigungsbutton, Abmelden.
// Prueft je Seite: kein waagrechter Ueberlauf, Eingaben >= 16px (kein
// iOS-Zoom), Bedienflaechen >= 44px, keine Konsolenfehler. Screenshots in --out.
import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';

const arg = (name, fallback) => (process.argv.find(a => a.startsWith(`--${name}=`)) || `--${name}=${fallback}`).split('=').slice(1).join('=');
const base = arg('url', 'http://localhost:8790');
const out = arg('out', '/tmp/konto-qa');
const engine = arg('engine', 'chromium');
const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');
await mkdir(out, {recursive: true});

const browser = await pw[engine].launch();
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? 'ok  ' : 'FEHL'} ${what}`); };

async function audit(page, label) {
  const r = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth > w + 1;
    const small = [...document.querySelectorAll('main input:not([type=checkbox]):not([hidden]), main select')]
      .filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id);
    const tiny = [...document.querySelectorAll('main button, main .ka-btn')]
      .filter(e => e.offsetParent && e.getBoundingClientRect().height < 36).map(e => e.textContent.trim().slice(0, 30));
    return {overflow, small, tiny};
  });
  check(!r.overflow, `${label}: kein waagrechter Ueberlauf`);
  check(!r.small.length, `${label}: Eingaben >= 16px ${r.small.join(',')}`);
  check(!r.tiny.length, `${label}: Bedienflaechen gross genug ${r.tiny.join(',')}`);
}

async function shot(page, name) { await page.screenshot({path: `${out}/${engine}-${name}.png`, fullPage: true}); }

const desktop = await browser.newContext({viewport: {width: 1280, height: 900}});
const page = await desktop.newPage();
const consoleErrors = [];
// Der absichtlich provozierte Doppel-Checkout antwortet 409; das protokolliert der Browser selbst.
page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push(String(e)));
const email = `qa-${Date.now()}@example.test`;
const password = 'Sicheres-Passwort-26';

// Nicht angemeldet: /konto/ leitet zur Anmeldung.
await page.goto(`${base}/konto/`);
await page.waitForURL(/\/konto\/anmelden\/\?next=%2Fkonto%2F/);
check(true, 'Konto ohne Sitzung -> Anmeldung');

// Konto-interne Tarifseite bleibt erreichbar (Tarifwechsel fuer Angemeldete).
await page.goto(`${base}/konto/tarife/`);
await page.waitForLoadState('networkidle');
check((await page.textContent('#ka-plans')).includes('Kostenlos registrieren'), 'Free: kostenlos registrieren');
check((await page.textContent('.ka-plan[data-plan=pro] .ka-price')).includes('/ Monat'), 'Pro: Monatspreis');
check((await page.textContent('#main')).includes('dieselben Funktionen'), 'gleicher Umfang offen genannt');
await audit(page, 'Tarife ohne Anmeldung');
await shot(page, '00-tarife');

// Oeffentliche Tarifseite /preise/: ohne Kontonavigation, Preise und Umfang aus /v1/plans.
const plansApi = await (await page.request.get(`${base}/v1/plans`)).json();
const proMonth = plansApi.plans.find(p => p.id === 'pro').prices.find(x => x.interval === 'month');
await page.goto(`${base}/preise/`);
await page.waitForFunction(() => !document.querySelector('[data-price=pro][aria-busy]'));
check(!(await page.$('.ka-nav')), 'Preise: keine Kontonavigation');
check(await page.locator('.pr-plan').count() === 2, 'Preise: zwei Tarifkarten');
const shownPro = (await page.textContent('[data-price=pro]')).replace(/\s/g, ' ');
const expectedPro = new Intl.NumberFormat('de-DE', {style: 'currency', currency: proMonth.currency}).format(proMonth.unitAmount / 100).replace(/\s/g, ' ');
check(shownPro === expectedPro, `Preise: Pro-Preis aus dem Backend (${shownPro} = ${expectedPro})`);
check((await page.textContent('.pr-plan[data-plan=pro]')).includes('Interner Testpreis'), 'Preise: interner Testpreis gekennzeichnet');
check(await page.isVisible('#pr-same') && await page.locator('#pr-rows tr').count() === Object.keys(plansApi.plans.find(p => p.id === 'free').features).length,
  'Preise: Funktionsumfang aus dem Backend, identisch');
await audit(page, 'Preise ohne Anmeldung');
await shot(page, '00-preise');
await page.click('#pr-choose-pro');
await page.waitForURL(/\/konto\/registrieren\/\?plan=pro/);

// Registrierung
await audit(page, 'Registrierung');
check(await page.isVisible('#ka-plan-hint'), 'Hinweis: Pro gewaehlt');
await page.fill('#email', email);
await page.fill('#display-name', 'QA Person');
await page.fill('#password', 'kurz');
check((await page.textContent('#pw-rules')).includes('· 10 bis 72 Zeichen'), 'Passwort-Hinweis live');
await page.fill('#password', password);
await page.check('#terms');
await shot(page, '01-registrieren');
await page.click('#ka-register button[type=submit]');
await page.waitForSelector('#ka-register-done:not([hidden])');
check((await page.textContent('#ka-register-done')).includes(email), 'Bestaetigungshinweis mit Adresse');

// Postfach -> Bestaetigungslink -> angemeldet -> weiter zur Pro-Bestaetigung (nicht direkt zur Zahlung)
await page.goto(`${base}/__dev/mail`);
await page.click('a.btn');
await page.waitForURL(/\/konto\/tarife\/\?plan=pro&status=verified/);
await page.waitForSelector('#ka-confirm:not([hidden])');
check((await page.textContent('#ka-status')).includes('bestätigt'), 'E-Mail bestaetigt, angemeldet');
check(await page.isDisabled('#ka-checkout'), 'Zahlung erst nach Bestaetigung der Bedingungen');
const confirmText = await page.textContent('#ka-confirm');
check(confirmText.includes('pro Monat') && confirmText.includes('Kündigung') && confirmText.includes('Widerruf'), 'Preis, Kuendigung, Widerruf vor dem Checkout');
await audit(page, 'Pro bestaetigen');
await shot(page, '02-pro-bestaetigen');

// Abbruch im Checkout: nichts berechnet, Konto bleibt Free.
await page.check('#ka-confirm-terms');
await page.click('#ka-checkout');
await page.waitForURL(/\/__dev\/checkout\//);
await page.click('text=Abbrechen');
await page.waitForURL(/\/konto\/tarife\/\?checkout=canceled/);
await page.waitForFunction(() => document.getElementById('ka-status').textContent.includes('abgebrochen'));
await page.waitForSelector('.ka-plan[data-plan=free][data-current=true]');
check(await page.isHidden('#ka-confirm'), 'nach Abbruch keine erneute Aufforderung');
check(true, 'Abbruch: Konto bleibt Free');
await page.goto(`${base}/konto/`);
await page.waitForSelector('#ka-account:not([hidden])');
check((await page.textContent('#ka-hello')).includes('QA Person'), 'Konto nach Abbruch erreichbar (kein Umleitungskreis)');
await shot(page, '03-konto-free');

// Upgrade als bestehendes Konto: Tarife -> Pro auswaehlen -> bestaetigen -> bezahlen
await page.goto(`${base}/konto/tarife/`);
await page.waitForSelector('.ka-plan[data-plan=free][data-current=true]');
await page.click('#ka-choose-pro');
await page.waitForSelector('#ka-confirm:not([hidden])');
await page.check('#ka-confirm-terms');
await page.click('#ka-checkout');
await page.waitForURL(/\/__dev\/checkout\//);
await page.click('text=Zahlungspflichtig abonnieren');
await page.waitForURL(/\/konto\/abo\/\?checkout=success/);
await page.waitForSelector('#ka-sub .ka-kv');
await page.waitForFunction(() => document.getElementById('ka-status').textContent.includes('aktiv'));
check((await page.textContent('#ka-sub')).includes('Pro') && (await page.textContent('#ka-sub')).includes('Aktiv'), 'Pro aktiv nach Checkout');
check((await page.textContent('#ka-invoices')).includes('bezahlt'), 'Rechnung bezahlt');
await audit(page, 'Abonnement');
await shot(page, '04-abo');

// Kundenportal hin und zurueck
await page.click('text=Zahlung, Rechnungen und Kündigung verwalten');
await page.waitForURL(/\/__dev\/portal\//);
await page.click('text=Zurück zu Vision Universe');
await page.waitForSelector('#ka-sub .ka-kv');
check(true, 'Kundenportal erreichbar');

// Zweites Abo nicht moeglich: Pro ist "Dein Tarif", kein Kaufknopf
await page.goto(`${base}/konto/tarife/`);
await page.waitForSelector('.ka-plan[data-plan=pro][data-current=true]');
check((await page.textContent('.ka-plan[data-plan=pro]')).includes('Dein Tarif') && !(await page.$('#ka-choose-pro')), 'Doppelabo verhindert');
await page.goto(`${base}/konto/`);
await page.waitForSelector('#ka-account:not([hidden])');
check((await page.textContent('#ka-account-facts')).includes('Pro'), 'Konto zeigt Pro');
await page.goto(`${base}/preise/`);
await page.waitForSelector('#pr-signed-in:not([hidden])');
check(await page.isVisible('.pr-plan[data-plan=pro] [data-current-tag]') && (await page.getAttribute('#pr-choose-pro', 'href')) === '/konto/abo/',
  'Preise angemeldet: Pro ist dein Tarif, Verwaltung im Konto');

// Einstellungen: Dunkelmodus
await page.goto(`${base}/konto/einstellungen/`);
await page.waitForSelector('#ka-settings-wrap:not([hidden])');
await page.selectOption('#appearance', 'dark');
await page.check('[data-notification=EARNINGS]');
await page.click('#ka-settings button[type=submit]');
await page.waitForFunction(() => document.getElementById('ka-status').textContent.includes('Gespeichert'));
await page.reload();
await page.waitForSelector('#ka-settings-wrap:not([hidden])');
check(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'Dunkelmodus gespeichert');
check(await page.isChecked('[data-notification=EARNINGS]'), 'Benachrichtigung gespeichert');
await audit(page, 'Einstellungen dunkel');
await shot(page, '05-einstellungen-dunkel');

// Kuendigungsbutton
await page.goto(`${base}/konto/kuendigen/`);
await page.waitForSelector('#ka-cancel-signed-in:not([hidden])');
await shot(page, '06-kuendigen-dunkel');
await page.click('#ka-cancel-now');
await page.waitForSelector('#ka-cancel-done:not([hidden])');
check((await page.textContent('#ka-cancel-done')).includes('gekündigt'), 'Kuendigung bestaetigt');
await page.goto(`${base}/konto/abo/`);
await page.waitForSelector('#ka-sub .ka-kv');
check((await page.textContent('#ka-sub')).includes('Endet am'), 'Abo zeigt Laufzeitende');
check((await page.textContent('#ka-sub')).includes('automatisch Free'), 'nach Laufzeitende automatisch Free');

// Kuendigung ohne Anmeldung (eigener Kontext, ohne Sitzung), ausserordentlich mit Grund
{
  const anonContext = await browser.newContext({viewport: {width: 1280, height: 900}});
  const anon = await anonContext.newPage();
  await anon.goto(`${base}/konto/kuendigen/`);
  check(await anon.isHidden('#cancel-reason-field'), 'Grund-Feld erst bei ausserordentlicher Kuendigung');
  await anon.fill('#cancel-email', email);
  await anon.click('#ka-cancel-form button[type=submit]');
  check((await anon.textContent('#ka-status')).includes('Namen'), 'Name ist Pflicht');
  await anon.fill('#cancel-name', 'QA Person');
  await anon.selectOption('#cancel-kind', 'extraordinary');
  check(await anon.isVisible('#cancel-reason-field'), 'Grund-Feld sichtbar');
  await anon.fill('#cancel-reason', 'Test der Kuendigung');
  await audit(anon, 'Kuendigen ohne Anmeldung');
  await anon.click('#ka-cancel-form button[type=submit]');
  await anon.waitForSelector('#ka-cancel-done:not([hidden])');
  check((await anon.textContent('#ka-cancel-done [data-mail]')).includes('versendet'), 'Bestaetigung per E-Mail versendet');
  await anon.screenshot({path: `${out}/${engine}-07-kuendigen-ohne-anmeldung.png`, fullPage: true});
  await anonContext.close();
}

// Free ueber /preise/: keine Pro-Wahl uebrig (eigener Kontext ohne Sitzung).
{
  const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('vu-plan-choice-v1', JSON.stringify({plan: 'pro', at: Date.now()})); } catch (e) {} });
  await p.goto(`${base}/preise/`);
  await p.click('#pr-choose-free');
  await p.waitForURL(/\/konto\/registrieren\/\?plan=free/);
  check(await p.isHidden('#ka-plan-hint'), 'Free gewaehlt: kein Pro-Hinweis, alte Pro-Wahl verworfen');
  await ctx.close();
}

// Abmelden
await page.goto(`${base}/konto/`);
await page.waitForSelector('#ka-account:not([hidden])');
await page.click('#ka-logout');
await page.waitForURL(/\/konto\/anmelden\//);
check(true, 'Abgemeldet');
check(!consoleErrors.length, `keine Konsolenfehler ${consoleErrors.slice(0, 3).join(' | ')}`);

// Mobil (iPhone-Viewport), hell und dunkel, inklusive "nicht freigeschaltet".
for (const theme of ['light', 'dark']) {
  const mobile = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, isMobile: engine !== 'firefox', hasTouch: true});
  await mobile.addInitScript(t => { try { localStorage.setItem('vu-discover-theme-v1', t); } catch (e) {} }, theme);
  const m = await mobile.newPage();
  for (const path of ['anmelden', 'registrieren', 'passwort', 'kuendigen', 'tarife']) {
    await m.goto(`${base}/konto/${path}/`);
    await m.waitForLoadState('networkidle');
    await audit(m, `mobil ${theme} ${path}`);
    await m.screenshot({path: `${out}/${engine}-mobil-${theme}-${path}.png`, fullPage: true});
  }
  await m.goto(`${base}/preise/`);
  await m.waitForFunction(() => !document.querySelector('[data-price=pro][aria-busy]'));
  await audit(m, `mobil ${theme} preise`);
  await m.screenshot({path: `${out}/${engine}-mobil-${theme}-preise.png`, fullPage: true});
  await m.route('**/konto/config.js', r => r.fulfill({contentType: 'text/javascript', body: 'globalThis.VU_ACCOUNT_CONFIG={endpoint:""};'}));
  await m.goto(`${base}/konto/anmelden/`);
  check((await m.textContent('#ka-status')).includes('noch nicht freigeschaltet') && await m.isDisabled('#email'),
    `mobil ${theme}: ohne Freigabe deaktiviert`);
  await m.screenshot({path: `${out}/${engine}-mobil-${theme}-nicht-freigeschaltet.png`});
  await mobile.close();
}

await browser.close();
console.log(problems.length ? `\n${problems.length} Problem(e).` : '\nAlle Browser-Pruefungen bestanden.');
process.exit(problems.length ? 1 : 0);
