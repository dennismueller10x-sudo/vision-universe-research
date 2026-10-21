// Register bekannter, unveraenderter Datenfehler im Discover-Browser-Gate (browser-qa.mjs, browser-qa-direct.mjs).
//
// WARUM: Ein bekannter Datenfehler (z. B. die Rheinmetall-Kursdaten, separat untersucht) liess das Gate fuer JEDE Aenderung
// an Discover- oder Navigationspfaden rot werden - auch fuer Aenderungen, die mit dem Fehler nichts zu tun haben.
//
// REGEL (eng, nicht pauschal): Ein fehlgeschlagener Ladevorgang gilt nur dann als bekannter Fehler, wenn
//   1. er die eingetragene Route betrifft,
//   2. JEDES seiner Probleme zur eingetragenen Signatur gehoert (die Ursache plus ihre direkten Folgen) und es keine
//      Seitenfehler gibt, und
//   3. der Fingerabdruck ueber die eingetragenen Daten- und Codepfade unveraendert ist (Inhalt jeder Datei, sortiert).
// Aendern sich Daten oder Code im Bereich des Fehlers, greift die Ausnahme nicht mehr: dann zaehlt das Gate wieder streng
// (ein behobener Fehler wird gruen, ein veraenderter Fehler bleibt rot und muss neu bewertet werden).
// Jeder bekannte Fehler bleibt sichtbar: ::warning:: im Lauf, Eintrag im Bericht und in der Zusammenfassung.
import {readFileSync, readdirSync, statSync, existsSync, appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, relative} from 'node:path';

const REGISTER = new URL('./known-defects.json', import.meta.url);

function walk(root, rel, out) {
  const full = join(root, rel);
  if (!existsSync(full)) { out.push(rel + '\0MISSING'); return; }
  if (statSync(full).isDirectory()) { for (const name of readdirSync(full).sort()) walk(root, join(rel, name), out); return; }
  out.push(rel);
}

/* Fingerabdruck: sha256 ueber (Pfad, sha256 des Inhalts) aller Dateien der Pfade, sortiert. Fehlende Pfade gehen mit ein. */
export function fingerprint(paths, root = process.cwd()) {
  const files = [];
  for (const p of [...paths].sort()) walk(root, p, files);
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f + '\n');
    if (!f.endsWith('\0MISSING')) h.update(createHash('sha256').update(readFileSync(join(root, f))).digest('hex') + '\n');
  }
  return h.digest('hex');
}

export function loadRegister(file = REGISTER) {
  return JSON.parse(readFileSync(file, 'utf8')).defects || [];
}

/* Aktive Ausnahmen: nur Eintraege, deren Fingerabdruck dem aktuellen Stand entspricht. */
export function activeDefects({defects = loadRegister(), root = process.cwd()} = {}) {
  return defects.map(d => {
    const current = fingerprint(d.scope, root);
    return {...d, current, active: current === d.fingerprint};
  });
}

/* Gehoert ein Ladevorgang (Route + Probleme + Seitenfehler) vollstaendig zu einem aktiven bekannten Fehler? */
export function matchKnown(defects, route, problems, pageErrors = []) {
  if (!problems || !problems.length || (pageErrors && pageErrors.length)) return null;
  for (const d of defects) {
    if (!d.active || d.route !== route) continue;
    const cause = new RegExp(d.signature.cause), allowed = d.signature.consequences.map(r => new RegExp(r));
    if (!problems.some(p => cause.test(p))) continue;
    if (problems.every(p => cause.test(p) || allowed.some(r => r.test(p)))) return d;
  }
  return null;
}

/* Sammelt bekannte Treffer fuer den Bericht und macht sie im Lauf sichtbar. */
export function createRecorder(defects) {
  const seen = new Map();
  return {
    defects,
    absorb(route, problems, pageErrors) {
      const d = matchKnown(defects, route, problems, pageErrors);
      if (!d) return false;
      seen.set(d.id, (seen.get(d.id) || 0) + 1);
      return true;
    },
    summary() {
      return defects.map(d => ({id: d.id, issue: d.issue, route: d.route, active: d.active, absorbedLoads: seen.get(d.id) || 0,
        fingerprint: {registered: d.fingerprint, current: d.current}}));
    },
    report(context) {
      for (const d of defects) {
        const n = seen.get(d.id) || 0;
        if (!d.active) console.log(`::notice::Bekannter Fehler ${d.id} (${d.issue}) greift nicht: Daten oder Code im Bereich haben sich geaendert (Fingerabdruck ${d.current.slice(0, 12)} statt ${d.fingerprint.slice(0, 12)}). Das Gate prueft diese Route wieder streng.`);
        else if (n) console.log(`::warning::${context}: bekannter, unveraenderter Fehler ${d.id} (${d.issue}) in ${n} Ladevorgaengen von ${d.route} - weiterhin offen: ${d.title}`);
      }
      if (process.env.GITHUB_STEP_SUMMARY) {
        const rows = defects.map(d => `| ${d.id} | ${d.issue} | ${d.route} | ${d.active ? 'ja' : 'nein (Bereich geaendert)'} | ${seen.get(d.id) || 0} |`);
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Bekannte Datenfehler – ${context}\n\n| Fehler | Vorgang | Route | Ausnahme aktiv | betroffene Ladevorgaenge |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
      }
    }
  };
}
