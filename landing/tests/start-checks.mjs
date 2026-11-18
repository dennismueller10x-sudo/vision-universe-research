import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
// Owner 17./18.11.2026: zwei Abschnitte ohne Leerraum. Abschnitt 1 zeigt, was die App kann (ohne Mengenangaben), Abschnitt 2
// sammelt die Anmeldung. Abschnitt 1 passt ganz ins Fenster, nach dem Knopf ist die ganze Anmeldung zu sehen: Handy (iPhone-Safari 390 × 660, Android 412 × 700), Desktop, flacher Laptop.
export async function checkStart(newContext, base) {
  for (const [name, width, height] of [['desktop', 1440, 900], ['laptop', 1366, 620], ['iphone', 390, 660], ['android', 412, 700]]) {
    const mobile = /iphone|android/.test(name);
    const context = await newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => localStorage.setItem('vu-consent', JSON.stringify({ v: 1, stats: false, t: '2026-11-17' })));
    const page = await context.newPage();
    await page.goto(base + '/start/', { waitUntil: 'networkidle' });
    const a = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, end: document.querySelector('.lpa').getBoundingClientRect().bottom, caps: document.querySelectorAll('.lpcaps li').length, text: document.querySelector('.lpa').innerText }));
    assert.equal(a.w, width, `${name}: kein seitliches Scrollen`);
    assert.ok(a.end <= height + 1, `${name}: Bildschirm 1 passt ins Fenster (${Math.round(a.end)} px)`);
    assert.ok(a.caps >= 4, `${name}: Bildschirm 1 zeigt, was die App kann`);
    assert.doesNotMatch(a.text, /\d\.\d{3}|1990|20 Jahre/, `${name}: keine Mengen- oder Historienangaben`);
    await page.locator('.lpnext a[href="#anmelden"]').click();
    await page.waitForTimeout(1200); // sanftes Scrollen
    const b = await page.evaluate(() => { const f = document.querySelector('#newsletter-form').getBoundingClientRect(); return { formTop: f.top, formEnd: f.bottom }; });
    assert.ok(b.formTop >= 0 && b.formEnd <= height, `${name}: nach dem Knopf ist die ganze Anmeldung zu sehen (${Math.round(b.formTop)}–${Math.round(b.formEnd)} px)`);
    assert.equal(await page.locator('#anmelden #newsletter-form').getAttribute('data-ready'), 'true');
    for (const href of ['../impressum/', '../datenschutz/']) assert.equal(await page.locator(`footer a[href="${href}"]`).count(), 1);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    assert.equal(await page.locator('dialog.nlpop').count(), 0, 'kein Newsletter-Fenster auf der Landingpage');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map((v) => v.id + ':' + v.nodes.length), [], `${name}: barrierefrei`);
    await context.close();
  }
}
