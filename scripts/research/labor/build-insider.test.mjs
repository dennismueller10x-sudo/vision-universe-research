// Strang G: Insider-Aufbereitung mit Fixture-Datensatz (synthetisch, keine Studienaussage).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { quarterList, eventsFromAccessions } from './build-insider.mjs';

const T = (rows) => rows.map(r => r.join('\t')).join('\n') + '\n';
function fixture(dir) {
  const q = path.join(dir, '2016q1'); fs.mkdirSync(q, { recursive: true });
  fs.writeFileSync(path.join(q, 'SUBMISSION.tsv'), T([['ACCESSION_NUMBER', 'FILING_DATE', 'PERIOD_OF_REPORT', 'DOCUMENT_TYPE', 'ISSUERCIK', 'ISSUERNAME', 'ISSUERTRADINGSYMBOL'],
    ['a1', '15-JAN-2016', '13-JAN-2016', '4', '42', 'X', 'X'], ['a2', '20-JAN-2016', '19-JAN-2016', '4/A', '42', 'X', 'X'],
    ['a3', '25-JAN-2016', '22-JAN-2016', '4', '42', 'X', 'X'], ['a4', '26-JAN-2016', '22-JAN-2016', '4', '99', 'Y', 'Y'], ['a5', '27-JAN-2016', '22-JAN-2016', '4', '42', 'X', 'X']]));
  fs.writeFileSync(path.join(q, 'REPORTINGOWNER.tsv'), T([['ACCESSION_NUMBER', 'RPTOWNERCIK', 'RPTOWNERNAME', 'RPTOWNER_RELATIONSHIP', 'RPTOWNER_TITLE'],
    ['a1', '1001', 'A', 'Director', ''], ['a2', '1001', 'A', 'Director', ''], ['a3', '1002', 'B', 'TenPercentOwner', ''], ['a4', '1003', 'C', 'Officer', 'CEO'], ['a5', '1004', 'D', 'Officer', 'CFO']]));
  fs.writeFileSync(path.join(q, 'NONDERIV_TRANS.tsv'), T([['ACCESSION_NUMBER', 'NONDERIV_TRANS_SK', 'SECURITY_TITLE', 'TRANS_DATE', 'TRANS_CODE', 'TRANS_SHARES', 'TRANS_PRICEPERSHARE', 'TRANS_ACQUIRED_DISP_CD'],
    ['a1', '1', 'Common', '13-JAN-2016', 'P', '100', '10', 'A'], ['a2', '2', 'Common', '19-JAN-2016', 'P', '999', '10', 'A'], ['a3', '3', 'Common', '22-JAN-2016', 'P', '100', '10', 'A'],
    ['a4', '4', 'Common', '22-JAN-2016', 'P', '100', '10', 'A'], ['a5', '5', 'Common', '22-JAN-2016', 'S', '100', '10', 'D']]));
  return q;
}

test('Quartalsliste', () => { assert.deepEqual(quarterList('2015q3', '2016q2'), ['2015q3', '2015q4', '2016q1', '2016q2']); });

test('Form 4 ohne Änderungen, nur Käufe (P) von Director/Officer, Zuordnung über CIK, Datum = Einreichung', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'labor-ins-'));
  fixture(dir);
  const idx = path.join(dir, 'index.json'); fs.writeFileSync(idx, JSON.stringify({ issuers: { '0000000042': { securityIds: ['ref_X', 'dl_9'] } } }));
  const out = path.join(dir, 'out.json');
  execFileSync(process.execPath, [path.join(import.meta.dirname, 'build-insider.mjs'), '--datasets', dir, '--fund-index', idx, '--out', out, '--from', '2016q1', '--to', '2016q1']);
  const d = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(d.events.ref_X, [['2016-01-15', '0000001001', 1000]]);
  assert.deepEqual(d.events.dl_9, d.events.ref_X);
  assert.equal(d.stats.unmapped, 1, 'CIK 99: Officer-Kauf ohne Zuordnung wird gezählt, nicht geraten');
  assert.equal(d.stats.notInsider, 1, 'a3: nur 10-%-Eigner');
  assert.equal(d.missing.length, 0);
});

test('Mehrere Insider einer Einreichung: Wert einmal', () => {
  const { into } = eventsFromAccessions({ x: { i: '0000000042', f: 16800, o: [['0000000001', 1], ['0000000002', 2]], x: [['P', 16799, 10, 500, 0]] } }, new Map([['0000000042', ['ref_X']]]));
  assert.deepEqual(into.get('ref_X').map(e => e[2]), [500, 0]);
});
