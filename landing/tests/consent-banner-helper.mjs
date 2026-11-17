// Cookie-Banner (web/consent.js) liegt unten über der Seite. Ältere Browser-Prüfungen klicken ins Formular
// und prüfen, dass ohne Klick nichts im Browser gespeichert wird. Für sie blenden wir das Banner aus, ohne
// eine Auswahl zu speichern. Banner, Einwilligung und Newsletter-Fenster prüft tests/consent-checks.mjs.
const hide = () => {
  const drop = () => document.querySelectorAll('section.cc').forEach((e) => e.remove());
  new MutationObserver(drop).observe(document, { childList: true, subtree: true });
};
export function withoutConsentBanner(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => { const context = await newContext(options); await context.addInitScript(hide); return context; };
  browser.newPage = async (options) => { const context = await browser.newContext(options); const page = await context.newPage(); page.on('close', () => context.close().catch(() => {})); return page; };
  return newContext;
}
