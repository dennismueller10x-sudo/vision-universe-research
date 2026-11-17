import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
// Cookie-Einwilligung und Newsletter-Fenster (Owner 17.11.2026), siehe web/consent.js.
// base/ready: Seite ohne Google-Mess-ID; base/ga: dieselbe Seite mit Mess-ID G-TEST1234.
export async function checkConsent(newContext, base) {
  const open = async (path, options = {}) => {
    const context = await newContext({ viewport: { width: 1280, height: 860 }, ...options });
    const google = [];
    await context.route(/googletagmanager\.com|google-analytics\.com/, (r) => { google.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
    const page = await context.newPage();
    await page.goto(base + path, { waitUntil: 'networkidle' });
    return { context, page, google };
  };
  const stored = (page) => page.evaluate(() => [localStorage.getItem('vu-consent'), sessionStorage.length]);

  // 1) Erster Besuch: Banner sichtbar, nichts gespeichert, nichts von Google geladen, barrierefrei.
  let { context, page, google } = await open('/ga/');
  assert.equal(await page.locator('section.cc[role=dialog]').isVisible(), true, 'Banner beim ersten Besuch');
  assert.deepEqual(await stored(page), [null, 0], 'vor einem Klick nichts im Browser');
  assert.equal(google.length, 0, 'ohne Zustimmung lädt Google nichts');
  for (const label of ['Ablehnen', 'Akzeptieren']) assert.equal(await page.locator('.cc button', { hasText: label }).count(), 1, label + ' gleichrangig');
  const axe = await new AxeBuilder({ page }).include('section.cc').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(axe.violations.map((v) => v.id), [], 'Banner barrierefrei');
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /script-src 'self' https:\/\/www\.googletagmanager\.com/);

  // 2) Ablehnen: Auswahl gespeichert, kein Google, Banner weg, auch nach dem Neuladen.
  await page.locator('.cc button', { hasText: 'Ablehnen' }).click();
  assert.equal(await page.locator('section.cc').count(), 0);
  assert.equal(JSON.parse((await stored(page))[0]).stats, false);
  await page.evaluate(() => sessionStorage.setItem('vu-nl-popup', '1')); // Fenster gilt als gezeigt; geprüft in 6)
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('section.cc').count(), 0, 'Auswahl bleibt');
  assert.equal(google.length, 0, 'nach Ablehnen lädt Google nichts');

  // 3) Cookie-Einstellungen im Fuß öffnen die Auswahl; Statistik an, Google lädt mit der Mess-ID.
  await page.locator('footer [data-consent-open]').click();
  await page.locator('#cc-stats').check();
  await page.locator('.cc button', { hasText: 'Auswahl speichern' }).click();
  await page.waitForTimeout(300);
  assert.ok(google.some((u) => /gtag\/js\?id=G-TEST1234/.test(u)), 'Google Analytics nach Zustimmung');

  // 4) Widerruf: Auswahl aus, Seite lädt neu, Google bleibt danach aus.
  await page.evaluate(() => { document.cookie = '_ga=GA1.1.1; path=/'; });
  await page.locator('footer [data-consent-open]').click();
  await page.locator('#cc-stats').uncheck();
  await Promise.all([page.waitForEvent('load'), page.locator('.cc button', { hasText: 'Auswahl speichern' }).click()]);
  const before = google.length;
  await page.waitForLoadState('networkidle');
  assert.equal(google.length, before, 'nach Widerruf kein Google');
  assert.doesNotMatch(await page.evaluate(() => document.cookie), /_ga=/, 'Analyse-Cookies gelöscht');
  await context.close();

  // 5) Ohne Mess-ID lädt auch nach „Akzeptieren“ nichts von Google; CSP bleibt ohne Google.
  ({ context, page, google } = await open('/ready/'));
  assert.doesNotMatch(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /google/);
  await page.locator('.cc button', { hasText: 'Akzeptieren' }).click();
  await page.waitForTimeout(300);
  assert.equal(google.length, 0, 'ohne Mess-ID kein Google');

  // 6) Newsletter-Fenster: nach der Auswahl beim Scrollen, mit dem bestehenden Formular, einmal je Besuch.
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.3));
  const pop = page.locator('dialog.nlpop[open]');
  await pop.waitFor({ timeout: 3000 });
  assert.equal(await pop.locator('#newsletter-form').count(), 1, 'Formular im Fenster');
  assert.equal(await page.locator('#newsletter-form').count(), 1, 'Formular nur einmal');
  const axePop = await new AxeBuilder({ page }).include('dialog.nlpop').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(axePop.violations.map((v) => v.id), [], 'Fenster barrierefrei');
  await page.keyboard.press('Escape');
  await page.locator('#newsletter #newsletter-form').waitFor({ state: 'attached', timeout: 3000 }); // close-Ereignis kommt asynchron
  assert.equal(await page.locator('#newsletter #newsletter-form').count(), 1, 'Formular zurück an seinem Platz');
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.3));
  await page.waitForTimeout(800);
  assert.equal(await page.locator('dialog.nlpop').count(), 0, 'nur einmal je Besuch');
  await context.close();
}
