#!/usr/bin/env node
// Vision Universe — Rolle billing_tester (Live-Checkout nur fuer Tester, VU_CHECKOUT_ACCESS = "testers").
//
//   node scripts/account/billing-tester.mjs status
//   node scripts/account/billing-tester.mjs grant  --user=<Konto-UUID>
//   node scripts/account/billing-tester.mjs revoke --user=<Konto-UUID>
//
// Braucht SUPABASE_URL und SUPABASE_SECRET_KEY (Service-Zugang; Nutzer koennen user_roles nur lesen).
// Regeln:
//   * genau EIN Konto je Aufruf, nur ueber die Konto-ID (UUID) - nie ueber eine Adresse, nie in Mengen
//   * das Konto muss existieren und seine E-Mail-Adresse bestaetigt haben
//   * idempotent: eine vorhandene Rolle bleibt, ein zweiter Aufruf aendert nichts
//   * Ausgaben ohne personenbezogene Daten (das Repository und seine Protokolle sind oeffentlich):
//     nur gekuerzte Konto-ID und Zaehler
// Workflow: .github/workflows/account-billing-tester.yml (Umgebung account-dev, Freigabe des Owners).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ROLE = 'billing_tester';

export const shortId = id => `${String(id).slice(0, 8)}…`;

export async function billingTester({action, userId, url, secretKey, fetchImpl = fetch, log = console.log}) {
  if (!['status', 'grant', 'revoke'].includes(action)) throw new Error('AKTION_UNBEKANNT (status | grant | revoke)');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(String(url || '')) && !/^http:\/\/(localhost|127\.0\.0\.1|[a-z.]+\.sim)(:\d+)?$/.test(String(url || ''))) {
    throw new Error('SUPABASE_URL fehlt oder ist keine Supabase-Adresse');
  }
  if (!String(secretKey || '')) throw new Error('SUPABASE_SECRET_KEY fehlt');
  const headers = {apikey: secretKey, 'Content-Type': 'application/json', Accept: 'application/json'};
  if (secretKey.startsWith('eyJ')) headers.Authorization = `Bearer ${secretKey}`;
  async function call(path, init = {}) {
    const res = await fetchImpl(url + path, {...init, headers: {...headers, ...(init.headers || {})}});
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return {status: res.status, ok: res.ok, data};
  }
  const testers = async () => {
    const r = await call(`/rest/v1/user_roles?select=user_id&role=eq.${ROLE}`);
    if (!r.ok) throw new Error(`ROLLEN_NICHT_LESBAR (${r.status})`);
    return r.data.map(x => x.user_id);
  };

  const before = await testers();
  if (action === 'status') {
    log(`Konten mit Rolle ${ROLE}: ${before.length}${before.length ? ' (' + before.map(shortId).join(', ') + ')' : ''}`);
    return {action, testers: before.length, changed: false};
  }
  if (!UUID.test(String(userId || ''))) throw new Error('KONTO_ID_UNGUELTIG (UUID erwartet, keine Adresse)');

  if (action === 'grant') {
    const u = await call(`/auth/v1/admin/users/${userId}`);
    if (u.status === 404 || (u.ok && !u.data?.id)) throw new Error('KONTO_NICHT_GEFUNDEN');
    if (!u.ok) throw new Error(`KONTO_NICHT_LESBAR (${u.status})`);
    if (u.data.id !== userId) throw new Error('KONTO_ID_WIDERSPRUCH');
    if (!u.data.email_confirmed_at) throw new Error('E_MAIL_NICHT_BESTAETIGT');
    if (u.data.banned_until && Date.parse(u.data.banned_until) > Date.now()) throw new Error('KONTO_GESPERRT');
    if (before.includes(userId)) {
      log(`Konto ${shortId(userId)} hat die Rolle ${ROLE} bereits - keine Aenderung. Tester gesamt: ${before.length}`);
      return {action, testers: before.length, changed: false};
    }
    const r = await call('/rest/v1/user_roles?on_conflict=user_id,role', {method: 'POST',
      headers: {Prefer: 'resolution=ignore-duplicates,return=minimal'}, body: JSON.stringify({user_id: userId, role: ROLE})});
    if (!r.ok) throw new Error(`ROLLE_NICHT_VERGEBEN (${r.status})`);
  } else {
    if (!before.includes(userId)) {
      log(`Konto ${shortId(userId)} hat die Rolle ${ROLE} nicht - keine Aenderung. Tester gesamt: ${before.length}`);
      return {action, testers: before.length, changed: false};
    }
    const r = await call(`/rest/v1/user_roles?user_id=eq.${userId}&role=eq.${ROLE}`, {method: 'DELETE', headers: {Prefer: 'return=minimal'}});
    if (!r.ok) throw new Error(`ROLLE_NICHT_ENTFERNT (${r.status})`);
  }
  const after = await testers();
  const expected = action === 'grant' ? before.length + 1 : before.length - 1;
  const has = after.includes(userId);
  if (after.length !== expected || has !== (action === 'grant')) throw new Error(`NACHPRUEFUNG_FEHLGESCHLAGEN (vorher ${before.length}, nachher ${after.length})`);
  log(`Konto ${shortId(userId)}: Rolle ${ROLE} ${action === 'grant' ? 'vergeben' : 'entfernt'}. Tester gesamt: ${before.length} -> ${after.length}`);
  return {action, testers: after.length, changed: true};
}

import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  const userId = (process.argv.find(a => a.startsWith('--user=')) || '').slice(7);
  billingTester({action, userId, url: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''), secretKey: process.env.SUPABASE_SECRET_KEY})
    .catch(e => { console.error(`::error::${e.message}`); process.exit(1); });
}
