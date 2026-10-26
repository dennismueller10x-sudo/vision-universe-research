"""Issuer extensions: reviewed issuer-specific XBRL concepts, only for their own CIK (quant/sec/issuer_extensions.py).

A SYNTHETIC issuer reports capex only with its own concept. The rule fills that
gap for exactly this CIK; another issuer with the same facts gets nothing, a
generic concept in the same filing always wins, and a document that does not
match its pin is not read.
"""
import hashlib
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from quant.sec import consumer, issuer_extensions as ie
from quant.sec.registry import MetricRegistry, RegistryError
from quant.tests.fixtures import FLOW_CONCEPTS, build_year_ends, standard_company

CIK = 2000000093
OTHER = 2000000094
RULE = {"id": "synx-capex", "cik": str(CIK).zfill(10), "taxonomy": "synx", "concept": "PurchasesOfEquipment",
        "metric": "capital_expenditures", "priority": 900, "unit": "USD", "filings": []}
NO_CAPEX = tuple(c for c in FLOW_CONCEPTS if c[0] != "PaymentsToAcquirePropertyPlantAndEquipment")
KW = dict(as_of="2026-09-14", tickers=["SYNX"], security_ids=["ref_SYNX"], name="Synthetic Extension Issuer")

INSTANCE = b"""<?xml version="1.0" encoding="utf-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
  xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:synx="http://synthetic.example/2020"
  xmlns:other="http://other.example/2020">
  <xbrli:context id="FY"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2019-01-01</xbrli:startDate><xbrli:endDate>2019-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:context id="FY_seg"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">x</xbrli:identifier>
    <xbrli:segment><xbrldi:explicitMember dimension="a:B">a:C</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
    <xbrli:period><xbrli:startDate>2019-01-01</xbrli:startDate><xbrli:endDate>2019-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <synx:PurchasesOfEquipment contextRef="FY" unitRef="usd" decimals="-6">42000000</synx:PurchasesOfEquipment>
  <synx:PurchasesOfEquipment contextRef="FY_seg" unitRef="usd" decimals="-6">7000000</synx:PurchasesOfEquipment>
  <other:PurchasesOfEquipment contextRef="FY" unitRef="usd" decimals="-6">99000000</other:PurchasesOfEquipment>
</xbrli:xbrl>
"""


def _company(cik, generic_capex_years=()):
    fy_ends = build_year_ends(date(2014, 12, 31), 13)   # FY2015 .. FY2026
    builder, _ = standard_company(cik, fy_ends, lambda year: 1000.0 * (year - 2000), flow_concepts=NO_CAPEX)
    for year in generic_capex_years:
        builder.add("us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment", "USD", 11.0,
                    f"{year}-12-31", f"{year}-01-01", f"{cik}-{str(year)[2:]}-FY", "10-K", f"{year + 1}-02-24",
                    fy=year, fp="FY")
    return builder.company_facts()


def _facts(cik, years, value=lambda year: 5.0 * year):
    return [{"taxonomy": "synx", "concept": "PurchasesOfEquipment", "unit": "USD", "start": f"{y}-01-01",
             "end": f"{y}-12-31", "value": value(y), "accession": f"{cik}-{str(y)[2:]}-FY"} for y in years]


def _capex(bundle):
    return {row[0]: row[3] for row in bundle["annual"].get("capital_expenditures", [])}


class IssuerExtensionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plain = MetricRegistry.load(issuer_extensions=False)
        cls.registry = MetricRegistry.load(issuer_extensions=False).attach_issuer_rules(
            {"version": "test", "extensions": [RULE]})

    def test_fills_the_gap_for_its_own_issuer(self):
        payload, accessions = ie.supplement_company_facts(_company(CIK), _facts(CIK, range(2017, 2022)))
        self.assertEqual(len(accessions), 5)
        bundle = consumer.build_consumer_bundle(CIK, payload, self.registry, **KW)
        self.assertEqual(_capex(bundle), {y: 5.0 * y for y in range(2017, 2022)})
        fcf = {row[0]: row[3] for row in bundle["annual"]["free_cash_flow"]}
        self.assertEqual(sorted(fcf), list(range(2017, 2022)))   # gaps stay gaps, nothing filled
        self.assertIn("synx:PurchasesOfEquipment", bundle["conceptsUsed"]["capital_expenditures"])

    def test_never_applies_to_another_issuer(self):
        payload, _ = ie.supplement_company_facts(_company(OTHER), _facts(OTHER, range(2017, 2022)))
        bundle = consumer.build_consumer_bundle(OTHER, payload, self.registry, **KW)
        self.assertEqual(_capex(bundle), {})

    def test_generic_concept_in_the_same_filing_wins(self):
        payload, _ = ie.supplement_company_facts(_company(CIK, generic_capex_years=(2020,)), _facts(CIK, (2019, 2020)))
        capex = _capex(consumer.build_consumer_bundle(CIK, payload, self.registry, **KW))
        self.assertEqual(capex[2020], 11.0)
        self.assertEqual(capex[2019], 5.0 * 2019)

    def test_without_extension_facts_the_bundle_is_unchanged(self):
        payload = _company(CIK, generic_capex_years=(2020,))
        strip = lambda b: json.dumps({k: v for k, v in b.items() if k != "generatedAtUtc"}, sort_keys=True)
        self.assertEqual(strip(consumer.build_consumer_bundle(CIK, payload, self.registry, **KW)),
                         strip(consumer.build_consumer_bundle(CIK, payload, self.plain, **KW)))

    def test_filing_unknown_to_companyfacts_is_not_merged(self):
        facts = _facts(CIK, (2019,))
        facts[0]["accession"] = "0000000000-99-000001"
        payload = _company(CIK)
        merged, accessions = ie.supplement_company_facts(payload, facts)
        self.assertIs(merged, payload)
        self.assertEqual(accessions, [])

    def test_rule_must_rank_below_every_generic_concept(self):
        for bad in ({"priority": 30}, {"metric": "no_such_metric"}, {"unit": "shares"}):
            with self.assertRaises(RegistryError):
                MetricRegistry.load(issuer_extensions=False).attach_issuer_rules({"extensions": [dict(RULE, **bad)]})

    def test_standard_taxonomy_cannot_be_an_extension(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ext.json"
            path.write_text(json.dumps({"extensions": [dict(RULE, taxonomy="us-gaap", filings=[
                {"accession": "a", "document": "d.xml", "sha256": "0" * 64}])]}))
            with self.assertRaises(ie.ExtensionError):
                ie.load(path)

    def test_instance_parser_reads_only_undimensioned_facts_of_its_namespace(self):
        self.assertEqual(ie.parse_instance(INSTANCE, "synx", ["PurchasesOfEquipment"]),
                         [("PurchasesOfEquipment", "USD", "2019-01-01", "2019-12-31", 42000000.0)])
        self.assertEqual(ie.parse_instance(INSTANCE, "absent", ["PurchasesOfEquipment"]), [])

    def test_document_that_does_not_match_its_pin_is_not_read(self):
        class Client:
            def download_to(self, url, path):
                Path(path).parent.mkdir(parents=True, exist_ok=True)
                Path(path).write_bytes(INSTANCE)
                return path, len(INSTANCE), False
        good = {"accession": "0002000000-20-000001", "document": "synx.xml", "sha256": hashlib.sha256(INSTANCE).hexdigest()}
        bad = dict(good, accession="0002000000-20-000002", sha256="f" * 64)
        logs = []
        with tempfile.TemporaryDirectory() as tmp:
            facts = ie.fetch_facts(Client(), {"extensions": [dict(RULE, filings=[good, bad])]}, tmp, log=logs.append)
        rows = facts[str(CIK).zfill(10)]
        self.assertEqual([r["accession"] for r in rows], [good["accession"]])
        self.assertTrue(any("nicht gelesen" in line for line in logs))

    def test_gzip_transfer_is_checked_against_the_document(self):
        # Wie sec.gov: die Uebertragung ist gzip-komprimiert, gepinnt ist das entpackte Dokument.
        import gzip

        class Client:
            def download_to(self, url, path):
                Path(path).parent.mkdir(parents=True, exist_ok=True)
                Path(path).write_bytes(gzip.compress(INSTANCE))
                return path, 0, False
        filing = {"accession": "0002000000-20-000003", "document": "synx.xml", "sha256": hashlib.sha256(INSTANCE).hexdigest()}
        with tempfile.TemporaryDirectory() as tmp:
            facts = ie.fetch_facts(Client(), {"extensions": [dict(RULE, filings=[filing])]}, tmp, log=lambda _: None)
        self.assertEqual([r["value"] for r in facts[str(CIK).zfill(10)]], [42000000.0])

    def test_shipped_configuration(self):
        config = ie.load()
        registry = MetricRegistry.load()
        for ext in config["extensions"]:
            self.assertNotIn(ext["taxonomy"], ie.STANDARD_TAXONOMIES)
            self.assertEqual(registry.metrics_for_concept(ext["taxonomy"], ext["concept"]), [])
            self.assertEqual(registry.metrics_for_concept(ext["taxonomy"], ext["concept"], cik=ext["cik"]),
                             [(ext["metric"], ext["priority"])])
            self.assertEqual(registry.metrics_for_concept(ext["taxonomy"], ext["concept"], cik="0000320193"), [])
            # Aufgenommen nur mit Ueberschneidung, und dort wertgleich mit dem generischen Konzept.
            overlap = ext["evidence"]["overlap"]
            self.assertGreaterEqual(len(overlap), 2)
            for row in overlap:
                self.assertEqual(row["value"], row["genericValue"])
                self.assertIn(row["genericConcept"].split(":", 1)[1],
                              [rule.concept for rule in registry.get(ext["metric"]).concepts])


if __name__ == "__main__":
    unittest.main()
