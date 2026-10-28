// Regression: Auswertung von `supabase db push --dry-run` (CLI 2.122.0). Die Fixtures sind die echten Ausgaben,
// stdout und stderr zusammengefuehrt (2>&1); der erste Fall ist der Lauf #40681925021, der faelschlich abbrach.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePushPlan, decide} from '../supabase-push-plan.mjs';

const EXPECT = '20261028000200_free_pro.sql';
// Lauf #40681925021 (28.10.2026): Plan auf stderr, auf stdout nur "Finished supabase db push."
const STDERR_PLAN = 'DRY RUN: migrations will *not* be pushed to the database.\nConnecting to remote database...\nWould push these migrations:\n • 20261028000200_free_pro.sql\n';
const STDOUT_FINISHED = 'Finished supabase db push.\n';
const UP_TO_DATE = 'DRY RUN: migrations will *not* be pushed to the database.\nConnecting to remote database...\nRemote database is up to date.\n';
const TWO = 'DRY RUN: migrations will *not* be pushed to the database.\nConnecting to remote database...\nWould push these migrations:\n • 20261028000200_free_pro.sql\n • 20261029000100_extra.sql\nFinished supabase db push.\n';
const OTHER = STDERR_PLAN.replace('20261028000200_free_pro.sql', '20261029000100_extra.sql') + STDOUT_FINISHED;
const JSON_AGENT = '{"upToDate":false,"dryRun":true,"migrations":["20261028000200_free_pro.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}\n';

test('der tatsaechlich aufgetretene Fall: Plan auf stderr, zusammen ausgewertet -> erwartet', () => {
  assert.deepEqual(decide(STDERR_PLAN + STDOUT_FINISHED, EXPECT), {ok: true, state: 'expected'});
  assert.deepEqual(decide(STDOUT_FINISHED + STDERR_PLAN, EXPECT), {ok: true, state: 'expected'}, 'Reihenfolge der Stroeme egal');
});

test('nur stdout (der alte Fehler) wird nicht als Plan missverstanden', () => {
  assert.equal(parsePushPlan(STDOUT_FINISHED), null);
  assert.equal(decide(STDOUT_FINISHED, EXPECT).ok, false);
});

test('nichts offen -> up-to-date', () => {
  assert.deepEqual(decide(UP_TO_DATE, EXPECT), {ok: true, state: 'up-to-date'});
});

test('Abbruch bei zwei offenen, einer anderen oder keiner erkennbaren Migration', () => {
  assert.match(decide(TWO, EXPECT).reason, /Mehr als eine offene Migration: 20261028000200_free_pro\.sql, 20261029000100_extra\.sql/);
  assert.match(decide(OTHER, EXPECT).reason, /Unerwartete Migration: 20261029000100_extra\.sql/);
  assert.match(decide('', EXPECT).reason, /nicht erkannt/);
  assert.match(decide('Would push these migrations:\n', EXPECT).reason, /ohne Migrationen/);
  assert.match(decide(STDERR_PLAN, 'free_pro.sql').reason, /ungueltig/);
});

test('JSON-Ausgabe (CLI erkennt KI-Agent) wird gleich bewertet', () => {
  assert.deepEqual(decide(JSON_AGENT, EXPECT), {ok: true, state: 'expected'});
  assert.deepEqual(decide('{"upToDate":true,"dryRun":true,"migrations":[]}', EXPECT), {ok: true, state: 'up-to-date'});
  assert.equal(decide('{"upToDate":false,"migrations":["a.sql","b.sql"]}', EXPECT).ok, false);
});
