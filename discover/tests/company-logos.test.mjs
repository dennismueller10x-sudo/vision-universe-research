/* Firmenlogos: Zuordnung, Lizenzpruefung und die ausgelieferten Dateien.
   Regeln: scripts/discover/company-logos-lib.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeSite, parseIconLinks, parseManifest, orderCandidates, sniff, icoLargestPng, genericIcons, toPng,
  inlineLogoSvg, websiteFromFiling, filingText, latestReport, rootDomain, ownLogoHint,
  normalizeLogo, logoFilings, secLogoImages, parseIsharesUsTickers, icoLargestBmp
} from "../../scripts/discover/company-logos-web.mjs";
import {
  normalizeCik, commonsTitle, namesAgree, namesEqual, collectItems, pickLogo, matchUniverse, checkLicense, safeSymbol,
  entityToItem, matchByName, searchName, namesStrong, licenseCode, cleanAuthor
} from "../../scripts/discover/company-logos-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FP = "http://commons.wikimedia.org/wiki/Special:FilePath/";

function b(item, label, logo, extra = {}) {
  const r = { item: { value: "http://www.wikidata.org/entity/" + item }, itemLabel: { value: label },
              logo: { value: FP + encodeURIComponent(logo) },
              rank: { value: "http://wikiba.se/ontology#" + (extra.preferred ? "PreferredRank" : "NormalRank") } };
  if (extra.start) r.start = { value: extra.start };
  r.lp = { value: "http://www.wikidata.org/prop/" + (extra.icon ? "P8972" : "P154") };
  if (extra.exch) r.exch = { value: "http://www.wikidata.org/entity/" + extra.exch };
  if (extra.cik) r.cik = { value: extra.cik };
  if (extra.ticker) r.ticker = { value: extra.ticker };
  return r;
}

test("CIK und Commons-Titel werden normalisiert", () => {
  assert.equal(normalizeCik("0000320193"), "320193");
  assert.equal(normalizeCik(null), null);
  assert.equal(commonsTitle(FP + "apple%20logo_black.svg"), "File:Apple logo black.svg");
  assert.equal(commonsTitle("https://example.org/x.png"), null);
});

test("Namensabgleich ignoriert Rechtsformen", () => {
  assert.ok(namesAgree("Apple Inc.", "Apple"));
  assert.ok(!namesAgree("Holdings Inc", "Group Corp"));
  assert.ok(!namesAgree("Ford Motor Company", "Agilent Technologies"));
});

test("Zuordnung: CIK zuerst, Ticker nur mit passendem Namen", () => {
  const items = collectItems([
    b("Q312", "Apple Inc.", "Apple logo black.svg", { cik: "0000320193" }),
    b("Q1", "Alcoa", "Alcoa logo.svg", { ticker: "AA" }),
    b("Q2", "American Airlines Group", "AAL logo.svg", { ticker: "AAL" }),
    b("Q3", "Someone Else", "Other.svg", { ticker: "XYZ" })
  ]);
  const { matches, reasons } = matchUniverse([
    { symbol: "AAPL", name: "Apple", cik: "320193" },
    { symbol: "AA", name: "Alcoa", cik: null },
    { symbol: "AAL", name: "American Airlines", cik: "6201" },
    { symbol: "XYZ", name: "Block", cik: null },
    { symbol: "NONE", name: "Nobody", cik: "1" }
  ], items);
  assert.equal(matches.get("AAPL").via, "CIK");
  assert.equal(matches.get("AAPL").title, "File:Apple logo black.svg");
  assert.equal(matches.get("AA").via, "TICKER");
  assert.equal(matches.get("AAL").via, "TICKER");
  assert.equal(reasons.get("XYZ"), "NAME_ODER_CIK_WIDERSPRICHT");
  assert.equal(reasons.get("NONE"), "KEIN_WIKIDATA_LOGO");
});

test("Namensabgleich des Ticker-Wegs ist streng genug fuer alle Boersen", () => {
  assert.ok(namesAgree("American Airlines Group", "American Airlines"));
  assert.ok(!namesAgree("American Express", "American Airlines"));
  assert.ok(!namesAgree("First Solar", "First Horizon"));
  assert.ok(namesAgree("HP Inc", "HP"));
  const items = collectItems([
    b("Q10", "Alcoa Corporation", "Alcoa.svg", { ticker: "AA", exch: "Q13677" }),
    b("Q11", "Alcoa Australia", "AlcoaAU.svg", { ticker: "AA", exch: "Q1" })
  ]);
  assert.equal(matchUniverse([{ symbol: "AA", name: "Alcoa", cik: null }], items).matches.get("AA").item, "Q10");
});

test("Suchname ohne Aktiengattung und ADR-Zusatz", () => {
  assert.equal(searchName("Visa Class A"), "Visa");
  assert.equal(searchName("Shell Plc ADR (Representing - )"), "Shell Plc");
  assert.equal(searchName("Carnival Corporation Ltd (Paired Stock)"), "Carnival Corporation Ltd");
  assert.equal(searchName("Novo Nordisk"), "Novo Nordisk");
});

function ent(id, label, claims, aliases = []) {
  const snak = (v) => ({ mainsnak: { datavalue: { value: v } }, rank: "normal" });
  const c = {};
  for (const [p, vals] of Object.entries(claims)) c[p] = vals.map((v) => typeof v === "object" && v.q ? { ...snak(v.v), qualifiers: v.q } : snak(v));
  return { id, labels: { en: { value: label } }, aliases: { en: aliases.map((value) => ({ value })) }, claims: c };
}

test("Namens-Weg: nur exakter Name, Unternehmen, keine widersprechende Kennung", () => {
  const firma = entityToItem(ent("Q20", "HP Inc.", { P154: ["HP logo 2012.svg"], P452: [{ id: "Q1" }] }));
  const ohneFirma = entityToItem(ent("Q21", "HP", { P154: ["HP.svg"] }));
  assert.equal(ohneFirma, null);
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Inc", cik: "47217" }, [firma]).match.title, "File:HP logo 2012.svg");
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Enterprise", cik: null }, [firma]).reason, "KEIN_WIKIDATA_LOGO");
  const andereCik = entityToItem(ent("Q22", "HP Inc.", { P154: ["X.svg"], P5531: ["0000000001"] }));
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Inc", cik: "47217" }, [andereCik]).reason, "KEIN_WIKIDATA_LOGO");
  const andererTicker = entityToItem(ent("Q23", "HP Inc.", { P154: ["X.svg"], P414: [{ v: { id: "Q13677" }, q: { P249: [{ datavalue: { value: "HPE" } }] } }] }));
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Inc", cik: null }, [andererTicker]).reason, "KEIN_WIKIDATA_LOGO");
  const alias = entityToItem(ent("Q24", "Hewlett-Packard", { P154: ["HP.svg"], P946: ["US40434L1052"] }, ["HP Inc."]));
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Inc", cik: null }, [alias]).match.item, "Q24");
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Inc", cik: null }, [firma, alias]).match.item, "Q24");
  const zweitesListed = entityToItem(ent("Q25", "HP Inc.", { P154: ["Y.svg"], P946: ["US0000000000"] }));
  assert.equal(matchByName({ symbol: "HPQ", name: "HP Inc", cik: null }, [alias, zweitesListed]).reason, "MEHRERE_ITEMS");
  assert.ok(namesEqual("Exxon Mobil Corp", "Exxon Mobil Corporation"));
  assert.ok(!namesEqual("Exxon Mobil", "Mobil"));
});

test("Ticker-Treffer mit abweichender CIK wird verworfen", () => {
  const items = collectItems([b("Q9", "Delta Air Lines", "Delta.svg", { ticker: "DAL", cik: "27904" })]);
  const { matches, reasons } = matchUniverse([{ symbol: "DAL", name: "Delta Air Lines", cik: "99999" }], items);
  assert.equal(matches.size, 0);
  assert.equal(reasons.get("DAL"), "NAME_ODER_CIK_WIDERSPRICHT");
});

test("Mehrere Items heisst kein Logo, mehrere Logos einer Firma nicht", () => {
  const zweiLogos = collectItems([b("Q5", "Acme", "A1.svg", { cik: "5" }), b("Q5", "Acme", "A2.png", { cik: "5" })]);
  assert.equal(pickLogo(zweiLogos.get("Q5")), "File:A1.svg");
  assert.deepEqual(matchUniverse([{ symbol: "ACM", name: "Acme", cik: "5" }], zweiLogos).matches.get("ACM").titles,
                   ["File:A1.svg", "File:A2.png"]);
  const neuer = collectItems([b("Q5", "Acme", "Alt.svg", { cik: "5", start: "+1990-01-01T00:00:00Z" }),
                              b("Q5", "Acme", "Neu.svg", { cik: "5", start: "+2021-01-01T00:00:00Z" })]);
  assert.equal(pickLogo(neuer.get("Q5")), "File:Neu.svg");
  /* Quadratisches Symbol (P8972) vor breitem Schriftzug (P154). */
  const icon = collectItems([b("Q5", "Acme", "Logo.svg", { cik: "5", preferred: true }), b("Q5", "Acme", "Icon.svg", { cik: "5", icon: true })]);
  assert.equal(pickLogo(icon.get("Q5")), "File:Icon.svg");
  const bevorzugt = collectItems([b("Q5", "Acme", "A1.svg", { cik: "5" }), b("Q5", "Acme", "A2.svg", { cik: "5", preferred: true })]);
  assert.equal(pickLogo(bevorzugt.get("Q5")), "File:A2.svg");
  const zweiItems = collectItems([b("Q6", "Acme", "A.svg", { cik: "7" }), b("Q7", "Acme Sub", "B.svg", { cik: "7" })]);
  assert.equal(matchUniverse([{ symbol: "ACME", name: "Acme", cik: "7" }], zweiItems).reasons.get("ACME"), "MEHRERE_ITEMS");
});

test("Lizenz: nur gemeinfrei, CC0, CC BY, CC BY-SA", () => {
  const info = (license, extra = {}) => ({ extmetadata: Object.fromEntries(Object.entries({ License: license, LicenseShortName: license, ...extra }).map(([k, v]) => [k, { value: v }])) });
  assert.ok(checkLicense(info("pd", { Restrictions: "trademarked" })).ok);
  assert.ok(checkLicense(info("cc0")).ok);
  assert.ok(checkLicense(info("cc-by-sa-4.0", { Artist: "<a href='x'>Jane</a>" })).ok);
  assert.ok(checkLicense(info("cc-by-3.0-de", { Artist: "Max" })).ok);
  assert.equal(checkLicense(info("cc-by-sa-4.0")).reason, "URHEBER_FEHLT");
  assert.match(checkLicense(info("gfdl")).reason, /^LIZENZ_NICHT_FREI/);
  assert.match(checkLicense(info("cc-by-nc-4.0", { Artist: "X" })).reason, /^LIZENZ_NICHT_FREI/);
  assert.match(checkLicense(info("")).reason, /^LIZENZ_NICHT_FREI/);
  assert.match(checkLicense(info("pd", { Restrictions: "trademarked|insignia" })).reason, /^EINSCHRAENKUNG/);
  assert.equal(checkLicense(null).reason, "KEINE_DATEIINFO");
  assert.equal(checkLicense(info("cc-by-4.0", { Artist: "<b>Jane</b> &amp; Co" })).author, "Jane & Co");
});

test("Dateinamen bleiben im Logo-Ordner", () => {
  assert.equal(safeSymbol("BRK-B"), "BRK-B");
  assert.equal(safeSymbol("../x"), null);
  assert.equal(safeSymbol("a"), null);
});

test("Ausgelieferte Logos: jede Datei belegt, Commons nur mit freier Lizenz", () => {
  const dir = join(root, "discover", "logos");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  const credits = JSON.parse(readFileSync(join(dir, "credits.json"), "utf8")).credits;
  const exclusions = JSON.parse(readFileSync(join(root, "discover", "config", "logo-exclusions.json"), "utf8")).symbols;
  const rejects = JSON.parse(readFileSync(join(root, "discover", "config", "logo-rejects.json"), "utf8"));
  const freigabe = JSON.parse(readFileSync(join(root, "discover", "config", "logo-reviewed.json"), "utf8")).symbols;
  /* Wartende Logos: Datei vorhanden, nicht in der Oberflaeche, Bild nicht gesperrt. */
  for (const [sym, c] of Object.entries(credits).filter(([, c]) => c.pending)) {
    assert.ok(!index.files[sym], sym);
    assert.ok(existsSync(join(dir, c.path)), c.path);
    assert.ok(!(rejects.urls || {})[c.iconUrl] && !(rejects.titles || {})[c.title], "Gesperrtes Bild wartet: " + sym);
  }
  assert.equal(index.count, Object.keys(index.files).length);
  for (const [sym, path] of Object.entries(index.files)) {
    assert.ok(safeSymbol(sym), sym);
    assert.match(path, new RegExp("^files/" + sym.replace(/[.\-]/g, "\\$&") + "\\.(png|jpg|gif|webp)$"));
    assert.ok(existsSync(join(dir, path)), path);
    const c = credits[sym];
    assert.ok(c, "Nachweis fehlt: " + sym);
    /* Live nur, was genau so gesichtet ist. */
    assert.ok(!c.pending, "Wartendes Logo ausgeliefert: " + sym);
    assert.equal(freigabe[sym], c.sha1, "Nicht gesichtet: " + sym);
    if (c.source === "WEBSITE" || c.source === "SEC_FILING") {
      /* Website- oder SEC-Logo: immer PNG (nie eine fremde SVG), Quelle genannt, keine Lizenz behauptet. */
      assert.match(path, /\.png$/, sym);
      assert.match(c.page || "", /^https?:\/\//, sym);
      if (c.source === "WEBSITE") assert.ok(c.host, "Website fehlt: " + sym);
      else assert.match(c.page, /^https:\/\/www\.sec\.gov\//, sym);
      assert.equal(c.license, undefined, sym);
    } else {
      assert.match(c.license, /^(pd|cc0|cc-by(-sa)?-\d\.\d(-[a-z]{2,})?|apache-2\.0|mit)$/, sym);
      assert.match(c.page || "", /^https:\/\/commons\.wikimedia\.org\//, sym);
      if (c.attributionRequired) assert.ok(c.author, "Urheber fehlt: " + sym);
    }
    assert.ok(!exclusions[sym], "Ausgeschlossener Titel mit Logo: " + sym);
    assert.ok(!(rejects.urls || {})[c.iconUrl] && !(rejects.titles || {})[c.title], "Gesperrtes Bild ausgeliefert: " + sym);
  }
  /* Breite Fassung: nur zu einem ausgelieferten Logo, immer PNG, wirklich breit. */
  for (const [sym, r] of Object.entries(index.wide || {})) {
    assert.ok(index.files[sym], "Breite Fassung ohne Logo: " + sym);
    assert.ok(!credits[sym].pending, sym);
    assert.equal(credits[sym].wide, "files/wide/" + sym + ".png", sym);
    assert.ok(existsSync(join(dir, credits[sym].wide)), sym);
    assert.ok(r >= 1.6, sym);
  }
  const breiteDateien = existsSync(join(dir, "files", "wide")) ? readdirSync(join(dir, "files", "wide")).filter((f) => !f.startsWith(".")) : [];
  for (const f of breiteDateien) assert.ok(Object.values(credits).some((c) => c.wide === "files/wide/" + f), "Breite Datei ohne Eintrag: " + f);
  const imOrdner = existsSync(join(dir, "files")) ? readdirSync(join(dir, "files")).filter((f) => !f.startsWith(".") && f !== "wide") : [];
  const belegt = new Set(Object.values(credits).map((c) => c.path.slice(6)));
  for (const f of imOrdner) assert.ok(belegt.has(f), "Datei ohne Eintrag: " + f);
});

test("Social-Pipeline verwendet keine Firmenlogos", () => {
  const verboten = /discover\/logos/;
  const pruefen = (d) => {
    if (!existsSync(d)) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") pruefen(p); }
      else if (/\.(m?js|json|html)$/.test(e.name)) assert.ok(!verboten.test(readFileSync(p, "utf8")), p);
    }
  };
  pruefen(join(root, "social"));
  pruefen(join(root, "scripts", "social"));
  pruefen(join(root, "workers", "vision-universe-social"));
});

test("Zweite Runde: ExxonMobil, BlackRock, Hasbro, Lizenz nur als Kurzname", () => {
  assert.ok(namesEqual("ExxonMobil", "Exxon Mobil"));
  assert.ok(namesAgree("ExxonMobil", "Exxon Mobil"));
  const blk = collectItems([b("Q30", "BlackRock", "BlackRock.svg", { ticker: "BLK", exch: "Q13677", cik: "1364742" })]);
  assert.equal(matchUniverse([{ symbol: "BLK", name: "BlackRock Finance", cik: "2012383" }], blk).matches.get("BLK").item, "Q30");
  const fremd = collectItems([b("Q31", "American Express", "Amex.svg", { ticker: "AXP", exch: "Q13677", cik: "4962" })]);
  assert.equal(matchUniverse([{ symbol: "AXP", name: "American Airlines", cik: "6201" }], fremd).matches.size, 0);
  assert.ok(!namesStrong("American Financial Group", "American"));
  const konzern = entityToItem(ent("Q32", "Hasbro", { P154: ["Hasbro.svg"], P414: [{ id: "Q82059" }] }));
  const marke = entityToItem(ent("Q33", "Hasbro", { P154: ["Hasbro2.svg"], P452: [{ id: "Q1" }] }));
  assert.equal(matchByName({ symbol: "HAS", name: "Hasbro", cik: null }, [konzern, marke]).match.item, "Q32");
  assert.equal(licenseCode("", "Public domain"), "pd");
  assert.equal(licenseCode("", "CC BY-SA 4.0"), "cc-by-sa-4.0");
  assert.equal(licenseCode("", "CC BY-NC 4.0"), "");
  assert.equal(licenseCode("cc-by-3.0", "egal"), "cc-by-3.0");
});

/* --------------------------------------------- Zweite Quelle: Website */

test("Website: nur echte Firmenseiten", () => {
  assert.equal(normalizeSite("apple.com").origin, "https://apple.com");
  assert.equal(normalizeSite("https://www.nvidia.com/en-us/").host, "nvidia.com");
  assert.equal(normalizeSite("https://en.wikipedia.org/wiki/Apple_Inc."), null);
  assert.equal(normalizeSite("https://www.linkedin.com/company/x"), null);
  assert.equal(normalizeSite("ftp://example.com"), null);
  assert.equal(normalizeSite(""), null);
});

test("Website: Icons aus dem HTML, bestes zuerst, Standardpfade am Ende", () => {
  const html = `<head><link rel="icon" href="/favicon-32.png" sizes="32x32">
    <link rel='apple-touch-icon' href="/apple.png">
    <link rel="icon" type="image/png" sizes="192x192" href="https://cdn.x.com/i192.png">
    <link rel="mask-icon" href="/safari.svg"><link rel="manifest" href="/site.webmanifest"></head>`;
  const { icons, manifest } = parseIconLinks(html, "https://x.com/de/");
  assert.equal(manifest, "https://x.com/site.webmanifest");
  assert.ok(!icons.some((i) => /safari/.test(i.href)));
  const order = orderCandidates(icons.concat(parseManifest({ icons: [{ src: "/m512.png", sizes: "512x512" }, { src: "/mono.png", sizes: "512x512", purpose: "monochrome" }] }, "https://x.com/")), "https://x.com");
  const hrefs = order.map((c) => c.href);
  assert.deepEqual(hrefs.slice(0, 4), ["https://x.com/m512.png", "https://cdn.x.com/i192.png", "https://x.com/apple.png", "https://x.com/apple-touch-icon.png"]);
  assert.ok(hrefs.indexOf("https://x.com/favicon-32.png") > hrefs.indexOf("https://x.com/favicon.svg"));
  assert.equal(hrefs[hrefs.length - 1], "https://x.com/favicon.ico");
});

function pngBytes(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}

test("Website: Bildformat aus den Bytes, ICO nur mit eingebettetem PNG", () => {
  assert.equal(sniff(pngBytes(1, 1)), "png");
  assert.equal(sniff(Buffer.from("<?xml version='1.0'?><svg xmlns='x'></svg>")), "svg");
  assert.equal(sniff(Buffer.from("<!doctype html><html></html>")), null);
  const png = pngBytes(256, 256);
  const ico = Buffer.alloc(6 + 32 + png.length + 40);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(2, 4);
  ico[6] = 32; ico.writeUInt32LE(40, 6 + 8); ico.writeUInt32LE(6 + 32 + png.length, 6 + 12);      // BMP 32px
  ico[22] = 0; ico.writeUInt32LE(png.length, 22 + 8); ico.writeUInt32LE(6 + 32, 22 + 12);          // PNG 256px
  png.copy(ico, 6 + 32);
  assert.equal(sniff(ico), "ico");
  assert.equal(icoLargestPng(ico).readUInt32BE(16), 256);
});

test("Website: dasselbe Icon auf drei Websites ist ein Baukasten-Icon", () => {
  const icons = new Map([
    ["GOOG", { hash: "g", host: "abc.xyz" }], ["GOOGL", { hash: "g", host: "abc.xyz" }],
    ["A", { hash: "wp", host: "a.com" }], ["B", { hash: "wp", host: "b.com" }], ["C", { hash: "wp", host: "c.com" }]
  ]);
  assert.deepEqual([...genericIcons(icons)].sort(), ["A", "B", "C"]);
});

test("Website: Umwandlung in ein kleines PNG (falls sharp installiert ist)", async (t) => {
  let sharp;
  try { sharp = (await import("sharp")).default; } catch (e) { t.skip("sharp nicht installiert"); return; }
  const gross = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#c00" } }).png().toBuffer();
  const res = await toPng(gross, sharp);
  const meta = await sharp(res.png).metadata();
  assert.equal(meta.format, "png"); assert.equal(meta.width, 128);
  const klein = await sharp({ create: { width: 32, height: 32, channels: 4, background: "#c00" } }).png().toBuffer();
  assert.equal((await toPng(klein, sharp)).reason, "WEB_ICON_ZU_KLEIN");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><script>alert(1)</script><rect width="24" height="24" fill="red"/></svg>');
  const ausSvg = await toPng(svg, sharp);
  assert.equal((await sharp(ausSvg.png).metadata()).format, "png");
  assert.equal((await toPng(Buffer.from("<html>nein</html>"), sharp)).reason, "WEB_KEIN_BILD");
});

test("Website: Logo aus dem Seitenkopf, wenn kein grosses Icon da ist", () => {
  const html = `<header><a class="brand"><img src="/assets/nvidia-logo-horz.svg" alt="NVIDIA"></a>
    <img src="/wp-content/uploads/novartis-logo-350x70.jpg" alt="Novartis">
    <img src="/images/default-source/social-icons/x-logo.svg" alt="NVIDIA on X" class="nav-logo">
    <img src="/img/partner-logo-acme.png" class="partner-logo"></header>
    <link rel="icon" href="/favicon.ico">`;
  const { icons } = parseIconLinks(html, "https://www.nvidia.com/", "NVIDIA Corp");
  const logos = icons.filter((i) => i.kind === "logo").map((i) => i.href);
  assert.deepEqual(logos, ["https://www.nvidia.com/assets/nvidia-logo-horz.svg"]);
  const order = orderCandidates(icons, "https://www.nvidia.com").map((c) => c.href);
  assert.ok(order.indexOf("https://www.nvidia.com/assets/nvidia-logo-horz.svg") < order.indexOf("https://www.nvidia.com/favicon.ico"));
  const svg = inlineLogoSvg('<a class="site-logo" href="/">' + '<svg viewBox="0 0 100 20"><path d="' + "M0 0L1 1".repeat(40) + '"/></svg></a>');
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.equal(inlineLogoSvg('<svg class="icon-cart"><path d="M0 0"/></svg>'), null);
});

test("SEC: Website aus 'our website' im Bericht, fremde Adressen zaehlen nicht", () => {
  const text = filingText(`<p>Our website address is <a href="https://www.nvidia.com">www.nvidia.com</a>. Information on
    our website is not incorporated. Reports are available at www.sec.gov. See www.fasb.org for standards.
    Our transfer agent is Computershare (www.computershare.com).</p>`);
  assert.equal(websiteFromFiling(text, "NVIDIA Corp"), "nvidia.com");
  assert.equal(websiteFromFiling("Visit www.acme.com today. The SEC maintains www.sec.gov.", "Acme"), null);
  assert.equal(websiteFromFiling("We make our reports available free of charge on our website at investors.acmebio.com.", "Acme Bio"), "acmebio.com");
  assert.equal(rootDomain("ir.example.co.uk"), "example.co.uk");
  assert.equal(rootDomain("www.fedex.com"), "fedex.com");
});

test("SEC: juengster Jahresbericht vor Quartalsbericht", () => {
  const recent = { form: ["8-K", "10-Q", "10-K", "10-Q"], accessionNumber: ["a", "b", "c", "d"], primaryDocument: ["x.htm", "q.htm", "k.htm", "q2.htm"] };
  assert.deepEqual(latestReport(recent), { form: "10-K", accession: "c", document: "k.htm" });
  assert.equal(latestReport(null), null);
});

test("Zweite Diagnose: Apache-Lizenz, nur das eigene Logo, breite Wortmarken", async (t) => {
  const info = (short) => ({ extmetadata: { LicenseShortName: { value: short }, Artist: { value: "NVIDIA" }, Restrictions: { value: "trademarked" } } });
  const nv = checkLicense(info("Apache License 2.0"));
  assert.ok(nv.ok); assert.equal(nv.license, "apache-2.0"); assert.ok(nv.attributionRequired);
  assert.ok(!checkLicense(info("GNU General Public License v3")).ok);
  assert.ok(!ownLogoHint("/wp-content/uploads/novartis-logo.jpg Novartis", "https://xencor.com/", "Xencor Inc"));
  assert.ok(ownLogoHint("/img/xencor-logo.svg", "https://xencor.com/", "Xencor Inc"));
  assert.ok(ownLogoHint("/content/dam/logo.svg site-logo", "https://www.norfolksouthern.com/", "Norfolk Southern"));
  assert.ok(ownLogoHint("/is/image/emerson/logo", "https://www.emerson.com/en/corporate", "Emerson Electric"));
  assert.ok(ownLogoHint('<svg aria-label="HP logo" class="c-logo">', "https://www.hp.com/us-en/home.html", "HP Inc"));
  assert.ok(!ownLogoHint("/assets/php-logo.png", "https://www.hp.com/", "HP Inc"));
  let sharp;
  try { sharp = (await import("sharp")).default; } catch (e) { t.skip("sharp nicht installiert"); return; }
  const wortmarke = await sharp({ create: { width: 240, height: 48, channels: 4, background: "#036" } }).png().toBuffer();
  assert.ok((await toPng(wortmarke, sharp, { logo: true })).png);
  assert.equal((await toPng(wortmarke, sharp)).reason, "WEB_ICON_ZU_KLEIN");
});

test("Einheitliche Groesse: hohes Symbol und flacher Schriftzug fuellen dasselbe Feld", async (t) => {
  let sharp;
  try { sharp = (await import("sharp")).default; } catch (e) { t.skip("sharp nicht installiert"); return; }
  /* Apple-artig: hoch, mit viel leerem Rand; NVIDIA-artig: flach. */
  const hoch = await sharp({ create: { width: 300, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp({ create: { width: 100, height: 120, channels: 4, background: "#000" } }).png().toBuffer(), left: 100, top: 140 }]).png().toBuffer();
  const flach = await sharp({ create: { width: 500, height: 100, channels: 4, background: "#76b900" } }).png().toBuffer();
  for (const [buf, ratio] of [[hoch, 100 / 120], [flach, 5]]) {
    const n = await normalizeLogo(buf, sharp);
    const m = await sharp(n.png).metadata();
    assert.equal(m.width, 128); assert.equal(m.height, 128);
    assert.ok(Math.abs(n.ratio - ratio) < 0.05, "Seitenverhaeltnis bleibt: " + n.ratio);
    /* Inhalt reicht in der laengeren Richtung bis an den gemeinsamen Rand (6 %). */
    const { info } = await sharp(n.png).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    assert.ok(Math.max(info.width, info.height) >= 110 && Math.max(info.width, info.height) <= 114, "Inhalt " + info.width + "x" + info.height);
    /* Breite Fassung nur fuer den Schriftzug: ohne Quadrat, bis 512 x 128. */
    if (ratio < 1.6) assert.equal(n.wide, null);
    else {
      const w = await sharp(n.wide).metadata();
      assert.equal(w.width, 512); assert.ok(Math.abs(w.width / w.height - ratio) < 0.1, w.width + "x" + w.height);
    }
  }
});

test("SEC: Einreichungen mit Logo und das Logo-Bild darin", () => {
  const recent = { form: ["8-K", "DEF 14A", "10-K", "ARS"], accessionNumber: ["1", "2", "3", "4"], primaryDocument: ["a.htm", "p.htm", "k.htm", "ars.pdf"] };
  assert.deepEqual(logoFilings(recent).map((f) => f.form), ["DEF 14A", "ARS", "10-K"]);
  /* Nur ausdruecklich als Logo bezeichnet - ein Bild mit dem Firmennamen kann eine Titelseite sein. */
  const html = `<img src="g1_signature.jpg" alt="signature"><img src="g2.jpg" alt="LOGO"><img src="chart1.jpg" alt="Performance chart">
    <img src="g3.jpg" alt="United Airlines Holdings"><img src="ual_logo.png" alt="">`;
  assert.deepEqual(secLogoImages(html, "https://www.sec.gov/Archives/edgar/data/100517/0001/p.htm", "United Airlines Holdings Inc"),
    ["https://www.sec.gov/Archives/edgar/data/100517/0001/g2.jpg", "https://www.sec.gov/Archives/edgar/data/100517/0001/ual_logo.png"]);
});

test("MSCI World: nur Aktien an US-Boersen aus der iShares-Datei", () => {
  const csv = `iShares MSCI World ETF
Fund Holdings as of,"Sep 26, 2026"
 
Ticker,Name,Sector,Asset Class,Market Value,Weight (%),Notional Value,Quantity,Price,Location,Exchange,Currency,FX Rate,Market Currency,Accrual Date
"NVDA","NVIDIA CORP","Information Technology","Equity","1,000","5.1","1,000","10","180","United States","NASDAQ","USD","1.00","USD","-"
"ASML","ASML HOLDING NV","Information Technology","Equity","1,000","0.8","1,000","1","900","Netherlands","Euronext Amsterdam","EUR","1.1","EUR","-"
"BRKB","BERKSHIRE HATHAWAY INC CLASS B","Financials","Equity","1,000","0.9","1,000","1","500","United States","New York Stock Exchange Inc.","USD","1.00","USD","-"
"USD","USD CASH","Cash and/or Derivatives","Cash","1","0.1","1","1","1","United States","-","USD","1.00","USD","-"`;
  assert.deepEqual(parseIsharesUsTickers(csv).sort(), ["BRKB", "NVDA"]);
});

test("Index-Rettung: erstes Bild im Proxy Statement, BMP-Favicon lesbar", async (t) => {
  const html = `<p>Proxy</p><img src="g1.jpg" alt=""><p>Brief</p><img src="g2_signature.jpg" alt="">`;
  assert.deepEqual(secLogoImages(html, "https://www.sec.gov/x/p.htm", "United Airlines"), []);
  assert.deepEqual(secLogoImages(html, "https://www.sec.gov/x/p.htm", "United Airlines", { firstImage: true }), ["https://www.sec.gov/x/g1.jpg"]);
  assert.deepEqual(secLogoImages('<img src="sig.jpg" alt="signature">', "https://www.sec.gov/x/p.htm", "X", { firstImage: true }), []);
  /* Prospekt: Logo der Emissionsbank neben dem der Firma - nur die Firma zaehlt. */
  const prosp = '<img src="kingswood_logo.jpg" alt="Kingswood Capital logo"><img src="viewtrade-logo.png"><img src="acme_logo.png">';
  assert.deepEqual(secLogoImages(prosp, "https://www.sec.gov/x/p.htm", "Acme Holdings"), ["https://www.sec.gov/x/acme_logo.png"]);
  assert.deepEqual(secLogoImages('<img src="securities_logo.png">', "https://www.sec.gov/x/p.htm", "Cathay Securities Inc"), ["https://www.sec.gov/x/securities_logo.png"]);
  assert.ok(!logoFilings({ form: ["424B4"], accessionNumber: ["1"], primaryDocument: ["p.htm"] }).length);
  /* ICO mit einem 32x32-BMP-Eintrag (32 bit): rote Flaeche. */
  const w = 32, h = 32, bmpSize = 40 + w * h * 4;
  const ico = Buffer.alloc(6 + 16 + bmpSize);
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
  ico[6] = w; ico[7] = h; ico.writeUInt32LE(bmpSize, 6 + 8); ico.writeUInt32LE(22, 6 + 12);
  ico.writeUInt32LE(40, 22); ico.writeInt32LE(w, 26); ico.writeInt32LE(h * 2, 30); ico.writeUInt16LE(1, 34); ico.writeUInt16LE(32, 36);
  for (let i = 0; i < w * h; i++) { const o = 62 + i * 4; ico[o] = 0; ico[o + 1] = 0; ico[o + 2] = 255; ico[o + 3] = 255; }
  const bmp = icoLargestBmp(ico);
  assert.equal(bmp.width, 32); assert.deepEqual([...bmp.raw.slice(0, 4)], [255, 0, 0, 255]);
  let sharp;
  try { sharp = (await import("sharp")).default; } catch (e) { t.skip("sharp nicht installiert"); return; }
  assert.equal((await toPng(ico, sharp)).reason, "WEB_ICON_ZU_KLEIN");
  const ok = await toPng(ico, sharp, { minIcon: 32 });
  assert.equal((await sharp(ok.png).metadata()).width, 128);
});

test("Urheberangabe aus Commons: lesbar, kein Name faellt weg", () => {
  assert.equal(cleanAuthor("Tesla (logo), Fry1989 eh? (vectorization)"), "Tesla, Fry1989");
  assert.equal(cleanAuthor("Original: Rob Janoff"), "Rob Janoff");
  assert.equal(cleanAuthor("The original uploader was KUsam at English Wikipedia ."), "KUsam");
  assert.equal(cleanAuthor("™/®General Motors Company Tel(11)94017-9623"), "General Motors Company");
  assert.equal(cleanAuthor("Original: Cleveland-Cliffs Vector: Grmike"), "Cleveland-Cliffs, Grmike");
  assert.equal(cleanAuthor("Ituran Location and Control Ltd."), "Ituran Location and Control Ltd.");
  assert.equal(cleanAuthor("Advanced Micro Devices, Inc."), "Advanced Micro Devices, Inc.");
  assert.equal(cleanAuthor("Unknown author Unknown author"), null);
  assert.equal(cleanAuthor("null"), null);
  /* Pflichtangabe (CC BY): bleibt nichts Lesbares, gilt der Rohtext. */
  const info = (artist) => ({ extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, License: { value: "cc-by-sa-4.0" }, Artist: { value: artist } } });
  assert.equal(checkLicense(info("Tesla (logo), Fry1989 eh? (vectorization)")).author, "Tesla, Fry1989");
  assert.equal(checkLicense(info("null")).reason, "URHEBER_FEHLT");
});

test("Kuratierte Websites: gueltige Adressen, nur Titel des Universums", () => {
  const sites = JSON.parse(readFileSync(join(root, "discover", "config", "logo-sites.json"), "utf8")).symbols;
  for (const [sym, url] of Object.entries(sites)) {
    assert.ok(safeSymbol(sym), sym);
    assert.ok(normalizeSite(url), sym + ": " + url);
  }
});
