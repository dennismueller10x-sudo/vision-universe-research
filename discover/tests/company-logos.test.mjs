/* Firmenlogos: Zuordnung, Lizenzpruefung und die ausgelieferten Dateien.
   Regeln: scripts/discover/company-logos-lib.mjs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeCik, commonsTitle, namesAgree, collectItems, pickLogo, matchUniverse, checkLicense, safeSymbol
} from "../../scripts/discover/company-logos-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FP = "http://commons.wikimedia.org/wiki/Special:FilePath/";

function b(item, label, logo, extra = {}) {
  const r = { item: { value: "http://www.wikidata.org/entity/" + item }, itemLabel: { value: label },
              logo: { value: FP + encodeURIComponent(logo) },
              rank: { value: "http://wikiba.se/ontology#" + (extra.preferred ? "PreferredRank" : "NormalRank") } };
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

test("Ticker-Treffer mit abweichender CIK wird verworfen", () => {
  const items = collectItems([b("Q9", "Delta Air Lines", "Delta.svg", { ticker: "DAL", cik: "27904" })]);
  const { matches, reasons } = matchUniverse([{ symbol: "DAL", name: "Delta Air Lines", cik: "99999" }], items);
  assert.equal(matches.size, 0);
  assert.equal(reasons.get("DAL"), "NAME_ODER_CIK_WIDERSPRICHT");
});

test("Mehrdeutig heisst: kein Logo", () => {
  const zweiLogos = collectItems([b("Q5", "Acme", "A1.svg", { cik: "5" }), b("Q5", "Acme", "A2.svg", { cik: "5" })]);
  assert.equal(pickLogo(zweiLogos.get("Q5")), null);
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
