// Rolle billing_tester: genau ein Konto je Aufruf, nur bestaetigte Konten, idempotent, keine personenbezogenen Ausgaben.
import test from 'node:test';
import assert from 'node:assert/strict';
import {billingTester} from '../billing-tester.mjs';

const URL = 'https://qiytbnpoqvldsatpfkeh.supabase.co';
const A = '11111111-2222-4333-8444-555555555555';
const B = '99999999-2222-4333-8444-555555555555';

function fakeSupabase(users) {
  const roles = new Set();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new globalThis.URL(url), method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}${u.search}`);
    assert.equal(init.headers.apikey, 'sb_secret_test', 'Service-Zugang');
    const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {status});
    const admin = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/);
    if (admin) return users[admin[1]] ? reply(200, users[admin[1]]) : reply(404, {msg: 'User not found'});
    if (u.pathname === '/rest/v1/user_roles' && method === 'GET') return reply(200, [...roles].map(id => ({user_id: id})));
    if (u.pathname === '/rest/v1/user_roles' && method === 'POST') { const b = JSON.parse(init.body); assert.equal(b.role, 'billing_tester'); roles.add(b.user_id); return reply(201); }
    if (u.pathname === '/rest/v1/user_roles' && method === 'DELETE') { roles.delete(u.searchParams.get('user_id').slice(3)); return reply(204); }
    return reply(404, {});
  };
  return {fetchImpl, roles, calls};
}
const run = (sb, action, userId, logs = []) => billingTester({action, userId, url: URL, secretKey: 'sb_secret_test', fetchImpl: sb.fetchImpl, log: l => logs.push(l)});

test('vergibt die Rolle genau einem bestaetigten Konto, idempotent, und entfernt sie wieder', async () => {
  const sb = fakeSupabase({[A]: {id: A, email: 'owner@example.test', email_confirmed_at: '2026-10-28T18:06:00Z'}, [B]: {id: B, email: 'b@example.test', email_confirmed_at: '2026-10-28T18:06:00Z'}});
  const logs = [];
  assert.deepEqual(await run(sb, 'grant', A, logs), {action: 'grant', testers: 1, changed: true});
  assert.deepEqual([...sb.roles], [A], 'nur dieses Konto');
  assert.deepEqual(await run(sb, 'grant', A, logs), {action: 'grant', testers: 1, changed: false}, 'zweiter Aufruf aendert nichts');
  assert.ok(!logs.join('\n').includes('@'), 'keine Adresse in der Ausgabe');
  assert.ok(!logs.join('\n').includes(A), 'Konto-ID nur gekuerzt');
  assert.deepEqual(await run(sb, 'revoke', A, logs), {action: 'revoke', testers: 0, changed: true});
  assert.equal(sb.roles.size, 0);
});

test('lehnt ab: unbestaetigte, unbekannte, gesperrte Konten, Adressen statt ID, unbekannte Aktion', async () => {
  const sb = fakeSupabase({[A]: {id: A, email_confirmed_at: null}, [B]: {id: B, email_confirmed_at: '2026-10-28T18:06:00Z', banned_until: '2999-01-01T00:00:00Z'}});
  await assert.rejects(run(sb, 'grant', A), /E_MAIL_NICHT_BESTAETIGT/);
  await assert.rejects(run(sb, 'grant', B), /KONTO_GESPERRT/);
  await assert.rejects(run(sb, 'grant', '22222222-2222-4333-8444-555555555555'), /KONTO_NICHT_GEFUNDEN/);
  await assert.rejects(run(sb, 'grant', 'owner@example.test'), /KONTO_ID_UNGUELTIG/);
  await assert.rejects(run(sb, 'grant', ''), /KONTO_ID_UNGUELTIG/);
  await assert.rejects(run(sb, 'grant-all', A), /AKTION_UNBEKANNT/);
  await assert.rejects(billingTester({action: 'status', url: 'https://evil.example', secretKey: 'x'}), /SUPABASE_URL/);
  assert.equal(sb.roles.size, 0, 'nichts vergeben');
  assert.ok(!sb.calls.some(c => c.startsWith('POST')), 'kein Schreibversuch');
});

test('status zaehlt nur, schreibt nichts', async () => {
  const sb = fakeSupabase({});
  sb.roles.add(A);
  const logs = [];
  assert.deepEqual(await run(sb, 'status', null, logs), {action: 'status', testers: 1, changed: false});
  assert.ok(sb.calls.every(c => c.startsWith('GET')));
  assert.match(logs[0], /: 1 \(11111111…\)$/);
});
