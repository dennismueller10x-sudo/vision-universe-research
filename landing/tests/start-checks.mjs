import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
// Owner 17.11.2026: zwei Bildschirme. Bildschirm 1 zeigt, was die App kann (ohne Mengenangaben), Bildschirm 2 sammelt die
// Anmeldung. Jeder passt ganz ins Fenster: Handy (iPhone-Safari 390 × 660, Android 412 × 700), Desktop, flacher Laptop.
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
    await page.waitForFunction(() => Math.abs(document.getElementById('anmelden').getBoundingClientRect().top) <= 2, null, { timeout: 4000 }); // sanftes Scrollen
    const b = await page.evaluate(() => { const s = document.getElementById('anmelden').getBoundingClientRect(), f = document.querySelector('#newsletter-form').getBoundingClientRect(); return { top: s.top, formEnd: f.bottom }; });
    assert.ok(Math.abs(b.top) <= 2 && b.formEnd <= height, `${name}: Bildschirm 2 zeigt die ganze Anmeldung (${Math.round(b.formEnd)} px)`);
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
