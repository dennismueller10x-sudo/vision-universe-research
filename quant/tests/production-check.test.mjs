/* Taeglicher Quant-Produktionscheck (Strang AK): reine Bewertung ohne Netz und ohne Browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTEN, SCHWELLEN, bewerteDaten, bewerteRoute } from "../../scripts/quant/production-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("PCK-1 · Datenarten: FAILED/STALE sind Befund, DEGRADED/UNKNOWN nur Hinweis, Fremdes bleibt draussen", () => {
  const report = { domains: [
    { id: "a", label: "A", artifact: "/quant/data/a.json", status: "OK" },
    { id: "b", label: "B", artifact: "/quant/data/b.json", status: "STALE", reason: "OLDER_THAN_72H", warnings: [] },
    { id: "c", label: "C", artifact: "/quant/data/c.json", status: "FAILED", reason: "ARTIFACT_UNREADABLE" },
    { id: "d", label: "D", artifact: "/quant/data/d.json", status: "DEGRADED" },
    { id: "e", label: "E", artifact: "/quant/data/e.json", status: "UNKNOWN" },
    { id: "f", label: "F", artifact: "/quant/data/f.json", status: "DISABLED" },
    { id: "n", label: "News", artifact: "/dashboard/data/news_feed.json", status: "FAILED" }
  ] };
  const r = bewerteDaten(report);
  assert.equal(r.rows.length, 6);
  assert.equal(r.befunde.length, 2);
  assert.match(r.befunde.join("\n"), /B .*STALE/);
  assert.match(r.befunde.join("\n"), /C .*FAILED/);
  assert.equal(r.hinweise.length, 2);
});

test("PCK-2 · Route: gesund = kein Befund; JS-Fehler, 404, leere Seite, fehlender Kurs und Haenger sind Befunde", () => {
  const gut = { fehler: [], readyMs: 2500, text: 4000, bereit: true, preisGesehen: true };
  assert.deepEqual(bewerteRoute({ preis: true }, gut), { befunde: [], hinweise: [] });
  assert.equal(bewerteRoute({}, { ...gut, fehler: ["JS-Fehler: x"] }).befunde.length, 1);
  const vt = bewerteRoute({}, { ...gut, fehler: ["JS-Fehler: Transition was aborted because of invalid state. ViewTransition opt-in disabled"] });
  assert.equal(vt.befunde.length, 0); assert.equal(vt.hinweise.length, 1);
  assert.match(bewerteRoute({}, { ...gut, fehler: ["HTTP 404 /quant/app/x.js"] }).befunde[0], /404/);
  assert.match(bewerteRoute({}, { ...gut, text: 10 }).befunde[0], /kaum Inhalt/);
  assert.match(bewerteRoute({ preis: true }, { ...gut, preisGesehen: false }).befunde[0], /kein Kurs/);
  assert.match(bewerteRoute({}, { ...gut, bereit: false, readyMs: 45000, text: 0 }).befunde[0], /nicht bereit/);
  const langsam = bewerteRoute({}, { ...gut, readyMs: SCHWELLEN.bereitWarnMs + 1 });
  assert.equal(langsam.befunde.length, 0); assert.equal(langsam.hinweise.length, 1);
  assert.equal(bewerteRoute({}, { ...gut, readyMs: SCHWELLEN.bereitFehlerMs + 1 }).befunde.length, 1);
});

test("PCK-3 · Routenliste deckt die Menue-Eintraege aus module.json und die Forschung (nur lesen) ab", () => {
  const mod = JSON.parse(readFileSync(join(ROOT, "products/quant/module.json"), "utf8"));
  const pfade = new Set(ROUTEN.map((r) => r.pfad));
  for (const [, href] of mod.navigation.entries) assert.ok(pfade.has(href) || href === "/quant/#/aktien" || href === "/quant/#/strategien" || [...pfade].some((p) => href.startsWith(p.replace(/\/NVDA.*$/, "/"))), "Menue-Eintrag ohne Pruefung: " + href);
  assert.ok(pfade.has("/quant/#/forschung"));
  assert.equal(new Set(ROUTEN.map((r) => r.pfad)).size, ROUTEN.length);
});

test("PCK-4 · Workflow: nur lesen ausser dem Alarm-Job, kein Cron, Eingaben ueber env, Zeitplan im Register", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/quant-produktionscheck.yml"), "utf8");
  assert.match(wf, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(wf.replace(/^\s*#.*$/gm, ""), /\n\s+schedule:/);
  assert.doesNotMatch(wf, /run:[^\n]*\$\{\{\s*inputs\./);
  assert.match(wf, /concurrency:\n\s+group: quant-produktionscheck-\$\{\{ github\.ref_name \}\}/);
  const reg = JSON.parse(readFileSync(join(ROOT, "core/registry/schedule.json"), "utf8"));
  assert.ok(reg.entries.some((e) => e.workflow === "quant-produktionscheck.yml" && e.timer === "waker"));
});
