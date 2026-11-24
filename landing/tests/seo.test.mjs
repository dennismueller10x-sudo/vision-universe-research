// Suche für www.visionuniverse.de: Veröffentlichungsschalter, robots/Sitemap, strukturierte Daten, llms.txt, IndexNow-Schlüssel.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build, root, SITE_PAGES, publicationModeFor, ALTE_SHOP_ADRESSEN} from '../scripts/build.mjs';
import {fragen, strukturierteDaten} from '../scripts/seo.mjs';

const privacy = {mode:'closed', privacyReviewed:true, privacyHtmlPath:'legal-drafts/newsletter-public-2026-10-16.html'};

test('SEO-1 · Produktionszweig folgt publication.json, Vorschau-Zweige bleiben preview', async () => {
  const file = JSON.parse(await readFile(resolve(root,'publication.json'),'utf8'));
  assert.equal(file.main, 'production');
  assert.equal(publicationModeFor({CF_PAGES_BRANCH:'main'}, file), 'production');
  assert.equal(publicationModeFor({CF_PAGES_BRANCH:'main', LANDING_PUBLICATION_MODE:'preview'}, file), 'production');
  assert.equal(publicationModeFor({CF_PAGES_BRANCH:'claude/x', LANDING_PUBLICATION_MODE:'production'}, file), 'preview');
  assert.equal(publicationModeFor({CF_PAGES_BRANCH:'main'}, {main:'preview'}), 'preview');
  assert.equal(publicationModeFor({}, file), 'preview');
  assert.equal(publicationModeFor({LANDING_PUBLICATION_MODE:'production'}, file), 'production');
});

test('SEO-2 · Produktionsbau: indexierbar, robots, Sitemap, llms.txt, Schlüssel, strukturierte Daten', async () => {
  const out = resolve(root,'tests/output/seo-production');
  try {
    await build({output:out, config:privacy, production:true});
    assert.match(await readFile(resolve(out,'robots.txt'),'utf8'), /^User-agent: \*\nAllow: \/\nSitemap: https:\/\/www\.visionuniverse\.de\/sitemap\.xml\n$/);
    assert.doesNotMatch(await readFile(resolve(out,'_headers'),'utf8'), /X-Robots-Tag/);
    const sitemap = await readFile(resolve(out,'sitemap.xml'),'utf8');
    for (const p of SITE_PAGES) assert.ok(sitemap.includes('https://www.visionuniverse.de/'+p.replace('index.html','')+'<'), p);
    const llms = await readFile(resolve(out,'llms.txt'),'utf8');
    assert.match(llms, /^# Vision Universe\n\n> /);
    assert.match(llms, /Keine Anlageberatung/);
    for (const p of ['index.html', ...SITE_PAGES]) {
      const html = await readFile(resolve(out,p),'utf8');
      assert.match(html, /<meta name="robots" content="index, follow">/, p);
      const ld = html.match(/<script type="application\/ld\+json" data-vu-seo>([^<]*)<\/script>/);
      assert.ok(ld, p + ': strukturierte Daten');
      const graph = JSON.parse(ld[1])['@graph'];
      assert.ok(graph.length >= 2, p);
      if (p !== 'index.html') assert.ok(graph.some((g) => g['@type'] === 'BreadcrumbList'), p);
    }
    const home = await readFile(resolve(out,'index.html'),'utf8');
    const graph = JSON.parse(home.match(/data-vu-seo>([^<]*)</)[1])['@graph'];
    assert.deepEqual(graph.map((g) => g['@type']), ['Organization','WebSite','FAQPage']);
    assert.equal(graph[2].mainEntity.length, (home.match(/<div class="faq">[\s\S]*?<\/div>/)[0].match(/<details>/g) || []).length);
    const key = (await readdir(resolve(root,'..'))).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    assert.equal(await readFile(resolve(out,key),'utf8'), await readFile(resolve(root,'..',key),'utf8'), 'IndexNow-Schlüssel wie auf research');
  } finally { await rm(out,{recursive:true,force:true}); }
});

test('SEO-3 · Vorschaubau bleibt gesperrt', async () => {
  const out = resolve(root,'tests/output/seo-preview');
  try {
    await build({output:out});
    assert.equal(await readFile(resolve(out,'robots.txt'),'utf8'), 'User-agent: *\nDisallow: /\n');
    assert.match(await readFile(resolve(out,'_headers'),'utf8'), /X-Robots-Tag: noindex, nofollow/);
    assert.match(await readFile(resolve(out,'index.html'),'utf8'), /content="noindex, nofollow"/);
  } finally { await rm(out,{recursive:true,force:true}); }
});

test('SEO-4 · Fragen nur aus dem FAQ-Block, ohne Plus-Zeichen; keine Daten ohne eigene Kanonisch-Adresse', () => {
  const html = '<div class="faq"><details><summary>Was ist das?<i aria-hidden="true">+</i></summary><p>Eine <b>App</b>.</p></details></div>';
  assert.deepEqual(fragen(html), [{frage:'Was ist das?', antwort:'Eine App.'}]);
  assert.deepEqual(strukturierteDaten('news/index.html', '<title>X</title>'), []);
  assert.deepEqual(strukturierteDaten('news/index.html', '<title>X</title><link rel="canonical" href="https://example.com/">'), []);
});

test('SEO-5 · alte Shop-Adressen leiten um, unbekannte Adressen bekommen eine echte 404-Seite', async () => {
  const out = resolve(root,'tests/output/seo-404');
  try {
    await build({output:out, config:privacy, production:true});
    const redirects = await readFile(resolve(out,'_redirects'),'utf8');
    for (const alt of ['/pages/*', '/products/*', '/collections/*', '/blogs/*']) assert.match(redirects, new RegExp('^'+alt.replace(/[/*]/g,'\\$&')+' /[a-z/]* 301$','m'), alt);
    // Echte Seiten werden nie umgeleitet (Cloudflare wendet _redirects vor den Dateien an).
    for (const [von] of ALTE_SHOP_ADRESSEN) for (const p of SITE_PAGES) assert.ok(!('/'+p).startsWith(von.replace('*','')), `${von} trifft ${p}`);
    assert.doesNotMatch(redirects, /^\/policies/m);
    const fehler = await readFile(resolve(out,'404.html'),'utf8');
    assert.match(fehler, /<meta name="robots" content="noindex, nofollow">/);
    assert.doesNotMatch(fehler, /rel="canonical"/);
    assert.doesNotMatch(fehler, /(href|src)="(?!https?:|\/|#|mailto:|data:)/, 'nur absolute Pfade');
    assert.ok(!(await readFile(resolve(out,'sitemap.xml'),'utf8')).includes('404'));
  } finally { await rm(out,{recursive:true, force:true}); }
});

test('SEO-6 · jede Seite nennt ein eigenes, vorhandenes Vorschaubild zum Teilen', async () => {
  const out = resolve(root,'tests/output/seo-og');
  const {existsSync} = await import('node:fs');
  try {
    await build({output:out, config:privacy, production:true});
    const seiten = (await readdir(out,{recursive:true})).filter((f)=>f.endsWith('.html'));
    assert.ok(seiten.length > 80, String(seiten.length));
    for (const f of seiten) {
      const html = await readFile(resolve(out,f),'utf8');
      const og = html.match(/<meta property="og:image" content="https:\/\/www\.visionuniverse\.de\/([^"]+)"/)?.[1];
      assert.ok(og, `${f}: kein og:image`);
      assert.ok(existsSync(resolve(out,og)), `${f}: ${og} fehlt`);
    }
  } finally { await rm(out,{recursive:true, force:true}); }
});
