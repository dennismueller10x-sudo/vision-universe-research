"""V9 portfolio stream: rate-limited SEC access via the repository client.

Raw bodies stay in the private scratch cache (never in the repository).
Hard limit: 2 requests/second for this stream (shared SEC fair-access budget).
"""
import datetime
import hashlib
import json
import os
import re
import sys
import zoneinfo
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))
from scripts.quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter  # noqa: E402

PRIVATE = Path(os.environ.get(
    "V9_PORTFOLIO_PRIVATE",
    "/tmp/claude-0/-home-user-vision-universe-research/84af0cda-6f74-5ce8-afa8-dfb2e62db3b4/scratchpad/v9-private/portfolio"))
if PRIVATE == ROOT or ROOT in PRIVATE.resolve().parents:
    raise SystemExit("PRIVATE_OUTPUT_REQUIRED")

_client = None


def client():
    global _client
    if _client is None:
        _client = SECHttpClient(cache=DiskCache(PRIVATE / "http-cache", ttl_seconds=None),
                                rate_limiter=RateLimiter(rate_per_second=2, burst=2))
    return _client


def get(url):
    return client().get_bytes(url)


def get_json(url):
    return json.loads(get(url))


def sha(b):
    return hashlib.sha256(b).hexdigest()


def submissions(cik):
    """All filings (recent + older pages) as list of dicts."""
    cik10 = str(int(cik)).zfill(10)
    root = get_json(f"https://data.sec.gov/submissions/CIK{cik10}.json")
    pages = [root["filings"]["recent"]]
    for f in root["filings"].get("files", []):
        pages.append(get_json("https://data.sec.gov/submissions/" + f["name"]))
    rows = []
    for p in pages:
        keys = list(p.keys())
        for i in range(len(p["accessionNumber"])):
            rows.append({k: p[k][i] for k in keys})
    return root, rows


def archive_base(cik, acc):
    return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/"


def header(cik, acc):
    """SGML header (index-headers) -> acceptance in US/Eastern and UTC."""
    url = archive_base(cik, acc) + f"{acc}-index-headers.html"
    raw = get(url)
    text = raw.decode("utf8", "replace")
    m = re.search(r"<ACCEPTANCE-DATETIME>(\d{14})", text)
    if not m:
        return {"url": url, "sha256": sha(raw), "state": "HEADER_NOT_FOUND"}
    east = datetime.datetime.strptime(m.group(1), "%Y%m%d%H%M%S").replace(
        tzinfo=zoneinfo.ZoneInfo("America/New_York"))
    utc = east.astimezone(datetime.timezone.utc)
    return {"url": url, "sha256": sha(raw), "rawEastern": m.group(1),
            "acceptanceUtc": utc.strftime("%Y-%m-%dT%H:%M:%S.000Z"), "text": text}


def index_json(cik, acc):
    return get_json(archive_base(cik, acc) + "index.json")


def html_text(raw):
    t = raw.decode("utf8", "replace")
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?is)<ix:header>.*?</ix:header>", " ", t)
    t = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|td|th|li|h\d)>", "\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    import html as _h
    t = _h.unescape(t).replace("\xa0", " ").replace("​", "")
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    t = re.sub(r"\n\s*", "\n", t)
    return t
