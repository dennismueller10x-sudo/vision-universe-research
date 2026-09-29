/* Firmenlogos: Zuordnung, Lizenzpruefung und die ausgelieferten Dateien.
   Regeln: scripts/discover/company-logos-lib.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeCik, commonsTitle, namesAgree, namesEqual, collectItems, pickLogo, matchUniverse, checkLicense, safeSymbol,
  entityToItem, matchByName, searchName, namesStrong, licenseCode
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
  const icon = collectItems([b("Q5", "Acme", "Icon.svg", { cik: "5", icon: true, preferred: true }), b("Q5", "Acme", "Logo.svg", { cik: "5" })]);
  assert.equal(pickLogo(icon.get("Q5")), "File:Logo.svg");
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

test("Ausgelieferte Logos: jede Datei belegt, jede Lizenz frei", () => {
  const dir = join(root, "discover", "logos");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  const credits = JSON.parse(readFileSync(join(dir, "credits.json"), "utf8")).credits;
  const exclusions = JSON.parse(readFileSync(join(root, "discover", "config", "logo-exclusions.json"), "utf8")).symbols;
  assert.equal(index.count, Object.keys(index.files).length);
  for (const [sym, path] of Object.entries(index.files)) {
    assert.ok(safeSymbol(sym), sym);
    assert.match(path, new RegExp("^files/" + sym.replace(/[.\-]/g, "\\$&") + "\\.(png|jpg|gif|webp)$"));
    assert.ok(existsSync(join(dir, path)), path);
    const c = credits[sym];
    assert.ok(c, "Nachweis fehlt: " + sym);
    assert.match(c.license, /^(pd|cc0|cc-by(-sa)?-\d\.\d(-[a-z]{2,})?)$/, sym);
    assert.match(c.page || "", /^https:\/\/commons\.wikimedia\.org\//, sym);
    if (c.attributionRequired) assert.ok(c.author, "Urheber fehlt: " + sym);
    assert.ok(!exclusions[sym], "Ausgeschlossener Titel mit Logo: " + sym);
  }
  const imOrdner = existsSync(join(dir, "files")) ? readdirSync(join(dir, "files")).filter((f) => !f.startsWith(".")) : [];
  const belegt = new Set(Object.values(index.files).map((p) => p.slice(6)));
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
