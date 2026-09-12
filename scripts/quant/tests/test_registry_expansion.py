"""Die erweiterte Metrikregistry und EBITDA — §5, §7.

Der Auftrag verlangt eine Fundamentalschicht, die Bilanz, GuV und
Kapitalfluss traegt. Die Registry fuehrte 27 Kennzahlen; dreizehn aus der
Liste fehlten, darunter die Abschreibungen - und ohne sie war EBITDA
ausdruecklich als UNSUPPORTED gefuehrt.

Diese Tests pruefen zweierlei, und das zweite ist das wichtigere:

  1. Die neuen Kennzahlen sind richtig geformt und richtig verdrahtet.
  2. EBITDA wird gerechnet, wenn die Abschreibungen da sind - und bleibt
     NULL MIT GRUND, wenn nicht. Eine Null waere hier die schlimmste
     Antwort: sie liest sich wie ein Ergebnis.
"""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec.canonical import UNSUPPORTED_METRICS, METRIC_MAP, DEPENDENCIES
from quant.sec.derived import FORMULAS, RECONSTRUCTED, reconstruct
from quant.sec.model import MISSING_INPUT
from quant.sec.normalize import normalize_company
from quant.sec.periods import PeriodResolver
from quant.sec.provider import SECProvider
from quant.sec.registry import MetricRegistry
from quant.tests.fixtures import FLOW_CONCEPTS, build_year_ends, standard_company

NEU = (
    "depreciation_and_amortization", "current_assets", "current_liabilities",
    "inventory", "receivables", "retained_earnings", "goodwill",
    "intangible_assets", "investing_cash_flow", "financing_cash_flow",
    "share_repurchases", "debt_issued", "debt_repaid",
)


class _NullClient:
    def get_json(self, url, use_cache=True):  # pragma: no cover
        raise AssertionError("kein Netz in Tests")


def _resolver(cik, flow_concepts):
    registry = MetricRegistry.load()
    fy_ends = build_year_ends(date(2018, 12, 31), 8)
    builder, _ = standard_company(cik, fy_ends, lambda year: 1000.0 * (year - 2017),
                                  flow_concepts=flow_concepts)
    provider = SECProvider(client=_NullClient())
    raw = list(provider.iter_raw_facts(builder.company_facts()))
    result = normalize_company(str(cik).zfill(10), raw, registry,
                               filing_metadata=builder.filings)
    return PeriodResolver(result.factbook, registry), registry


class RegistryShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = MetricRegistry.load()

    def test_every_requested_metric_is_present(self):
        for name in NEU:
            with self.subTest(metric=name):
                self.assertIsNotNone(self.registry.get(name),
                                     f"{name} fehlt in der Registry")

    def test_every_new_metric_has_at_least_one_concept(self):
        for name in NEU:
            spec = self.registry.get(name)
            with self.subTest(metric=name):
                self.assertTrue(spec.concepts, f"{name} mappt auf nichts")

    def test_concept_priorities_are_unique_and_ordered(self):
        """Zwei Konzepte mit derselben Prioritaet sind keine Priorisierung.

        Die Registry weist das beim Laden zurueck; hier steht der Test
        trotzdem, weil die Reihenfolge die MAPPING-Entscheidung ist: was
        vorne steht, gewinnt, wenn ein Emittent mehrere Tags meldet.
        """
        for name in NEU:
            spec = self.registry.get(name)
            prios = [c.priority for c in spec.concepts]
            with self.subTest(metric=name):
                self.assertEqual(len(set(prios)), len(prios), f"{name}: doppelte Prioritaet")
                self.assertEqual(prios, sorted(prios), f"{name}: Prioritaeten nicht aufsteigend")

    def test_balance_sheet_metrics_are_instants_and_flows_are_durations(self):
        """Eine Bilanzposition ist ein Zeitpunkt, ein Cashflow ein Zeitraum.

        Die beiden zu verwechseln erzeugt keine Fehlermeldung - es erzeugt
        Werte, die niemand nachrechnen kann.
        """
        erwartet = {
            "current_assets": "instant", "current_liabilities": "instant",
            "inventory": "instant", "receivables": "instant",
            "retained_earnings": "instant", "goodwill": "instant",
            "intangible_assets": "instant",
            "depreciation_and_amortization": "duration",
            "investing_cash_flow": "duration", "financing_cash_flow": "duration",
            "share_repurchases": "duration", "debt_issued": "duration",
            "debt_repaid": "duration",
        }
        for name, kind in erwartet.items():
            with self.subTest(metric=name):
                self.assertEqual(self.registry.get(name).kind, kind)

    def test_new_metrics_are_optional(self):
        """Ein Emittent ohne Goodwill hat keinen Goodwill - das ist kein Fehler."""
        for name in NEU:
            with self.subTest(metric=name):
                self.assertTrue(getattr(self.registry.get(name), "optional", False),
                                f"{name} ist nicht optional; ein Nicht-Melder waere ein Fehlerfall")

    def test_outflow_metrics_declare_their_sign(self):
        """Rueckkaeufe und Tilgungen meldet die SEC als positive Abfluesse."""
        for name in ("share_repurchases", "debt_repaid"):
            with self.subTest(metric=name):
                self.assertEqual(self.registry.get(name).sign, "outflow_positive")


class EbitdaTests(unittest.TestCase):
    def test_ebitda_is_no_longer_declared_unsupported(self):
        self.assertNotIn("ebitda", UNSUPPORTED_METRICS)

    def test_ebitda_is_wired_end_to_end(self):
        self.assertIn("ebitda", FORMULAS)
        self.assertIn("ebitda", RECONSTRUCTED)
        self.assertIn("ebitda", METRIC_MAP)
        self.assertEqual(DEPENDENCIES["ebitda"],
                         ("operating_income", "depreciation_and_amortization"))

    def test_ebitda_is_operating_income_plus_depreciation(self):
        mit_da = FLOW_CONCEPTS + (("DepreciationDepletionAndAmortization", "USD", 0.07),)
        resolver, _ = _resolver(3100000001, mit_da)
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        ebitda = derived["ebitda"]
        self.assertTrue(ebitda.available, "EBITDA nicht gerechnet, obwohl die Abschreibungen da sind")

        op = resolver.annual("operating_income", 2025, date(2026, 3, 1))
        da = resolver.annual("depreciation_and_amortization", 2025, date(2026, 3, 1))
        self.assertAlmostEqual(ebitda.value, op.value + da.value, places=6)

    def test_without_depreciation_ebitda_is_null_with_a_reason_not_zero(self):
        """Der eigentliche Test. Ohne Abschreibungen darf EBITDA nicht
        stillschweigend zum operativen Ergebnis werden."""
        resolver, _ = _resolver(3100000002, FLOW_CONCEPTS)   # ohne D&A
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        ebitda = derived["ebitda"]
        self.assertFalse(ebitda.available)
        self.assertIsNone(ebitda.value)
        self.assertEqual(ebitda.reason, MISSING_INPUT)

        op = resolver.annual("operating_income", 2025, date(2026, 3, 1))
        self.assertTrue(op.available, "die Gegenprobe braucht ein vorhandenes operatives Ergebnis")

    def test_ebitda_is_labelled_as_computed_not_as_reported(self):
        mit_da = FLOW_CONCEPTS + (("DepreciationDepletionAndAmortization", "USD", 0.07),)
        resolver, _ = _resolver(3100000003, mit_da)
        derived = reconstruct(resolver, 2025, "FY", date(2026, 3, 1))
        prov = derived["ebitda"].provenance
        from quant.sec.model import SOURCE_DERIVED, TRANSFORM_FORMULA
        self.assertEqual(prov.source, SOURCE_DERIVED)
        self.assertEqual(prov.transformation, TRANSFORM_FORMULA)
        self.assertTrue(prov.formula_version)
        # Die Eingaben stehen an der Herkunft, nicht in einem Kommentar:
        # wer den Wert nachrechnen will, sieht woraus.
        # Die Eingaben tragen ihre Periode mit ("metrik@FY2025FY") - genau
        # das macht einen abgeleiteten Wert nachrechenbar.
        self.assertTrue(any(i.startswith("depreciation_and_amortization@") for i in prov.inputs),
                        prov.inputs)
        self.assertTrue(any(i.startswith("operating_income@") for i in prov.inputs), prov.inputs)
        self.assertIn("ebitda", FORMULAS)
        self.assertIn("depreciation_and_amortization", FORMULAS["ebitda"])


if __name__ == "__main__":
    unittest.main()
