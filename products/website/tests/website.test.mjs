/* Website-Vorschau (/website/): Seiten aktuell, Owner-Regeln vom 12.11.2026 eingehalten. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, MODULES, SOCIAL } from "../build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SITE = buildSite();
const hrefs = (html) => [...html.matchAll(/\s(?:href|src|data-video|data-poster)="([^"]+)"/g)].map((m) => m[1]);
/* Routen der App: dürfen nicht verlinkt sein, solange die App nicht verfügbar ist. */
const APP_ROUTES = /^\/(discover|quant|fundamental|technical|screener|supertrader|hedgefonds|elliott|portfolios|vorsorge|ask|konto|mein-dashboard|willkommen|aktie|preise|dashboard|app)(\/|$)/;

test("WEB-1 · die committeten Seiten entsprechen dem Bau (node products/website/build.mjs)", () => {
  for (const [p, html] of SITE) assert.equal(readFileSync(join(ROOT, "website", p), "utf8"), html, `website/${p} veraltet`);
});

test("WEB-2 · intern: jede Seite noindex", () => {
  for (const [p, html] of SITE) assert.match(html, /<meta name="robots" content="noindex,nofollow">/, p);
});

test("WEB-3 · kein Link in die App, keine Store-Links, keine Preise", () => {
  for (const [p, html] of SITE) {
    for (const h of hrefs(html)) {
      assert.ok(!APP_ROUTES.test(h), `${p}: Link in die App ${h}`);
      assert.ok(!/apps\.apple\.com|play\.google\.com/.test(h), `${p}: Store-Link ${h}`);
    }
    assert.ok(!/App öffnen|Kostenlos starten|Jetzt starten|Anmelden/.test(html), `${p}: App-Aufforderung`);
    assert.ok(html.includes("App bald verfügbar"), `${p}: Hinweis „App bald verfügbar“ fehlt`);
    assert.ok(!/\d+[,.]\d{2}\s?€\s?(im|pro|\/)\s?Monat/.test(html), `${p}: Preis`);
  }
});

test("WEB-4 · Social Media nur Instagram und TikTok", () => {
  assert.deepEqual(SOCIAL.map((s) => s[0]), ["instagram", "tiktok"]);
  for (const [p, html] of SITE) {
    const ext = hrefs(html).filter((h) => /^https?:/.test(h) && !/visionuniverse\.de/.test(h));
    for (const h of ext) assert.match(h, /^https:\/\/www\.(instagram\.com|tiktok\.com)\//, `${p}: ${h}`);
  }
});

test("WEB-5 · interne Ziele existieren", () => {
  for (const [p, html] of SITE) {
    for (const h of hrefs(html).filter((x) => x.startsWith("/"))) {
      const path = h.split(/[?#]/)[0];
      const file = path.endsWith("/") ? join(ROOT, path, "index.html") : join(ROOT, path);
      const generated = path.startsWith("/website/") && path.endsWith("/") && SITE.has(path.slice(9) + "index.html");
      assert.ok(generated || existsSync(file), `${p}: Ziel fehlt ${h}`);
    }
  }
});

test("WEB-6 · Wortwahl (docs/legal/WORTWAHL.md) und Pflichtsatz", () => {
  const notice = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8")).notices.footer.text;
  const BAD = /Kaufempfehlung|Kaufsignal|Verkaufssignal|\bSignale?\b|Kursziel(?!e\b)|wir empfehlen|empfohlen|garantiert|risikolos|Geheimtipp|Top-Pick|unterbewertet|Schnäppchen|passt zu dir|Was Profis kaufen|Was kaufen/;
  for (const [p, html] of SITE) {
    const text = html.replace(/<[^>]+>/g, " ").replace(/Keine Kursziele|keine Kursziele|kein Kursziel|ohne Kursziel/g, "");
    assert.ok(!BAD.test(text), `${p}: ${text.match(BAD)?.[0]}`);
    assert.ok(html.includes(notice.replace(/&/g, "&amp;")), `${p}: Pflichtsatz fehlt`);
  }
});

test("WEB-7 · alle Module mit eigener Seite, Startseite zeigt die Unterseiten prominent", () => {
  for (const m of MODULES) assert.ok(SITE.has(m.id === "insights" ? "insights/index.html" : `funktionen/${m.id}/index.html`), m.id);
  const home = SITE.get("index.html");
  for (const p of ["funktionen/", "insights/", "fuer-wen/", "videos/", "daten/"]) assert.ok(home.includes(`class="xcard`) && home.includes(`href="/website/${p}"`), p);
  for (const img of hrefs(home).filter((h) => h.startsWith("/website/img/"))) assert.ok(existsSync(join(ROOT, img)), img);
});
