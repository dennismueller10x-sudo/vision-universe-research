// Brevo-Einrichtung: Probelauf schreibt nichts; --apply legt nur Fehlendes an, nie Kontakte, nie Versand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setupBrevo, LISTS} from '../brevo-setup.mjs';

function fakeBrevo({lists = [{id: 4, name: 'Newsletter', uniqueSubscribers: 135}], folders = [], attributes = []} = {}) {
  const calls = [];
  let next = 20;
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), {status});
  const fetchImpl = async (url, {method = 'GET', body} = {}) => {
    const u = new URL(url);
    calls.push(`${method} ${u.pathname}`);
    if (u.pathname === '/v3/contacts/folders' && method === 'GET') return json(200, {folders, count: folders.length});
    if (u.pathname === '/v3/contacts/folders' && method === 'POST') { const f = {id: next++, name: JSON.parse(body).name}; folders.push(f); return json(201, {id: f.id}); }
    if (u.pathname === '/v3/contacts/lists' && method === 'GET') return json(200, {lists, count: lists.length});
    if (u.pathname === '/v3/contacts/lists' && method === 'POST') { const l = {id: next++, ...JSON.parse(body)}; lists.push(l); return json(201, {id: l.id}); }
    if (u.pathname === '/v3/contacts/attributes' && method === 'GET') return json(200, {attributes});
    if (u.pathname.startsWith('/v3/contacts/attributes/normal/') && method === 'POST') { attributes.push({name: u.pathname.split('/').pop(), category: 'normal'}); return json(201); }
    if (u.pathname === '/v3/smtp/templates') return json(200, {templates: [{id: 5, name: 'VU | Newsletter | DE | API Double Opt In | v1', doiTemplate: true, isActive: true, htmlContent: '{{ params.DOIurl }}'}]});
    return json(404, {code: 'not_found'});
  };
  return {fetchImpl, calls, lists};
}

test('Probelauf: nur lesen', async () => {
  const b = fakeBrevo();
  const lines = [];
  const r = await setupBrevo({apiKey: 'k', fetchImpl: b.fetchImpl, log: l => lines.push(l)});
  assert.ok(b.calls.every(c => c.startsWith('GET ')), b.calls.join(','));
  assert.equal(r.newsletter.id, 4);
  assert.deepEqual([r.template.id, r.template.doi], [5, true]);
  assert.ok(lines.some(l => l.includes('[Probelauf] wuerde: Ordner')));
});

test('--apply: Ordner, drei Listen, Merkmal; zweiter Lauf legt nichts doppelt an; keine Kontakte', async () => {
  const b = fakeBrevo();
  const r = await setupBrevo({apiKey: 'k', apply: true, fetchImpl: b.fetchImpl, log: () => {}});
  assert.ok(r.lists.users.id && r.lists.free.id && r.lists.pro.id);
  assert.deepEqual(b.lists.filter(l => Object.values(LISTS).includes(l.name)).map(l => l.name).sort(), Object.values(LISTS).sort());
  const posts = b.calls.filter(c => c.startsWith('POST'));
  await setupBrevo({apiKey: 'k', apply: true, fetchImpl: b.fetchImpl, log: () => {}});
  assert.equal(b.calls.filter(c => c.startsWith('POST')).length, posts.length, 'idempotent');
  assert.ok(!b.calls.some(c => /\/v3\/contacts(\/import|\/doubleOptin|$)/.test(c.split(' ')[1]) && !c.startsWith('GET')), 'keine Kontakte');
  assert.ok(!b.calls.some(c => /smtp\/email|emailCampaigns/.test(c)), 'kein Versand');
});
