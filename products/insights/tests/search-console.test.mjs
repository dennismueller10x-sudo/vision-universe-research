// Search-Console-Bericht (products/insights/search-console.mjs): Anmeldung und Auswertung ohne Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { jwt, auswerten, BASIS } from '../search-console.mjs';

test('GSC-1 · JWT ist RS256-signiert, an das Dienstkonto gebunden und eine Stunde gültig', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const konto = { client_email: 'search-console@beispiel.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const [kopf, inhalt, sig] = jwt(konto, 1_000_000).split('.');
  const dec = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());
  assert.deepEqual(dec(kopf), { alg: 'RS256', typ: 'JWT' });
  const p = dec(inhalt);
  assert.equal(p.iss, konto.client_email);
  assert.equal(p.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(p.scope, 'https://www.googleapis.com/auth/webmasters');
  assert.equal(p.exp - p.iat, 3600);
  assert.ok(crypto.createVerify('RSA-SHA256').update(kopf + '.' + inhalt).verify(publicKey, Buffer.from(sig, 'base64url')));
});

test('GSC-2 · Auswertung kürzt Adressen, rundet Klickrate (Prozent) und Position', () => {
  const r = auswerten({
    gesamt: [{ clicks: 3, impressions: 120, ctr: 0.025, position: 14.333 }],
    seiten: [{ keys: [BASIS + '/insights/goldminen-inflation-newmont/'], clicks: 2, impressions: 80, ctr: 0.025, position: 9.87 }],
    begriffe: [{ keys: ['newmont aktie', BASIS + '/insights/goldminen-inflation-newmont/'], clicks: 1, impressions: 30, ctr: 0.0333, position: 7.04 }],
    tage: [{ keys: ['2026-11-10'], clicks: 3, impressions: 120, ctr: 0.025, position: 14.3 }],
  });
  assert.deepEqual(r.insights, { klicks: 3, impressionen: 120, ctr: 2.5, position: 14.3 });
  assert.equal(r.seiten[0].url, '/insights/goldminen-inflation-newmont/');
  assert.equal(r.begriffe[0].begriff, 'newmont aktie');
  assert.equal(r.begriffe[0].ctr, 3.3);
  assert.equal(r.tage[0].datum, '2026-11-10');
  assert.deepEqual(auswerten({}).insights, { klicks: 0, impressionen: 0, ctr: 0, position: null });
});
