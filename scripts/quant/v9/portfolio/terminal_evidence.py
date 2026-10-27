#!/usr/bin/env python3
"""V9 portfolio: terminal (merger / cash-out / stock-exchange) dossiers from SEC.

For daily series that end materially before 2026-10-26, locate the issuer's
completion 8-K (Item 2.01 / 3.01 / 5.01), Form 25 / 25-NSE and merger proxy /
registration filings, and extract the stated per-share consideration and the
completion date with verbatim quotes. Nothing is inferred: if the consideration
or date is not stated in the fetched documents, the dossier says so.

The four weekly INACTIVE ids (BGC, COHR, DCOM, TRAK) are owned by workstream A
and are NOT analysed here.
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import secfetch as S  # noqa: E402
from harvest_dividends import DATE, iso, dates_in  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
CANDIDATES = [
    ("DBRG", "DigitalBridge Group"), ("LBRDK", "Liberty Broadband"), ("TWO", "Two Harbors Investment"),
    ("WBS", "Webster Financial"), ("LEG", "Leggett & Platt"), ("HLX", "Helix Energy Solutions"),
    ("CRNX", "Crinetics Pharmaceuticals"), ("AVB", "AvalonBay Communities"), ("TALK", "Talkspace"),
    ("RMAX", "RE/MAX Holdings"), ("DOMO", "Domo"), ("APGE", "Apogee Therapeutics"),
]


def resolve_cik(ticker, name):
    u = ("https://efts.sec.gov/LATEST/search-index?q=" + urllib.parse.quote('"' + name + '"')
         + "&forms=8-K&dateRange=custom&startdt=2025-06-01&enddt=2026-10-27")
    for h in S.get_json(u)["hits"]["hits"]:
        for dn in h["_source"].get("display_names", []):
            m = re.search(r"\((?:[A-Z.,\- ]+, )*" + re.escape(ticker) + r"(?:, [A-Z.\- ]+)*\)\s+\(CIK (\d{10})\)", dn)
            if m:
                return int(m.group(1)), dn
    return None, None


NP = r"(?:[^.]|\.(?=\d))"
CONSID = re.compile(r"(?i)(?:converted into|exchanged for|cancelled[^.]{0,40}?in exchange for)" + NP + r"{0,40}?right to receive" + NP + r"{0,600}")


def extract(t):
    flat = re.sub(r"\s+", " ", t)
    out = {"considerationQuotes": [], "cashPerShare": [], "shareRatios": [], "completionDates": [], "tradingQuotes": []}
    for m in CONSID.finditer(flat):
        q = flat[m.start():m.end()][:300]
        out["considerationQuotes"].append(q)
        for c in re.finditer(r"\$\s?(\d+(?:\.\d+)?)\s*(?:in cash|per share in cash|, in cash|, without interest|\(the)", m.group(0)):
            out["cashPerShare"].append(c.group(1))
        for r_ in re.finditer(r"(\d+\.\d+)\s*(?:\([^)]{0,40}\)\s*)?(?:validly issued[^.]{0,60})?(?:shares?|fully paid|American Depositary)[^;]{0,120}?(?:common stock|ordinary shares|American Depositary Shares|ADS)", m.group(0), re.I):
            out["shareRatios"].append(r_.group(1))
    for m in re.finditer(r"(?i)On\s+" + DATE + NP + r"{0,200}?(?:completed|consummated)" + NP + r"{0,200}?(?:merger|acquisition|transaction|Mergers)", flat):
        out["completionDates"].append({"date": iso(*m.groups()[0:3]), "quote": flat[m.start():m.end()][:300]})
    for m in re.finditer(r"(?i)(?:ceased trading|suspend(?:ed)? trading|halt(?:ed)? trading|delist|removal from listing)[^.]{0,250}", flat):
        out["tradingQuotes"].append(flat[max(0, m.start() - 120):m.end()][:300])
    for k in ("cashPerShare", "shareRatios"):
        out[k] = sorted(set(out[k]))
    out["considerationQuotes"] = out["considerationQuotes"][:4]
    out["tradingQuotes"] = out["tradingQuotes"][:4]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    dossiers = []
    for tk, name in CANDIDATES:
        ser = json.loads((ROOT / f"quant/data/market/discover-series/ref_{tk}.json").read_text())
        pts = ser["points"]
        tail_flat = 0
        for i in range(len(pts) - 1, 0, -1):
            if pts[i][1] == pts[i - 1][1]:
                tail_flat += 1
            else:
                break
        dos = {"ticker": tk, "securityId": "ref_" + tk, "seriesLastDate": pts[-1][0], "seriesLastClose": pts[-1][1],
               "trailingUnchangedCloses": tail_flat, "seriesSha256": hashlib.sha256((ROOT / f"quant/data/market/discover-series/ref_{tk}.json").read_bytes()).hexdigest()}
        cik, dn = resolve_cik(tk, name)
        dos.update({"cik": cik, "secDisplayName": dn})
        if not cik:
            dos["status"] = "CIK_NOT_RESOLVED"
            dossiers.append(dos)
            continue
        _, subs = S.submissions(cik)
        rel = [r for r in subs if r["filingDate"] >= "2025-06-01" and (
            (r["form"] == "8-K" and set(r.get("items", "").split(",")) & {"2.01", "3.01", "5.01"})
            or r["form"] in ("25", "25-NSE", "15-12B", "15-12G", "DEFM14A", "S-4", "424B3", "SC TO-T", "SC 14D9"))]
        dos["filings"] = [{"form": r["form"], "accession": r["accessionNumber"], "filingDate": r["filingDate"],
                           "acceptanceUtc": r["acceptanceDateTime"], "items": r.get("items"), "primaryDocument": r["primaryDocument"]} for r in rel]
        docs = []
        for r in [r for r in rel if r["form"] == "8-K" and "2.01" in r.get("items", "")][:2]:
            ix = S.index_json(cik, r["accessionNumber"])
            names = [it["name"] for it in ix["directory"]["item"] if re.search(r"\.htm$", it["name"]) and not re.match(r"R\d+\.htm", it["name"])]
            for n in names[:4]:
                url = S.archive_base(cik, r["accessionNumber"]) + n
                raw = S.get(url)
                ex = extract(S.html_text(raw))
                if any(ex[k] for k in ("considerationQuotes", "completionDates", "tradingQuotes")):
                    hd = S.header(cik, r["accessionNumber"])
                    docs.append({"accession": r["accessionNumber"], "file": n, "url": url, "sha256": S.sha(raw), "form": "8-K", "items": r.get("items"),
                                 "acceptanceUtc": hd.get("acceptanceUtc"), "headerSha256": hd["sha256"], **ex})
        dos["documents"] = docs
        cash = sorted({c for d in docs for c in d["cashPerShare"]})
        ratio = sorted({c for d in docs for c in d["shareRatios"]})
        comp = sorted({c["date"] for d in docs for c in d["completionDates"]})
        dos["statedCashPerShare"], dos["statedShareRatios"], dos["statedCompletionDates"] = cash, ratio, comp
        dos["form25"] = [f for f in dos["filings"] if f["form"] in ("25", "25-NSE")]
        dos["status"] = ("DOCUMENTED" if (cash or ratio) and len(comp) == 1 else "PARTIAL" if docs else "NO_COMPLETION_8K_FOUND")
        dossiers.append(dos)
        print(tk, cik, dos["status"], cash, ratio, comp, len(dos["form25"]), flush=True)
    rep = {"schemaVersion": "v9-portfolio-terminal-evidence-1.0.0", "codeSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "selection": "daily discover-series ending materially before 2026-10-26 (62 ids); 12 operating-company candidates with likely M&A completion examined; ETFs/units/preferreds/warrants not examined",
           "crossReferenceOnly": {"ref_BGC": "workstream A", "ref_COHR": "workstream A", "ref_DCOM": "workstream A", "ref_TRAK": "workstream A"},
           "dossiers": dossiers, "certification": "NOT_CERTIFIED", "productionApproved": False}
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")


if __name__ == "__main__":
    main()
