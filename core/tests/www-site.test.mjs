// www.visionuniverse.de (Story-Website, Owner 17.11.2026): News, Aktienmagazin und Aktienreport auf www zeigen den
// aktuellen Insights-Stand. products/insights/build.mjs frischt landing/ im selben Lauf auf (scripts/website/www-news.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { syncWww, readState, regions } from "../../scripts/website/www-news.mjs";

test("WWW-1 · www zeigt den neuesten Artikel, das neueste Heft und den neuesten Report", () => {
  const stale = syncWww({ check: true });
  assert.deepEqual(stale, [], "www veraltet: node scripts/website/www-news.mjs ausführen und landing/ mit committen");
});

test("WWW-2 · Startseite: oben „Neu: Aktienmagazin“, im News-Kapitel mindestens drei Tagesnews und fest Heft und Report", () => {
  const r = regions(readState())["index.html"];
  assert.match(r.neu, /class="ah2-new" href="\.\/magazin\/"/);
  assert.ok((r.start.match(/class="ntile"/g) || []).length >= 3);
  assert.equal((r.start.match(/class="hlm"/g) || []).length, 2);
  assert.doesNotMatch(r.neu + r.start, /src="https?:/, "Bilder liegen auf www selbst");
});
