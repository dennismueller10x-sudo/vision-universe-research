import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const L = require(join(ROOT, "scripts/quant/v10/setup/setup-lib.cjs"));
const Inv = require(join(ROOT, "scripts/quant/v10/setup/setup-original-inventory.cjs"));
const Decision = require(join(ROOT, "scripts/quant/v10/setup/build-setup-independence-decision.cjs"));
const V = require(join(ROOT, "quant/engines/research-validation.cjs"));
const DOCS = join(ROOT, "docs/quant-recovery/v10/setup");
const readDoc = (f) => JSON.parse(readFileSync(join(DOCS, f), "utf8"));

test("NYSE-Kalender: Feiertage, Ersatztage und Reifedaten", () => {
  assert.equal(L.isSession("2027-03-26"), false, "Karfreitag 2027");
  assert.equal(L.isSession("2027-06-18"), false, "Juneteenth 2027 (Sa) -> Fr");
  assert.equal(L.isSession("2027-12-31"), true, "Neujahr 2028 (Sa) ohne Ersatztag");
  assert.equal(L.isSession("2025-01-09"), false, "Sonderschliessung");
  assert.equal(L.easterSunday(2027), "2027-03-28");
  assert.equal(L.nextSession("2026-09-24"), "2026-09-25");
  assert.equal(L.addSessions("2026-09-25", 126), "2027-03-30");
});

test("N_eff-Modell: Grenzfaelle", () => {
  const rho = 0.08, H = 126;
  const sameDay = Array.from({ length: 200 }, (_, i) => ({ t: "T" + i, p: 0 }));
  assert.ok(Math.abs(L.nEff(sameDay, rho, H).nEff - 200 / (1 + 199 * rho)) < 1e-9);
  const apart = Array.from({ length: 5 }, (_, i) => ({ t: "X", p: i * H }));
  assert.ok(Math.abs(L.nEff(apart, rho, H).nEff - 5) < 1e-12);
  assert.ok(Math.abs(L.nEff([{ t: "A", p: 0 }, { t: "A", p: 0 }], rho, H).nEff - 1) < 1e-12);
  assert.equal(L.disjointWindows([0, 10, 126, 130, 300], H), 3);
  assert.equal(L.nonOverlappingBlocks([0, 300], H), 3);
});

test("Ereignisregel identisch mit dem Produkt-Erzeuger", async () => {
  const P = await import(join(ROOT, "scripts/quant/build-setup-outcomes.mjs"));
  const S = ["NO_SETUP", "WATCH", "SETUP_FORMING", "CONFIRMED", "ACTIVE", "UNAVAILABLE"];
  for (const a of S) for (const b of S) assert.equal(Inv.transitionType(a, b), P.transitionType(a, b), a + "->" + b);
});

test("Bestandsaufnahme laeuft nur nach --out und bestaetigt die veroeffentlichten Ereignisse", () => {
  const dir = mkdtempSync(join(tmpdir(), "v10-setup-"));
  try {
    const out = join(dir, "inv.json");
    const r = spawnSync(process.execPath, [join(ROOT, "scripts/quant/v10/setup/setup-original-inventory.cjs"), "--out", out], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(d.events.recomputedEqualsPublished, true);
    assert.equal(d.calendar.check.state, "EXACT_MATCH");
    assert.equal(d.gateCalendar.gates.find((g) => g.gate === "oos").earliest, null);
    assert.equal(d.productionApproved, false);
    assert.equal(d.activeGateChanged, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Rekonstruktion: Registrierung vor Ergebnis, Hashbindung, kein Zertifikat", () => {
  const reg = readDoc("setup-reconstruction-registration-1.0.0.json"), res = readDoc("setup-reconstruction-result-1.0.0.json");
  assert.equal(V.hash(reg.registration), reg.registrationHash);
  assert.equal(res.registrationHash, reg.registrationHash);
  assert.equal(res.inputsSameAsRegistered, true);
  assert.equal(res.evidenceKind, "RECONSTRUCTION");
  assert.equal(res.certificationStatus, "NOT_CERTIFIED");
  assert.equal(res.productionApproved, false);
  assert.equal(res.cells.length, 16);
  assert.ok(res.cells.every((c) => c.multipleTesting && c.multipleTesting.family === 16));
});

test("Rekonstruktion verweigert ein privates Verzeichnis im Repository", () => {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/quant/v10/setup/run-setup-reconstruction.cjs"), "run", "--registration", join(DOCS, "setup-reconstruction-registration-1.0.0.json"),
    "--out", join(tmpdir(), "never.json"), "--private", join(ROOT, "tmp-private")], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY/);
});

test("Entscheidungsvorlage ist nicht aktiviert und Projektion ist monoton begrenzt", () => {
  const d = readDoc("setup-independence-decision-1.0.0.json");
  assert.equal(d.status, "DECISION_TEMPLATE_NOT_APPROVED_NOT_ACTIVATED");
  assert.equal(d.activeGateChanged, false);
  assert.equal(d.productionApproved, false);
  assert.equal(d.recommendation.option, "B");
  // Synthetische Panels: obere Schranke (neue Titel) >= untere Schranke (wiederholte Titel).
  const ev = [];
  for (const [k, day] of ["2026-09-24", "2026-09-25"].entries()) for (let i = 0; i < 30; i++) ev.push(["T" + i, "SETUP_NEW", day]);
  const p = Decision.projection(ev, "SETUP_NEW", 0.08, "2027-12-31");
  const last = p.lower.length - 1;
  assert.ok(p.upper[last].nEff >= p.lower[last].nEff);
  assert.equal(p.upper[1].nEff, p.lower[1].nEff, "beobachtete Panels identisch");
});

test("Python-Gegenrechnung bestaetigt alle Pruefungen", () => {
  const v = readDoc("setup-python-verification-1.0.0.json");
  assert.equal(v.state, "PASS");
  assert.ok(Object.values(v.checks).every(Boolean));
});
