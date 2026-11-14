/* Website (Owner-Freigaben „Website-Mock-up 3“ vom 14.11.2026): Vorschau /website2/ auf research und die Seiten für
   www.visionuniverse.de unter landing/. Seiten aktuell, Regeln eingehalten. Die Browser- und Formularprüfungen von www
   liegen in landing/tests/ (dort checkt die CI nur landing/ aus). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, buildWww, loadSnapshot, makeSnapshot, wwwAssets, wwwCss, wwwJs, MODULES, NEWSLETTER, HEFT, BASE, SOCIAL, PAGES as SITE_PAGES } from "../build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SITE = buildSite();
const CSS = readFileSync(join(ROOT, "website2/site.css"), "utf8");
const JS = readFileSync(join(ROOT, "website2/site.js"), "utf8");
const LEGAL = JSON.parse(readFileSync(join(ROOT, "assets/legal-notices.json"), "utf8"));
const refs = (html) => [...html.matchAll(/\s(?:href|src|poster)="([^"]+)"/g)].map((m) => m[1]);
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]);
const local = (h) => join(ROOT, h.split(/[?#]/)[0]);
/* Routen der App: dürfen nicht verlinkt sein, solange die App nicht verfügbar ist. */
const APP_ROUTES = /^\/(discover|quant|fundamental|technical|screener|supertrader|hedgefonds|elliott|portfolios|vorsorge|ask|konto|mein-dashboard|willkommen|aktie|preise|dashboard|app)(\/|$)/;
const PAGES = ["index.html", "app/index.html", ...MODULES.map((m) => `module/${m.id}/index.html`), "news/index.html", "magazin/index.html", "faq/index.html"];
/* Das Ziel www ist erst mit dem Umzug eingecheckt (landing/site/). Solange es fehlt, prüft diese Datei nur die Vorschau;
   dieselbe Datei gilt damit vor und nach dem Umzug. */
const HAS_WWW = existsSync(join(ROOT, "landing/site/pages.json"));
const TARGETS = () => [["research", SITE, BASE], ...(HAS_WWW ? [["www", buildWww(), ""]] : [])];

test("W2-1 · 17 Seiten; die committeten Seiten entsprechen dem Bau (node products/website2/build.mjs)", () => {
  assert.deepEqual([...SITE.keys()], PAGES);
  assert.equal(SITE.size, 17);
  assert.deepEqual(MODULES.map((m) => m.id), ["discover", "screener", "atlas", "fundamental", "quant", "technical", "elliott", "supertrader", "hedgefonds", "portfolios", "vorsorge", "insights"]);
  for (const [p, html] of SITE) assert.equal(readFileSync(join(ROOT, "website2", p), "utf8"), html, `website2/${p} veraltet`);
});

test("W2-2 · Vorschau: jede Seite noindex, ohne Mock-up-Marke, gemeinsames CSS und JS als Datei", () => {
  for (const [p, html] of SITE) {
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/, p);
    assert.ok(!/Mock-up/i.test(html), `${p}: Mock-up-Marke`);
    assert.ok(html.includes(`<link rel="stylesheet" href="${BASE}site.css">`) && html.includes(`<script src="${BASE}site.js" defer></script>`), `${p}: site.css/site.js`);
    assert.equal(tags(html, "style").length, 0, `${p}: eingebettetes CSS`);
    assert.equal(tags(html, "script").length, 1, `${p}: eingebettetes Skript`);
    assert.ok(!/prefers-color-scheme/.test(html), p);
  }
  assert.ok(!/prefers-color-scheme/.test(CSS), "kein Dunkelmodus");
  assert.match(CSS, /color-scheme:light/);
});

test("W2-3 · kein Link in die App, keine Store-Links, keine Preise; „App bald verfügbar“ auf jeder Seite", () => {
  for (const [p, html] of SITE) {
    for (const h of refs(html)) {
      assert.ok(!APP_ROUTES.test(h), `${p}: Link in die App ${h}`);
      assert.ok(!/apps\.apple\.com|play\.google\.com/.test(h), `${p}: Store-Link ${h}`);
    }
    assert.ok(!/App öffnen|Kostenlos starten|Jetzt starten|Anmelden/.test(html), `${p}: App-Aufforderung`);
    assert.ok(html.includes("App bald verfügbar"), `${p}: Hinweis „App bald verfügbar“ fehlt`);
    assert.ok(!/\d+[,.]\d{2}\s?€\s?(im|pro|\/)\s?Monat/.test(html), `${p}: Preis`);
  }
});

test("W2-4 · der eine Aufruf führt zur Anmeldung auf www, wie auf /website/; kein Formular, kein E-Mail-Feld", () => {
  assert.equal(NEWSLETTER, "https://www.visionuniverse.de/#newsletter");
  assert.match(readFileSync(join(ROOT, "products/website/build.mjs"), "utf8"), /const NEWSLETTER = "https:\/\/www\.visionuniverse\.de\/#newsletter";/, "/website/ nutzt dasselbe Ziel");
  for (const [p, html] of SITE) {
    const calls = [...html.matchAll(/<a class="cta[^"]*" href="([^"]+)">(Zum Start benachrichtigen|Benachrichtigen) /g)];
    assert.ok(calls.length >= 2, `${p}: Aufruf fehlt (Kopf und Abschluss)`);
    assert.ok(html.includes("Anmeldung auf www.visionuniverse.de"), `${p}: Hinweis, wo die Anmeldung liegt`);
    for (const c of calls) assert.equal(c[1], NEWSLETTER, `${p}: ${c[2]} → ${c[1]}`);
    assert.equal(tags(html, "form").length + tags(html, "input").length, 0, `${p}: Formular oder Eingabefeld`);
    const ext = refs(html).filter((h) => /^(https?:|mailto:)/.test(h));
    const social = SOCIAL.map((x) => x[2]);
    for (const h of ext) assert.ok(/^https:\/\/(www|konto|research)\.visionuniverse\.de\//.test(h) || h === "mailto:info@visionuniverse.de" || social.includes(h), `${p}: fremdes Ziel ${h}`);
  }
});

test("W2-5 · interne Ziele existieren; jede Datei unter website2/img und website2/vid wird verwendet", () => {
  const used = new Set();
  for (const [p, html] of SITE) {
    for (const h of refs(html).filter((x) => x.startsWith("/"))) {
      const path = h.split(/[?#]/)[0];
      used.add(path);
      const generated = path.startsWith(BASE) && path.endsWith("/") && SITE.has(path.slice(BASE.length) + "index.html");
      assert.ok(generated || existsSync(path.endsWith("/") ? join(ROOT, path, "index.html") : local(path)), `${p}: Ziel fehlt ${h}`);
      const anchor = h.split("#")[1];
      if (anchor && path.startsWith(BASE)) assert.ok(SITE.get(path.slice(BASE.length) + "index.html").includes(`id="${anchor}"`), `${p}: Anker fehlt ${h}`);
    }
    for (const a of [...html.matchAll(/href="#([^"]+)"/g)]) assert.ok(html.includes(`id="${a[1]}"`), `${p}: Anker #${a[1]} fehlt`);
  }
  for (const dir of ["img", "vid"]) for (const f of readdirSync(join(ROOT, "website2", dir))) assert.ok(used.has(`${BASE}${dir}/${f}`), `website2/${dir}/${f} wird von keiner Seite verwendet`);
  for (const u of [...CSS.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1])) assert.ok(existsSync(local(u)), `site.css: ${u}`);
});

test("W2-6 · Wortwahl (docs/legal/WORTWAHL.md); Pflichtsatz und Rechtslinks nur im Menü „Rechtliches & Infos“", () => {
  const notice = LEGAL.notices.footer.text;
  const BAD = /Kaufempfehlung|Kaufsignal|Verkaufssignal|\bSignale?\b|Kursziel(?!e\b)|wir empfehlen|empfohlen|garantiert|risikolos|Geheimtipp|Top-Pick|unterbewertet|Schnäppchen|passt zu dir|Was Profis kaufen|Was kaufen|schlägt den Markt|Outperform|Mehrrendite|Kaufzone|Einstiegszone|Stop-Loss/;
  for (const [p, html] of SITE) {
    const text = html.replace(/<[^>]+>/g, " ").replace(/Keine Kursziele|keine Kursziele|kein Kursziel|ohne Kursziel|kein\s+Kursziel/g, "");
    assert.ok(!BAD.test(text), `${p}: ${text.match(BAD)?.[0]}`);
    const menu = html.match(/<nav\b[^>]*id="site-panel"[^>]*>[\s\S]*?<\/nav>/)?.[0] || "";
    assert.ok(menu.includes("<h2>Rechtliches &amp; Infos</h2>") && menu.includes(notice.replace(/&/g, "&amp;")), `${p}: Pflichtsatz fehlt im Menü`);
    for (const k of ["impressum", "kontakt", "datenschutz", "bedingungen", "risikohinweise"]) assert.ok(menu.includes(`href="${LEGAL.links[k]}"`), `${p}: ${k} fehlt im Menü`);
    assert.ok(menu.includes('href="/infos/#quellen"'), `${p}: Datenquellen fehlen im Menü`);
    assert.ok(!html.replace(menu, "").includes(notice.slice(0, 60)), `${p}: Pflichtsatz außerhalb des Menüs`);
    /* Der Fuß zeigt wie auf www Impressum, Datenschutz, Kontaktformular und E-Mail (in der Vorschau mit den Adressen von www). */
    const foot = html.match(/<footer[\s\S]*<\/footer>/)[0];
    assert.ok(foot.includes('href="/infos/"') && !/rechtliches\//.test(foot), `${p}: Fuß verlinkt /infos/, keine Rechtslinks von research`);
    for (const t of ["https://www.visionuniverse.de/impressum/", "https://www.visionuniverse.de/datenschutz/", "https://konto.visionuniverse.de/kontakt", "mailto:info@visionuniverse.de"]) assert.ok(foot.includes(`href="${t}"`), `${p}: ${t} fehlt im Fuß`);
  }
});

test("W2-7 · echte Links zwischen den Seiten: Menü, Leiste unten und Startseite führen zu jeder Unterseite", () => {
  for (const [p, html] of SITE) {
    const head = html.match(/<header[\s\S]*<\/header>/)[0], dock = html.match(/<nav class="dock"[\s\S]*?<\/nav>/)[0];
    for (const t of ["", "app/", "news/", "magazin/", "faq/"]) assert.ok(head.includes(`href="${BASE}${t}"`), `${p}: Kopf ohne ${t || "Start"}`);
    for (const m of MODULES) assert.ok(head.includes(`href="${BASE}module/${m.id}/"`), `${p}: Menü ohne ${m.id}`);
    for (const t of ["", "app/#bereiche", "app/", "news/", "faq/"]) assert.ok(dock.includes(`href="${BASE}${t}"`), `${p}: Leiste ohne ${t || "Start"}`);
    assert.ok(!/href="#"|javascript:|data-to=/.test(html), `${p}: Schein-Link`);
    /* „Module“ öffnet mit JavaScript das Menü und führt ohne JavaScript zur Übersicht der Bereiche. */
    assert.match(head, /<a class="nl[^"]*" href="\/website2\/app\/#bereiche" data-mega aria-controls="mega" aria-expanded="false">/, p);
    assert.equal((html.match(/aria-current="page"/g) || []).length <= 2, true, p);
  }
  const home = SITE.get("index.html"), app = SITE.get("app/index.html");
  for (const m of MODULES) for (const [n, page] of [["Start", home], ["App", app]]) assert.ok(page.match(/<main[\s\S]*<\/main>/)[0].includes(`href="${BASE}module/${m.id}/"`), `${n} ohne Kachel ${m.id}`);
  assert.ok(app.includes('id="bereiche"') && home.includes('id="fuer-wen"'));
});

test("W2-8 · Original-Knöpfe von Apple und Google in Farbe, auf jeder Seite, ohne Store-Link, mit „Bald verfügbar“", () => {
  for (const [p, html] of SITE) {
    assert.ok(html.includes('src="/website/img/badge-apple.svg" alt="Laden im App Store"'), `${p}: App-Store-Knopf fehlt`);
    assert.ok(html.includes('src="/website/img/badge-google.png" alt="Jetzt bei Google Play"'), `${p}: Google-Play-Knopf fehlt`);
    assert.ok(!/<a[^>]*>\s*<img[^>]*badge-/.test(html), `${p}: Store-Knopf ist verlinkt`);
    assert.match(html, /badge-google\.png"[^>]*><span>Bald verfügbar<\/span>/, `${p}: „Bald verfügbar“ fehlt neben den Knöpfen`);
  }
  assert.ok(!/grayscale|\.badge\{[^}]*(filter|opacity)/.test(CSS), "Knöpfe bleiben in Farbe");
});

test("W2-9 · Insights aktualisiert sich selbst: Plätze für Artikel, Heft und Report; festes Heft als Rückfall", () => {
  const home = SITE.get("index.html"), news = SITE.get("news/index.html"), mag = SITE.get("magazin/index.html");
  for (const slot of ["data-live-artikel", "data-mag-img"]) assert.ok(home.includes(slot), `Start: ${slot}`);
  for (const slot of ["data-feed-lead", 'data-feed="5"', "data-live-report-titel", "data-live-report-link", "data-mag-nr", "data-mag-titel", "data-mag-seiten"]) assert.ok(news.includes(slot), `News: ${slot}`);
  for (const slot of ["data-mag-kopf", "data-mag-h1", "data-mag-link", "data-mag-pdf", "data-mag-seite=", `data-mag="${HEFT.nr}"`]) assert.ok(mag.includes(slot), `Magazin: ${slot}`);
  assert.match(JS, /fetch\('\/insights\/artikel\.json'/);
  assert.match(JS, /\.catch\(function \(\) \{/, "ohne Liste bleibt der feste Text stehen");
  /* Ohne JavaScript und ohne Liste: Links zur echten Insights-Übersicht, kein eingefrorener Artikel. */
  assert.match(news, /<a class="art lead rv" href="\/insights\/" data-feed-lead>/);
  assert.ok(!/href="\/insights\/[a-z0-9-]+\/"/.test(news.replace(/\/insights\/(magazin|reports)\//g, "")), "News trägt keinen fest eingebauten Artikel");
  /* Das fest gezeigte Heft gibt es wirklich, mit Leseseite, Titelbild, PDF und den gezeigten Seiten. */
  const liste = JSON.parse(readFileSync(join(ROOT, "insights/artikel.json"), "utf8"));
  assert.ok(Array.isArray(liste.artikel) && Array.isArray(liste.magazin) && Array.isArray(liste.reports));
  const heft = liste.magazin.find((h) => h.nr === HEFT.nr);
  assert.ok(heft, `Heft ${HEFT.nr} steht in /insights/artikel.json`);
  assert.deepEqual([heft.titel, heft.seiten, heft.href, heft.datum.split("-").reverse().join(".")], [HEFT.titel, HEFT.seiten, HEFT.href, HEFT.datum]);
  assert.ok(mag.includes(`href="${HEFT.href}" data-mag-link`) && mag.includes(`href="${HEFT.href}vision-universe-aktienmagazin-${HEFT.nr}.pdf" data-mag-pdf`));
  for (const h of liste.magazin) assert.ok(existsSync(local(h.cover)) && existsSync(join(ROOT, h.href, "index.html")) && existsSync(join(ROOT, h.href, `vision-universe-aktienmagazin-${h.nr}.pdf`)) && existsSync(join(ROOT, h.href, "seiten/s02.jpg")), `Heft ${h.nr}: Muster der Dateinamen, auf das site.js baut`);
});

test("W2-10 · Zugänglichkeit: eine Hauptüberschrift, Alternativtexte, Sprunglink, Fokus, reduzierte Bewegung, Videos", () => {
  for (const [p, html] of SITE) {
    assert.match(html, /<html lang="de">/, p);
    assert.equal(tags(html, "h1").length, 1, `${p}: genau eine h1`);
    assert.ok(html.includes('<a class="skip" href="#inhalt">') && html.includes('<main id="inhalt"'), `${p}: Sprunglink`);
    for (const img of tags(html, "img")) {
      assert.match(img, /\salt="[^"]*"/, `${p}: Bild ohne alt ${img}`);
      assert.match(img, /\swidth="\d+" height="\d+"/, `${p}: Bild ohne Maße ${img}`);
    }
    for (const v of tags(html, "video")) {
      assert.match(v, /\sposter="[^"]+"/, `${p}: Video ohne Standbild`);
      assert.match(v, /\splaysinline\b/, `${p}: Video ohne playsinline`);
      assert.match(v, /\spreload="none"/, `${p}: Video lädt vor dem Start`);
      assert.match(v, /\saria-label="[^"]+"/, `${p}: Video ohne Namen`);
      if (/data-autoplay/.test(v)) assert.match(v, /\smuted\b/, `${p}: selbst startendes Video mit Ton`); else assert.match(v, /\scontrols\b/, `${p}: Video ohne Bedienleiste (ohne JavaScript)`);
      assert.ok(!/\sautoplay\b/.test(v), `${p}: autoplay-Attribut (site.js startet nur ohne reduzierte Bewegung)`);
    }
    assert.ok(!/<(div|span)[^>]*onclick/.test(html), p);
  }
  for (const m of MODULES.filter((x) => x.video)) {
    const html = SITE.get(`module/${m.id}/index.html`);
    assert.ok(html.includes(`<source src="/assets/stories/${m.video}-v1.mp4" type="video/mp4">`) && html.includes(`poster="${BASE}img/p-${m.video}.jpg"`), `${m.id}: Film`);
  }
  assert.equal(tags(SITE.get("faq/index.html"), "details").length, 7, "Fragen als details/summary (ohne JavaScript bedienbar)");
  assert.match(CSS, /:focus-visible\{outline:3px solid/);
  assert.match(CSS, /@media\(prefers-reduced-motion:reduce\)\{\n\*,\*::before,\*::after\{animation:none!important;transition:none!important\}/);
  assert.match(JS, /prefers-reduced-motion: reduce/);
  /* Einblenden: ohne JavaScript ist nichts versteckt; site.js versteckt nur, was unter dem Fenster liegt. */
  assert.ok(!/\.rv\{[^}]*opacity:0/.test(CSS) && /\.rv\.wait\{opacity:0/.test(CSS));
});

const greenish = (hex) => { const n = hex.length === 4 ? [...hex.slice(1)].map((c) => parseInt(c + c, 16)) : [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return n[1] > n[0] + 12 && n[1] > n[2] + 12; };
test("W2-11 · Farben: nur Schwarz, Weiß, Grau und das eine Neongrün, kein Dunkelgrün (Owner 14.11.2026)", () => {
  const sources = [["site.css", CSS], ["site.js", JS], ["build.mjs", readFileSync(join(ROOT, "products/website2/build.mjs"), "utf8")], ...SITE];
  for (const [name, source] of sources) {
    const found = [...new Set([...source.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toLowerCase()))].filter(greenish);
    assert.deepEqual(found.filter((c) => !["#c8f531", "#eef9cc"].includes(c)), [], `${name}: Grünton außer Neongrün und seinem blassen Ton`);
  }
  assert.ok(!/--lt\b/.test(CSS), "die frühere dunkelgrüne Schriftfarbe ist entfernt");
  /* Neongrün ist Fläche hinter schwarzer Schrift; als Schriftfarbe nur auf Schwarz. */
  assert.match(CSS, /\.hl\{background:var\(--lime\);color:var\(--ink\)/);
  assert.match(CSS, /\.eb\{[^}]*color:var\(--ink\)\}/);
  for (const rule of CSS.matchAll(/([^{}]+)\{[^{}]*[;{]color:var\(--lime\)[^{}]*\}/g)) assert.match(rule[1], /\.c-ink|\.blk|\.mq|\.fc\.b|\.stats|\.dock|\.icb|\.sc:hover/, `Neongrün als Schriftfarbe nur auf Schwarz: ${rule[1]}`);
});

test("W2-12 · Instagram und TikTok: schlichte Links mit Namen im Fuß und im Menü jeder Seite, keine Einbettung", () => {
  assert.deepEqual(SOCIAL.map((x) => x[2]), ["https://www.instagram.com/app.visionuniverse/", "https://www.tiktok.com/@app.visionuniverse"]);
  for (const [name, pages] of TARGETS()) for (const [p, html] of pages) {
    const foot = html.match(/<footer[\s\S]*<\/footer>/)[0], menu = html.match(/<nav class="mg" id="site-panel"[\s\S]*?<\/nav>/)[0];
    for (const part of [foot, menu]) for (const [, label, url] of SOCIAL) {
      const link = part.match(new RegExp(`<a class="sc" href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`))?.[0];
      assert.ok(link, `${name} ${p}: ${label} fehlt`);
      assert.ok(link.includes('rel="noopener"') && link.includes(`aria-label="Vision Universe auf ${label}`), `${name} ${p}: ${label} ohne Namen oder noopener`);
    }
    assert.ok(!/<iframe|platform\.instagram|tiktok\.com\/embed/.test(html), `${name} ${p}: Einbettung`);
  }
  assert.match(CSS, /\.sc\{width:46px;height:46px/, "Bedienfläche mindestens 44 px");
});

test("W2-13 · Startseite führt zu jeder Unterseite, jede Unterseite zurück und weiter (beide Ziele)", () => {
  for (const [name, pages, root] of TARGETS()) {
    const main = (html) => html.match(/<main[\s\S]*<\/main>/)[0];
    const start = main(pages.get("index.html"));
    for (const p of SITE_PAGES.slice(1)) assert.ok(start.includes(`href="${root || "./"}${p}"`), `${name}: Startseite ohne Link im Inhalt zu ${p}`);
    for (const [p, html] of pages) {
      const up = root || "../".repeat(p.split("/").length - 1) || "./";
      assert.ok(html.includes(`href="${up}"`), `${name} ${p}: kein Link zur Startseite`);
      for (const t of ["app/", "news/", "magazin/", "faq/"]) assert.ok(html.includes(`href="${up}${t}"`), `${name} ${p}: kein Link zu ${t}`);
      if (p.startsWith("module/")) assert.ok((main(html).match(/href="[^"]*module\/[a-z]+\/"/g) || []).length >= 4, `${name} ${p}: „Passt dazu“`);
    }
  }
});

test("W2-14 · www: die committeten Seiten und Dateien unter landing/ entsprechen dem Erzeuger und dem Insights-Stand (node products/website2/build.mjs --target www)", { skip: !HAS_WWW && "www ist noch nicht eingecheckt (kommt mit dem Umzug)" }, () => {
  const snapshot = loadSnapshot(), www = buildWww(snapshot);
  assert.deepEqual([...www.keys()], PAGES);
  for (const [p, html] of www) assert.equal(readFileSync(join(ROOT, "landing", p), "utf8"), html, `landing/${p} veraltet`);
  assert.equal(readFileSync(join(ROOT, "landing/site/site.css"), "utf8"), wwwCss(), "landing/site/site.css veraltet");
  assert.equal(readFileSync(join(ROOT, "landing/site/site.js"), "utf8"), wwwJs(), "landing/site/site.js veraltet");
  assert.ok(!/fetch\(|artikel\.json/.test(wwwJs()), "www ohne Laufzeit-Abruf");
  const files = wwwAssets(snapshot);
  for (const [to, from] of files) {
    assert.ok(existsSync(join(ROOT, "landing/site", to)), `landing/site/${to} fehlt`);
    /* Dateien aus /insights/ gehören dem Auszug: sie werden erst beim nächsten Auffrischen ersetzt. */
    if (!from.startsWith("insights/") || existsSync(join(ROOT, from))) assert.ok(readFileSync(join(ROOT, "landing/site", to)).equals(readFileSync(join(ROOT, from))), `landing/site/${to} weicht von ${from} ab`);
  }
  for (const dir of ["img", "vid"]) for (const f of readdirSync(join(ROOT, "landing/site", dir))) assert.ok(files.has(`${dir}/${f}`), `landing/site/${dir}/${f} gehört zu keiner Seite`);
  const list = JSON.parse(readFileSync(join(ROOT, "landing/site/pages.json"), "utf8"));
  assert.deepEqual(list.pages, SITE_PAGES);
  assert.deepEqual(list.modules.map((m) => m.id), MODULES.map((m) => m.id));
  assert.deepEqual(list.social, SOCIAL.map((x) => x[2]));
  assert.equal(list.notice, LEGAL.notices.footer.text, "Pflichtsatz in landing/site/pages.json veraltet");
  /* Das Formular von www ist wörtlich das freigegebene (Einwilligung vu-newsletter-v1); der Erzeuger ändert es nie. */
  const form = readFileSync(join(ROOT, "landing/newsletter-form.html"), "utf8").trim();
  assert.ok(www.get("index.html").includes(form) && form.includes('name="CONSENT_VERSION" value="vu-newsletter-v1"') && form.includes('name="EMAIL"') && form.includes('name="OPT_IN"'));
  for (const [p, html] of www) {
    assert.ok(!/data-live-|data-feed|data-mag-|"\/website2\/|research\.visionuniverse\.de\/(?!insights\/)/.test(html), `landing/${p}: Rest der Vorschau`);
    for (const h of refs(html).filter((x) => /^https:\/\/research\./.test(x))) assert.match(h, /^https:\/\/research\.visionuniverse\.de\/insights\//, `landing/${p}: nur öffentlich lesbare Insights-Seiten`);
  }
  /* Der Auszug ist ein erzeugtes Artefakt von /insights/: products/insights/build.mjs frischt ihn im selben Schritt auf.
     Wer Artikel, Heft oder Report ändert, bringt deshalb die www-Seiten im selben Commit mit. */
  assert.deepEqual(snapshot, makeSnapshot(), "www zeigt einen älteren Insights-Stand: node products/insights/build.mjs (oder node products/website2/build.mjs --target www) ausführen und landing/ mit committen");
  assert.match(readFileSync(join(ROOT, "products/insights/build.mjs"), "utf8"), /www\.writeWww\(\)/, "der Insights-Bau frischt www im selben Schritt auf");
});
