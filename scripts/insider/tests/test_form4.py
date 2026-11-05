"""Offline contract and CLI tests; all outputs stay in TemporaryDirectory."""
from datetime import date
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / "form4.py"
spec = importlib.util.spec_from_file_location("form4", SCRIPT)
f = importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)
PATH = "edgar/data/123/0000000123-26-000001.txt"
META = {"path": PATH, "form": "4", "filingDate": "2026-06-05"}
HEADER = "CIK|Company Name|Form Type|Date Filed|Filename\n"
INDEX = HEADER + "123|Example Inc|4|2026-06-05|" + PATH + "\n"
TX = '''<nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle>
<transactionDate><value>2026-06-01</value></transactionDate>
<transactionCoding><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>10.25</value></transactionShares>
<transactionPricePerShare><value>2.40</value></transactionPricePerShare>
<transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts>
<ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
</nonDerivativeTransaction>'''
OWNER = '''<reportingOwner><reportingOwnerId><rptOwnerCik>456</rptOwnerCik>
<rptOwnerName>Person</rptOwnerName></reportingOwnerId>
<reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>CEO</officerTitle></reportingOwnerRelationship></reportingOwner>'''


def xml(tx=TX, owners=OWNER, form="4"):
    return f'''<ownershipDocument><documentType>{form}</documentType>
<issuer><issuerCik>123</issuerCik><issuerName>Example Inc</issuerName><issuerTradingSymbol>EX</issuerTradingSymbol></issuer>
{owners}<nonDerivativeTable>{tx}</nonDerivativeTable></ownershipDocument>'''


def submission(doc=None, accepted="20260605173000"):
    return ((f"<ACCEPTANCE-DATETIME>{accepted}\n" if accepted else "") + "<XML>" + (doc or xml()) + "</XML>").encode()


class Form4Tests(unittest.TestCase):
    def test_decimal_owner_and_provenance(self):
        rows, _ = f.parse_filing(submission(xml(owners=OWNER + OWNER)), META)
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["reportedValue"], "24.6000")
        self.assertEqual(r["issuerCik"], "0000000123")
        self.assertEqual(len(r["reportingOwners"]), 2)
        self.assertEqual(r["transactionDate"], "2026-06-01")
        self.assertEqual(r["filingDate"], "2026-06-05")
        self.assertEqual(r["acceptedAt"], "2026-06-05T21:30:00Z")
        self.assertEqual(len(r["sourceSha256"]), 64)
        self.assertIsNone(r["priceCurrency"])
        self.assertNotIn("securityId", r)  # no invented ticker-based identity

    def test_point_in_time_not_transaction_date_or_midnight(self):
        for end in ("2026-06-04", "2026-06-05T21:29:59Z"):
            d = f.generate(date(2026, 6, 1), f.cutoff(end), [INDEX], lambda p: submission())
            self.assertEqual(d["records"], 0)
        d = f.generate(date(2026, 6, 1), f.cutoff("2026-06-05T21:30:00Z"), [INDEX, INDEX], lambda p: submission())
        self.assertEqual(d["records"], 1)
        self.assertEqual(d["filingsProcessed"], 1)

    def test_same_accession_under_issuer_and_owner_cik_counted_once(self):
        owner_path = PATH.replace("edgar/data/123/", "edgar/data/456/")
        index = INDEX + "456|Person|4|2026-06-05|" + owner_path + "\n"
        d = f.generate(date(2026, 6, 1), f.cutoff("2026-06-05T21:30:00Z"), [index], lambda p: submission())
        self.assertEqual(d["filingsProcessed"], 1)
        self.assertEqual(d["records"], 1)

    def test_no_acceptance_conservative_next_day_dst(self):
        r, _ = f.parse_filing(submission(accepted=None), META)
        self.assertEqual(r[0]["availableAt"], "2026-06-06T04:00:00Z")
        self.assertIsNone(r[0]["acceptedAt"])
        m = {**META, "filingDate": "2026-01-05"}
        doc = xml().replace("2026-06-01", "2026-01-02")
        r, _ = f.parse_filing(submission(doc, None), m)
        self.assertEqual(r[0]["availableAt"], "2026-01-06T05:00:00Z")
        r, _ = f.parse_filing(submission(doc, "20260105173000"), m)
        self.assertEqual(r[0]["availableAt"], "2026-01-05T22:30:00Z")

    def test_only_priced_nonderivative_acquired_purchases(self):
        for tx in (TX.replace("<transactionCode>P", "<transactionCode>S"), TX.replace("<transactionCode>P", "<transactionCode>A"),
                   TX.replace("<value>A</value>", "<value>D</value>"), TX.replace("2.40", "0"),
                   TX.replace("2.40", "NaN"), TX.replace("10.25", "-1"), TX.replace("2.40", ""),
                   TX.replace("2026-06-01", "2026-06-06")):
            with self.subTest(tx=tx):
                self.assertEqual(f.parse_filing(submission(xml(tx=tx)), META)[0], [])
        doc = xml().replace("nonDerivativeTable", "derivativeTable").replace("nonDerivativeTransaction", "derivativeTransaction")
        r, counts = f.parse_filing(submission(doc), META)
        self.assertEqual(r, [])
        self.assertEqual(counts["derivativeTransactions"], 1)

    def test_amendment_separate_event_not_retroactive_replacement(self):
        meta = {**META, "form": "4/A", "path": PATH.replace("000001", "000002")}
        rows, _ = f.parse_filing(submission(xml(form="4/A")), meta)
        self.assertTrue(rows[0]["isAmendment"])
        original, _ = f.parse_filing(submission(), META)
        self.assertNotEqual(rows[0]["id"], original[0]["id"])

    def test_namespace_and_footnote_only_prices(self):
        doc = xml().replace("<ownershipDocument>", '<ownershipDocument xmlns="urn:ownership">')
        self.assertEqual(len(f.parse_filing(submission(doc), META)[0]), 1)
        doc = xml().replace("<value>2.40</value>", '<footnoteId id="F1"/>')
        self.assertEqual(f.parse_filing(submission(doc), META)[1]["unpricedOrInvalid"], 1)

    def test_invalid_sources_fail_closed(self):
        for payload in (b"<html>blocked</html>", submission(xml(form="3")), submission("<!DOCTYPE x>" + xml()),
                        submission(accepted="20260606120000")):
            with self.subTest(payload=payload), self.assertRaises((ValueError, f.ET.ParseError)):
                f.parse_filing(payload, META)
        with self.assertRaises(ValueError):
            f.index_rows("<html>denied</html>")
        with self.assertRaises(ValueError):
            f.index_rows(INDEX.replace(PATH, "../../secret"))
        with self.assertRaises(ValueError):
            f.cutoff("2026-06-05T12:00:00")
        self.assertEqual(list(f.quarters(date(2025, 12, 31), date(2026, 4, 1))),
                         ["edgar/full-index/2025/QTR4/master.idx", "edgar/full-index/2026/QTR1/master.idx", "edgar/full-index/2026/QTR2/master.idx"])

    def test_http_retries_and_user_agent(self):
        with self.assertRaises(ValueError):
            f.Edgar(None)
        client = f.Edgar("VU Research contact@example.com")
        with patch.object(f.clock, "sleep"), patch.object(f, "urlopen") as open_url:
            response = open_url.return_value.__enter__.return_value
            response.read.return_value = b"ok"
            self.assertEqual(client.get(PATH), b"ok")
            self.assertIn("contact@example.com", open_url.call_args.args[0].get_header("User-agent"))
            open_url.side_effect = HTTPError("url", 429, "slow", {}, None)
            with self.assertRaises(HTTPError):
                client.get(PATH)
            self.assertEqual(open_url.call_count, 5)
            open_url.reset_mock()
            open_url.side_effect = HTTPError("url", 403, "denied", {}, None)
            with self.assertRaises(HTTPError):
                client.get(PATH)
            self.assertEqual(open_url.call_count, 1)

    def test_registry_contract_and_exact_large_decimal(self):
        registry = json.loads((SCRIPT.parents[2] / "core/registry/domains.json").read_text())
        entries = [d for d in registry["domains"] if d["id"] == "insiderPurchases"]
        self.assertEqual(len(entries), 1)
        self.assertIn("scripts/insider/form4.py", entries[0]["producer"])
        self.assertIsNone(entries[0]["workflow"])
        doc = f.generate(date(2026, 6, 1), f.cutoff("2026-06-05"), [INDEX], lambda p: submission())
        self.assertEqual(len(doc[entries[0]["records"]]), doc["records"])
        tx = TX.replace("10.25", "12345678901234567890123456789").replace("2.40", "10")
        rows, _ = f.parse_filing(submission(xml(tx=tx)), META)
        self.assertEqual(rows[0]["reportedValue"], "123456789012345678901234567890")
        with self.assertRaises(ValueError):
            f.parse_filing(submission(accepted="bad"), META)

    def test_cli_out_and_failed_run_preserves_previous_artifact(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / PATH).parent.mkdir(parents=True)
            (root / PATH).write_bytes(submission())
            idx = root / "master.idx"
            idx.write_text(INDEX)
            out = root / "out" / "purchases.json"
            cmd = [sys.executable, str(SCRIPT), "--from", "2026-06-01", "--as-of", "2026-06-05", "--index-file", str(idx),
                   "--filings-dir", str(root), "--out", str(out)]
            subprocess.run(cmd, check=True, capture_output=True)
            before = out.read_bytes()
            self.assertEqual(json.loads(before)["records"], 1)
            (root / PATH).write_text("invalid")
            self.assertNotEqual(subprocess.run(cmd, capture_output=True).returncode, 0)
            self.assertEqual(out.read_bytes(), before)
            self.assertEqual(list(out.parent.iterdir()), [out])
            self.assertNotEqual(subprocess.run(cmd[:-2], capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
