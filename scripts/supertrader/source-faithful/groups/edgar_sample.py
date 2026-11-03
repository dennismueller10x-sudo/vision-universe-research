#!/usr/bin/env python3
"""PIT-SIC-Stichprobe direkt aus SEC-EDGAR-Filing-Headern (FP-ST-03). Hoechstens 50 Emittenten.

Zweck: das Format und die Zeitpunktlogik der PIT-SIC-Basis an der Quelle gegenpruefen, ohne den Bestand
`quant/data/sec/sic-history` anzufassen. Die Ausgabe hat das Emittenten-Format von sic-history/1.0.0 und wird mit
`build-pit-sic-groups.mjs --sic-issuers <datei>` gelesen.

Abrufe (sequenziell, hoechstens 4 je Sekunde, 30 s Timeout, harte Obergrenze --budget):
  data.sec.gov/submissions/CIK##########.json         nur die Liste der Filings (Accession, Form, Datum)
  www.sec.gov/Archives/edgar/data/<cik>/<acc>.hdr.sgml   ASSIGNED-SIC und ACCEPTANCE-DATETIME zum Einreichungszeitpunkt

Die heutige SIC aus `submissions` wird nur als `currentSicNotPit` zur Gegenprobe ausgewiesen und nie in eine
Beobachtung uebernommen: vor dem ersten gelesenen Header bleibt die SIC unbekannt.

Header-Auswertung, Zeitstempel und Laeufe stammen unveraendert aus scripts/quant/sec/sic_history.py (parse_header,
_issuer_record): eine Logik, keine zweite.

User-Agent: Umgebungsvariable SEC_RESEARCH_USER_AGENT, sonst "VisionUniverseResearch research-bot".

  python3 scripts/supertrader/source-faithful/groups/edgar_sample.py --ciks 320193,1018724 --out <datei.json>
  python3 scripts/supertrader/source-faithful/groups/edgar_sample.py --instruments-sample 40 --out <datei.json>
"""
import argparse
import gzip
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "scripts"))
from quant.sec import sic_history as SH  # noqa: E402  (nur gelesen, nicht veraendert)

VERSION = "sf-pit-sic-edgar-sample-1.0.0"
MAX_ISSUERS = 50
DEFAULT_USER_AGENT = "VisionUniverseResearch research-bot"
MIN_INTERVAL_S = 0.25
TIMEOUT_S = 30
# Formulare, deren Header den Registranten als FILER fuehrt (periodische Berichte und Registrierungen).
PERIODIC_FORMS = frozenset({"10-K", "10-K405", "10-KSB", "10-Q", "10-QSB", "20-F", "40-F", "10-K/A", "10-Q/A", "20-F/A", "8-K", "S-1", "F-1", "10-12B", "10-12G"})


class Budget:
    def __init__(self, limit):
        self.limit, self.used, self.refused = limit, 0, 0

    def take(self):
        if self.used >= self.limit:
            self.refused += 1
            return False
        self.used += 1
        return True


class Fetcher:
    """Sequenziell, gedrosselt, Budget fail-closed. opener(url, headers, timeout) -> bytes (in Tests injiziert)."""

    def __init__(self, user_agent, budget, opener=None, sleep=time.sleep, clock=time.monotonic):
        if "@" in user_agent:
            raise ValueError("User-Agent ohne E-Mail-Adresse (Projektvorgabe)")
        self.user_agent, self.budget = user_agent, budget
        self._opener = opener or self._urlopen
        self._sleep, self._clock, self._last = sleep, clock, None
        self.stats = {"requests": 0, "ok": 0, "failed": 0, "byKind": {"submissions": 0, "header": 0}}

    @staticmethod
    def _urlopen(url, headers, timeout):
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=timeout) as r:
            payload = r.read()
            return gzip.decompress(payload) if r.headers.get("Content-Encoding") == "gzip" else payload

    def get(self, url, kind):
        if not self.budget.take():
            return None
        if self._last is not None:
            wait = self._last + MIN_INTERVAL_S - self._clock()
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()
        self.stats["requests"] += 1
        self.stats["byKind"][kind] += 1
        try:
            body = self._opener(url, {"User-Agent": self.user_agent, "Accept-Encoding": "gzip"}, TIMEOUT_S)
            self.stats["ok"] += 1
            return body
        except Exception:  # noqa: BLE001 - jeder Fehler zaehlt als fehlgeschlagen, nie als leere SIC
            self.stats["failed"] += 1
            return None


def pick_filings(recent, max_headers):
    """Gleichmaessig ueber die Zeit verteilte Auswahl, aelteste und neueste eingeschlossen (deterministisch)."""
    rows = [(d, a, f) for d, a, f in zip(recent.get("filingDate", []), recent.get("accessionNumber", []), recent.get("form", []))
            if f in PERIODIC_FORMS]
    rows.sort()
    if len(rows) <= max_headers:
        return rows
    if max_headers == 1:
        return [rows[-1]]
    idx = sorted({round(i * (len(rows) - 1) / (max_headers - 1)) for i in range(max_headers)})
    return [rows[i] for i in idx]


def sample_issuer(fetcher, cik, max_headers):
    cik = SH.normalize_cik(cik)
    raw = fetcher.get(f"https://data.sec.gov/submissions/CIK{cik}.json", "submissions")
    if raw is None:
        return None, {"cik": cik, "reason": "SUBMISSIONS_UNAVAILABLE"}
    sub = json.loads(raw)
    chosen = pick_filings(sub.get("filings", {}).get("recent", {}), max_headers)
    observations, quarantine = [], []
    for _, acc, _form in chosen:
        body = fetcher.get(SH.header_url(cik, acc), "header")
        if body is None:
            quarantine.append({"cik": cik, "accession": acc, "reason": "HEADER_UNAVAILABLE"})
            continue
        obs, q = SH.parse_header(body, cik, acc)
        if q:
            quarantine.append(q)
        else:
            observations.append(obs)
    observations.sort(key=SH._obs_sort_key)  # noqa: SLF001 - dieselbe Ordnung wie die Basis
    rec = SH._issuer_record(cik, observations)  # noqa: SLF001
    rec["currentSicNotPit"] = SH.normalize_sic(str(sub.get("sic") or ""))
    rec["recentFilingsListed"] = len(sub.get("filings", {}).get("recent", {}).get("accessionNumber", []))
    rec["headersRead"] = len(observations)
    return rec, quarantine


def ciks_from_instruments(directory, n):
    """Deterministische Stichprobe: jede k-te CIK des Wertpapierstamms (sortiert)."""
    ciks = set()
    for f in sorted(Path(directory).glob("*.json")):
        for x in json.loads(f.read_text()).get("instruments", []):
            if x.get("cik"):
                ciks.add(SH.normalize_cik(x["cik"]))
    ordered = sorted(ciks)
    step = max(1, len(ordered) // n)
    return ordered[::step][:n]


def main(argv=None, opener=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--ciks", default="")
    p.add_argument("--instruments-sample", type=int, default=0)
    p.add_argument("--instruments", default=str(ROOT / "quant/data/universe/instruments"))
    p.add_argument("--max-headers-per-issuer", type=int, default=6)
    p.add_argument("--budget", type=int, default=400)
    p.add_argument("--out", required=True)
    a = p.parse_args(argv)
    out = Path(a.out).resolve()
    for owned in ("quant/data", "discover/data", "supertrader/data", "social/data"):
        if str(out).startswith(str((ROOT / owned).resolve()) + os.sep):
            raise SystemExit(f"OUT_IN_PRODUCER_OWNED_TREE: {owned}")
    ciks = [SH.normalize_cik(c) for c in a.ciks.split(",") if c.strip()]
    if a.instruments_sample:
        ciks += [c for c in ciks_from_instruments(a.instruments, a.instruments_sample) if c not in ciks]
    if not ciks:
        raise SystemExit("keine CIK gewaehlt (--ciks oder --instruments-sample)")
    if len(ciks) > MAX_ISSUERS:
        raise SystemExit(f"hoechstens {MAX_ISSUERS} Emittenten je Stichprobe ({len(ciks)} gewaehlt)")
    ua = os.environ.get("SEC_RESEARCH_USER_AGENT", DEFAULT_USER_AGENT)
    fetcher = Fetcher(ua, Budget(a.budget), opener=opener)
    issuers, quarantine, missing = {}, [], []
    for cik in ciks:
        rec, q = sample_issuer(fetcher, cik, a.max_headers_per_issuer)
        if rec is None:
            missing.append(q)
            continue
        issuers[cik] = rec
        quarantine += q
    result = {
        "schemaVersion": SH.SCHEMA_VERSION,
        "producer": VERSION,
        "run": {"userAgent": ua, "budget": a.budget, "refusedOverBudget": fetcher.budget.refused, "maxHeadersPerIssuer": a.max_headers_per_issuer, **fetcher.stats},
        "issuers": issuers,
        "quarantine": quarantine,
        "missing": missing,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, sort_keys=True, indent=1) + "\n")
    print(json.dumps({"issuers": len(issuers), "missing": len(missing), "quarantine": len(quarantine), **result["run"]}, sort_keys=True))
    return result


if __name__ == "__main__":
    main()
