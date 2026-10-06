"""Der Fundamental Data Contract, gegen die echten Artefakte geprueft.

Ein Vertrag ohne Test ist eine Absichtserklaerung. Die Zusagen aus
docs/VU_FUNDAMENTAL_DATA_CONTRACT.md werden hier gegen das geprueft, was
tatsaechlich ausgeliefert wird - damit ein spaeterer Umbau den Vertrag
bricht und nicht bloss die Wirklichkeit.

Die Tests laufen gegen die AUSGELIEFERTEN Buendel unter
quant/data/sec/canonical/. Der Faktenspeicher ist gitignored; was hier
nicht liegt, kann ein Konsument auch nicht lesen.
"""
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

ROOT = Path(__file__).resolve().parents[3]
VERTRAG = ROOT / "docs" / "VU_FUNDAMENTAL_DATA_CONTRACT.md"
CANONICAL = ROOT / "quant" / "data" / "sec" / "canonical"
FUNDAMENTALS = ROOT / "quant" / "data" / "fundamentals"


def bundles():
    if not CANONICAL.exists():
        return []
    return [json.loads(p.read_text(encoding="utf-8"))
            for p in sorted(CANONICAL.glob("*.json"))]


class VertragExistiertTests(unittest.TestCase):
    def test_der_vertrag_liegt_im_repository(self):
        self.assertTrue(VERTRAG.exists(), "docs/VU_FUNDAMENTAL_DATA_CONTRACT.md fehlt")

    def test_er_nennt_alle_fuenf_universen(self):
        """§11: keine falsche Vollstaendigkeit. Die fuenf muessen unterscheidbar sein."""
        text = VERTRAG.read_text(encoding="utf-8")
        for name in ("PRODUCT_UNIVERSE", "TECHNICAL_UNIVERSE", "FUNDAMENTAL_UNIVERSE",
                     "PIT_UNIVERSE", "BACKTEST_READY_UNIVERSE"):
            self.assertIn(name, text, f"{name} fehlt im Vertrag")

    def test_er_verbietet_parallele_fundamentalquellen(self):
        text = VERTRAG.read_text(encoding="utf-8")
        self.assertIn("eigene Fundamentalquelle", text)


class IdentityContractTests(unittest.TestCase):
    """§12 IDENTITY CONTRACT."""

    def test_die_emittenten_id_kommt_aus_der_cik(self):
        base = FUNDAMENTALS / "issuers"
        if not base.exists():
            self.skipTest("keine Emittentenscherben")
        muster = re.compile(r"^iss_cik_\d{10}$")
        geprueft = 0
        for path in sorted(base.glob("*.json"))[:20]:
            for row in json.loads(path.read_text(encoding="utf-8")).get("issuers") or []:
                self.assertRegex(row["issuerId"], muster)
                self.assertEqual(row["issuerId"], "iss_cik_" + str(row["cik"]).zfill(10))
                geprueft += 1
        self.assertGreater(geprueft, 0)

    def test_eine_cik_erzeugt_genau_einen_emittenten(self):
        """Zwei Aktienklassen teilen eine Historie - sie duerfen sie nicht verdoppeln."""
        base = FUNDAMENTALS / "issuers"
        if not base.exists():
            self.skipTest("keine Emittentenscherben")
        gesehen = set()
        for path in sorted(base.glob("*.json")):
            for row in json.loads(path.read_text(encoding="utf-8")).get("issuers") or []:
                self.assertNotIn(row["issuerId"], gesehen,
                                 f"{row['issuerId']} steht mehrfach im Bestand")
                gesehen.add(row["issuerId"])


class FundamentalContractTests(unittest.TestCase):
    """§12 FUNDAMENTAL CONTRACT: jedes Pflichtfeld an jedem Wert."""

    PFLICHT = ("securityId", "metricId", "fiscalPeriod", "fiscalYear", "periodEnd",
               "value", "unit", "currency", "filedAt", "availableAt",
               "revisionId", "restatementStatus", "sourceFilingId", "dataSourceId")

    def setUp(self):
        self.bundles = bundles()
        if not self.bundles:
            self.skipTest("keine kanonischen Buendel ausgeliefert")

    def test_jeder_wert_traegt_jedes_pflichtfeld(self):
        geprueft = 0
        for bundle in self.bundles:
            for fact in bundle.get("facts") or []:
                for feld in self.PFLICHT:
                    self.assertIn(feld, fact,
                                  f"{bundle['security']['ticker']}: {feld} fehlt an "
                                  f"{fact.get('metricId')}")
                geprueft += 1
        self.assertGreater(geprueft, 0)

    def test_kein_wert_ohne_einheit(self):
        """Eine nackte Zahl ist keine Kennzahl - 14532 was?"""
        for bundle in self.bundles:
            for fact in bundle.get("facts") or []:
                if fact.get("value") is not None:
                    self.assertTrue(fact.get("unit"),
                                    f"{fact.get('metricId')} hat einen Wert ohne Einheit")

    def test_die_point_in_time_garantie_haelt(self):
        """filedAt sagt WANN, sourceFilingId sagt WORAUS. Ohne beides kein PIT."""
        for bundle in self.bundles:
            for fact in bundle.get("facts") or []:
                if fact.get("value") is None:
                    continue
                self.assertTrue(fact.get("availableAt") or fact.get("filedAt"),
                                f"{fact.get('metricId')} ist nicht datierbar")
                self.assertTrue(fact.get("sourceFilingId"),
                                f"{fact.get('metricId')} nennt keine Einreichung")

    def test_der_wert_wurde_nicht_vor_seiner_periode_veroeffentlicht(self):
        """Ein Abschluss, der vor dem Periodenende eingereicht wurde, waere ein Leak."""
        for bundle in self.bundles:
            for fact in bundle.get("facts") or []:
                ende, gefiled = fact.get("periodEnd"), fact.get("filedAt")
                if ende and gefiled:
                    self.assertGreaterEqual(
                        gefiled, ende,
                        f"{bundle['security']['ticker']}/{fact.get('metricId')}: "
                        f"eingereicht {gefiled} vor Periodenende {ende}")

    def test_restatement_zustaende_sind_aus_dem_vertrag(self):
        erlaubt = {"original", "restated", "amended"}
        for bundle in self.bundles:
            for fact in bundle.get("facts") or []:
                self.assertIn(fact.get("restatementStatus"), erlaubt)


class HistoryContractTests(unittest.TestCase):
    """§12 HISTORY CONTRACT."""

    def setUp(self):
        self.bundles = bundles()
        if not self.bundles:
            self.skipTest("keine kanonischen Buendel ausgeliefert")

    def test_quartale_sind_echte_quartale(self):
        """Kein YTD2/YTD3 im Ausgelieferten - das waeren Meldungen, keine Perioden."""
        erlaubt = {"Q1", "Q2", "Q3", "Q4", "FY"}
        for bundle in self.bundles:
            for fact in bundle.get("facts") or []:
                self.assertIn(fact.get("fiscalPeriod"), erlaubt,
                              f"{fact.get('fiscalPeriod')} ist keine vergleichbare Periode")

    def test_jede_einreichung_ist_referenzierbar(self):
        for bundle in self.bundles:
            bekannt = {f["filingId"] for f in bundle.get("filings") or []}
            if not bekannt:
                continue
            for fact in bundle.get("facts") or []:
                quelle = fact.get("sourceFilingId")
                if quelle and quelle not in bekannt:
                    # Aeltere Werte stammen aus Einreichungen ausserhalb des
                    # gelieferten Fensters - das ist erlaubt, aber die
                    # Akzessionsnummer muss die Form einer solchen haben.
                    self.assertRegex(quelle, r"^\d{10}-\d{2}-\d{6}$")


class AvailabilityContractTests(unittest.TestCase):
    """§12 AVAILABILITY CONTRACT: die Zustaende muessen das Universum abdecken."""

    def test_die_titelzustaende_summieren_sich_auf_das_produktuniversum(self):
        path = FUNDAMENTALS / "fundamental-quality.json"
        if not path.exists():
            self.skipTest("kein Qualitaetsbericht - erst cli.py reconcile")
        q = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(sum(q["titles"]["byState"].values()),
                         q["titles"]["denominator"]["PRODUCT_TITLES"])

    def test_missing_und_unavailable_bleiben_getrennt(self):
        """Das erste ist unsere Baustelle, das zweite die der Quelle."""
        path = FUNDAMENTALS / "fundamental-quality.json"
        if not path.exists():
            self.skipTest("kein Qualitaetsbericht")
        q = json.loads(path.read_text(encoding="utf-8"))
        self.assertIn("MISSING", q["titles"]["byState"])
        self.assertIn("UNAVAILABLE", q["titles"]["byState"])


class VersionContractTests(unittest.TestCase):
    """§12: wer zwischenspeichert, muss auf Versionen pruefen koennen."""

    FELDER = ("normalization_schema", "normalization_logic", "formula",
              "provider_adapter", "quality_rules", "metric_registry")

    def test_jedes_ausgelieferte_buendel_sagt_womit_es_gerechnet_wurde(self):
        alle = bundles()
        if not alle:
            self.skipTest("keine kanonischen Buendel ausgeliefert")
        for bundle in alle:
            versionen = bundle.get("versions") or {}
            for feld in self.FELDER:
                self.assertIn(feld, versionen,
                              f"{bundle['security']['ticker']}: {feld} fehlt")

    def test_die_abgleichsartefakte_sind_ebenfalls_versioniert(self):
        for name in ("reconciliation.json", "gap-classification.json",
                     "backtest-readiness.json", "fundamental-quality.json"):
            path = FUNDAMENTALS / name
            if not path.exists():
                self.skipTest(f"{name} fehlt - erst cli.py reconcile")
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertIn("versions", payload, f"{name} sagt nicht, was es erzeugt hat")


class KeineFalscheVollstaendigkeitTests(unittest.TestCase):
    """§11. Der Satz, der nicht fallen darf."""

    def test_die_fuenf_universen_sind_verschieden_gross(self):
        path = FUNDAMENTALS / "reconciliation.json"
        if not path.exists():
            self.skipTest("kein Abgleich - erst cli.py reconcile")
        o = json.loads(path.read_text(encoding="utf-8"))["overlap"]
        b = json.loads((FUNDAMENTALS / "backtest-readiness.json").read_text(encoding="utf-8"))
        self.assertLess(o["FUNDAMENTAL_COMPANY_FACTS_AVAILABLE"], o["PRODUCT_TITLES"],
                        "Fundamentaldaten fuer JEDEN Produkttitel waere eine Behauptung, "
                        "die dieser Bestand nicht deckt (§11)")
        self.assertLess(b["BACKTEST_PIT_FUNDAMENTAL_READY"], o["PRODUCT_TITLES"])
        self.assertLessEqual(b["BACKTEST_PIT_FUNDAMENTAL_READY"],
                             o["FUNDAMENTAL_COMPANY_FACTS_AVAILABLE"])


if __name__ == "__main__":
    unittest.main()
