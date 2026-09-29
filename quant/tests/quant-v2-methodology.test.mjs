import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Methodology = require("../engines/methodology.js");
const Contract = require("../engines/quant-methodology-contract.js");
const v1 = require("../methodology/quant-v1.json");
const v2 = require("../methodology/quant-v2.json");

test("Quant V2 is the exact seven-factor constitution and passes its contract", () => {
  assert.deepEqual(Contract.validate(v2), { ok: true, errors: [] });
  assert.deepEqual(v2.factorOrder, Contract.FACTORS);
  assert.deepEqual(v2.factorWeights, Contract.WEIGHTS);
});

test("Quant V2 remains fail-closed until every factor and evidence gate is ready", () => {
  assert.equal(v2.status, "SPECIFIED_NOT_ACTIVE");
  assert.equal(v2.effectiveFrom, null);
  assert.equal(v2.publication.allowed, false);
  assert.equal(v2.publication.fullScoreRequiresEveryFactor, true);
  assert.equal(v2.publication.missingFactorWeightRedistribution, false);
  assert.equal(v2.factors.revisions.readiness, "BLOCKED_EXTERNAL");
});

test("Quant V1 remains the active immutable legacy runtime", () => {
  assert.equal(Methodology.quant().methodologyVersion, "quant-v1.0.0");
  assert.equal(Methodology.quantV2().methodologyVersion, "quant-v2.2.0");
  assert.equal(Methodology.quantV2().modelProfileId, "quant-v2.2.0-full-7f");
  assert.equal(v1.methodologyVersion, "quant-v1.0.0");
  assert.equal(v1.factorWeights.quality, 0.30);
  assert.equal(v1.factors.profitability, undefined);
});

test("no component is owned by two V2 factors", () => {
  const ids = Object.values(v2.factors).flatMap((factor) => factor.components.map((component) => component.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("Quant V2 binds peer levels to current SIC taxonomy without historical inference", () => {
  const binding = v2.normalization.classificationBinding;
  assert.deepEqual([binding.industry, binding.sector, binding.universe], ["sic4_industry", "sic_division", "universe"]);
  assert.equal(binding.scope, "CURRENT_ONLY");
  assert.equal(binding.historicalPolicy, "FAIL_CLOSED");
});

/* ---------------------------------------------------------------------------
   BRANCHENVORLAGEN

   Eine Vorlage ist der bequemste Ort fuer eine stille Absenkung: sie oeffnet
   einen Faktor dort, wo vorher NOT_APPLICABLE stand, und niemand vermisst
   einen Wert, den es nie gab. Diese Tests halten deshalb nicht nur fest, DASS
   die Vorlagen da sind, sondern dass der Vertrag jede Aufweichung ablehnt.
   --------------------------------------------------------------------------- */
test("jede Branchenvorlage traegt eine eigene Fassung, drei Faktoren und Gewichte auf eins", () => {
  for (const templateId of Contract.TEMPLATES) {
    const template = v2.industryTemplates[templateId];
    assert.ok(template, templateId + " fehlt im Vertrag");
    assert.match(template.version, /^quant-v2-[a-z-]+-\d+\.\d+\.\d+$/);
    assert.ok(template.appliesTo, templateId + " nennt keinen Geltungsbereich");
    for (const factorId of Contract.TEMPLATE_FACTORS) {
      const factor = template.factors[factorId];
      assert.ok(factor, templateId + ":" + factorId + " fehlt");
      const sum = factor.components.reduce((total, component) => total + component.weight, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, templateId + ":" + factorId + " Gewichte " + sum);
      assert.ok(factor.components.length >= 3);
      /* Jede Komponente nennt ihre Formel und ihr Fenster - sonst ist sie
         eine Zahl ohne Herkunft. */
      for (const component of factor.components) {
        assert.ok(component.input && component.window, templateId + ":" + component.id);
      }
      assert.equal(factor.minimumDataRequirements.minimumComponents, 3);
      assert.equal(factor.minimumDataRequirements.minimumOriginalWeight, 0.6);
    }
  }
});

test("keine Vorlage verspricht eine Groesse, die die Exporte nicht tragen", () => {
  const ids = Contract.TEMPLATES.flatMap((templateId) =>
    Contract.TEMPLATE_FACTORS.flatMap((factorId) =>
      v2.industryTemplates[templateId].factors[factorId].components.map((component) => component.id)));
  /* FFO und AFFO brauchen die Gewinne aus Immobilienverkaeufen, die
     Kombinierte Schadenquote braucht Schaeden und Betriebskosten - beides
     steht nicht in den Exporten. Eine Komponente, die so heisst, waere eine
     Umdeutung. */
  for (const verboten of ["ffo", "affo", "combinedRatio", "lossRatio", "expenseRatio", "nim", "netInterestMargin"]) {
    assert.ok(!ids.some((id) => id.toLowerCase().includes(verboten.toLowerCase())),
      "Vorlagenkomponente heisst wie eine nicht ableitbare Groesse: " + verboten);
  }
  assert.match(v2.industryTemplates.REAL_ESTATE_TRUST.notComputable, /FFO/);
  assert.match(v2.industryTemplates.INSURANCE_CARRIER.notComputable, /combined ratio/i);
});

test("der Vertrag lehnt eine abgesenkte oder unvollstaendige Vorlage ab", () => {
  const abgesenkt = structuredClone(v2);
  abgesenkt.industryTemplates.BALANCE_SHEET_FINANCIAL.factors.quality.minimumDataRequirements.minimumOriginalWeight = 0.3;
  assert.ok(Contract.validate(abgesenkt).errors.includes("TEMPLATE_MINIMUM:BALANCE_SHEET_FINANCIAL:quality"));

  const ohnePflicht = structuredClone(v2);
  ohnePflicht.industryTemplates.REAL_ESTATE_TRUST.factors.value.mandatory = [];
  assert.ok(Contract.validate(ohnePflicht).errors.includes("TEMPLATE_MANDATORY:REAL_ESTATE_TRUST:value"));

  const falschesGewicht = structuredClone(v2);
  falschesGewicht.industryTemplates.INSURANCE_CARRIER.factors.profitability.components[0].weight = 0.9;
  assert.ok(Contract.validate(falschesGewicht).errors.includes("TEMPLATE_COMPONENT_WEIGHT_SUM:INSURANCE_CARRIER:profitability"));

  const ohneFormel = structuredClone(v2);
  delete ohneFormel.industryTemplates.BALANCE_SHEET_FINANCIAL.factors.value.components[1].input;
  assert.ok(Contract.validate(ohneFormel).errors.some((error) => error.startsWith("TEMPLATE_COMPONENT_FIELD:BALANCE_SHEET_FINANCIAL:value")));

  const fehlt = structuredClone(v2);
  delete fehlt.industryTemplates.REAL_ESTATE_TRUST;
  assert.ok(Contract.validate(fehlt).errors.includes("TEMPLATE_MISSING:REAL_ESTATE_TRUST"));

  const zweiMal = structuredClone(v2);
  zweiMal.industryTemplates.BALANCE_SHEET_FINANCIAL.factors.quality.components[1].id =
    zweiMal.industryTemplates.BALANCE_SHEET_FINANCIAL.factors.quality.components[0].id;
  assert.ok(Contract.validate(zweiMal).errors.some((error) => error.startsWith("TEMPLATE_COMPONENT_REUSED:")));
});

test("Versicherungsvermittler sind keine Risikotraeger und stehen nicht im Branchentor", () => {
  /* SIC 6411 ist "Insurance agents, brokers & service". Der Geltungsbereich
     der Traegervorlage endet bei 6399 - stuende 6411 darin, waere die
     generische Formel fuer 25 Titel gesperrt, die Umsatz, operatives
     Ergebnis und EBITDA melden. */
  assert.equal(v2.industryTemplates.INSURANCE_CARRIER.appliesTo, "SIC 6300-6399");
  assert.match(v2.factors.quality.sectorTreatment, /6400-6411.*generic formula/);
});

test("contract rejects activation, missing revisions and component overlap", () => {
  const changed = structuredClone(v2);
  changed.status = "ACTIVE";
  changed.publication.allowed = true;
  changed.factors.revisions.readiness = "READY";
  changed.factors.risk.components[0].id = changed.factors.momentum.components[0].id;
  const result = Contract.validate(changed);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("ACTIVATION_LOCK"));
  assert.ok(result.errors.includes("PUBLICATION_LOCK"));
  assert.ok(result.errors.includes("REVISIONS_GATE"));
  assert.ok(result.errors.some((error) => error.startsWith("COMPONENT_REUSED:")));
});
