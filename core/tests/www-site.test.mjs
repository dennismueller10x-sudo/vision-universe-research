// www.visionuniverse.de (Story-Website, Owner 17.11.2026): News, Aktienmagazin und Aktienreport auf www zeigen den
// aktuellen Insights-Stand. products/insights/build.mjs frischt landing/ im selben Lauf auf (scripts/website/www-news.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { syncWww, readState, regions } from "../../scripts/website/www-news.mjs";
import { readFileSync } from "node:fs";

test("WWW-1 · www zeigt den neuesten Artikel, das neueste Heft und den neuesten Report", () => {
  const stale = syncWww({ check: true });
  assert.deepEqual(stale, [], "www veraltet: node scripts/website/www-news.mjs ausführen und landing/ mit committen");
});

test("WWW-2 · Startseite: Heft und Report als eigener Abschnitt, News-Bühne mit Aufmacher und mindestens drei Tagesnews", () => {
  const r = regions(readState())["index.html"];
  assert.equal((r.pubs.match(/class="pub[ "]/g) || []).length, 2);
  assert.match(r.tv, /class="vw-bill"/);
  assert.ok((r.tv.match(/class="vw-card"/g) || []).length >= 3);
  assert.doesNotMatch(r.pubs + r.tv, /src="https?:/, "Bilder liegen auf www selbst");
});

test("News-Seite: Bühnenbild mit srcset, Vorladen im Kopf vor der Schrift, hohe Priorität nur am ersten Bild", () => {
  const html = readFileSync(new URL("../../landing/news/index.html", import.meta.url), "utf8");
  const pre = html.indexOf('<link rel="preload" as="image"'), font = html.indexOf('as="font"');
  assert.ok(pre > 0 && font > pre, "Bild-Preload steht vor dem Schriften-Preload");
  assert.match(html, /<link rel="preload" as="image"[^>]*imagesrcset="[^"]*-800\.jpg 800w[^"]*"[^>]*fetchpriority="high"/);
  const hero = html.match(/<div class="ts-sl[^"]*"[^>]*><div class="ts-art"><img [^>]*>/g) || [];
  assert.equal(hero.length, 5);
  assert.match(hero[0], /srcset="[^"]*800w[^"]*" sizes="[^"]*" width="1600" height="900" alt="" fetchpriority="high"/);
  for (const h of hero.slice(1)) assert.match(h, /loading="lazy"/);
  assert.equal((html.match(/fetchpriority="high"/g) || []).length, 2, "Preload und erstes Bild, sonst nichts");
});
