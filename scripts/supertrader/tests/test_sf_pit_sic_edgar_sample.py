"""FP-ST-03: EDGAR-Stichprobe ohne Netz (injizierter Opener). Ausgabe nur in ein Temp-Verzeichnis.

  python3 -B -m unittest discover -s scripts/supertrader/tests -p 'test_sf_pit_sic_*.py'
"""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # kein __pycache__ im Quellbaum
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("edgar_sample", HERE.parent / "source-faithful/groups/edgar_sample.py")
ES = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ES)

CIK = "0000000101"
SUBMISSIONS = {
    "cik": "101", "sic": "3674",  # heutige SIC: darf in keiner Beobachtung landen
    "filings": {"recent": {
        "accessionNumber": ["0000000101-20-000011", "0000000101-15-000001", "0000000101-15-000002", "0000000101-18-000003"],
        "filingDate": ["2020-05-04", "2015-03-02", "2015-03-05", "2018-01-10"],
        "form": ["10-Q", "10-K", "SC 13G", "8-K"],
    }},
}


def header(acc, sic, accepted, filing_date, cik=CIK):
    return (f"<SEC-HEADER>{acc}.hdr.sgml : {filing_date}\n<ACCEPTANCE-DATETIME>{accepted}\n<ACCESSION-NUMBER>{acc}\n<TYPE>10-K\n"
            f"<FILING-DATE>{filing_date}\n<FILER>\n<COMPANY-DATA>\n<CONFORMED-NAME>ALPHA INC\n<CIK>{cik}\n<ASSIGNED-SIC>{sic}\n"
            f"</COMPANY-DATA>\n</FILER>\n").encode("latin-1")


PAGES = {
    f"https://data.sec.gov/submissions/CIK{CIK}.json": json.dumps(SUBMISSIONS).encode(),
    ES.SH.header_url(CIK, "0000000101-15-000001"): header("0000000101-15-000001", "7372", "20150302161005", "20150302"),
    ES.SH.header_url(CIK, "0000000101-18-000003"): header("0000000101-18-000003", "7372", "20180110080000", "20180110"),
    ES.SH.header_url(CIK, "0000000101-20-000011"): header("0000000101-20-000011", "3674", "20200504163000", "20200504"),
}


class Opener:
    def __init__(self):
        self.calls = []

    def __call__(self, url, headers, timeout):
        self.calls.append((url, headers["User-Agent"]))
        if url not in PAGES:
            raise OSError("404")
        return PAGES[url]


class EdgarSampleTests(unittest.TestCase):
    def run_main(self, *extra):
        opener = Opener()
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "s.json"
            res = ES.main(["--ciks", "101", "--out", str(out), *extra], opener=opener)
            self.assertEqual(json.loads(out.read_text())["issuers"].keys(), res["issuers"].keys())
        return res, opener

    def test_observations_from_headers_not_current_sic(self):
        res, opener = self.run_main()
        rec = res["issuers"][CIK]
        self.assertEqual([o[1] for o in rec["observations"]], ["7372", "7372", "3674"])
        # 16:10:05 EST -> 21:10:05Z; 16:30 EDT -> 20:30:00Z (Sekundengenau aus dem Header)
        self.assertEqual(rec["observations"][0][0], "2015-03-02T21:10:05Z")
        self.assertEqual(rec["observations"][-1][0], "2020-05-04T20:30:00Z")
        self.assertEqual(rec["currentSicNotPit"], "3674")
        self.assertEqual([r["sic"] for r in rec["runs"]], ["7372", "3674"])
        self.assertTrue(all(ua == ES.DEFAULT_USER_AGENT for _, ua in opener.calls))
        self.assertNotIn("@", ES.DEFAULT_USER_AGENT)
        self.assertEqual(res["schemaVersion"], "sic-history/1.0.0")
        self.assertEqual(res["run"]["byKind"], {"submissions": 1, "header": 3})  # SC 13G nicht gelesen

    def test_budget_fail_closed(self):
        res, opener = self.run_main("--budget", "2")
        self.assertEqual(len(opener.calls), 2)
        self.assertEqual(res["run"]["refusedOverBudget"], 2)
        self.assertEqual(len(res["issuers"][CIK]["observations"]), 1)
        self.assertEqual(len(res["quarantine"]), 2)

    def test_pick_filings_spreads_and_keeps_ends(self):
        recent = {"filingDate": [f"20{10 + i}-01-01" for i in range(10)], "accessionNumber": [f"a{i}" for i in range(10)], "form": ["10-K"] * 10}
        picked = ES.pick_filings(recent, 4)
        self.assertEqual([p[1] for p in picked], ["a0", "a3", "a6", "a9"])

    def test_refuses_email_user_agent_and_owned_out(self):
        with self.assertRaises(ValueError):
            ES.Fetcher("bot x@y.z", ES.Budget(1))
        with self.assertRaises(SystemExit):
            ES.main(["--ciks", "101", "--out", str(ES.ROOT / "quant/data/x.json")], opener=Opener())
        with self.assertRaises(SystemExit):
            ES.main(["--ciks", ",".join(str(i) for i in range(1, 52)), "--out", "/tmp/never.json"], opener=Opener())


if __name__ == "__main__":
    unittest.main()
