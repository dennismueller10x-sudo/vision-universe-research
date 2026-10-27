#!/usr/bin/env node
// Vision Universe — Brevo fuer Transaktions-E-Mails pruefen (nur lesend).
//
//   BREVO_API_KEY=… VU_MAIL_SENDER=konto@visionuniverse.de node scripts/account/brevo-check.mjs
//
// Prueft: Schluessel gueltig, Absender angelegt und aktiv, Absender-Domain
// authentifiziert (DKIM/DMARC). Sendet nichts, legt nichts an, gibt weder
// Schluessel noch Kontodaten aus.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function checkBrevo({apiKey, sender, fetchImpl = fetch, apiBase = 'https://api.brevo.com'}) {
  const problems = [];
  if (!apiKey) return {ok: false, problems: ['BREVO_API_KEY fehlt']};
  if (!/^[a-z0-9._%+-]+@visionuniverse\.de$/.test(String(sender || ''))) problems.push('VU_MAIL_SENDER fehlt oder ist keine Adresse @visionuniverse.de');
  const get = async path => {
    const res = await fetchImpl(`${apiBase}${path}`, {headers: {'api-key': apiKey, Accept: 'application/json'}});
    if (res.status === 401) throw new Error('Brevo lehnt den Schluessel ab (401)');
    if (!res.ok) throw new Error(`Brevo ${path}: ${res.status}`);
    return res.json();
  };
  try {
    await get('/v3/account');
    const senders = (await get('/v3/senders')).senders || [];
    const own = senders.find(s => String(s.email).toLowerCase() === String(sender).toLowerCase());
    if (!own) problems.push('Absender ist in Brevo nicht angelegt (Senders, Domains & Dedicated IPs -> Senders)');
    else if (!own.active) problems.push('Absender ist in Brevo noch nicht bestaetigt/aktiv');
    const domains = (await get('/v3/senders/domains')).domains || [];
    const domain = domains.find(d => d.domain_name === 'visionuniverse.de');
    if (!domain) problems.push('Domain visionuniverse.de ist in Brevo nicht angelegt');
    else if (!domain.authenticated) problems.push('Domain visionuniverse.de ist nicht authentifiziert (DKIM/DMARC-Eintraege fehlen)');
  } catch (e) { problems.push(e.message); }
  return {ok: problems.length === 0, problems};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkBrevo({apiKey: process.env.BREVO_API_KEY, sender: process.env.VU_MAIL_SENDER}).then(r => {
    if (r.ok) { console.log('Brevo: Schluessel, Absender und Domain in Ordnung.'); return; }
    for (const p of r.problems) console.log(`::error::Brevo: ${p}`);
    process.exit(1);
  });
}
