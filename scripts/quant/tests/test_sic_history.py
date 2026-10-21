"""Historische SIC-Beobachtungen (PIT). Kein Test hier beruehrt das Netz oder committete Daten."""
import gzip
import io
import json
import sys
import tempfile
import unittest
import zipfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import sic_history as sh
from quant.sec.http_client import DiskCache, SECHttpClient

# Echte Header-Auszuege (SEC EDGAR, gemeinfrei), auf die PIT-relevanten Zeilen gekuerzt.
AMZN_1998 = b"""<SEC-HEADER>0000891020-98-000448.hdr.sgml : 19980331
<ACCESSION-NUMBER>0000891020-98-000448
<TYPE>10-K405
<PERIOD>19971231
<FILING-DATE>19980330
<FILER>
<COMPANY-DATA>
<CONFORMED-NAME>AMAZON COM INC
<CIK>0001018724
<ASSIGNED-SIC>2731
</COMPANY-DATA>
</FILER>
</SEC-HEADER>
"""
AMZN_2026 = b"""<SEC-HEADER>0001018724-26-000004.hdr.sgml : 20260206
<ACCEPTANCE-DATETIME>20260205184431
<ACCESSION-NUMBER>0001018724-26-000004
<TYPE>10-K
<FILING-DATE>20260206
<FILER>
<COMPANY-DATA>
<CONFORMED-NAME>AMAZON COM INC
<CIK>0001018724
<ASSIGNED-SIC>5961
</COMPANY-DATA>
</FILER>
</SEC-HEADER>
"""
# Apple 8-K zu den Quartalszahlen: Annahme 16:30:28 ET (Sommerzeit), nach Handelsschluss.
AAPL_8K = b"""<SEC-HEADER>0000320193-26-000018.hdr.sgml : 20260730
<ACCEPTANCE-DATETIME>20260730163028
<TYPE>8-K
<FILING-DATE>20260730
<FILER>
<COMPANY-DATA>
<CONFORMED-NAME>Apple Inc.
<CIK>0000320193
<ASSIGNED-SIC>3571
</COMPANY-DATA>
</FILER>
</SEC-HEADER>
"""
CO_REGISTRANTS = b"""<SEC-HEADER>x : 20200102
<ACCEPTANCE-DATETIME>20200102101500
<TYPE>10-K
<FILING-DATE>20200102
<FILER>
<COMPANY-DATA>
<CONFORMED-NAME>PARENT CORP
<CIK>0000000111
<ASSIGNED-SIC>4911
</COMPANY-DATA>
</FILER>
<FILER>
<COMPANY-DATA>
<CONFORMED-NAME>UTILITY SUB LLC
<CIK>0000000222
<ASSIGNED-SIC>4931
</COMPANY-DATA>
</FILER>
</SEC-HEADER>
"""

SUB_HEADER = "adsh\tcik\tname\tsic\tcountryba\tform\tfiled\taccepted\tcountryinc\tafs"


def sub_txt(*rows):
    lines = [SUB_HEADER]
    for adsh, cik, sic, form, filed, accepted in rows:
        lines.append("\t".join([adsh, str(cik), "NAME", sic, "US", form, filed, accepted, "US", "1-LAF"]))
    return ("\n".join(lines) + "\n").encode()


class FakeStore(sh.RawStore):
    pass


def manifest_with(store, items):
    """items: [(kind, key, raw, extra)] -> Manifest mit Pins."""
    import hashlib
    sources = []
    for kind, key, raw, extra in items:
        store.put(kind, key, raw)
        sources.append(dict({"kind": kind, "key": key, "sha256": hashlib.sha256(raw).hexdigest(),
                             "observedAt": "2026-10-20T00:00:00Z"}, **extra))
    return {"schemaVersion": sh.SCHEMA_VERSION, "sources": sources}


class TimeTests(unittest.TestCase):
    def test_eastern_standard_and_daylight_time(self):
        self.assertEqual(sh.known_at(datetime(2026, 2, 5, 18, 44, 31), sh.PRECISION_SECOND, "2026-02-06"),
                         "2026-02-05T23:44:31Z")  # EST, UTC-5
        self.assertEqual(sh.known_at(datetime(2026, 7, 30, 16, 30, 28), sh.PRECISION_SECOND, "2026-07-30"),
                         "2026-07-30T20:30:28Z")  # EDT, UTC-4

    def test_minute_precision_ends_the_minute(self):
        # FSDS rundet auf die Minute: 16:00:31 erscheint als 16:01 -> knownAt 16:01:59, nie frueher.
        self.assertEqual(sh.known_at(datetime(2012, 5, 15, 16, 1), sh.PRECISION_MINUTE, "2012-05-15"),
                         "2012-05-15T20:01:59Z")

    def test_day_precision_ends_the_day(self):
        self.assertEqual(sh.known_at(None, sh.PRECISION_DAY, "1998-03-31"), "1998-04-01T04:59:59Z")

    def test_quarter_range(self):
        self.assertEqual(sh.quarter_range("2009q3", "2010q2"), ["2009q3", "2009q4", "2010q1", "2010q2"])


class HeaderParseTests(unittest.TestCase):
    def test_amazon_1998_historic_sic_without_acceptance(self):
        ob, bad = sh.parse_header(AMZN_1998, "1018724", "0000891020-98-000448")
        self.assertIsNone(bad)
        self.assertEqual(ob["sic"], "2731")  # Buchverlag - nicht die heutige 5961
        self.assertEqual(ob["precision"], sh.PRECISION_DAY)
        # Filing 30.03., Header erzeugt 31.03.: der spaetere Tag gilt
        self.assertEqual(ob["knownAt"], "1998-04-01T04:59:59Z")

    def test_amazon_2026_after_hours_acceptance(self):
        ob, _ = sh.parse_header(AMZN_2026, "0001018724", "0001018724-26-000004")
        self.assertEqual((ob["sic"], ob["precision"], ob["filingDate"]), ("5961", sh.PRECISION_SECOND, "2026-02-06"))
        # angenommen am 05.02. 18:44:31 ET, obwohl das Einreichungsdatum der 06.02. ist
        self.assertEqual(ob["knownAt"], "2026-02-05T23:44:31Z")

    def test_co_registrants_pick_exactly_the_requested_cik(self):
        sub, _ = sh.parse_header(CO_REGISTRANTS, "222", "0000000111-20-000001")
        self.assertEqual(sub["sic"], "4931")
        parent, _ = sh.parse_header(CO_REGISTRANTS, "111", "0000000111-20-000001")
        self.assertEqual(parent["sic"], "4911")

    def test_cik_not_in_header_is_quarantined_not_guessed(self):
        ob, bad = sh.parse_header(CO_REGISTRANTS, "333", "0000000111-20-000001")
        self.assertIsNone(ob)
        self.assertEqual(bad["reason"], "CIK_NOT_IN_HEADER")

    def test_missing_filing_date_is_quarantined(self):
        ob, bad = sh.parse_header(AMZN_2026.replace(b"<FILING-DATE>20260206\n", b""), "1018724", "x")
        self.assertIsNone(ob)
        self.assertEqual(bad["reason"], "MISSING_FILING_DATE")


class FsdsParseTests(unittest.TestCase):
    def test_rows_and_quarantine(self):
        raw = sub_txt(("0000000001-20-000001", 1, "3571", "10-K", "20200210", "2020-02-10 16:01:00.0"),
                      ("0000000001-20-000002", 1, "", "10-Q", "20200501", ""),
                      ("bad", 1, "3571", "10-Q", "20200501", "2020-05-01 08:00:00.0"))
        obs, bad = sh.parse_fsds_sub(raw, "2020q1")
        self.assertEqual(len(obs), 1)
        self.assertEqual(obs[0]["knownAt"], "2020-02-10T21:01:59Z")
        self.assertEqual(obs[0]["cik"], "0000000001")
        self.assertEqual(sorted(b["reason"] for b in bad), ["INVALID_ACCESSION", "MISSING_ACCEPTANCE"])

    def test_missing_columns_fail_loudly(self):
        with self.assertRaises(sh.SicSourceError):
            sh.parse_fsds_sub(b"adsh\tcik\n", "2020q1")

    def test_sic_normalisation(self):
        self.assertIsNone(sh.normalize_sic(""))
        self.assertIsNone(sh.normalize_sic("0000"))
        self.assertEqual(sh.normalize_sic("100"), "0100")


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = sh.RawStore(Path(self.tmp.name) / "raw")

    def tearDown(self):
        self.tmp.cleanup()

    def test_sic_change_runs_and_determinism(self):
        q1 = sub_txt(("0000000005-20-000001", 5, "2731", "10-K", "20200210", "2020-02-10 09:00:00.0"))
        q2 = sub_txt(("0000000005-20-000002", 5, "2731", "10-Q", "20200505", "2020-05-05 09:00:00.0"),
                     ("0000000005-20-000003", 5, "5961", "10-Q", "20200605", "2020-06-05 09:00:00.0"))
        m = manifest_with(self.store, [("fsds", "2020q1", q1, {}), ("fsds", "2020q2", q2, {})])
        a = sh.build_history(m, self.store)
        rec = a["issuers"]["0000000005"]
        self.assertEqual([r["sic"] for r in rec["runs"]], ["2731", "5961"])
        self.assertEqual(a["stats"]["sicChanges"], 1)
        out1, out2 = Path(self.tmp.name) / "o1", Path(self.tmp.name) / "o2"
        sh.write_outputs(out1, a, m, {"codes": {}}, {})
        sh.write_outputs(out2, sh.build_history(m, self.store), m, {"codes": {}}, {})
        self.assertEqual(sh.compare_trees(out1, out2), [])

    def test_pinned_hash_mismatch_fails(self):
        m = manifest_with(self.store, [("fsds", "2020q1", sub_txt(), {})])
        m["sources"][0]["sha256"] = "0" * 64
        with self.assertRaises(sh.SicSourceError):
            sh.build_history(m, self.store)

    def test_header_wins_over_fsds_and_mismatch_is_logged(self):
        fs = sub_txt(("0001018724-26-000004", 1018724, "9999", "10-K", "20260206", "2026-02-05 18:45:00.0"))
        m = manifest_with(self.store, [
            ("fsds", "2026q1", fs, {}),
            ("header", "0001018724_0001018724-26-000004", AMZN_2026, {"cik": "0001018724", "accession": "0001018724-26-000004"}),
        ])
        built = sh.build_history(m, self.store)
        ob = built["issuers"]["0001018724"]["observations"]
        self.assertEqual(len(ob), 1)
        self.assertEqual(ob[0][1], "5961")
        self.assertEqual(ob[0][4], "H")
        self.assertEqual(built["crosscheck"]["compared"], 1)
        self.assertEqual(built["quarantine"][0]["reason"], "FSDS_HEADER_SIC_MISMATCH")

    def test_crosscheck_counts_an_accession_once_even_if_two_quarters_list_it(self):
        fs = sub_txt(("0001018724-26-000004", 1018724, "5961", "10-K", "20260206", "2026-02-05 18:45:00.0"))
        m = manifest_with(self.store, [
            ("fsds", "2026q1", fs, {}), ("fsds", "2026q2", fs, {}),
            ("header", "0001018724_0001018724-26-000004", AMZN_2026, {"cik": "0001018724", "accession": "0001018724-26-000004"}),
        ])
        built = sh.build_history(m, self.store)
        self.assertEqual((built["crosscheck"]["compared"], built["crosscheck"]["agree"]), (1, 1))
        self.assertEqual(len(built["issuers"]["0001018724"]["observations"]), 1)

    def test_suspect_window_drops_unconfirmed_change_keeps_consistent(self):
        before = sub_txt(("0000000007-13-000001", 7, "2080", "10-Q", "20130510", "2013-05-10 09:00:00.0"))
        suspect = sub_txt(("0000000007-13-000002", 7, "3430", "10-Q", "20131108", "2013-11-08 09:00:00.0"),
                          ("0000000008-13-000002", 8, "6021", "10-Q", "20131108", "2013-11-08 09:00:00.0"))
        before8 = sub_txt(("0000000008-13-000001", 8, "6021", "10-Q", "20130510", "2013-05-10 09:00:00.0"))
        m = manifest_with(self.store, [("fsds", "2013q2", before + before8[len(SUB_HEADER) + 1:], {}),
                                       ("fsds", "2013q4", suspect, {})])
        built = sh.build_history(m, self.store)
        seven = built["issuers"]["0000000007"]["observations"]
        self.assertEqual([o[1] for o in seven], ["2080"])  # 3430 ohne Bestaetigung verworfen
        eight = built["issuers"]["0000000008"]["observations"]
        self.assertEqual([o[6] for o in eight], ["", sh.FLAG_SUSPECT_CONSISTENT])
        reasons = {q["reason"] for q in built["quarantine"]}
        self.assertIn("FSDS_SUSPECT_WINDOW_UNCONFIRMED", reasons)

    def test_contradicting_observations_at_same_time_are_flagged(self):
        q = sub_txt(("0000000009-20-000001", 9, "1311", "10-K", "20200210", "2020-02-10 09:00:00.0"),
                    ("0000000009-20-000002", 9, "1381", "10-K/A", "20200210", "2020-02-10 09:00:00.0"))
        m = manifest_with(self.store, [("fsds", "2020q1", q, {})])
        rec = sh.build_history(m, self.store)["issuers"]["0000000009"]
        self.assertEqual([o[6] for o in rec["observations"]], [sh.FLAG_CONFLICT, sh.FLAG_CONFLICT])
        self.assertEqual(len(rec["conflicts"]), 2)


def make_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    return buf.getvalue()


class RangeClient(SECHttpClient):
    """Client mit Range-Opener auf einem lokalen Bytes-Objekt."""

    def __init__(self, blob, tmp):
        super().__init__(cache=DiskCache(Path(tmp)), sleep=lambda s: None)
        self.blob = blob
        self.range_opener = self._serve

        class NoWait:
            def acquire(self):
                return 0.0
        self.rate_limiter = NoWait()

    def _serve(self, url, headers, timeout):
        spec = headers["Range"][6:]
        n = len(self.blob)
        if spec.startswith("-"):
            start, end = max(0, n + int(spec)), n - 1
        else:
            a, b = spec.split("-")
            start, end = int(a), (int(b) if b else n - 1)
        return self.blob[start:end + 1], n


class ZipRangeTests(unittest.TestCase):
    def test_reads_only_the_member_and_checks_crc(self):
        payload = sub_txt(("0000000001-20-000001", 1, "3571", "10-K", "20200210", "2020-02-10 16:01:00.0"))
        blob = make_zip({"sub.txt": payload, "num.txt": b"x" * 200000})
        with tempfile.TemporaryDirectory() as tmp:
            client = RangeClient(blob, tmp)
            raw, meta = sh.fetch_zip_member(client, "https://example/q.zip", "sub.txt")
            self.assertEqual(raw, payload)
            self.assertEqual(meta["uncompressed"], len(payload))
            self.assertEqual(client.stats["requests"], 3)

    def test_corrupt_member_is_rejected(self):
        blob = bytearray(make_zip({"sub.txt": b"a" * 5000}))
        idx = blob.find(b"sub.txt") + 7 + 5  # in die komprimierten Daten
        blob[idx] ^= 0xFF
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(Exception):
                sh.fetch_zip_member(RangeClient(bytes(blob), tmp), "https://example/q.zip", "sub.txt")

    def test_budget_stops_before_overrun(self):
        blob = make_zip({"sub.txt": sub_txt()})
        with tempfile.TemporaryDirectory() as tmp:
            client = RangeClient(blob, tmp)
            store = sh.RawStore(Path(tmp) / "raw")
            manifest = {"sources": []}
            budget = sh.RequestBudget(client, 4)
            added, _ = sh.fetch_fsds(client, store, manifest, ["2020q1"], "t", budget, log=lambda *_: None)
            self.assertEqual(added, ["2020q1"])
            with self.assertRaises(sh.SicSourceError):
                sh.fetch_fsds(client, store, manifest, ["2020q2"], "t", budget, log=lambda *_: None)

    def test_incremental_skip_and_republication_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = sh.RawStore(Path(tmp) / "raw")
            manifest = {"sources": []}
            client = RangeClient(make_zip({"sub.txt": sub_txt()}), tmp + "/c1")
            sh.fetch_fsds(client, store, manifest, ["2020q1"], "t1", sh.RequestBudget(client, 10), log=lambda *_: None)
            again, _ = sh.fetch_fsds(client, store, manifest, ["2020q1"], "t2", sh.RequestBudget(client, 10), log=lambda *_: None)
            self.assertEqual(again, [])
            changed_client = RangeClient(make_zip({"sub.txt": sub_txt(
                ("0000000001-20-000001", 1, "3571", "10-K", "20200210", "2020-02-10 16:01:00.0"))}), tmp + "/c2")
            _, changed = sh.fetch_fsds(changed_client, store, manifest, ["2020q1"], "t3",
                                       sh.RequestBudget(changed_client, 10), refresh=True, log=lambda *_: None)
            self.assertEqual(len(changed), 1)
            self.assertEqual(len(manifest["republished"]), 1)


class HydrateTests(unittest.TestCase):
    def test_refetches_pinned_sources_and_rejects_changed_ones(self):
        payload = sub_txt(("0000000001-20-000001", 1, "3571", "10-K", "20200210", "2020-02-10 16:01:00.0"))
        with tempfile.TemporaryDirectory() as tmp:
            client = RangeClient(make_zip({"sub.txt": payload}), tmp + "/c")
            src = sh.RawStore(Path(tmp) / "src")
            manifest = {"sources": []}
            sh.fetch_fsds(client, src, manifest, ["2020q1"], "t", sh.RequestBudget(client, 10), log=lambda *_: None)
            for e in manifest["sources"]:
                e["url"] = "https://example/q.zip"
            fresh = sh.RawStore(Path(tmp) / "fresh")
            self.assertEqual(sh.hydrate(client, fresh, manifest, sh.RequestBudget(client, 10), log=lambda *_: None), 1)
            self.assertEqual(fresh.get("fsds", "2020q1"), payload)
            other = RangeClient(make_zip({"sub.txt": sub_txt()}), tmp + "/c2")
            with self.assertRaises(sh.SicSourceError):
                sh.hydrate(other, sh.RawStore(Path(tmp) / "fresh2"), manifest, sh.RequestBudget(other, 10), log=lambda *_: None)


class GapPlanTests(unittest.TestCase):
    def test_one_issuer_filing_before_gap_and_one_per_year_until_first_observation(self):
        doc = {"filings": {"recent": {
            "accessionNumber": ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8"],
            "form": ["6-K", "4", "6-K", "20-F", "6-K", "SC 13G", "6-K", "20-F"],
            "filingDate": ["2015-11-02", "2016-02-01", "2016-02-10", "2016-04-15", "2016-05-20", "2016-08-01", "2017-03-01", "2018-04-19"],
        }, "files": []}}

        class Client:
            stats = {"requests": 0}

            def get_json(self, url):
                self.stats["requests"] += 1
                assert url.endswith("CIK0001046179.json")
                return doc
        client = Client()
        t = sh.plan_gap_headers(client, {"1046179": "2016-01-31"}, {"0001046179": "2018-04-19T11:56:59Z"},
                                sh.RequestBudget(client, 5), log=lambda *_: None)
        # a1: letztes Emittentenfiling vor der Luecke; 2016 -> a5 (letztes Emittentenfiling, Form 4 und SC 13G nie);
        # 2017 -> a7; a8 ist die erste Beobachtung selbst
        self.assertEqual(t, [["0001046179", "a1"], ["0001046179", "a5"], ["0001046179", "a7"]])

    def test_without_filing_before_the_gap_the_first_one_after_is_taken(self):
        doc = {"filings": {"recent": {"accessionNumber": ["s1", "q1"], "form": ["424B4", "10-Q"],
                                      "filingDate": ["2021-03-02", "2021-05-10"]}, "files": []}}

        class Client:
            stats = {"requests": 0}

            def get_json(self, url):
                return doc
        client = Client()
        t = sh.plan_gap_headers(client, {"5": "2021-02-28"}, {"0000000005": "2021-05-10T20:00:59Z"},
                                sh.RequestBudget(client, 5), log=lambda *_: None)
        self.assertEqual(t, [["0000000005", "s1"]])


class ManifestTests(unittest.TestCase):
    def test_compact_header_pins_roundtrip(self):
        m = {"schemaVersion": sh.SCHEMA_VERSION, "requestLog": [{"action": "x"}], "sources": [
            {"kind": "fsds", "key": "2020q1", "url": "u", "sha256": "a" * 64, "observedAt": "t1"},
            {"kind": "header", "key": "0000000001_0000000001-20-000001", "cik": "0000000001",
             "accession": "0000000001-20-000001", "url": sh.header_url("0000000001", "0000000001-20-000001"),
             "sha256": "b" * 64, "bytes": 10, "observedAt": "t2"}]}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            sh.save_manifest(path, json.loads(json.dumps(m)))
            back = sh.load_manifest(path)
            self.assertEqual(sorted(json.dumps(e, sort_keys=True) for e in back["sources"]),
                             sorted(json.dumps(e, sort_keys=True) for e in m["sources"]))
            self.assertEqual(back["requestLog"], [{"action": "x"}])
            self.assertEqual(json.loads(path.read_text())["headerPins"]["t2"][0][1], "0000000001-20-000001")
            self.assertTrue(sh.header_url("1", "0000000001-20-000001").endswith("/data/1/000000000120000001/0000000001-20-000001.hdr.sgml"))


class SicCodeTableTests(unittest.TestCase):
    def test_parses_sec_table(self):
        html = b"<table><tr><th>SIC</th></tr><tr><td>5961</td><td>Office of Trade &amp; Services</td><td>RETAIL-CATALOG &amp; MAIL-ORDER HOUSES</td></tr></table>"
        self.assertEqual(sh.sic_code_table(html)["5961"]["description"], "RETAIL-CATALOG & MAIL-ORDER HOUSES")


if __name__ == "__main__":
    unittest.main()
