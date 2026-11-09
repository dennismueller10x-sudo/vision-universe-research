#!/usr/bin/env node
// Vision Universe — darf ein Job die Umgebung account-auto (ohne Review) benutzen?
//
//   GH_TOKEN=… REPO=owner/name node scripts/account/check-auto-env.mjs
//
// Nur wenn sie existiert und auf den Branch main beschraenkt ist (docs/accounts/FREIGABEN.md). Ein Job mit einer
// unbekannten Umgebung wuerde sie sonst ungeschuetzt anlegen. Schreibt ready=true|false nach $GITHUB_OUTPUT.
//   fehlt                     -> ready=false, Hinweis (einmalige Einrichtung steht aus), Exit 0
//   nicht nur main / unlesbar -> Fehler (fail closed)
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function verdict(envStatus, env, policies) {
  if (envStatus === 404) return {ready: false, warning: 'Umgebung account-auto fehlt noch (einmalige Einrichtung, docs/accounts/FREIGABEN.md)'};
  if (envStatus !== 200) return {error: `Umgebung account-auto nicht lesbar (${envStatus})`};
  if (env?.deployment_branch_policy?.custom_branch_policies !== true) return {error: 'account-auto muss auf ausgewaehlte Branches (nur main) beschraenkt sein'};
  const names = (policies?.branch_policies || []).map(p => `${p.type || 'branch'}:${p.name}`).sort();
  if (names.join(',') !== 'branch:main') return {error: `account-auto erlaubt mehr als main (${names.join(',') || 'nichts'})`};
  return {ready: true};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {GH_TOKEN, REPO, GITHUB_OUTPUT} = process.env;
  const api = p => fetch(`https://api.github.com/repos/${REPO}/environments/account-auto${p}`,
    {headers: {Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json'}});
  const out = ready => { if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `ready=${ready}\n`); };
  try {
    const r = await api('');
    const env = r.status === 200 ? await r.json() : null;
    const pol = r.status === 200 && env?.deployment_branch_policy?.custom_branch_policies ? await (await api('/deployment-branch-policies')).json() : null;
    const v = verdict(r.status, env, pol);
    if (v.error) { console.error(`::error::${v.error}`); out(false); process.exit(1); }
    if (v.warning) console.log(`::warning::${v.warning} - Job uebersprungen`);
    else console.log('account-auto: vorhanden, nur main.');
    out(v.ready);
  } catch (e) { console.error(`::error::account-auto nicht pruefbar (${e.message})`); out(false); process.exit(1); }
}
