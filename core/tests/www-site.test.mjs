// www.visionuniverse.de (Story-Website, Owner 17.11.2026): News, Aktienmagazin und Aktienreport auf www zeigen den
// aktuellen Insights-Stand. products/insights/build.mjs frischt landing/ im selben Lauf auf (scripts/website/www-news.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { syncWww, readState, regions } from "../../scripts/website/www-news.mjs";

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
