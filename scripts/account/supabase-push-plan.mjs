#!/usr/bin/env node
// Vision Universe — Plan von `supabase db push --dry-run` pruefen (Ops-Laeufe gegen die Produktionsdatenbank).
//
//   npx supabase@2.122.0 db push --dry-run --db-url "$DB_URL" > plan.txt 2>&1
//   node scripts/account/supabase-push-plan.mjs --expect=20261028000200_free_pro.sql plan.txt
//
// Gibt "up-to-date" oder "expected" aus (Exit 0). Alles andere ist ein Abbruch (Exit 1): keine erkennbare
// Ausgabe, eine andere oder mehr als eine offene Migration.
//
// Wichtig: Die CLI schreibt den Plan ("Would push these migrations:" und die Liste) auf stderr und nur
// "Finished supabase db push." bzw. "Remote database is up to date." auf stdout. Deshalb immer beide Stroeme
// zusammen auswerten (2>&1). In Umgebungen, die die CLI als KI-Agent erkennt, steht auf stdout stattdessen
// JSON ({"upToDate":…,"migrations":[…]}); auch das wird erkannt.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const FILE = /^\d{14}_[a-z0-9_]+\.sql$/;

export function parsePushPlan(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j.migrations)) return {upToDate: j.upToDate === true && !j.migrations.length, migrations: j.migrations.map(String)};
    } catch { /* keine JSON-Zeile */ }
  }
  const head = lines.findIndex(l => /^\s*(Would push these migrations:|Do you want to push these migrations\b)/.test(l));
  if (head >= 0) {
    const migrations = [];
    for (const l of lines.slice(head + 1)) {
      const m = /^\s*[•*-]\s+(\S+)\s*$/.exec(l);
      if (!m) break;
      migrations.push(m[1]);
    }
    return {upToDate: false, migrations};
  }
  if (lines.some(l => /^\s*Remote database is up to date\.?\s*$/.test(l))) return {upToDate: true, migrations: []};
  return null;
}

// Entscheidung fuer genau eine erwartete Migration.
export function decide(text, expect) {
  if (!FILE.test(String(expect || ''))) return {ok: false, reason: `Erwartete Migration ungueltig: ${expect}`};
  const plan = parsePushPlan(text);
  if (!plan) return {ok: false, reason: 'Ausgabe der Supabase-CLI nicht erkannt'};
  if (plan.upToDate) return {ok: true, state: 'up-to-date'};
  if (!plan.migrations.length) return {ok: false, reason: 'Plan ohne Migrationen'};
  if (plan.migrations.length > 1) return {ok: false, reason: `Mehr als eine offene Migration: ${plan.migrations.join(', ')}`};
  if (plan.migrations[0] !== expect) return {ok: false, reason: `Unerwartete Migration: ${plan.migrations[0]} (erwartet ${expect})`};
  return {ok: true, state: 'expected'};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expect = (process.argv.find(a => a.startsWith('--expect=')) || '').slice(9);
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`FEHLER: Plan-Datei nicht lesbar (${file})`); process.exit(1); }
  const r = decide(text, expect);
  if (!r.ok) { console.error(`FEHLER: ${r.reason}`); process.exit(1); }
  console.log(r.state);
}
