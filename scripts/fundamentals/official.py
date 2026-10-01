"""Official filing -> existing canonical FundamentalFact, with Arelle iXBRL.

No financial website/PDF extraction. A manifest supplies verified entity identity,
publication evidence and fiscal periods; absent metadata is a blocking data gap.
Standard concepts reuse the existing registry. Issuer extensions need documented
semantic equivalence, not merely a similar label or wider/narrower anchoring.
"""
import argparse
import hashlib
import json
import math
import re
import sys
import zipfile
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from scripts.quant.sec.registry import MetricRegistry
from scripts.quant.sec.canonical import METRIC_MAP
from scripts.universe.global_equities import write_json, EUROPE

SOURCE_SYSTEMS = {"ESEF", "UK_OFFICIAL", "SWISS_OFFICIAL", "ISSUER_STRUCTURED"}
NORMALIZATION_VERSION = "official-filings-1.0.0"
NAMESPACE = re.compile(r"https?://xbrl\.ifrs\.org/taxonomy/\d{4}-\d{2}-\d{2}/ifrs-full$")
# Additional canonical metrics are additive; the protected SEC exporter keeps
# its existing metric set. Resolution still uses its verified concept registry.
CANONICAL_METRICS = {**METRIC_MAP,
    "operating_cash_flow": ("operatingCashFlow", "usd_m", 1e-6),
    "cash_and_equivalents": ("cash", "usd_m", 1e-6),
    "total_debt": ("totalDebt", "usd_m", 1e-6),
    "total_liabilities": ("totalLiabilities", "usd_m", 1e-6),
    "eps_basic": ("epsBasic", "usd", 1.0),
    "eps_diluted": ("epsDiluted", "usd", 1.0)}


def validate_manifest(manifest):
    required = {"companyId", "entityIdentifier", "sourceSystem", "sourceDocument", "documentId", "filingDate", "periods", "country"}
    if not required.issubset(manifest):
        raise ValueError("FILING_MANIFEST_INCOMPLETE")
    if manifest["sourceSystem"] not in SOURCE_SYSTEMS:
        raise ValueError("FILING_SOURCE_UNSUPPORTED")
    if manifest["sourceSystem"] == "ESEF" and (manifest["country"] not in EUROPE or manifest["country"] in {"GB", "CH"}):
        raise ValueError("ESEF_JURISDICTION_UNVERIFIED")
    if (manifest["sourceSystem"] == "UK_OFFICIAL" and manifest["country"] != "GB") or (manifest["sourceSystem"] == "SWISS_OFFICIAL" and manifest["country"] != "CH"):
        raise ValueError("FILING_JURISDICTION_MISMATCH")
    url = urlsplit(manifest["sourceDocument"])
    if url.scheme != "https" or url.username or url.password or url.query:
        raise ValueError("OFFICIAL_SOURCE_URL_INVALID")
    if url.hostname not in manifest.get("officialHosts", []):
        raise ValueError("OFFICIAL_SOURCE_HOST_UNVERIFIED")
    if not manifest.get("publicationEvidence") or not manifest.get("identityEvidence"):
        raise ValueError("FILING_EVIDENCE_MISSING")
    filed = date.fromisoformat(manifest["filingDate"])
    if filed > datetime.now(timezone.utc).date():
        raise ValueError("FILING_DATE_IN_FUTURE")
    available = manifest.get("acceptedAt")
    if available:
        dt = datetime.fromisoformat(available.replace("Z", "+00:00"))
        if dt.tzinfo is None or dt.astimezone(timezone.utc).date() < filed or dt > datetime.now(timezone.utc):
            raise ValueError("FILING_ACCEPTANCE_INVALID")
        available = dt.astimezone(timezone.utc).isoformat()
    else:
        # Date-only publication is unknown intraday. Expose only at EOD,
        # matching daily PIT queries without inventing a midnight timestamp.
        available = filed.isoformat() + "T23:59:59.999999+00:00"
    if not manifest["periods"]:
        raise ValueError("FILING_PERIODS_MISSING")
    for p in manifest["periods"]:
        end = date.fromisoformat(p["end"])
        start = date.fromisoformat(p["start"]) if p.get("start") else None
        if end > filed or (start and start >= end) or p["fiscalPeriod"] not in {"FY", "Q1", "Q2", "Q3", "Q4", "H1", "H2", "9M"}:
            raise ValueError("FILING_PERIOD_INVALID")
        if not isinstance(p["fiscalYear"], int):
            raise ValueError("FILING_FISCAL_YEAR_INVALID")
    return available


def resolve_concept(namespace, concept, registry, extensions):
    if NAMESPACE.fullmatch(namespace):
        return registry.metrics_for_concept("ifrs-full", concept)
    if re.fullmatch(r"https?://fasb\.org/us-gaap/\d{4}", namespace):
        return registry.metrics_for_concept("us-gaap", concept)
    mapping = extensions.get("{" + namespace + "}" + concept)
    if not mapping:
        return []
    if mapping.get("status") != "VERIFIED_EQUIVALENT" or not all(mapping.get(k) for k in ("labelEvidence", "presentationEvidence", "calculationEvidence", "semanticReview")):
        return []
    return [(mapping["metric"], 999)] if registry.get(mapping["metric"]) else []


def unit_of(unit):
    if unit is None:
        return None
    numerator, denominator = unit.measures
    def measure(q):
        if q.namespaceURI == "http://www.xbrl.org/2003/iso4217" and re.fullmatch(r"[A-Z]{3}", q.localName):
            return q.localName
        if q.namespaceURI == "http://www.xbrl.org/2003/instance" and q.localName in {"shares", "pure"}:
            return q.localName
        return None
    if len(numerator) != 1 or len(denominator) > 1:
        return None
    n = measure(numerator[0])
    d = measure(denominator[0]) if denominator else None
    return (n + "/" + d) if n and d else n if n and not denominator else None


def normalize_model(model, manifest, available, registry=None, retrieved_at=None):
    registry = registry or MetricRegistry.load()
    retrieved_at = retrieved_at or datetime.now(timezone.utc).isoformat()
    extensions = manifest.get("extensionMappings", {})
    candidates, issues = {}, []
    for fact in model.factsInInstance:
        if fact.isNil or not fact.isNumeric:
            continue
        ctx = fact.context
        concept = fact.concept
        if ctx is None or concept is None or ctx.entityIdentifier[1] != manifest["entityIdentifier"]:
            issues.append({"concept": str(fact.qname), "reason": "ENTITY_OR_CONCEPT_UNRESOLVED"}); continue
        if ctx.qnameDims or ctx.nonDimValues("segment") or ctx.nonDimValues("scenario"):
            issues.append({"concept": str(fact.qname), "reason": "DIMENSIONAL_FACT_NOT_CONSOLIDATED"}); continue
        # Arelle validates transformation, sign, scale, type and decimals.
        if fact.xValid < 4:
            issues.append({"concept": str(fact.qname), "reason": "XBRL_VALUE_INVALID"}); continue
        end_dt = ctx.instantDatetime if ctx.isInstantPeriod else ctx.endDatetime if ctx.isStartEndPeriod else None
        if not end_dt:
            continue
        # XBRL end/instant datetimes are exclusive (following midnight).
        end = (end_dt - timedelta(days=1)).date().isoformat()
        start = ctx.startDatetime.date().isoformat() if ctx.isStartEndPeriod else None
        periods = [p for p in manifest["periods"] if p["end"] == end and (not start or p.get("start") == start)]
        if len(periods) != 1:
            issues.append({"concept": str(fact.qname), "reason": "FISCAL_CONTEXT_UNRESOLVED"}); continue
        period = periods[0]
        unit = unit_of(fact.unit)
        mappings = resolve_concept(fact.qname.namespaceURI, fact.qname.localName, registry, extensions)
        if not mappings:
            issues.append({"concept": str(fact.qname), "reason": "CONCEPT_MAPPING_UNVERIFIED",
                           "label": concept.label(), "periodEnd": end}); continue
        for metric, priority in mappings:
            definition = registry.get(metric)
            if metric not in CANONICAL_METRICS or not definition.allows_unit(unit) or (definition.kind == "instant") != ctx.isInstantPeriod:
                issues.append({"concept": str(fact.qname), "reason": "UNIT_PERIOD_OR_CANONICAL_METRIC_UNSUPPORTED"}); continue
            value = float(fact.xValue)
            if not math.isfinite(value):
                continue
            metric_id, canonical_unit, scale = CANONICAL_METRICS[metric]
            if canonical_unit == "usd_m" and unit != "USD":
                canonical_unit = "currency_m"
            if canonical_unit == "usd" and not unit.startswith("USD"):
                canonical_unit = "currency"
            if definition.sign == "positive":
                value = abs(value)
            f = {"securityId": manifest["companyId"], "metricId": metric_id,
                 "fiscalYear": period["fiscalYear"], "fiscalPeriod": period["fiscalPeriod"], "periodEnd": end,
                 "value": value * scale, "unit": canonical_unit,
                 "reportedAt": manifest["filingDate"], "filedAt": manifest["filingDate"], "availableAt": available,
                 "ingestedAt": retrieved_at, "revisionId": int(manifest.get("revisionId", 0)),
                 "restatementStatus": "restated" if manifest.get("revisionId", 0) else "original",
                 "sourceFilingId": manifest["documentId"], "dataSourceId": "ds_official_filings_v1"}
            if canonical_unit not in {"count_m", "ratio"}:
                f["currency"] = unit.split("/")[0]
            provenance = {"sourceSystem": manifest["sourceSystem"], "sourceDocument": manifest["sourceDocument"],
                          "documentId": manifest["documentId"], "filingDate": manifest["filingDate"],
                          "acceptedAt": manifest.get("acceptedAt"), "availableAt": available, "periodStart": start,
                          "periodEnd": end, "originalConcept": "{" + fact.qname.namespaceURI + "}" + fact.qname.localName,
                          "normalizedMetric": metric_id, "reportedValue": str(fact.xValue), "normalizedValue": f["value"],
                          "currency": f.get("currency"), "unit": unit, "reportedOrDerived": "REPORTED",
                          "mappingStatus": "VERIFIED_STANDARD" if priority != 999 else "VERIFIED_EQUIVALENT",
                          "retrievedAt": retrieved_at, "contextId": ctx.id, "registryVersion": registry.version}
            key = (metric_id, end, period["fiscalPeriod"])
            candidates.setdefault(key, []).append((priority, f, provenance))
    facts, provenance = [], {}
    for key, options in sorted(candidates.items()):
        # Conflicting duplicates are quarantined, never averaged or guessed.
        if len({(o[1]["value"], o[1].get("currency"), o[1]["unit"]) for o in options}) > 1:
            issues.append({"metricId": key[0], "periodEnd": key[1], "reason": "CONFLICTING_FACTS"}); continue
        chosen = min(options, key=lambda o: o[0])
        facts.append(chosen[1]); provenance["|".join(key)] = chosen[2]
    return facts, provenance, issues


def ingest(document, manifest, entrypoint=None, offline=False):
    available = validate_manifest(manifest)
    from arelle import Cntlr, FileSource
    from arelle.XmlValidate import validate
    document = Path(document).resolve()
    digest = hashlib.sha256(document.read_bytes()).hexdigest()
    if manifest.get("documentSha256") and manifest["documentSha256"] != digest:
        raise ValueError("DOCUMENT_CHECKSUM_MISMATCH")
    with TemporaryDirectory(prefix="vu-official-") as temp:
        source = document
        packaged = zipfile.is_zipfile(document)
        if packaged:
            with zipfile.ZipFile(document) as archive:
                if sum(i.file_size for i in archive.infolist()) > 128 * 1024 * 1024:
                    raise ValueError("FILING_ARCHIVE_TOO_LARGE")
                for name in archive.namelist():
                    dest = (Path(temp) / name).resolve()
                    if not dest.is_relative_to(Path(temp).resolve()):
                        raise ValueError("FILING_ARCHIVE_PATH_INVALID")
                if entrypoint not in archive.namelist():
                    raise ValueError("FILING_ENTRYPOINT_NOT_FOUND")
            if not entrypoint:
                raise ValueError("FILING_ENTRYPOINT_REQUIRED")
            source = (Path(temp) / entrypoint).resolve()
            if not source.is_relative_to(Path(temp).resolve()):
                raise ValueError("FILING_ENTRYPOINT_INVALID")
        cntlr = Cntlr.Cntlr(logFileName="logToBuffer", disable_persistent_config=True)
        zip_stream = None
        try:
            cntlr.webCache.workOffline = offline
            cntlr.webCache.timeout = 15
            if packaged:
                # ESEF catalog.xml remaps public issuer schema URLs to files
                # inside the package. Extracting XHTML alone loses that DTS.
                zip_stream = document.open("rb")
                source = FileSource.openFileSource(None, cntlr, sourceZipStream=zip_stream)
                source.open()
                source.loadTaxonomyPackageMappings()
                source.select(entrypoint)
            model = cntlr.modelManager.load(source if packaged else str(source))
            if model.modelDocument is None or not model.factsInInstance:
                raise ValueError("STRUCTURED_FILING_NOT_LOADED")
            for fact in model.factsInInstance:
                validate(model, fact)
            if any(str(e).startswith(("IOerror", "FileNotLoadable", "xmlSchema", "xmlSyntax", "xbrl.4", "ix11.12.1.2:missingReferences")) for e in model.errors):
                raise ValueError("FILING_TAXONOMY_OR_INSTANCE_INVALID")
            facts, provenance, issues = normalize_model(model, manifest, available)
        finally:
            cntlr.modelManager.close()
            cntlr.close()
            if zip_stream:
                zip_stream.close()
    first = manifest["periods"][0]
    filing = {"filingId": manifest["documentId"], "securityId": manifest["companyId"],
              "formType": manifest["sourceSystem"], "fiscalYear": first["fiscalYear"], "fiscalPeriod": first["fiscalPeriod"],
              "periodEnd": first["end"], "filedAt": manifest["filingDate"],
              "restatementStatus": "restated" if manifest.get("revisionId", 0) else "original", "dataSourceId": "ds_official_filings_v1"}
    return {"schemaVersion": "official-filing-1.0.0", "companyId": manifest["companyId"],
            "companyName": manifest.get("companyName"), "country": manifest["country"],
            "lei": manifest.get("lei"), "isin": manifest.get("isin"),
            "normalizationVersion": NORMALIZATION_VERSION,
            "manifestSha256": hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
            "sourceSystem": manifest["sourceSystem"], "sourceDocument": manifest["sourceDocument"],
            "documentSha256": digest, "availableAt": available, "filing": filing,
            "facts": facts, "provenance": provenance, "issues": issues,
            "coverage": "STRUCTURED_FACTS" if facts else "NO_SAFE_MAPPINGS"}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--document", type=Path)
    p.add_argument("--entrypoint")
    p.add_argument("--out", type=Path, default=ROOT / "quant/data/fundamentals/official")
    p.add_argument("--offline", action="store_true")
    args = p.parse_args(argv)
    manifest = json.loads(args.manifest.read_text())
    validate_manifest(manifest)
    document = args.document
    if not document:
        if args.offline:
            p.error("--offline requires --document")
        cache = ROOT / ".market-cache/official-filings"
        cache.mkdir(parents=True, exist_ok=True)
        document = cache / (hashlib.sha256(manifest["sourceDocument"].encode()).hexdigest() + ".filing")
        if not document.exists():
            with urlopen(Request(manifest["sourceDocument"], headers={"User-Agent": "VisionUniverseResearch info@visionuniverse.de"}), timeout=30) as r:
                if urlsplit(r.geturl()).hostname not in manifest["officialHosts"]:
                    raise ValueError("OFFICIAL_SOURCE_REDIRECT_UNVERIFIED")
                body = r.read(32 * 1024 * 1024 + 1)
                if len(body) > 32 * 1024 * 1024:
                    raise ValueError("FILING_DOCUMENT_TOO_LARGE")
                document.write_bytes(body)
    payload = ingest(document, manifest, args.entrypoint or manifest.get("entrypoint"), args.offline)
    # Content + identity + publication define idempotency. Revisions are retained
    # as separate documents; never overwrite a company's prior filing.
    identity = json.dumps([manifest["companyId"], manifest["documentId"], payload["documentSha256"], payload["availableAt"], manifest.get("revisionId", 0), payload["manifestSha256"], NORMALIZATION_VERSION], separators=(",", ":"))
    key = hashlib.sha256(identity.encode()).hexdigest()
    destination = args.out / (key + ".json")
    if not destination.exists():
        write_json(destination, payload)
    print(json.dumps({"facts": len(payload["facts"]), "issues": len(payload["issues"]), "out": str(destination)}))
    return 0 if payload["facts"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
