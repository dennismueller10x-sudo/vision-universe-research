"""Gepruefte firmeneigene XBRL-Konzepte eines Emittenten (quant/config/sec-issuer-extensions.json).

WARUM ES DAS BRAUCHT

companyfacts.zip enthaelt nur Standard-Taxonomien (us-gaap, ifrs-full, dei,
srt ...). Meldet ein Emittent eine Position mit einem eigenen Konzept, fehlt
sie dort ganz: NVIDIA weist den Investitionsabfluss der Geschaeftsjahre 2013
bis 2021 nur als nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets aus,
und damit fehlten Investitionen und freier Cashflow fuer neun Jahre.

WAS ES TUT

  - Es liest den Wert aus dem Instanzdokument der Meldung selbst, nicht aus
    einer Abschrift. Jedes Dokument ist gepinnt (Accession, Dateiname,
    SHA-256); ein abweichendes Dokument wird nicht gelesen.
  - Uebernommen werden nur Werte ohne Dimension (kein Segment, kein
    Szenario), mit der Einheit der Regel, fuer Meldungen, die companyfacts
    kennt - Geschaeftsjahr, Form und Einreichungsdatum kommen von dort.
  - Die Regel gilt nur fuer die genannte CIK (MetricRegistry.attach_issuer_rules)
    und hat eine niedrigere Prioritaet als jedes generische Konzept: meldet
    dieselbe Meldung ein akzeptiertes Standard-Konzept, gewinnt es.

WAS ES NICHT TUT

  - Keine Zuordnung fuer ein anderes Unternehmen, keine Umbenennung eines
    Konzepts: der Wert behaelt seine Herkunft (nvda:...).
  - Kein Ersatz eines vorhandenen Fakts, keine Schaetzung. Fehlt ein
    Dokument oder passt der Pin nicht, bleibt die Luecke.
"""
import copy
import hashlib
import io
import json
import logging
import xml.etree.ElementTree as ET
from pathlib import Path

from .provider import normalize_cik

LOGGER = logging.getLogger("vu.sec.issuer_extensions")

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_PATH = ROOT / "quant" / "config" / "sec-issuer-extensions.json"
ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"
SOURCE_LABEL = "SEC EDGAR XBRL-Instanzdokument (gepinnt)"

# Eine Erweiterung darf keine Standard-Taxonomie umdeuten - das waere eine
# generische Zuordnung und gehoert in die Metric Registry.
STANDARD_TAXONOMIES = frozenset({"us-gaap", "ifrs-full", "dei", "srt", "invest", "ecd", "ffd"})

XBRLI = "http://www.xbrl.org/2003/instance"


class ExtensionError(ValueError):
    pass


def load(path=DEFAULT_PATH):
    """The validated configuration; an absent file is an empty one."""
    path = Path(path)
    if not path.exists():
        return {"version": None, "extensions": []}
    payload = json.loads(path.read_text(encoding="utf-8"))
    seen = set()
    for ext in payload.get("extensions") or []:
        for key in ("id", "cik", "taxonomy", "concept", "metric", "priority", "unit", "filings"):
            if not ext.get(key):
                raise ExtensionError(f"extension {ext.get('id')}: {key} fehlt")
        if ext["id"] in seen:
            raise ExtensionError(f"extension {ext['id']}: doppelt")
        seen.add(ext["id"])
        if ext["taxonomy"] in STANDARD_TAXONOMIES:
            raise ExtensionError(f"extension {ext['id']}: {ext['taxonomy']} ist eine Standard-Taxonomie")
        ext["cik"] = normalize_cik(ext["cik"])
        for filing in ext["filings"]:
            if not filing.get("accession") or not filing.get("document") or len(filing.get("sha256") or "") != 64:
                raise ExtensionError(f"extension {ext['id']}: Meldung ohne Accession, Dokument oder SHA-256")
    return payload


def document_url(cik, filing):
    return ARCHIVE_URL.format(cik=int(cik), accession=filing["accession"].replace("-", ""),
                              document=filing["document"])


def parse_instance(raw, taxonomy, concepts):
    """[(concept, unit, start or None, end, value)] of an XBRL instance for `taxonomy`.

    Only contexts without segment or scenario. The taxonomy is the prefix the
    document itself declares (nvda -> http://www.nvidia.com/2013...), so a
    concept of the same local name in another namespace is not read.
    """
    namespaces = {}
    for _, (prefix, uri) in ET.iterparse(io.BytesIO(raw), events=("start-ns",)):
        namespaces.setdefault(prefix, uri)
    uri = namespaces.get(taxonomy)
    if uri is None:
        return []
    root = ET.fromstring(raw)
    contexts = {}
    for ctx in root.iter(f"{{{XBRLI}}}context"):
        entity = ctx.find(f"{{{XBRLI}}}entity")
        if ctx.find(f"{{{XBRLI}}}scenario") is not None or (
                entity is not None and entity.find(f"{{{XBRLI}}}segment") is not None):
            continue
        period = ctx.find(f"{{{XBRLI}}}period")
        if period is None:
            continue
        start, end, instant = (period.findtext(f"{{{XBRLI}}}{tag}") for tag in ("startDate", "endDate", "instant"))
        if start and end:
            contexts[ctx.get("id")] = (start.strip(), end.strip())
        elif instant:
            contexts[ctx.get("id")] = (None, instant.strip())
    units = {}
    for unit in root.iter(f"{{{XBRLI}}}unit"):
        measures = [m.text.strip().split(":")[-1] for m in unit.iter(f"{{{XBRLI}}}measure") if m.text]
        if len(measures) == 1:
            units[unit.get("id")] = measures[0]
    out, seen = [], set()
    for concept in concepts:
        for element in root.iter(f"{{{uri}}}{concept}"):
            period = contexts.get(element.get("contextRef"))
            unit = units.get(element.get("unitRef"))
            text = (element.text or "").strip()
            if period is None or unit is None or not text or element.get(f"{{http://www.w3.org/2001/XMLSchema-instance}}nil") == "true":
                continue
            try:
                value = float(text)
            except ValueError:
                continue
            key = (concept, unit, period[0], period[1], value)
            if key not in seen:
                seen.add(key)
                out.append(key)
    return out


def fetch_facts(client, config, cache_dir, log=print):
    """{cik: [{taxonomy, concept, unit, start, end, value, accession}]} from the pinned documents.

    A document that cannot be loaded or does not match its pin is reported and
    skipped: the extension completes a gap and never fails the data run.
    """
    out = {}
    for ext in config.get("extensions") or []:
        for filing in ext["filings"]:
            target = Path(cache_dir) / "issuer-extensions" / filing["accession"] / filing["document"]
            try:
                path, _, _ = client.download_to(document_url(ext["cik"], filing), target)
                raw = Path(path).read_bytes()
            except Exception as exc:  # noqa: BLE001 - eine fehlende Meldung ist eine Luecke, kein Abbruch
                log(f"  {ext['id']} {filing['accession']}: nicht verfuegbar ({str(exc)[:160]})")
                continue
            digest = hashlib.sha256(raw).hexdigest()
            if digest != filing["sha256"]:
                log(f"  {ext['id']} {filing['accession']}: SHA-256 {digest[:12]} statt {filing['sha256'][:12]} - nicht gelesen")
                target.unlink(missing_ok=True)
                continue
            for concept, unit, start, end, value in parse_instance(raw, ext["taxonomy"], [ext["concept"]]):
                if unit != ext["unit"]:
                    continue
                out.setdefault(ext["cik"], []).append({"taxonomy": ext["taxonomy"], "concept": concept, "unit": unit,
                                                       "start": start, "end": end, "value": value,
                                                       "accession": filing["accession"]})
    return out


def save_facts(facts, path):
    Path(path).write_text(json.dumps(facts, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


def load_facts(path):
    return {normalize_cik(cik): rows for cik, rows in json.loads(Path(path).read_text(encoding="utf-8")).items()}


def supplement_company_facts(company_facts, facts):
    """(payload, accessions): one CIK's extension facts merged into its companyfacts payload.

    Filing metadata (fy, fp, form, filed) is taken from what companyfacts
    reports for the same accession; a filing companyfacts does not know is not
    merged. Nothing already in the payload is changed.
    """
    if not facts:
        return company_facts, []
    meta = {}
    for concepts in (company_facts.get("facts") or {}).values():
        for body in (concepts or {}).values():
            for entries in ((body or {}).get("units") or {}).values():
                for entry in entries or []:
                    if entry.get("accn") and entry.get("filed"):
                        meta.setdefault(entry["accn"], {k: entry.get(k) for k in ("fy", "fp", "form", "filed")})
    usable = [f for f in facts if f["accession"] in meta]
    if not usable:
        return company_facts, []
    merged = copy.deepcopy(company_facts)
    target = merged.setdefault("facts", {})
    for fact in sorted(usable, key=lambda f: (f["accession"], f["concept"], f["end"], f["start"] or "")):
        entry = {"end": fact["end"], "val": fact["value"], "accn": fact["accession"], **meta[fact["accession"]]}
        if fact["start"]:
            entry["start"] = fact["start"]
        units = target.setdefault(fact["taxonomy"], {}).setdefault(fact["concept"], {"units": {}}).setdefault("units", {})
        units.setdefault(fact["unit"], []).append(entry)
    return merged, sorted({f["accession"] for f in usable})
