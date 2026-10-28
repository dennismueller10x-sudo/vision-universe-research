"""Original-filing access for V9 secpit: filing index, XBRL instance, SGML header.

All bodies are cached in private scratch through the repo's SECHttpClient
(2 req/s). Parsing uses the stdlib expat-based ElementTree (expat in Python
>= 3.7.1 refuses external entities; the documents are SEC-hosted).
"""
import datetime
import json
import re
import zoneinfo
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation

from common import sha256_bytes

ARCHIVE = "https://www.sec.gov/Archives/edgar/data/%s/%s/"
XBRLI = "{http://www.xbrl.org/2003/instance}"
SKIP_SUFFIX = re.compile(r"(_cal|_def|_lab|_pre|_ref)\.xml$", re.I)


def acc_nodash(acc):
    return acc.replace("-", "")


def filing_index(client, cik, acc):
    url = ARCHIVE % (int(cik), acc_nodash(acc)) + "index.json"
    body = client.get_bytes(url)
    data = json.loads(body)
    return url, [item["name"] for item in data.get("directory", {}).get("item", [])]


def choose_instance(names):
    # Run-1 fix (documented in parity-results.json): pre-2012 filings carry
    # 'defnref.xml' next to the instance; the instance is the .xml sharing the
    # schema's (.xsd) stem.
    xml = [n for n in names if n.lower().endswith(".xml") and not SKIP_SUFFIX.search(n)
           and n not in ("FilingSummary.xml", "defnref.xml") and not re.match(r"^R\d+\.xml$", n, re.I)]
    htm_xml = [n for n in xml if n.lower().endswith("_htm.xml")]
    if htm_xml:
        return sorted(htm_xml)[0]
    stems = {n[:-4] for n in names if n.lower().endswith(".xsd")}
    paired = [n for n in xml if n[:-4] in stems]
    if paired:
        return sorted(paired)[0]
    return sorted(xml, key=lambda n: (len(n), n))[0] if xml else None


def fetch_instance(client, cik, acc):
    index_url, names = filing_index(client, cik, acc)
    name = choose_instance(names)
    if not name:
        return {"state": "NO_INSTANCE", "indexUrl": index_url, "files": len(names)}
    url = ARCHIVE % (int(cik), acc_nodash(acc)) + name
    body = client.get_bytes(url)
    return {"state": "OK", "indexUrl": index_url, "url": url, "name": name, "body": body,
            "sha256": sha256_bytes(body), "bytes": len(body)}


def _taxonomy(uri):
    # 2009-2011 instances use http://xbrl.us/us-gaap/2009-01-31 and http://xbrl.us/dei/2009-01-31
    if "fasb.org/us-gaap" in uri or "xbrl.us/us-gaap" in uri:
        return "us-gaap"
    if "xbrl.sec.gov/dei" in uri or "xbrl.us/dei" in uri:
        return "dei"
    if "ifrs" in uri:
        return "ifrs-full"
    if "fasb.org/srt" in uri:
        return "srt"
    return uri


def parse_instance(body):
    """Return (contexts, units, facts).

    contexts: id -> {start, end, instant, dimensional}
    facts: list of {taxonomy, concept, context, unit, raw, value(Decimal|None), decimals}
    """
    root = ET.fromstring(body)
    contexts, units, facts = {}, {}, []
    for ctx in root.iter(XBRLI + "context"):
        period = ctx.find(XBRLI + "period")
        start = period.findtext(XBRLI + "startDate")
        end = period.findtext(XBRLI + "endDate")
        instant = period.findtext(XBRLI + "instant")
        entity = ctx.find(XBRLI + "entity")
        dimensional = (entity is not None and entity.find(XBRLI + "segment") is not None) or \
            ctx.find(XBRLI + "scenario") is not None
        contexts[ctx.get("id")] = {"start": (start or "").strip()[:10] or None,
                                   "end": ((end or instant) or "").strip()[:10] or None,
                                   "instant": instant is not None, "dimensional": dimensional}
    for unit in root.iter(XBRLI + "unit"):
        measures = [m.text.split(":")[-1] for m in unit.iter(XBRLI + "measure") if m.text]
        if unit.find(XBRLI + "divide") is not None:
            num = [m.text.split(":")[-1] for m in unit.find(XBRLI + "divide").find(XBRLI + "unitNumerator").iter(XBRLI + "measure")]
            den = [m.text.split(":")[-1] for m in unit.find(XBRLI + "divide").find(XBRLI + "unitDenominator").iter(XBRLI + "measure")]
            units[unit.get("id")] = "%s/%s" % ("*".join(num), "*".join(den))
        else:
            units[unit.get("id")] = "*".join(measures)
    for el in root:
        ref = el.get("contextRef")
        if ref is None or not el.tag.startswith("{"):
            continue
        uri, local = el.tag[1:].split("}", 1)
        raw = (el.text or "").strip()
        try:
            value = Decimal(raw) if raw else None
        except InvalidOperation:
            value = None
        facts.append({"taxonomy": _taxonomy(uri), "concept": local, "context": ref,
                      "unit": units.get(el.get("unitRef")), "raw": raw[:300], "value": value,
                      "decimals": el.get("decimals")})
    return contexts, units, facts


def dei_values(contexts, facts, concept):
    return sorted({f["raw"] for f in facts if f["taxonomy"] == "dei" and f["concept"] == concept})


def header_acceptance(client, cik, acc):
    """ACCEPTANCE-DATETIME from the SGML header (US Eastern) -> UTC ISO."""
    url = ARCHIVE % (int(cik), acc_nodash(acc)) + acc + "-index-headers.html"
    body = client.get_bytes(url)
    found = re.search(rb"<ACCEPTANCE-DATETIME>(\d{14})", body)
    if not found:
        return {"state": "HEADER_NOT_FOUND", "url": url, "sha256": sha256_bytes(body)}
    raw = found.group(1).decode()
    eastern = datetime.datetime.strptime(raw, "%Y%m%d%H%M%S").replace(
        tzinfo=zoneinfo.ZoneInfo("America/New_York"))
    utc = eastern.astimezone(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    period = re.search(rb"CONFORMED PERIOD OF REPORT:\s*(\d{8})", body)
    return {"state": "OK", "url": url, "sha256": sha256_bytes(body), "rawEastern": raw, "acceptanceUtc": utc,
            "periodOfReport": period.group(1).decode() if period else None}
