import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
// Landingpage /start/ (Owner 17.11.2026): kurz und schlüssig, man darf nur kurz scrollen.
// Owner 17.11.2026: kein Scrollen. Auf dem Handy (iPhone-Safari-Fläche 390 × 660), am Desktop und am flachen Laptop
// steht alles auf einem Bildschirm, das ganze Anmeldeformular eingeschlossen.
export async function checkStart(newContext, base) {
  for (const [name, width, height, maxScreens] of [['desktop', 1440, 900, 1.01], ['laptop', 1366, 620, 1.01], ['iphone', 390, 660, 1.01], ['android', 412, 700, 1.01]]) {
    const context = await newContext({ viewport: { width, height }, isMobile: /iphone|android/.test(name), hasTouch: /iphone|android/.test(name) });
    await context.addInitScript(() => localStorage.setItem('vu-consent', JSON.stringify({ v: 1, stats: false, t: '2026-11-17' })));
    const page = await context.newPage();
    await page.goto(base + '/start/', { waitUntil: 'networkidle' });
    const m = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, form: document.querySelector('#newsletter-form').getBoundingClientRect().bottom }));
    assert.ok(m.h <= height * maxScreens, `${name}: Seite ${m.h}px, höchstens ${maxScreens} Bildschirme`);
    assert.equal(m.w, width, `${name}: kein seitliches Scrollen`);
    assert.ok(m.form <= height, `${name}: ganzes Formular im ersten Bildschirm`);
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
