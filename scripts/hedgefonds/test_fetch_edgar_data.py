"""Offline-Tests der 13F-Logik (kein Netzwerk). Aufruf:
python3 -m unittest scripts/hedgefonds/test_fetch_edgar_data.py"""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_edgar_data as m  # noqa: E402
from fund_meta import FUND_META  # noqa: E402


class Periods(unittest.TestCase):
    def test_recent_13fs_prefers_latest_amendment(self):
        f = {"form": ["13F-NT", "13F-HR", "10-K", "13F-HR/A", "13F-HR"],
             "accessionNumber": ["1", "2", "3", "4", "5"],
             "filingDate": ["2024-02-14", "2024-05-15", "2024-06-01", "2024-08-20", "2024-08-14"],
             "reportDate": ["2023-12-31", "2024-03-31", "2024-03-31", "2024-06-30", "2024-06-30"]}
        r = m.find_recent_13fs(f, 2)
        self.assertEqual([x["accession"] for x in r], ["4", "2"])

    def test_bulk_window(self):
        self.assertEqual(m.bulk_window_for_report_period("2024-06-30"), "01jun2024-31aug2024")
        self.assertEqual(m.bulk_window_for_report_period("2025-09-30"), "01sep2025-30nov2025")
        self.assertEqual(m.bulk_window_for_report_period("2023-12-31"), "01dec2023-29feb2024")

    def test_latest_closed_period(self):
        self.assertEqual(m.latest_closed_report_period(date(2026, 10, 3)), "2026-06-30")
        self.assertEqual(m.latest_closed_report_period(date(2026, 8, 31)), "2026-03-31")
        self.assertEqual(m.latest_closed_report_period(date(2026, 3, 1)), "2025-12-31")


class Positions(unittest.TestCase):
    def test_aggregate_splits_options_and_merges_duplicates(self):
        rows = [
            {"issuer": "SPDR", "cusip": "78462F103", "valueUSD": 100, "shares": 1, "putCall": ""},
            {"issuer": "SPDR", "cusip": "78462F103", "valueUSD": 50, "shares": 0.5, "putCall": ""},
            {"issuer": "SPDR", "cusip": "78462F103", "valueUSD": 80, "shares": 1, "putCall": "PUT"},
        ]
        agg = m.aggregate_positions(rows)
        self.assertEqual(len(agg), 2)
        self.assertEqual(agg[0]["valueUSD"], 150)
        self.assertEqual(agg[1]["putCall"], "PUT")

    def test_compute_trades_statuses(self):
        prev = [{"issuer": "A", "cusip": "A", "valueUSD": 100, "shares": 10, "putCall": ""},
                {"issuer": "B", "cusip": "B", "valueUSD": 100, "shares": 10, "putCall": ""},
                {"issuer": "C", "cusip": "C", "valueUSD": 100, "shares": 10, "putCall": ""},
                {"issuer": "D", "cusip": "D", "valueUSD": 100, "shares": 10, "putCall": ""}]
        cur = [{"issuer": "A", "cusip": "A", "valueUSD": 300, "shares": 15, "putCall": ""},
               {"issuer": "B", "cusip": "B", "valueUSD": 50, "shares": 5, "putCall": ""},
               {"issuer": "C", "cusip": "C", "valueUSD": 200, "shares": 10, "putCall": ""},
               {"issuer": "E", "cusip": "E", "valueUSD": 70, "shares": 7, "putCall": ""}]
        t = m.compute_trades(cur, prev)
        st = {k[0]: v["status"] for k, v in t.items()}
        self.assertEqual(st, {"A": "added", "B": "reduced", "C": "unchanged", "D": "sold", "E": "new"})
        self.assertAlmostEqual(t[("A", "")]["estValueUSD"], 100)   # 5 Stück x 20 USD
        self.assertAlmostEqual(t[("A", "")]["deltaPct"], 50)
        self.assertEqual(t[("D", "")]["estValueUSD"], -100)
        lists, counts = m.trade_lists(t, 10)
        self.assertEqual(counts, {"new": 1, "added": 1, "reduced": 1, "sold": 1})

    def test_diff_holdings_legacy(self):
        prev = [{"issuer": "A", "cusip": "111", "valueUSD": 100, "shares": 1},
                {"issuer": "B", "cusip": "222", "valueUSD": 200, "shares": 2}]
        cur = [{"issuer": "A", "cusip": "111", "valueUSD": 150, "shares": 1},
               {"issuer": "C", "cusip": "333", "valueUSD": 50, "shares": 3}]
        opened, closed = m.diff_holdings(cur, prev)
        self.assertEqual([h["cusip"] for h in opened], ["333"])
        self.assertEqual([h["cusip"] for h in closed], ["222"])

    def test_parse_info_table_put_call(self):
        xml = b"""<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
        <infoTable><nameOfIssuer>X</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>abc</cusip>
        <value>10</value><shrsOrPrnAmt><sshPrnamt>2</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
        <putCall>Put</putCall></infoTable></informationTable>"""
        h = m.parse_info_table_xml(xml)[0]
        self.assertEqual((h["cusip"], h["putCall"], h["valueUSD"], h["shares"]), ("ABC", "PUT", 10.0, 2.0))


class Units(unittest.TestCase):
    def test_thousands_reporting_is_scaled(self):
        rows = [{"valueUSD": v, "shares": sh, "putCall": "", "shareType": "SH"}
                for v, sh in [(150, 1000), (90, 2000), (4000, 50000)]]   # 0,15 $/Stück -> Tausender
        out, f = m.normalize_units(rows)
        self.assertEqual(f, 1000)
        self.assertEqual(out[0]["valueUSD"], 150000)

    def test_dollar_reporting_untouched(self):
        rows = [{"valueUSD": v, "shares": sh, "putCall": "", "shareType": "SH"}
                for v, sh in [(150000, 1000), (90000, 2000), (4e6, 50000)]]
        self.assertEqual(m.normalize_units(rows)[1], 1)


class Amendments(unittest.TestCase):
    def setUp(self):
        self.orig = (m.fetch_cover, m.fetch_filing_holdings)
        rows = {"orig": [{"issuer": "A", "cusip": "A", "valueUSD": 100, "shares": 1, "putCall": ""},
                         {"issuer": "B", "cusip": "B", "valueUSD": 200, "shares": 2, "putCall": ""}],
                "add": [{"issuer": "C", "cusip": "C", "valueUSD": 50, "shares": 1, "putCall": ""}],
                "rest": [{"issuer": "D", "cusip": "D", "valueUSD": 70, "shares": 1, "putCall": ""}]}
        types = {"add": "NEW HOLDINGS", "rest": "RESTATEMENT"}
        m.fetch_cover = lambda cik, f: ({"value": 1, "entries": 1, "amendmentType": types.get(f["accession"], "")}, [])
        m.fetch_filing_holdings = lambda cik, acc, names=None: [dict(r) for r in rows[acc]]

    def tearDown(self):
        m.fetch_cover, m.fetch_filing_holdings = self.orig

    def f(self, form, acc, filed):
        return {"form": form, "accession": acc, "filedDate": filed, "reportDate": "2026-03-31"}

    def test_new_holdings_amendment_is_merged(self):
        fl = [self.f("13F-HR/A", "add", "2026-06-01"), self.f("13F-HR", "orig", "2026-05-15")]
        pos, used = m.fetch_period_positions("1", fl, "2026-03-31")
        self.assertEqual(sorted(p["cusip"] for p in pos), ["A", "B", "C"])
        self.assertEqual(used["accession"], "add")

    def test_restatement_replaces(self):
        fl = [self.f("13F-HR", "orig", "2026-05-15"), self.f("13F-HR/A", "rest", "2026-06-01")]
        pos, _ = m.fetch_period_positions("1", fl, "2026-03-31")
        self.assertEqual([p["cusip"] for p in pos], ["D"])


class Universe(unittest.TestCase):
    def test_classification(self):
        c = m.classify_bulk_fund
        self.assertEqual(c("Alphabet Inc."), "Unternehmen")
        self.assertEqual(c("Dodge & Cox"), "Vermögensverwaltung")
        self.assertEqual(c("Walleye Trading LLC"), "Marktmacher / Trading")
        self.assertEqual(c("Zurich Insurance Group Ltd/FI"), "Versicherung")
        self.assertEqual(c("Viking Global Investors LP"), "Sonstige")
        self.assertEqual(c("Adage Capital Partners GP, L.L.C."), "Sonstige")

    def test_pretty_name(self):
        self.assertEqual(m.pretty_name("MUSTER KAPITAL GMBH"), "Muster Kapital GmbH")
        self.assertEqual(m.pretty_name("VIKING GLOBAL INVESTORS LP"), "Viking Global Investors LP")
        self.assertEqual(m.pretty_name("Already Fine LLC"), "Already Fine LLC")

    def test_select_universe_filters(self):
        h = lambda issuer, v: {"issuer": issuer, "valueUSD": v}  # noqa: E731
        bulk = {
            "1": {"name": "ALPHA CAPITAL LP", "country": "NY", "holdings": [h("NVIDIA CORP", 5e8)]},
            "2": {"name": "SMITH WEALTH ADVISORS", "country": "OH", "holdings": [h("APPLE INC", 5e8)]},
            "3": {"name": "BETA PARTNERS", "country": "CA", "holdings": [h("ISHARES TR", 4e8), h("APPLE INC", 1e8)]},
            "4": {"name": "MUSTER KAPITAL GMBH", "country": "2M", "holdings": [h("APPLE INC", 6e7)]},
            "5": {"name": "TINY FUND LP", "country": "NY", "holdings": [h("APPLE INC", 1e7)]},
            "6": {"name": "BLACKROCK INC", "country": "NY", "holdings": [h("APPLE INC", 9e9)]},
        }
        got = {e["cik"]: e["region"] for e in m.select_universe(bulk, 1, exclude=set())}
        self.assertEqual(got, {"1": None, "4": "DE"})


class Meta(unittest.TestCase):
    def test_fund_meta_unique_and_complete(self):
        slugs = [f["slug"] for f in FUND_META]
        ciks = [f["cik"] for f in FUND_META if f.get("cik")]
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertEqual(len(ciks), len(set(ciks)))
        for f in FUND_META:
            self.assertTrue(f["match"].isupper(), f["slug"])
            self.assertTrue(f["manager"] and f["style"], f["slug"])
        self.assertIn("pershing-square", slugs)


if __name__ == "__main__":
    unittest.main()
