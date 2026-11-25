// www.visionuniverse.de (Story-Website, Owner 17.11.2026): News, Aktienmagazin und Aktienreport auf www zeigen den
// aktuellen Insights-Stand. products/insights/build.mjs frischt landing/ im selben Lauf auf (scripts/website/www-news.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { syncWww, readState, regions } from "../../scripts/website/www-news.mjs";
import { readFileSync, existsSync, statSync } from "node:fs";

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
  for (const h of hero.slice(1)) assert.match(h, /loading="lazy" fetchpriority="low" decoding="async"/);
  assert.equal((html.match(/fetchpriority="high"/g) || []).length, 2, "Preload und erstes Bild, sonst nichts");
  // Alle Bilder der Buehne und der Regale ausser dem Aufmacher: im HTML mit src (Suchmaschinen, KI-Suche, ohne JS), aber niedrige Prioritaet,
  // damit sie dem Aufmacher auf langsamer Leitung keine Bandbreite nehmen (Ladezeit-Lauf 45369693746: Aufmacher 94 KB erst nach 3,1 s).
  const regale = (html.slice(html.indexOf('class="ts-hero"')).match(/<img [^>]*>/g) || []).filter((t) => /src="[^"]*web\/img\/news\//.test(t));
  const ohne = regale.slice(1).filter((t) => !/loading="lazy" fetchpriority="low" decoding="async"/.test(t));
  assert.ok(regale.length > 5 && ohne.length === 0, "Bilder ohne niedrige Prioritaet: " + ohne.slice(0, 3).join(" "));
  assert.ok(regale.slice(1).every((t) => /src="/.test(t)), "jedes Bild behaelt src");
  // Regal- und Listenbilder (24.11.2026): eine 640-px-Variante mit Hash des Originals, srcset+sizes, das Original bleibt als src/1600w.
  const karten = regale.slice(1).filter((t) => /web\/img\/news\/art-/.test(t) && !/srcset="[^"]*800w/.test(t)); // Artikelbilder; Magazin- und Report-Titel bleiben wie sie sind
  assert.ok(karten.length > 20, "Regal- und Listenbilder gefunden: " + karten.length);
  for (const t of karten) {
    const m = t.match(/src="\.\.\/web\/img\/news\/([^"]+\.jpg)" srcset="\.\.\/web\/img\/news\/([^ ]+-[0-9a-f]{8}-640\.jpg) 640w, \.\.\/web\/img\/news\/\1 1600w" sizes="\(min-width: 1000px\) 25vw, \(min-width: 640px\) 50vw, 75vw"/);
    assert.ok(m, "Bild mit 640w/1600w und sizes: " + t.slice(0, 160));
    const f = new URL("../../landing/web/img/news/" + m[2], import.meta.url);
    assert.ok(existsSync(f) && statSync(f).size < 120000, "Variante vorhanden und klein: " + m[2]);
  }
});
