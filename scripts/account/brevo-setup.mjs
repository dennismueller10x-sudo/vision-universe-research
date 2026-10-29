#!/usr/bin/env node
// Vision Universe — Brevo fuer Konten einrichten (Kontaktlisten, Merkmal) bzw. pruefen.
//
//   BREVO_API_KEY=… node scripts/account/brevo-setup.mjs            Probelauf: nur lesen, nichts anlegen
//   BREVO_API_KEY=… node scripts/account/brevo-setup.mjs --apply    fehlende Objekte anlegen
//
// Legt hoechstens an (nie aendern, nie loeschen, keine Kontakte, kein Versand):
//   Ordner "Vision Universe App"
//   Listen "Vision Universe App – Nutzer", "Vision Universe App – Free", "Vision Universe App – Pro"
//   Kontaktmerkmal VU_TARIF (Text: FREE | PRO)
// Prueft: Newsletter-Liste (Landingpage, id 4), abgenommene DOI-Vorlage, Absender, Domain.
// Ausgabe: IDs und Zaehler, keine Adressen, kein Schluessel. Die IDs gehoeren danach in
// workers/vu-account/wrangler.toml (VU_BREVO_LIST_USERS/FREE/PRO, VU_BREVO_LIST_NEWSLETTER).
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const FOLDER = 'Vision Universe App';
export const LISTS = Object.freeze({users: 'Vision Universe App – Nutzer', free: 'Vision Universe App – Free', pro: 'Vision Universe App – Pro'});
export const ATTRIBUTE = 'VU_TARIF';
export const NEWSLETTER_LIST = 4;
const TEMPLATE = 'VU | Newsletter | DE | API Double Opt In | v1';

export async function setupBrevo({apiKey, apply = false, fetchImpl = fetch, apiBase = 'https://api.brevo.com', log = console.log}) {
  if (!apiKey) throw new Error('BREVO_API_KEY fehlt');
  const call = async (method, path, body) => {
    const res = await fetchImpl(`${apiBase}/v3${path}`, {method, headers: {'api-key': apiKey, Accept: 'application/json',
      ...(body ? {'Content-Type': 'application/json'} : {})}, body: body ? JSON.stringify(body) : undefined});
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (res.status === 401) throw new Error('Brevo lehnt den Schluessel ab (401)');
    return {status: res.status, ok: res.ok, data};
  };
  const write = async (label, fn) => {
    if (!apply) { log(`[Probelauf] wuerde: ${label}`); return null; }
    const r = await fn();
    if (!(r.ok || r.status === 204)) throw new Error(`${label}: Brevo ${r.status} ${r.data?.code || ''}`);
    log(`angelegt: ${label}`);
    return r.data;
  };
  const all = async path => {
    const out = [];
    for (let offset = 0; offset < 5000; offset += 50) {
      const r = await call('GET', `${path}${path.includes('?') ? '&' : '?'}limit=50&offset=${offset}`);
      if (!r.ok) throw new Error(`${path}: Brevo ${r.status}`);
      const items = r.data?.lists || r.data?.folders || [];
      out.push(...items);
      if (items.length < 50) break;
    }
    return out;
  };
  const report = {lists: {}, folder: null, attribute: false, newsletter: null, template: null};

  const folders = await all('/contacts/folders');
  let folder = folders.find(f => f.name === FOLDER);
  if (!folder) {
    const created = await write(`Ordner "${FOLDER}"`, () => call('POST', '/contacts/folders', {name: FOLDER}));
    folder = created ? {id: created.id} : null;
  }
  report.folder = folder?.id || null;

  const lists = await all('/contacts/lists');
  for (const [key, name] of Object.entries(LISTS)) {
    let list = lists.find(l => l.name === name);
    if (!list && folder) {
      const created = await write(`Liste "${name}"`, () => call('POST', '/contacts/lists', {name, folderId: folder.id}));
      list = created ? {id: created.id, uniqueSubscribers: 0} : null;
    } else if (!list) log(`[Probelauf] wuerde: Liste "${name}" (nach dem Ordner)`);
    report.lists[key] = list ? {id: list.id, contacts: list.uniqueSubscribers ?? list.totalSubscribers ?? null} : null;
    log(`Liste ${name}: ${list ? `id ${list.id}` : 'fehlt'}`);
  }
  const nl = lists.find(l => l.id === NEWSLETTER_LIST);
  report.newsletter = nl ? {id: nl.id, name: nl.name, contacts: nl.uniqueSubscribers ?? nl.totalSubscribers ?? null} : null;
  log(`Newsletter-Liste ${NEWSLETTER_LIST}: ${nl ? `"${nl.name}", ${report.newsletter.contacts ?? '?'} Kontakte` : 'FEHLT'}`);

  const attrs = await call('GET', '/contacts/attributes');
  report.attribute = Boolean((attrs.data?.attributes || []).find(a => a.name === ATTRIBUTE && a.category === 'normal'));
  if (!report.attribute) {
    const done = await write(`Merkmal ${ATTRIBUTE} (Text)`, () => call('POST', `/contacts/attributes/normal/${ATTRIBUTE}`, {type: 'text'}));
    report.attribute = apply && done !== undefined;
  }
  log(`Merkmal ${ATTRIBUTE}: ${report.attribute ? 'vorhanden' : 'fehlt'}`);

  const tpl = await call('GET', '/smtp/templates?templateStatus=true&limit=100&offset=0');
  const t = (tpl.data?.templates || []).find(x => x.name === TEMPLATE);
  report.template = t ? {id: t.id, doi: t.doiTemplate === true, active: t.isActive === true, link: String(t.htmlContent || '').includes('{{ params.DOIurl }}')} : null;
  log(`DOI-Vorlage "${TEMPLATE}": ${t ? `id ${t.id}, DOI ${report.template.doi ? 'ja' : 'NEIN'}, aktiv ${report.template.active ? 'ja' : 'NEIN'}` : 'FEHLT'}`);
  log(`wrangler.toml: VU_BREVO_LIST_USERS = "${report.lists.users?.id || ''}", VU_BREVO_LIST_FREE = "${report.lists.free?.id || ''}", VU_BREVO_LIST_PRO = "${report.lists.pro?.id || ''}", VU_BREVO_LIST_NEWSLETTER = "${report.newsletter?.id || ''}"`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupBrevo({apiKey: process.env.BREVO_API_KEY, apply: process.argv.includes('--apply')})
    .catch(e => { console.error(`::error::${e.message}`); process.exit(1); });
}
