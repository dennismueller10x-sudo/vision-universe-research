"""Tests use synthetic XBRL only in disposable directories, never product data."""
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from scripts.fundamentals.official import ingest, validate_manifest, resolve_concept
from scripts.quant.sec.registry import MetricRegistry
from scripts.universe.global_equities import country_from_submission, directory_rows, coverage_report
from scripts.fundamentals.french_oam import normalize_record


def manifest():
    return {"companyId": "test_company", "entityIdentifier": "TESTENTITY", "sourceSystem": "ESEF",
            "sourceDocument": "https://official.example/report.xhtml", "officialHosts": ["official.example"],
            "documentId": "test-filing", "country": "DE", "filingDate": "2026-02-20",
            "identityEvidence": "test fixture", "publicationEvidence": "test fixture",
            "periods": [{"start": "2025-01-01", "end": "2025-12-31", "fiscalYear": 2025, "fiscalPeriod": "FY"}]}


class OfficialFilingTests(unittest.TestCase):
    def test_publication_requires_evidence_and_no_lookahead(self):
        m = manifest()
        self.assertEqual(validate_manifest(m), "2026-02-20T23:59:59.999999+00:00")
        m["acceptedAt"] = "2026-02-20T17:00:00+01:00"
        self.assertEqual(validate_manifest(m), "2026-02-20T16:00:00+00:00")
        del m["publicationEvidence"]
        with self.assertRaisesRegex(ValueError, "EVIDENCE"):
            validate_manifest(m)

    def test_jurisdiction_and_dates_are_not_guessed(self):
        for country in ("GB", "CH", "US"):
            with self.assertRaisesRegex(ValueError, "JURISDICTION"):
                validate_manifest({**manifest(), "country": country})
        m = manifest(); m["filingDate"] = "2025-10-01"
        with self.assertRaisesRegex(ValueError, "PERIOD"):
            validate_manifest(m)

    def test_extension_tag_and_namespace_spoofing_do_not_map_by_name(self):
        r = MetricRegistry.load()
        self.assertTrue(resolve_concept("https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full", "Revenue", r, {}))
        self.assertEqual(resolve_concept("https://issuer.example/ifrs-full", "Revenue", r, {}), [])
        self.assertEqual(resolve_concept("https://issuer.example/2025", "Revenue", r,
                         {"{https://issuer.example/2025}Revenue": {"status": "ANCHORED", "metric": "revenue"}}), [])

    def test_country_codes_are_not_sec_country_codes(self):
        d = {"addresses": {"business": {"country": "Taiwan", "countryCode": "F5"}}}
        self.assertEqual(country_from_submission(d), "TW")
        self.assertIsNone(country_from_submission({"addresses": {"business": {"countryCode": "F5"}}}))

    def test_oam_rejects_sentinel_publication_dates_and_untrusted_downloads(self):
        row = {"identificationsociete_iso_cd_isi": "FR0000121014", "uin_idt_uin": "test",
               "url_de_recuperation": "https://fr.ftp.opendatasoft.com/report.zip",
               "uin_dat_amf": "2025-03-25T15:59:51Z", "uin_dat_mar": "8887-12-31T23:00:00Z"}
        result = normalize_record(row, "FR0000121014")
        self.assertIsNone(result["marketPublishedAt"])
        self.assertIsNone(result["companyId"])
        self.assertIn("OAM_MARKET_TIMESTAMP_UNUSABLE", result["issues"])
        with self.assertRaisesRegex(ValueError, "HOST"):
            normalize_record({**row, "url_de_recuperation": "https://untrusted.example/report.zip"}, "FR0000121014")

    def test_archive_paths_cannot_escape_ingestion_and_jurisdictions_are_separate(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp) / "report.zip"
            with zipfile.ZipFile(p, "w") as z:
                z.writestr("../escape.xml", "test-only")
            with self.assertRaisesRegex(ValueError, "ARCHIVE_PATH"):
                ingest(p, manifest(), entrypoint="../escape.xml", offline=True)
        with self.assertRaisesRegex(ValueError, "JURISDICTION"):
            validate_manifest({**manifest(), "sourceSystem": "SWISS_OFFICIAL", "country": "GB"})

    def test_real_parser_preserves_currency_and_refuses_conflicting_consolidated_facts(self):
        # Self-contained small taxonomy; XBRL instance schemas are bundled by
        # Arelle so this parser test runs with all network access disabled.
        taxonomy = '''<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
          xmlns:xbrli="http://www.xbrl.org/2003/instance" targetNamespace="https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full"
          elementFormDefault="qualified">
          <xs:import namespace="http://www.xbrl.org/2003/instance" schemaLocation="http://www.xbrl.org/2003/xbrl-instance-2003-12-31.xsd"/>
          <xs:element name="Revenue" id="Revenue" type="xbrli:monetaryItemType" substitutionGroup="xbrli:item" xbrli:periodType="duration"/>
          <xs:element name="Assets" id="Assets" type="xbrli:monetaryItemType" substitutionGroup="xbrli:item" xbrli:periodType="instant"/>
        </xs:schema>'''
        doc = '''<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:link="http://www.xbrl.org/2003/linkbase"
          xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
          xmlns:ifrs="https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full">
          <link:schemaRef xlink:type="simple" xlink:href="test.xsd"/>
          <xbrli:context id="duration"><xbrli:entity><xbrli:identifier scheme="https://example.org/entity">TESTENTITY</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
          <xbrli:context id="instant"><xbrli:entity><xbrli:identifier scheme="https://example.org/entity">TESTENTITY</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>
          <xbrli:unit id="EUR"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>
          <ifrs:Revenue contextRef="duration" unitRef="EUR" decimals="0">2000000</ifrs:Revenue>
          <ifrs:Assets contextRef="instant" unitRef="EUR" decimals="0">3000000</ifrs:Assets>
        </xbrli:xbrl>'''
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp); (p / "test.xsd").write_text(taxonomy); (p / "test.xml").write_text(doc)
            result = ingest(p / "test.xml", manifest(), offline=True)
            revenue = next(f for f in result["facts"] if f["metricId"] == "revenue")
            self.assertEqual(revenue["value"], 2)
            self.assertEqual(revenue["currency"], "EUR")
            self.assertEqual(revenue["periodEnd"], "2025-12-31")
            self.assertEqual(revenue["availableAt"], "2026-02-20T23:59:59.999999+00:00")
            self.assertIn("revenue|2025-12-31|FY", result["provenance"])
            with zipfile.ZipFile(p / "test.zip", "w") as z:
                z.write(p / "test.xml", "test.xml"); z.write(p / "test.xsd", "test.xsd")
            zipped = ingest(p / "test.zip", manifest(), entrypoint="test.xml", offline=True)
            self.assertEqual([f["value"] for f in zipped["facts"]], [f["value"] for f in result["facts"]])
            (p / "test.xml").write_text(doc.replace('</xbrli:xbrl>', '<ifrs:Revenue contextRef="duration" unitRef="EUR" decimals="0">4000000</ifrs:Revenue></xbrli:xbrl>'))
            result = ingest(p / "test.xml", manifest(), offline=True)
            self.assertFalse(any(f["metricId"] == "revenue" for f in result["facts"]))
            self.assertTrue(any(i["reason"] == "CONFLICTING_FACTS" for i in result["issues"]))
            # ESEF uses Inline XBRL transformations and scale, not XML text
            # parsing. Test the actual Arelle path in a standalone XHTML.
            resources = doc[doc.index('<xbrli:context'):doc.index('<ifrs:Revenue')]
            inline = '''<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
              xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:link="http://www.xbrl.org/2003/linkbase"
              xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217"
              xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12"
              xmlns:ifrs="https://xbrl.ifrs.org/taxonomy/2024-03-27/ifrs-full"><head><title>Test filing</title></head><body>
              <div style="display:none"><ix:header><ix:references><link:schemaRef xlink:type="simple" xlink:href="test.xsd"/></ix:references><ix:resources>''' + resources + '''</ix:resources></ix:header></div>
              <p><ix:nonFraction name="ifrs:Revenue" contextRef="duration" unitRef="EUR" decimals="-5" scale="6" format="ixt:num-comma-decimal">2,5</ix:nonFraction></p>
              </body></html>'''
            (p / "test.xhtml").write_text(inline)
            result = ingest(p / "test.xhtml", manifest(), offline=True)
            self.assertEqual(result["facts"][0]["value"], 2.5)
            self.assertEqual(result["facts"][0]["currency"], "EUR")


if __name__ == "__main__":
    unittest.main()
