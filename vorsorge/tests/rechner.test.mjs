import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../engines/rechner.js");
const F = require("../engines/funding.js");
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const avd = read("../data/funding-rules/2027-DE.json");
const assumptions = read("../data/steuer-annahmen.json");
const plan = { cost: 0.003, inflation: 0.02, returns: { konservativ: 0.03, basis: 0.05, optimistisch: 0.07 } };
const ctx = { rules: avd, assumptions, plan, referenceYear: 2027, targetAge: 67 };
const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("Steuer-Annahmen: lueckenlose Spannen, Satz je Spanne, als Annahme gekennzeichnet", () => {
  assert.equal(assumptions.kind, "ANNAHME");
  for (let i = 1; i < assumptions.bands.length; i++) assert.equal(assumptions.bands[i].from, assumptions.bands[i - 1].to);
  const rates = assumptions.bands.map((b) => b.marginalRate);
  assert.deepEqual(rates, [...rates].sort((a, b) => a - b), "Grenzsteuersatz steigt mit dem Einkommen");
  assert.ok(rates.every((r) => r > 0 && r <= 0.45));
});

test("150 EUR im Monat: volle Grundzulage 540 EUR, Zulagen folgen der Regeldatei", () => {
  const r = R.calculate({ birthYear: 1985, band: "25-50", children: [], monthly: 150, firstContract: false }, ctx);
  assert.equal(r.ownContribution, 1800);
  assert.equal(r.basicAllowance, 540);
  assert.equal(r.childAllowance, 0);
  close(r.allowanceMonthly, 45);
  const direct = F.altersvorsorgedepot(avd, { ownContribution: 1800, age: 42, children: [], firstContract: false });
  assert.equal(r.basicAllowance, direct.basicAllowance);
});

test("Steuervorteil: (Eigenbeitrag bis Deckel + Zulage) x Grenzsteuersatz - Zulage, nie negativ", () => {
  const t = R.taxBenefit(avd, 1800, 540, 0.30);
  close(t.deductible, 2340);
  close(t.benefit, 2340 * 0.30 - 540);
  assert.equal(R.taxBenefit(avd, 1800, 540, 0.10).benefit, 0, "Guenstigerpruefung: Zulage bleibt, Vorteil nie negativ");
  close(R.taxBenefit(avd, 3000, 540, 0.30).deductible, 2340, 0.01); // Deckel 1.800 EUR
  const r = R.calculate({ birthYear: 1985, band: "50-75", children: [], monthly: 150 }, ctx);
  close(r.totalPerYear, r.allowance + r.taxBenefit);
});

test("Oberhalb der Foerdergrenze waechst die Zulage nicht mehr", () => {
  const a = R.calculate({ birthYear: 1985, band: "25-50", children: [], monthly: 150 }, ctx);
  const b = R.calculate({ birthYear: 1985, band: "25-50", children: [], monthly: 300 }, ctx);
  assert.equal(a.basicAllowance, b.basicAllowance);
  assert.ok(b.wealth > a.wealth);
});

test("Unter Mindestbeitrag keine Zulage; Kinder zaehlen nur mit Kindergeldanspruch (unter 18)", () => {
  const low = R.calculate({ birthYear: 1985, band: "25-50", children: [], monthly: 5 }, ctx);
  assert.equal(low.eligible, false);
  assert.equal(low.allowance, 0);
  assert.ok(low.reason);
  const k = R.calculate({ birthYear: 1985, band: "25-50", children: [{ birthYear: 2008 }, { birthYear: 2015 }], monthly: 150 }, ctx);
  assert.equal(k.children[0].hasChildBenefit, false, "2008 geboren: 2027 volljaehrig");
  assert.equal(k.children[1].hasChildBenefit, true);
  assert.equal(k.childAllowance, 300);
});

test("Berufseinsteigerbonus nur unter 25 und beim ersten Vertrag", () => {
  const young = R.calculate({ birthYear: 2005, band: "bis25", children: [], monthly: 100, firstContract: true }, ctx);
  assert.equal(young.careerStarterBonus, 200);
  const old = R.calculate({ birthYear: 1985, band: "bis25", children: [], monthly: 100, firstContract: true }, ctx);
  assert.equal(old.careerStarterBonus, 0);
});

test("Szenarien: konservativ < Basis < optimistisch, Kurve endet im Basiswert, Spanne stimmt", () => {
  const r = R.calculate({ birthYear: 1985, band: "25-50", children: [], monthly: 150 }, ctx);
  assert.equal(r.years, 25);
  assert.ok(r.scenarios[0].nominal < r.scenarios[1].nominal && r.scenarios[1].nominal < r.scenarios[2].nominal);
  close(r.curve[r.curve.length - 1], r.wealth);
  assert.equal(r.curve.length, r.years + 1);
  assert.deepEqual(r.wealthRange, [r.scenarios[0].nominal, r.scenarios[2].nominal]);
  assert.ok(r.scenarios[1].real < r.scenarios[1].nominal);
});

test("Unbekannte Einkommensspanne: kein erfundener Steuervorteil", () => {
  const r = R.calculate({ birthYear: 1985, band: "gibt-es-nicht", children: [], monthly: 150 }, ctx);
  assert.equal(r.taxBenefit, null);
  assert.equal(r.totalPerYear, r.allowance);
});
