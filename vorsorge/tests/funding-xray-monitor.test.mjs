import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("../engines/funding.js");
const X = require("../engines/xray.js");
const Mo = require("../engines/monitor.js");
const M = require("../engines/vorsorge-math.js");
const dir = new URL("../data/funding-rules/", import.meta.url);
const rules = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const avd = rules.find((r) => r.ruleId === "DE-ALTERSVORSORGEDEPOT");
const ri = rules.find((r) => r.ruleId === "DE-RIESTER");
const fr = rules.find((r) => r.ruleId === "DE-FRUEHSTART");

test("Alle Regeldateien sind gueltig und haben Quelle, Version, Gueltigkeit", () => {
  for (const r of rules) assert.deepEqual(F.validateRules(r), [], r.ruleId);
  assert.ok(F.validateRules({ ruleId: "x" }).length > 0);
});

test("selectRule waehlt nach Stichtag", () => {
  assert.equal(F.selectRule(rules, "DE-ALTERSVORSORGEDEPOT", "2026-06-01"), null);
  assert.equal(F.selectRule(rules, "DE-ALTERSVORSORGEDEPOT", "2027-02-01").ruleVersion, avd.ruleVersion);
  assert.ok(F.selectRule(rules, "DE-RIESTER", "2027-02-01"), "Bestandsverträge laufen nach § 52 Abs. 50a weiter");
  assert.ok(F.selectRule(rules, "DE-RIESTER", "2026-06-01"));
});

test("Altersvorsorgedepot: Zulagen folgen ausschliesslich der Regeldatei", () => {
  const t = avd.incomeRules.basicAllowance.tiers;
  const max = avd.contributionRules.maximumSubsidizedOwnContribution;
  const r = F.altersvorsorgedepot(avd, { ownContribution: max });
  assert.equal(r.basicAllowance, Math.min(avd.incomeRules.basicAllowance.maximum, F.tiered(max, t)));
  const r2 = F.altersvorsorgedepot(avd, { ownContribution: max * 3 });
  assert.equal(r2.basicAllowance, r.basicAllowance, "ueber dem Hoechstbeitrag keine weitere Zulage");
  const below = F.altersvorsorgedepot(avd, { ownContribution: avd.contributionRules.minimumAnnualOwnContribution - 1 });
  assert.equal(below.eligible, false); assert.equal(below.total, 0);
  const kids = F.altersvorsorgedepot(avd, { ownContribution: 1200, children: [{ hasChildBenefit: true }, { hasChildBenefit: false }] });
  assert.equal(kids.childAllowance, avd.childRules.perChild.maximum);
  const young = F.altersvorsorgedepot(avd, { ownContribution: 600, age: 22, firstContract: true });
  assert.equal(young.careerStarterBonus, avd.bonusRules.careerStarter.amount);
  assert.equal(young.rule.ruleVersion, avd.ruleVersion);
});

test("Riester: Kuerzung bei zu geringem Eigenbeitrag", () => {
  const full = F.riester(ri, { ownContribution: 2000, previousYearIncome: 40000, children: [{ bornYear: 2012 }] });
  assert.equal(full.allowanceRatio, 1);
  assert.equal(full.basicAllowance, ri.incomeRules.basicAllowance.fixed);
  assert.equal(full.childAllowance, ri.childRules.bornFrom2008);
  const cut = F.riester(ri, { ownContribution: 500, previousYearIncome: 40000 });
  assert.ok(cut.allowanceRatio < 1 && cut.reducedBecause);
  const tax = F.riester(ri, { ownContribution: 1925, previousYearIncome: 60000, marginalTaxRate: 0.42 });
  assert.ok(tax.additionalTaxBenefit > 0);
});

test("Fruehstart: Jahre und Summe aus der Regel", () => {
  const r = F.fruehstart(fr, { childAge: 2, referenceYear: 2027 });
  assert.equal(r.startAge, fr.childRules.fromAge);
  assert.equal(r.total, (fr.childRules.untilAgeExclusive - fr.childRules.fromAge) * 12 * fr.childRules.stateContributionMonthly);
  assert.equal(F.fruehstart(fr, { childAge: 20 }).years, 0);
  const path = F.childWealthPath(fr, { childAge: 2, referenceYear: 2027, parentMonthly: 25, annualReturn: 0.05, annualCost: 0.002 });
  assert.ok(path.path[18].value < path.path[30].value && path.path[30].value < path.path[67].value);
  assert.equal(path.path[18].state, r.total);
  // Gesetzentwurf: Kinder vor Geburtsjahrgang 2020 erhalten keine staatliche Einzahlung
  const old = F.fruehstart(fr, { childAge: 10, referenceYear: 2027 });
  assert.equal(old.eligible, false); assert.equal(old.total, 0); assert.match(old.reason, /2020/);
  assert.equal(F.childWealthPath(fr, { childAge: 10, referenceYear: 2027, parentMonthly: 0, annualReturn: 0.05 }).path[18].state, 0);
});

test("Overlap: gewichteter Overlap, gemeinsame Holdings; ohne Daten DATA_PENDING", () => {
  const a = { asOf: "2026-09-30", holdings: [{ id: "NVDA", name: "NVIDIA", weight: 0.07 }, { id: "AAPL", name: "Apple", weight: 0.06 }, { id: "X", name: "X", weight: 0.87 }] };
  const b = { asOf: "2026-09-30", holdings: [{ id: "NVDA", name: "NVIDIA", weight: 0.10 }, { id: "AAPL", name: "Apple", weight: 0.02 }, { id: "Y", name: "Y", weight: 0.88 }] };
  const o = X.overlap(a, b);
  assert.equal(o.status, "CALCULATED"); assert.ok(Math.abs(o.value - 0.09) < 1e-12); assert.equal(o.commonCount, 2); assert.equal(o.top[0].name, "NVIDIA");
  assert.equal(X.overlap(a, null).status, "DATA_PENDING");
  assert.equal(X.overlap(a, { holdings: [] }).value, null);
});

test("Durchschau: 'Du besitzt NVIDIA indirekt ueber drei ETFs'", () => {
  const h = (w) => ({ holdings: [{ id: "NVDA", name: "NVIDIA", weight: w, country: "US", sector: "Tech" }, { id: "O", name: "Other", weight: 1 - w, country: "DE" }] });
  const lt = X.lookThrough([{ symbol: "A", weight: 1 }, { symbol: "B", weight: 1 }, { symbol: "C", weight: 2 }], { A: h(0.05), B: h(0.1), C: h(0.2) });
  assert.equal(lt.status, "CALCULATED");
  const nv = lt.multiplyHeld.find((m) => m.name === "NVIDIA");
  assert.equal(nv.via.length, 3); assert.match(nv.text, /indirekt über 3 ETFs/);
  assert.ok(Math.abs(nv.weight - (0.25 * 0.05 + 0.25 * 0.1 + 0.5 * 0.2)) < 1e-12);
  const partial = X.lookThrough([{ symbol: "A", weight: 1 }, { symbol: "Z", weight: 1 }], { A: h(0.05) });
  assert.equal(partial.status, "PARTIAL"); assert.equal(partial.coverage, 0.5);
  assert.equal(X.lookThrough([{ symbol: "Z", weight: 1 }], {}).status, "DATA_PENDING");
});

test("Portfolio-X-Ray: Gruppen, Waehrung, Konzentration, komplexe Positionen", () => {
  const etf = { A: { assetClass: "EQUITY", region: "GLOBAL", currency: "USD" }, B: { assetClass: "BOND", region: null, currency: "EUR", complex: true } };
  const pts = (k) => Array.from({ length: 60 }, (_, i) => [new Date(Date.UTC(2025, 0, 1 + i * 7)).toISOString().slice(0, 10), 100 + k * i]);
  const x = X.portfolioXRay([{ symbol: "A", weight: 60 }, { symbol: "B", weight: 40 }], etf, { A: pts(1), B: pts(0.2) }, { baseCurrency: "EUR" });
  assert.equal(x.assetClasses[0].key, "EQUITY"); assert.ok(Math.abs(x.assetClasses[0].weight - 0.6) < 1e-12);
  assert.ok(x.regions.some((r) => r.key === "UNKNOWN"));
  assert.ok(Math.abs(x.fxExposure.share - 0.6) < 1e-12);
  assert.deepEqual(x.complexPositions, ["B"]);
  assert.ok(Math.abs(x.concentration.hhi - 0.52) < 1e-12);
  assert.equal(x.series.status, "CALCULATED");
});

test("Szenario-Lab: Aktien -20 %, Hebel, fehlende Datenbasis", () => {
  const etf = { A: { assetClass: "EQUITY", currency: "USD", leverage: 1 }, L: { assetClass: "EQUITY", leverage: 2, inverse: true }, B: { assetClass: "BOND" } };
  const s = X.SCENARIOS.find((x) => x.id === "aktien-20");
  const r = X.applyScenario(s, [{ symbol: "A", weight: 50 }, { symbol: "B", weight: 50 }], etf);
  assert.ok(Math.abs(r.impact + 0.10) < 1e-12);
  const lev = X.applyScenario(s, [{ symbol: "L", weight: 1 }], etf);
  assert.ok(Math.abs(lev.impact - 0.40) < 1e-12, "2x short gewinnt bei -20 %");
  assert.equal(X.applyScenario(X.SCENARIOS.find((x) => x.id === "zinsen+2"), [{ symbol: "B", weight: 1 }], etf).status, "DATA_PENDING");
  assert.equal(X.applyScenario(X.SCENARIOS.find((x) => x.id === "tech-30"), [{ symbol: "A", weight: 1 }], etf).impact, null);
});

test("What changed: Namensaenderung, Delisting, neue und entfernte Listings", () => {
  const prev = { etfs: [{ listingId: "a", symbol: "A", name: "Old", status: "ACTIVE", index: null }, { listingId: "b", symbol: "B", name: "B", status: "ACTIVE" }, { listingId: "c", symbol: "C", name: "C", status: "ACTIVE" }] };
  const next = { etfs: [{ listingId: "a", symbol: "A", name: "New", status: "ACTIVE", index: null }, { listingId: "b", symbol: "B", name: "B", status: "INACTIVE" }, { listingId: "d", symbol: "D", name: "D", status: "ACTIVE" }] };
  const d = Mo.diffMasters(prev, next, "2026-10-02");
  const types = d.events.map((e) => e.type).sort();
  assert.deepEqual(types, ["CLOSED_OR_DELISTED", "NAME_CHANGE", "NEW_LISTING", "REMOVED"]);
  assert.ok(d.unmonitored.some((u) => u.type === "TER_CHANGE"));
  assert.equal(Mo.diffMasters(null, next).events.length, 0, "Erstlauf meldet keine 'neuen' Listings");
});

test("Monitor: Ampel und Plan-Diff", () => {
  assert.equal(Mo.onTrack(1.05).state, "ON_TRACK"); assert.equal(Mo.onTrack(0.85).state, "CLOSE"); assert.equal(Mo.onTrack(0.2).state, "OFF_TRACK"); assert.equal(Mo.onTrack(null).state, "UNKNOWN");
  const p1 = M.plan({ age: 30, monthly: 200, desiredIncome: 2500, existingIncome: 1500 });
  const p2 = M.plan({ age: 30, monthly: 300, desiredIncome: 2500, existingIncome: 1500 });
  const diff = Mo.diffPlan(Mo.snapshotPlan(p1, []), Mo.snapshotPlan(p2, []));
  assert.ok(diff.some((d) => d.type === "GOAL_ATTAINMENT")); assert.ok(diff.some((d) => d.type === "SAVINGS_RATE"));
});

test("Riester-Analyse: zwei Szenarien, keine Empfehlung", () => {
  const r = Mo.riesterComparison({ contractValue: 15000, ownMonthly: 100, allowanceYearly: 175, years: 20, keepReturn: 0.02, keepCost: 0.015,
    newReturn: 0.05, newCost: 0.004, newAllowanceYearly: 175, switchCost: 500, guaranteedValue: 30000 }, M);
  assert.ok(r.keep.endValue > 0 && r.realign.endValue > 0);
  assert.equal(r.realign.startAfterCosts, 14500);
  assert.ok(r.breakEvenNote);
  assert.ok(!("recommendation" in r));
});


test("Förderregeln 2027: primär verifiziert, Prüfsumme, Fundstellen, gesetzliche Werte", () => {
  assert.equal(avd.verification.primaryVerified, true);
  assert.ok(avd.primarySource && /bgbl/.test(avd.primarySource.url) && avd.primarySource.sha256);
  assert.equal(avd.ruleHash, F.ruleHash(avd));
  for (const k of ["incomeRules.basicAllowance", "childRules.perChild", "contributionRules.minimumAnnualOwnContribution", "bonusRules.careerStarter", "productRules.standardDepotCostCap"]) assert.ok(avd.verification.fields[k], k);
  const max = F.altersvorsorgedepot(avd, { ownContribution: 1800 });
  assert.equal(max.basicAllowance, 540, "§ 84: 0,5 × 360 + 0,25 × 1 440");
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 360 }).basicAllowance, 180);
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 120 }).basicAllowance, 60);
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 119 }).total, 0, "§ 86: Mindesteigenbeitrag 120 €");
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 1800, indirectSpouse: true }).basicAllowance, 175, "§ 84 Satz 3");
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 200, children: [{ hasChildBenefit: true }] }).childAllowance, 200, "§ 85: 100 %");
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 1800, children: [{ hasChildBenefit: true }] }).childAllowance, 300, "§ 85: höchstens 300 €");
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 1200, age: 24, firstContract: true }).careerStarterBonus, 200);
  assert.equal(F.altersvorsorgedepot(avd, { ownContribution: 1200, age: 25, firstContract: true }).careerStarterBonus, 0, "25. Lebensjahr vollendet");
  assert.equal(avd.productRules.standardDepotCostCap, 0.01);
});

test("Regeldateien: Manipulation ohne neue Version fällt über die Prüfsumme auf", () => {
  const t = JSON.parse(JSON.stringify(avd));
  t.incomeRules.basicAllowance.tiers[0].rate = 0.6;
  assert.ok(F.validateRules(t).includes("RULE_HASH_MISMATCH"));
  const u = JSON.parse(JSON.stringify(fr)); u.verification.primaryVerified = true; delete u.primarySource;
  assert.ok(F.validateRules(u).includes("PRIMARY_VERIFIED_WITHOUT_PRIMARY_SOURCE"));
});

test("Frühstart bleibt Entwurf: primaryVerified false, Status GESETZENTWURF", () => {
  assert.equal(fr.verification.primaryVerified, false);
  assert.equal(fr.legalStatus, "GESETZENTWURF");
});

test("Holdings-Vertrag v2 und Provider-Mapping-Vertrag", () => {
  const P = require("../engines/etf-provider.js");
  assert.deepEqual(X.validateHoldingsFile({ asOf: "2026-09-30", source: "issuer", holdings: [{ name: "NVIDIA", weight: 0.07, holdingIdentifier: "US67066G1040" }] }), []);
  assert.ok(X.validateHoldingsFile({ holdings: [{ weight: 2 }] }).length >= 3);
  assert.deepEqual(P.validateMapped({ isin: "IE00B4L5Y983", ter: 0.002, distributionPolicy: "ACCUMULATING" }), []);
  assert.ok(P.validateMapped({ ter: 0.5 }).includes("MISSING_isin"));
  assert.equal(P.STATUS_MATRIX.tiingo.holdings, "NOT_AVAILABLE");
});

test("Portfolio-X-Ray: Datenzustand PRICE_ONLY ohne Holdings, FULL mit Holdings", () => {
  const pts = Array.from({ length: 40 }, (_, i) => [new Date(Date.UTC(2025, 0, 1 + i * 7)).toISOString().slice(0, 10), 100 + i]);
  const x = X.portfolioXRay([{ symbol: "A", weight: 1 }], { A: {} }, { A: pts }, {});
  assert.equal(x.dataState, "PRICE_ONLY_DATA");
  const h = { asOf: "x", source: "y", holdings: [{ name: "N", weight: 1 }] };
  assert.equal(X.portfolioXRay([{ symbol: "A", weight: 1 }], { A: {} }, { A: pts }, { holdingsBySymbol: { A: h } }).dataState, "FULL_DATA");
  const o = X.overlap({ holdings: [{ id: "a", name: "a", weight: 0.5 }, { id: "b", name: "b", weight: 0.5 }] }, { holdings: [{ id: "a", name: "a", weight: 0.2 }, { id: "c", name: "c", weight: 0.8 }] });
  assert.ok(Math.abs(o.simpleOverlap - 1 / 3) < 1e-12); assert.ok(Math.abs(o.weightedOverlap - 0.2) < 1e-12);
});

test("Monitor: Kategorien und Sammelmeldung bei Massen-Neuaufnahme", () => {
  const next = { etfs: Array.from({ length: 80 }, (_, i) => ({ listingId: "n" + i, symbol: "N" + i, name: "n", status: "ACTIVE" })) };
  const d = Mo.diffMasters({ etfs: [] }, next, "2026-10-02");
  assert.equal(d.events.length, 1); assert.equal(d.events[0].count, 80); assert.equal(d.events[0].category, "PRODUCT_CHANGE");
  const v = Mo.diffMasters({ etfs: [{ listingId: "a", symbol: "A", name: "A", status: "ACTIVE", vol: 0.1 }] }, { etfs: [{ listingId: "a", symbol: "A", name: "A", status: "ACTIVE", vol: 0.2 }] }, "x");
  assert.equal(v.events[0].type, "VOLATILITY_CHANGE"); assert.equal(v.events[0].category, "MARKET_CHANGE");
  const p1 = M.plan({ age: 30, monthly: 200 });
  const diff = Mo.diffPlan(Mo.snapshotPlan(p1, [], "a", { ruleVersions: { R: "1" }, dataAsOf: "2026-09-01" }), Mo.snapshotPlan(p1, [], "b", { ruleVersions: { R: "2" }, dataAsOf: "2026-10-01" }));
  assert.ok(diff.some((e) => e.category === "REGULATORY_CHANGE")); assert.ok(diff.some((e) => e.category === "DATA_UPDATE"));
});
