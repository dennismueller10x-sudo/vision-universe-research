import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
// Landingpage /start/ (Owner 17.11.2026): kurz und schlüssig, man darf nur kurz scrollen.
// Desktop: ein Bildschirm. Handy: höchstens gut zwei Bildschirme, das Formular beginnt im ersten.
export async function checkStart(newContext, base) {
  for (const [name, width, height, maxScreens] of [['desktop', 1440, 900, 1.1], ['iphone', 390, 844, 2.2]]) {
    const context = await newContext({ viewport: { width, height }, isMobile: name === 'iphone', hasTouch: name === 'iphone' });
    await context.addInitScript(() => localStorage.setItem('vu-consent', JSON.stringify({ v: 1, stats: false, t: '2026-11-17' })));
    const page = await context.newPage();
    await page.goto(base + '/start/', { waitUntil: 'networkidle' });
    const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, form: document.querySelector('#newsletter-form').getBoundingClientRect().top }));
    assert.ok(m.h <= height * maxScreens, `${name}: Seite ${m.h}px, höchstens ${maxScreens} Bildschirme`);
    assert.equal(m.w, width, `${name}: kein seitliches Scrollen`);
    assert.ok(m.form < height, `${name}: Formular beginnt im ersten Bildschirm`);
    assert.equal(await page.locator('#newsletter-form').getAttribute('data-ready'), 'true');
    for (const href of ['../impressum/', '../datenschutz/']) assert.equal(await page.locator(`footer a[href="${href}"]`).count(), 1);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    assert.equal(await page.locator('dialog.nlpop').count(), 0, 'kein Newsletter-Fenster auf der Landingpage');
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    assert.deepEqual(axe.violations.map((v) => v.id + ':' + v.nodes.length), [], `${name}: barrierefrei`);
    await context.close();
  }
}
