/* Die Capability Matrix: eine Zeile je Titel des Company Masters, jede
   Faehigkeit gemessen, jede Luecke mit Grund - und die bekannten Titel des
   Auftrags sind auffindbar und weisen ihre Faehigkeiten korrekt aus. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import {tmpdir} from 'node:os';
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCapabilityMatrix, CAPABILITIES, SPOT_CHECK } from "../../scripts/market/build-capability-matrix.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const master = join(root, "quant", "data", "market", "security-master", "eligibility.json");
const { rows, summary } = existsSync(master) ? buildCapabilityMatrix({ root, dryRun: true }) : { rows: [], summary: null };
const skip = !existsSync(master);

test("CM1 · eine Zeile je Master-Titel, Produktuniversum = alle ausser EXCLUDED", { skip }, () => {
  const m = JSON.parse(readFileSync(master, "utf8"));
  assert.equal(rows.length, m.decisions.length);
  assert.equal(summary.counts.productUniverse, m.counts.productUniverse);
  assert.equal(rows.filter((r) => r.inProductUniverse).length, m.counts.productUniverse);
  assert.equal(new Set(rows.map((r) => r.securityId)).size, rows.length, "securityId doppelt");
});

test("CM2 · Faehigkeiten sind konsistent: kein Live ohne Intraday, keine Historie ohne Marktdaten, keine Seite ohne Karte", { skip }, () => {
  for (const r of rows) {
    for (const c of CAPABILITIES) assert.equal(typeof r[c], "boolean", r.ticker + " " + c);
    if (r.HAS_LIVE) assert.ok(r.HAS_INTRADAY, r.ticker + ": live ohne Intraday");
    if (r.HAS_HISTORICAL) assert.ok(r.HAS_MARKET_DATA, r.ticker + ": Historie ohne Marktdaten");
    if (r.HAS_STOCK_PAGE) assert.ok(r.DISCOVER_ELIGIBLE || r.gaps.some((g) => g.startsWith("NOT_TRADING")), r.ticker + ": Seite ohne Karte");
    if (!r.inProductUniverse) assert.ok(r.gaps.some((g) => g.startsWith("NOT_IN_PRODUCT_UNIVERSE")), r.ticker);
    if (r.inProductUniverse && !r.HAS_INTRADAY) assert.ok(r.gaps.some((g) => /INTRADAY|IEX/.test(g)), r.ticker + ": Intraday-Luecke ohne Grund");
    if (!r.HAS_NAME) assert.ok(r.gaps.includes("NAME_MISSING"), r.ticker);
  }
});

test("CM3 · Zaehlungen stimmen mit den Zeilen ueberein", { skip }, () => {
  const p = rows.filter((r) => r.inProductUniverse);
  const n = (f) => p.filter(f).length;
  assert.equal(summary.counts.historicalAvailable, n((r) => r.HAS_HISTORICAL));
  assert.equal(summary.counts.intradayAvailable, n((r) => r.HAS_INTRADAY));
  assert.equal(summary.counts.liveCapable, n((r) => r.HAS_LIVE));
  assert.equal(summary.counts.factorEligible, n((r) => r.HAS_FACTORS));
  assert.equal(summary.counts.stockPages, n((r) => r.HAS_STOCK_PAGE));
  assert.equal(summary.counts.namesMissing, n((r) => !r.HAS_NAME));
  assert.equal(summary.counts.tiingoResolved + summary.counts.tiingoUnresolved, p.length);
});

test("CM4 · Stichprobe: Apple bis Micron sind im Master, im Produktuniversum und weisen Faehigkeiten aus", { skip }, () => {
  assert.equal(SPOT_CHECK.length, 15);
  for (const s of summary.spotCheck) {
    assert.ok(s.found, s.name + " (" + s.ticker + ") nicht im Company Master");
    assert.ok(s.inProductUniverse, s.name + " nicht im Produktuniversum");
    assert.ok(s.capabilities.HAS_PROVIDER_MAPPING, s.name + " ohne Tiingo-Mapping");
    /* Was die Matrix ausweist, muss den Artefakten entsprechen. */
    const row = rows.find((r) => r.ticker === s.ticker);
    const series = join(root, "quant", "data", "market", "discover-series", row.securityId + ".json");
    assert.equal(row.HAS_MARKET_DATA || !existsSync(series), true);
    if (existsSync(series)) assert.ok(row.HAS_MARKET_DATA, s.name + ": Reihe vorhanden, aber HAS_MARKET_DATA false");
    const page = join(root, "discover", "data", "stocks", "US_REAL", s.ticker + ".json");
    assert.equal(row.HAS_STOCK_PAGE, existsSync(page), s.name + ": HAS_STOCK_PAGE widerspricht der Datei");
  }
});
test('incremental Tiingo provider mapping requires the exact verified canonical listing, while unverified historical sources remain missing',()=>{
 const dir=mkdtempSync(join(tmpdir(),'vu-capability-listing-'));
 try{
  const decision={ticker:'IPO',securityId:'ref_IPO',exchange:'NYSE',instrument_type:'EQUITY_COMMON',product_eligibility:'ELIGIBLE',product_eligibility_reason:'TIINGO2_VERIFIED_INCREMENTAL_ADDITION',evidence_source:'TIINGO2_STAGED_QA',start_date:'2026-10-01'};
  const instrument={symbol:'IPO',masterMemberId:'ref_IPO',legacyIds:['ref_IPO'],exchange:'NYSE',firstTradeDate:'2026-10-01',providerIds:{tiingo:{symbol:'IPO',exchange:'NYSE',assetType:'Stock'}}};
  mkdirSync(join(dir,'quant/data/market/security-master'),{recursive:true});mkdirSync(join(dir,'quant/data/universe/instruments'),{recursive:true});
  const build=(d=decision,i=instrument)=>{
   writeFileSync(join(dir,'quant/data/market/security-master/eligibility.json'),JSON.stringify({decisions:[d],counts:{productUniverse:1,ELIGIBLE:1,SEPARATE_CLASS:0,REVIEW:0,EXCLUDED:0}}));
   writeFileSync(join(dir,'quant/data/universe/instruments/IP.json'),JSON.stringify({instruments:[i]}));
   return buildCapabilityMatrix({root:dir,dryRun:true}).rows[0];
  };
  assert.equal(build().HAS_PROVIDER_MAPPING,true);
  for(const change of [i=>i.providerIds.tiingo.symbol='OTHER',i=>i.providerIds.tiingo.exchange='NASDAQ',i=>i.exchange='NASDAQ',i=>i.masterMemberId='ref_OTHER',i=>i.symbol='OTHER',i=>i.firstTradeDate='2020-01-01',i=>i.legacyIds=[]]){
   const invalid=structuredClone(instrument);change(invalid);const row=build(decision,invalid);assert.equal(row.HAS_PROVIDER_MAPPING,false);assert.ok(row.gaps.includes('PROVIDER_MAPPING_MISSING'));
  }
  assert.equal(build({...decision,evidence_source:'UNVERIFIED_HISTORICAL_SOURCE'}).HAS_PROVIDER_MAPPING,false,'a matching symbol alone cannot upgrade an unverified historical mapping');
  assert.equal(build({...decision,product_eligibility_reason:'UNVERIFIED_ADDITION'}).HAS_PROVIDER_MAPPING,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
