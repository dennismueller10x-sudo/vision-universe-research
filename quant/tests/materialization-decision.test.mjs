// Materialisierung: ein Same-Day-Refresh mit neueren Faktorzeilen wird automatisch nachgezogen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide } from '../../scripts/quant/materialization-decision.mjs';

const T = { store: '2026-10-02', product: '2026-10-02' };

test('Vorfall 03.10.2026: gleicher Stichtag, Faktorzeilen nach der Evidenz neu geschrieben -> materialisieren', () => {
  const d = decide({ ...T, factorsAt: '2026-10-03T14:25:16.826Z', evidenceAt: '2026-10-03T10:51:08.000Z' });
  assert.deepEqual(d, { noop: false, reason: 'FACTORS_NEWER_THAN_EVIDENCE' });
});

test('Nach der Nachmaterialisierung ist derselbe Stand ein No-Op (keine Endlosschleife)', () => {
  const d = decide({ ...T, factorsAt: '2026-10-03T14:25:16.826Z', evidenceAt: '2026-10-03T15:02:00.000Z' });
  assert.deepEqual(d, { noop: true, reason: 'UP_TO_DATE' });
});

test('Millisekunden und gekuerzte Sekunden werden zeitlich, nicht als Text verglichen', () => {
  assert.equal(decide({ ...T, factorsAt: '2026-10-03T14:25:16.826Z', evidenceAt: '2026-10-03T14:25:17.000Z' }).noop, true);
  assert.equal(decide({ ...T, factorsAt: '2026-10-03T14:25:17.001Z', evidenceAt: '2026-10-03T14:25:17.000Z' }).noop, false);
});

test('Fehlende Evidenz bei vorhandenen Faktorzeilen -> materialisieren', () => {
  assert.equal(decide({ ...T, factorsAt: '2026-10-03T14:25:16.826Z', evidenceAt: '' }).reason, 'FACTORS_NEWER_THAN_EVIDENCE');
});

test('Rangfolge: force und Methodikwechsel vor allem anderen; Stichtagsrueckstand materialisiert', () => {
  assert.equal(decide({ ...T, force: true, factorsAt: 'x', evidenceAt: 'y' }).reason, 'FORCE');
  assert.equal(decide({ ...T, method: 'benchmark' }).reason, 'METHODOLOGY_CHANGED');
  assert.deepEqual(decide({ store: '2026-10-05', product: '2026-10-02' }), { noop: false, reason: 'STORE_AHEAD_OF_PRODUCT' });
});

test('Workflow entscheidet ueber das Skript, nicht ueber eigenen Shell-Vergleich', () => {
  const wf = readFileSync(new URL('../../.github/workflows/product-intelligence-materialization.yml', import.meta.url), 'utf8');
  assert.match(wf, /node scripts\/quant\/materialization-decision\.mjs --store="\$STORE" --product="\$PRODUCT"/);
  assert.doesNotMatch(wf, /echo "noop=(true|false)" >> "\$GITHUB_OUTPUT"/);
});
