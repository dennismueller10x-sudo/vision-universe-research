// Vertrag expectLive (core/registry/domains.json): eine Datenart, die AN sein soll, darf auf der Seite nicht still DISABLED sein.
// Anlass: Company Intelligence war ab 08.11.2026 17:27 UTC live aus (Fail-closed-Rollback des Refresh 42493495646), ohne Alarm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { checkExpectLive } from "../../scripts/core/expect-live.mjs";

const require = createRequire(import.meta.url);
const Health = require("../health.js");
const registry = JSON.parse(readFileSync(new URL("../registry/domains.json", import.meta.url), "utf8"));
const ci = registry.domains.find((d) => d.id === "companyIntelligence");
const ctx = (target) => ({ now: new Date("2026-11-09T12:00:00Z"), target });

test("EL-1 · Company Intelligence ist als erwartet AN registriert", () => {
  assert.equal(ci.expectLive, true);
  assert.deepEqual(ci.disabledWhen, { path: "state", equals: "DISABLED" });
});

test("EL-2 · auf der Seite: DISABLED trotz expectLive ist FAILED, nicht DISABLED", () => {
  const r = Health.assessDomain(ci, { ok: true, data: { state: "DISABLED" } }, ctx("site"));
  assert.equal(r.status, "FAILED");
  assert.equal(r.reason, "DISABLED_BUT_EXPECTED_LIVE");
});

test("EL-3 · im Repository bleibt der DISABLED-Platzhalter DISABLED (kein Fehlalarm in core-ci)", () => {
  const r = Health.assessDomain(ci, { ok: true, data: { state: "DISABLED" } }, ctx("repository"));
  assert.equal(r.status, "DISABLED");
});

test("EL-4 · ohne expectLive bleibt DISABLED ein Sollzustand", () => {
  const d = { ...ci, expectLive: false };
  assert.equal(Health.assessDomain(d, { ok: true, data: { state: "DISABLED" } }, ctx("site")).status, "DISABLED");
});

test("EL-5 · checkExpectLive: an = ok, aus oder unlesbar = Befund", () => {
  const reg = { domains: [ci] };
  assert.equal(checkExpectLive(reg, { [ci.artifact]: { ok: true, data: { state: "AVAILABLE", companies: 4934 } } }, Health).ok, true);
  const aus = checkExpectLive(reg, { [ci.artifact]: { ok: true, data: { state: "DISABLED" } } }, Health);
  assert.equal(aus.ok, false);
  assert.equal(aus.rows[0].reason, "DISABLED_BUT_EXPECTED_LIVE");
  assert.equal(checkExpectLive(reg, { [ci.artifact]: { ok: false, error: "HTTP 404" } }, Health).ok, false);
});

test("EL-6 · der Freshness-Monitor ruft den Check gegen die Seite auf und wird bei Befund rot", () => {
  const wf = readFileSync(new URL("../../.github/workflows/freshness-monitor.yml", import.meta.url), "utf8");
  assert.match(wf, /node scripts\/core\/expect-live\.mjs --site="\$SITE"/);
  assert.match(wf, /steps\.expect_live\.outcome == 'failure'/);
});
