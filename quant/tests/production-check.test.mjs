/* Taeglicher Quant-Produktionscheck (Strang AK): reine Bewertung ohne Netz und ohne Browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTEN, SCHWELLEN, bewerteDaten, bewerteRoute, pruefeBudget, ladeBudget } from "../../scripts/quant/production-check.mjs";

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
  /* 13.11.2026: "name: ...: ..." ist kein gueltiges YAML, GitHub startete die Datei dann bei jedem Push als leeren Fehlerlauf. */
  assert.match(wf.split("\n")[0], /^name: [^:]+$/);
  assert.match(wf, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(wf.replace(/^\s*#.*$/gm, ""), /\n\s+schedule:/);
  assert.doesNotMatch(wf, /run:[^\n]*\$\{\{\s*inputs\./);
  assert.match(wf, /concurrency:\n\s+group: quant-produktionscheck-\$\{\{ github\.ref_name \}\}/);
  const reg = JSON.parse(readFileSync(join(ROOT, "core/registry/schedule.json"), "utf8"));
  assert.ok(reg.entries.some((e) => e.workflow === "quant-produktionscheck.yml" && e.timer === "waker"));
});

test("PCK-5 · Jeder Menue-Eintrag von Quant (module.json) steht in den Ansichten des Release-Smoke", () => {
  const mod = JSON.parse(readFileSync(join(ROOT, "products/quant/module.json"), "utf8"));
  const smoke = readFileSync(join(ROOT, "scripts/vu2/production-smoke.mjs"), "utf8");
  for (const [, raw] of mod.navigation.entries) {
    const href = raw === "/quant/" ? "/quant/#/" : raw; /* die Startseite heisst im Smoke /quant/#/ */
    assert.ok(smoke.includes("'" + href + "'"), "Menue-Eintrag fehlt im Release-Smoke (scripts/vu2/production-smoke.mjs VIEWS): " + href);
  }
});

test("PCK-6 · Pages-Deploy wartet und versucht es einmal erneut, wenn ein anderes Deployment noch lief (Lauf 43296967376)", () => {
  const wf = readFileSync(join(ROOT, ".github/workflows/pages-release.yml"), "utf8");
  for (const job of ["deploy", "deploy-schnell"]) {
    const i = wf.indexOf("\n  " + job + ":\n");
    assert.ok(i > 0, job);
    const block = wf.slice(i, wf.indexOf("\n  # ===", i + 10) > 0 ? i + 3000 : i + 3000);
    assert.match(block, /id: deployment\n\s+uses: actions\/deploy-pages@v4\n\s+continue-on-error: true/, job + ": erster Versuch muss continue-on-error sein");
    assert.match(block, /steps\.deployment\.outcome == 'failure'\n\s+run: sleep 120/, job + ": Wartezeit fehlt");
    assert.match(block, /id: deployment2\n\s+if: steps\.deployment\.outcome == 'failure'\n\s+uses: actions\/deploy-pages@v4/, job + ": zweiter Versuch fehlt");
    assert.match(block, /url: \$\{\{ steps\.deployment2\.outputs\.page_url \|\| steps\.deployment\.outputs\.page_url \}\}/, job + ": URL aus beiden Versuchen");
  }
});

test("PCK-7 · Datenstand-Abnahme: Schalter im Test, Abnahmewert in der Konfig, taeglicher Job mit Alarm", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "quant/config/product-universe-acceptance.json"), "utf8"));
  assert.equal(cfg.schema, "vu-product-universe-acceptance-1");
  for (const k of ["PRODUCT_TITLES", "HISTORICAL_CHART_AVAILABLE", "TECHNICAL_HISTORY_ELIGIBLE"]) {
    assert.ok(Number.isInteger(cfg.abgenommen[k]) && Number.isInteger(cfg.aktuellerPolicyStand[k]), k);
    assert.ok(cfg.aktuellerPolicyStand[k] <= cfg.abgenommen.PRODUCT_TITLES, k);
  }
  const py = readFileSync(join(ROOT, "scripts/quant/tests/test_canonical_market.py"), "utf8");
  assert.doesNotMatch(py, /^(ABGENOMMEN|AKTUELLER_POLICY_STAND) = \{\n\s+"PRODUCT_TITLES": 63/m, "keine festen Live-Zahlen mehr im Test");
  assert.equal((py.match(/@nur_datenstand/g) || []).length, 7);
  const wf = readFileSync(join(ROOT, ".github/workflows/quant-produktionscheck.yml"), "utf8");
  assert.match(wf, /\n  abnahme:\n/);
  assert.match(wf, /VU_DATENSTAND_ABNAHME: '1'/);
  assert.match(wf, /node --test quant\/tests\/v10-population\.test\.mjs/);
  assert.match(readFileSync(join(ROOT, "quant/tests/v10-population.test.mjs"), "utf8"), /skip:DATENSTAND_ABNAHME\?false:/);
  assert.match(wf, /needs: \[check, abnahme\]/);
  assert.match(wf, /RESULT_ABNAHME: \$\{\{ needs\.abnahme\.result \}\}/);
});

test("PCK-8 · Frontend-Budget: jede gepruefte Route hat eine Grenze, Ueberschreitung ist Befund, gesunde Messung nicht", () => {
  const budget = ladeBudget();
  assert.equal(budget.schema, "vu-quant-frontend-budget-1");
  for (const r of ROUTEN) {
    const b = budget.routen[r.pfad];
    assert.ok(b, "Route ohne Budget: " + r.pfad);
    assert.ok(b.maxKb >= b.gemessenKb && b.maxRequests >= b.gemessenRequests, r.pfad);
    assert.ok(b.maxKb <= b.gemessenKb * 1.3, "Puffer zu gross, nichts wuerde auffallen: " + r.pfad);
  }
  const pfad = "/quant/#/aktie/NVDA", b = budget.routen[pfad];
  assert.deepEqual(pruefeBudget(pfad, { kb: b.gemessenKb, requests: b.gemessenRequests, readyMs: 1200 }, budget), []);
  assert.match(pruefeBudget(pfad, { kb: b.maxKb + 1, requests: b.gemessenRequests, readyMs: 1200 }, budget)[0], /Budget: \d+ KB/);
  assert.match(pruefeBudget(pfad, { kb: 1, requests: b.maxRequests + 1, readyMs: 1200 }, budget)[0], /Anfragen/);
  assert.match(pruefeBudget(pfad, { kb: 1, requests: 1, readyMs: budget.maxBereitMs + 1 }, budget)[0], /bereit nach/);
  assert.deepEqual(pruefeBudget("/quant/#/unbekannt", { kb: 99999, requests: 999, readyMs: 1 }, budget), []);
});
