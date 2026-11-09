// V12 INDEXPOP: parser, normalization and evidence-consistency tests (read-only, synthetic fixtures, fast).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = require(path.join(ROOT, 'scripts/quant/v12/indexpop/lib.cjs'));
const DOCS = path.join(ROOT, 'docs/quant-recovery/v12/indexpop');

const NPORT = `<?xml version="1.0"?><edgarSubmission xmlns="http://www.sec.gov/edgar/nport"><formData><genInfo><seriesId>S000000001</seriesId>
<repPdEnd>2020-12-31</repPdEnd><repPdDate>2020-09-30</repPdDate></genInfo><fundInfo><totAssets>1010</totAssets><totLiabs>10</totLiabs><netAssets>1000</netAssets></fundInfo>
<invstOrSecs>
<invstOrSec><name>AT&amp;T Inc</name><title>AT&amp;T Inc</title><cusip>00206R102</cusip><identifiers><isin value="US00206R1023"/></identifiers><balance>10</balance><units>NS</units><curCd>USD</curCd><valUSD>600</valUSD><pctVal>60</pctVal><payoffProfile>Long</payoffProfile><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>
<invstOrSec><name>Acme Corp/The</name><cusip>000000AA1</cusip><balance>4</balance><units>NS</units><valUSD>395</valUSD><pctVal>39.5</pctVal><payoffProfile>Long</payoffProfile><assetCat>EC</assetCat></invstOrSec>
<invstOrSec><name>Money Market</name><cusip>000000MM1</cusip><balance>50</balance><units>NS</units><valUSD>50</valUSD><payoffProfile>Long</payoffProfile><assetCat>STIV</assetCat></invstOrSec>
<invstOrSec><name>S&amp;P future</name><balance>1</balance><units>NC</units><valUSD>3</valUSD><payoffProfile>N/A</payoffProfile><assetCat>DE</assetCat></invstOrSec>
</invstOrSecs></formData></edgarSubmission>`;

test('N-PORT parser: members are long equity shares only; validation against net assets', () => {
  const d = L.parseNport(Buffer.from(NPORT));
  assert.equal(d.repPdDate, '2020-09-30');
  assert.equal(d.positions.length, 4);
  assert.equal(d.positions[0].name, 'AT&T Inc');
  assert.equal(d.positions[0].isin, 'US00206R1023');
  const v = L.validateNport(d, [2, 2]);
  assert.equal(v.memberCount, 2);
  assert.equal(v.memberSum, 995);
  assert.equal(v.valid, true);
  assert.equal(L.validateNport(d, [3, 5]).reasons.includes('MEMBER_COUNT_OUT_OF_RANGE'), true);
  assert.equal(L.validateNport({ ...d, netAssets: 2000 }, [2, 2]).valid, false);
});

const TXT = `THE SPDR TRUST SERIES 1
SCHEDULE OF INVESTMENTS
SEPTEMBER 30, 2003
<Table>
         COMMON STOCKS              SHARES          VALUE
3M Co. .........................   3,066,220   $   211,783,815
ADC Telecommunications,
  Inc. *........................   3,143,263         7,323,803
American International Group, Inc. 1,926,637       167,497,004
                                               ---------------
Total Common Stocks
  (Cost $47,663,140,946)........                386,604,622
</Table>`;

test('report parser (text): wrapped names, glued values, total on a continuation line', () => {
  const r = L.parseReport(Buffer.from(TXT), false);
  assert.equal(r.date, '2003-09-30');
  assert.deepEqual(r.positions.map(p => p.name), ['3M Co.', 'ADC Telecommunications, Inc.', 'American International Group, Inc.']);
  assert.equal(r.total, 386604622);
  const v = L.validateReport(r, [3, 3]);
  assert.equal(v.valid, true);
  assert.equal(v.memberSum, 386604622);
});

const HTML = `<p>Schedule of Investments (Unaudited)</p><p>iSHARES&reg; RUSSELL 3000 ETF</p><p>December 31, 2013</p>
<table><tr><td>Security</td><td>Shares</td><td>Value</td></tr>
<tr><td>COMMON STOCKS &#151; 99.78%</td></tr><tr><td>AEROSPACE &amp; DEFENSE &#151; 2.62%</td></tr>
<tr><td valign="top">AAR Corp.</td><td>10,631</td><td>$</td><td>297,774</td></tr>
<tr><td>AeroVironment<br>Inc. <sup>a,b</sup></td><td>4,613</td><td>134,377</td></tr>
<tr><td></td><td>432,151</td></tr></table>
<p>Schedule of Investments (Unaudited) (Continued)</p><p>iSHARES&reg; RUSSELL 3000 GROWTH ETF</p>
<table><tr><td>Other Fund Co.</td><td>1</td><td>999</td></tr></table>
<p>iSHARES&reg; RUSSELL 3000 ETF</p>
<table><tr><td>Security</td><td>Shares</td><td>Value</td></tr><tr><td>Boeing Co. (The)</td><td>100</td><td>13,649</td></tr>
<tr><td>TOTAL COMMON STOCKS (Cost: $1)</td><td>445,800</td></tr></table>`;

test('report parser (HTML, multi-fund): fund scope by page heading, subtotal rows ignored, footnotes stripped', () => {
  const r = L.parseReport(Buffer.from(HTML), true, { fundRe: /\biSHARES\s+RUSSELL 3000 (ETF|INDEX FUND)\b/i, anyFundRe: /\biSHARES\s[^|]{0,70}?\b(ETF|INDEX FUND)\b/i });
  assert.equal(r.date, '2013-12-31');
  assert.deepEqual(r.positions.map(p => p.name), ['AAR Corp.', 'AeroVironment Inc.', 'Boeing Co. (The)']);
  assert.equal(r.total, 445800);
  assert.equal(L.validateReport(r, [3, 3]).valid, true);
});

test('name normalization 1.1.0', () => {
  const k = s => L.normName(s).key;
  assert.equal(k('Bank of New York Mellon Corp. (The)'), 'BANK OF NEW YORK MELLON');
  assert.equal(k('Bank of New York Mellon Corp/The'), 'BANK OF NEW YORK MELLON');
  assert.equal(k('BANK OF NEW YORK MELLON CORP NEW'), 'BANK OF NEW YORK MELLON');
  assert.equal(k('Procter & Gamble Co. (The)'), 'PROCTER AND GAMBLE');
  assert.deepEqual(L.normName('Alphabet Inc - Class C'), { key: 'ALPHABET', cls: 'C' });
  assert.deepEqual(L.normName('News Corp. Class A NVS'), { key: 'NEWS', cls: 'A' });
  assert.equal(L.tokenSim('A B C', 'A B C'), 1);
});

test('committed evidence is internally consistent (register sums = validated member sums; coverage within [0,100])', () => {
  const val = JSON.parse(fs.readFileSync(path.join(DOCS, 'validation-1.0.0.json'), 'utf8'));
  assert.equal(val.dates.length, 335);
  assert.equal(val.dates.every(d => d.valid), true);
  const reg = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DOCS, 'register-1.2.0.json.gz'))));
  assert.equal(reg.snapshots.length, 335);
  assert.equal(reg.certificationStatus, 'NOT_CERTIFIED');
  const sums = new Map(val.dates.map(d => [d.fund + '|' + d.date, d.memberSum]));
  for (const s of reg.snapshots) {
    const c = s.cols, t = c.v.reduce((a, x) => a + x, 0);
    assert.equal(c.v.length, s.members);
    assert.ok(Math.abs(t - sums.get(s.fund + '|' + s.date)) <= s.members, s.fund + s.date);
    for (let i = 0; i < c.v.length; i++) if (c.cov[i]) assert.ok(c.id[i] >= 0, 'covered rows carry a securityId');
    assert.ok(c.dk.every((x, i) => i === 0 || x >= 0), 'rows sorted by key index');
  }
  for (const V of ['1.1.0', '1.2.0']) {
    const cov = JSON.parse(fs.readFileSync(path.join(DOCS, `coverage-${V}.json`), 'utf8'));
    for (const c of cov.dates) { assert.ok(c.coveredPctN >= 0 && c.coveredPctN <= 100); assert.ok(c.coveredPctN <= c.mappedPctN + 1e-9); }
  }
});

test('repository evidence stays compact and holds no raw CUSIPs', () => {
  let total = 0;
  for (const f of fs.readdirSync(DOCS)) total += fs.statSync(path.join(DOCS, f)).size;
  assert.ok(total < 6 * 1024 * 1024, 'indexpop evidence < 6 MB');
  const reg = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DOCS, 'register-1.2.0.json.gz'))));
  for (const k of reg.keys) { assert.match(k[0], /^[0-9a-f]{16}$/); assert.ok(k[2] === null || /^[0-9a-f]{16}$/.test(k[2])); }
});
