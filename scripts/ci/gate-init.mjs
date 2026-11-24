/* Zugangszustand für Live-Prüfungen hinter der Zugangsmaske (Steuerung 24.11.2026).
   Aufruf:  node --import ./scripts/ci/gate-init.mjs scripts/discover/browser-qa.mjs ...
   Voraussetzung (nur im env des jeweiligen Schritts): RESEARCH_ACCESS_PASSWORD und IN_SITE (Adresse der geprüften Seite).
   Wirkung: jeder Browserkontext der geteilten Playwright-Instanz bekommt ein Init-Skript, das den Zugangszustand (accessStateFor,
   wie scripts/mobile/measure.mjs --gate und browser-qa-kurzhistorie.mjs) in localStorage legt, und zwar NUR im Ursprung von IN_SITE.
   Das Passwort steht nie in Argumenten, Ausgabe, Artefakt oder Seite; in die Seite geht nur der abgeleitete Zustand.
   Ohne Passwort oder ohne gültige IN_SITE passiert nichts (die Skripte laufen wie bisher, mit Hinweis auf stderr).
   Die Skripte brauchen keine Änderung: sie rufen browser.newContext() oder browser.newPage() wie immer. */
import { createRequire } from 'node:module';
import { accessStateFor, STORAGE_KEY } from '../access-gate/build.mjs';

export function gateInitScript() {
  return ([k, v, o]) => { try { if (location.origin === o) localStorage.setItem(k, v); } catch (e) { /* ohne Speicher */ } };
}

/** Hängt das Init-Skript an jeden Kontext, den ein Browser dieses Typs (chromium, webkit, firefox) erzeugt. */
export function installGate(playwright, { origin, key, value }) {
  const arg = [key, value, origin];
  for (const name of ['chromium', 'webkit', 'firefox']) {
    const type = playwright && playwright[name];
    if (!type || typeof type.launch !== 'function' || type.__vuGate) continue;
    const launch = type.launch.bind(type);
    type.launch = async (...a) => {
      const browser = await launch(...a);
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...b) => {
        const ctx = await newContext(...b);
        await ctx.addInitScript(gateInitScript(), arg);
        return ctx;
      };
      browser.newPage = async (opts) => {
        const ctx = await browser.newContext(opts);
        const page = await ctx.newPage();
        const close = page.close.bind(page);
        page.close = async (o) => { try { await close(o); } finally { await ctx.close().catch(() => {}); } };
        return page;
      };
      return browser;
    };
    type.__vuGate = true;
  }
  return playwright;
}

export function activate(env = process.env, load = () => createRequire(import.meta.url)('playwright')) {
  const password = env.RESEARCH_ACCESS_PASSWORD;
  if (!password) { console.error('gate-init: kein RESEARCH_ACCESS_PASSWORD, kein Zugangszustand'); return false; }
  let origin;
  try { origin = new URL(env.IN_SITE).origin; } catch { console.error('gate-init: IN_SITE fehlt oder ist keine Adresse, kein Zugangszustand'); return false; }
  installGate(load(), { origin, key: STORAGE_KEY, value: JSON.stringify(accessStateFor(password)) });
  return true;
}

if (process.env.VU_GATE_INIT_NOAUTO !== '1') activate();
