"""Revenue statement evidence as a pipeline stage (Migrationsblocker M-B6).

SEC RAW -> CORE NORMALIZATION -> REVENUE EVIDENCE -> FUNDAMENTAL BUNDLE -> CONSUMERS

When us-gaap:Revenues is smaller than another positive revenue concept of the
same filing and cell, the core keeps the cell empty unless the filing itself
says which concept is the income-statement line (normalize._drop_partial_aggregates).
This module

  1. finds exactly the filings the core needs a decision for: the same
     normalization, run with no evidence at all, reports every such filing as
     AMBIGUOUS_AGGREGATE (a cheap raw-fact pre-filter skips issuers that
     cannot have one);
  2. decides each filing that has no decision yet from its own statement roles,
     presentation and calculation linkbase (resumable: earlier decisions are
     kept; a filing is fetched once);
  3. writes the store atomically with a build block. A transient failure
     (network, 429/5xx after retries, request budget) is recorded as pending,
     never as a decision, and leaves complete = false;
  4. lets the consumer build check compatibility before it reads one value
     (check_compatible) - schema, builder and core version, build commit,
     universe, freshness, completeness. Incompatible = hard failure.

Decisions (the store's `decisions` map, read by normalize.load_revenue_evidence):
  TOTAL              Revenues is the revenue/total line of the income statement
  OTHER[:concept]    only the other concept is a statement line; Revenues is a note
  AMBIGUOUS          no unambiguous evidence - the cell stays empty
"""
import hashlib
import json
import os
import re
import subprocess
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

from .fiscal import FiscalCalendar
from .http_client import RETRYABLE_STATUS, SECHTTPError
from .normalize import ISSUE_AMBIGUOUS_AGGREGATE, REVENUE_EVIDENCE_PATH, normalize_company
from .provider import PERIODIC_FORMS, SECProvider
from .version import NORMALIZATION_LOGIC_VERSION

SCHEMA = "vu-sec-revenue-statement-evidence-2.0.0"
BUILDER_VERSION = "revenue-evidence-builder-1.0.0"
# Decisions are facts about immutable filings; the version names their semantics.
DECISIONS_VERSION = "1.2.0"
# The consumer build accepts evidence built from an archive at most this old.
MAX_AGE_DAYS = 14
CHECKPOINT_EVERY = 25
# The code that decides which filings need evidence (and how): unchanged
# between the evidence build commit and the consumer build, or the store is
# someone else's.
CORE_PATHS = ("scripts/quant/sec", "quant/config/sec-metric-registry.json")

PENDING_TRANSIENT = "TRANSIENT_FETCH_ERROR"
PENDING_BUDGET = "REQUEST_BUDGET_EXHAUSTED"

RIVALS = ("RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax",
          "SalesRevenueNet", "SalesRevenueGoodsNet", "SalesRevenueServicesNet")
INCOME = re.compile(r"operations|income|earnings|profit|loss", re.I)
NOT_INCOME = re.compile(r"parenthetical|balance|financial condition|financial position|cash flow|"
                        r"stockholders|shareholders|partners'|members'|changes in equity|statements? of equity|details|tables|policies", re.I)
XLINK = "{http://www.w3.org/1999/xlink}"


class EvidenceIncompatible(RuntimeError):
    """The evidence store does not belong to this consumer build."""

    def __init__(self, reason, detail):
        super().__init__(f"REVENUE_EVIDENCE_{reason}: {detail}")
        self.reason = reason


class FilingUnreadable(RuntimeError):
    """Permanent: the filing has no readable statement structure (404, parse error)."""


class TransientFetch(RuntimeError):
    """Temporary: try again in a later run; never a decision."""


# ------------------------------------------------------------- which filings

def _sha256(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode("utf-8")).hexdigest()


def may_need_evidence(company_facts):
    """Raw pre-filter: a filing with Revenues next to a larger rival in the same unit and period end.

    A superset of what the core reports; it only decides which issuers are
    normalized below, so it may say yes too often but never no too often for
    an exact (unit, end) pair."""
    gaap = (company_facts.get("facts") or {}).get("us-gaap") or {}
    revenues = gaap.get("Revenues")
    if not revenues:
        return False
    rival_max = {}
    for concept in RIVALS:
        for unit, rows in ((gaap.get(concept) or {}).get("units") or {}).items():
            for r in rows:
                if isinstance(r.get("val"), (int, float)) and r["val"] > 0:
                    key = (r.get("accn"), unit, r.get("end"))
                    rival_max[key] = max(rival_max.get(key, 0), r["val"])
    if not rival_max:
        return False
    for unit, rows in (revenues.get("units") or {}).items():
        for r in rows:
            if isinstance(r.get("val"), (int, float)) and r["val"] < rival_max.get((r.get("accn"), unit, r.get("end")), float("-inf")):
                return True
    return False


def required_accessions(cik, company_facts, registry, provider=None):
    """{accession} the core needs a decision for: AMBIGUOUS_AGGREGATE with no evidence at all."""
    if not may_need_evidence(company_facts):
        return set()
    provider = provider or SECProvider.__new__(SECProvider)
    raw = list(SECProvider.iter_raw_facts(provider, company_facts, availability={}, forms=PERIODIC_FORMS))
    if not raw:
        return set()
    calendar = FiscalCalendar.from_raw_facts(cik, raw)
    result = normalize_company(cik, raw, registry, calendar=calendar, revenue_evidence={})
    return {issue["accession"] for issue in result.issues
            if issue.get("code") == ISSUE_AMBIGUOUS_AGGREGATE and issue.get("accession")}


# ------------------------------------------------------------- one filing

class Filing:
    """The parts of one EDGAR filing the decision reads, through the fair-access client."""

    def __init__(self, cik, accession, client):
        self.client = client
        self.base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/"
        index = json.loads(self._get(self.base + "index.json"))
        self.files = [item["name"] for item in index["directory"]["item"]]

    def _get(self, url):
        try:
            return self.client.get_bytes(url, expected_statuses=(404,))
        except SECHTTPError as exc:
            if exc.status == 404:
                raise FilingUnreadable(f"{url}: 404") from exc
            if exc.status is None or exc.status in RETRYABLE_STATUS:
                raise TransientFetch(str(exc)) from exc
            raise FilingUnreadable(str(exc)) from exc
        except OSError as exc:  # timeouts and resets that escaped the retry loop
            raise TransientFetch(f"{url}: {exc}") from exc

    def file(self, *suffixes):
        for name in self.files:
            if name.endswith(suffixes):
                return self._get(self.base + name)
        return None

    def linkbase(self, suffix, arc):
        data = self.file(suffix)
        if data is None:
            return {}
        roles = {}
        for link in ET.fromstring(data):
            role = link.get(XLINK + "role")
            locs = {loc.get(XLINK + "label"): loc.get(XLINK + "href", "").split("#")[-1]
                    for loc in link if loc.tag.endswith("loc")}
            arcs = [{"parent": locs.get(a.get(XLINK + "from")), "child": locs.get(a.get(XLINK + "to")),
                     "weight": float(a.get("weight") or 0), "preferredLabel": a.get("preferredLabel")}
                    for a in link if a.tag.endswith(arc)]
            if arcs:
                roles.setdefault(role, []).extend(arcs)
        return roles


def concept_name(href_fragment):
    """'us-gaap_Revenues' -> 'Revenues' (identical to the audit reader that produced 1.0.0/1.1.0)."""
    return href_fragment.split("_", 1)[-1] if "_" in href_fragment else href_fragment


def income_statement_roles(filing):
    data = filing.file("FilingSummary.xml") if "FilingSummary.xml" in filing.files else None
    if not data:
        return []
    roles = []
    for report in ET.fromstring(data).iter("Report"):
        category = (report.findtext("MenuCategory") or "").strip()
        long_name = (report.findtext("LongName") or "").strip()
        title = long_name.split(" - ", 2)[-1] if " - " in long_name else long_name
        is_statement = category == "Statements" or " - Statement - " in long_name
        if is_statement and INCOME.search(title) and not NOT_INCOME.search(title):
            roles.append((report.findtext("Role") or "").strip())
    return roles


def decide(filing):
    """{"decision": TOTAL | OTHER[:concept] | AMBIGUOUS, "basis": ...} from the filing's own structure."""
    roles = income_statement_roles(filing)
    if not roles:
        return {"decision": "AMBIGUOUS", "basis": "NO_INCOME_STATEMENT_ROLE"}
    pre = filing.linkbase("_pre.xml", "presentationArc")
    cal = filing.linkbase("_cal.xml", "calculationArc")
    in_statement = {concept_name(href) for role in roles for arc in pre.get(role, [])
                    for href in (arc["parent"], arc["child"]) if href}
    revenues_in = "Revenues" in in_statement
    rivals_in = sorted(c for c in RIVALS if c in in_statement)
    total_label = any(arc["child"] and concept_name(arc["child"]) == "Revenues"
                      and (arc["preferredLabel"] or "").endswith("totalLabel")
                      for role in roles for arc in pre.get(role, []))
    summand = any(arc["parent"] and arc["child"] and concept_name(arc["parent"]) == "Revenues"
                  and concept_name(arc["child"]) in RIVALS and arc["weight"] > 0
                  for role in roles for arc in cal.get(role, []))
    if revenues_in and (not rivals_in or summand):
        return {"decision": "TOTAL", "basis": "PRESENTATION" + ("+CALCULATION" if summand else "")}
    if revenues_in and rivals_in and total_label:
        return {"decision": "TOTAL", "basis": "PRESENTATION_TOTAL_LABEL"}
    if rivals_in and not revenues_in:
        return {"decision": "OTHER" + (":" + rivals_in[0] if len(rivals_in) == 1 else ""), "basis": "PRESENTATION"}
    return {"decision": "AMBIGUOUS", "basis": "BOTH_OR_NEITHER_IN_STATEMENT"}


# ------------------------------------------------------------- the store

def write_atomic(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(payload, indent=0, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def load_store(path):
    path = Path(path)
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def universe_fingerprint(names_file):
    return _sha256(Path(names_file).read_bytes())


def required_fingerprint(required):
    return _sha256("\n".join(sorted(required)))


def build_store(sources, out_path, client, registry, as_of, build_commit, names_file,
                max_filings=None, log=print):
    """Decide every required filing that has no decision yet; write atomically.

    `sources` yields (cik, companyfacts payload) for the consumer universe.
    Returns (written payload, run counters). complete is True only if every required filing
    has a decision and nothing is pending."""
    previous = load_store(out_path)
    decisions = dict(previous.get("decisions") or {})
    bases = dict(previous.get("bases") or {})
    required = {}
    issuers = scanned = 0
    for cik, payload in sources:
        issuers += 1
        accessions = required_accessions(cik, payload, registry)
        if accessions:
            scanned += 1
        for accession in accessions:
            required[accession] = cik
    todo = sorted(a for a in required if a not in decisions)
    log(f"  evidence: {issuers} Emittenten, {len(required)} Einreichungen brauchen einen Beleg, "
        f"{len(required) - len(todo)} schon entschieden, {len(todo)} offen")
    pending, fetched = {}, 0

    def snapshot(complete):
        counts = {}
        for accession in required:
            if accession in decisions:
                key = decisions[accession].split(":")[0]
                counts[key] = counts.get(key, 0) + 1
        return {
            "schema": SCHEMA, "version": DECISIONS_VERSION, "producer": "scripts/quant/cli.py revenue-evidence",
            "source": "SEC EDGAR Einreichungen (FilingSummary.xml, Presentation- und Calculation-Linkbase)",
            "semantics": {"TOTAL": "Revenues ist die Umsatz-/Summenzeile der Ergebnisrechnung",
                          "OTHER[:Konzept]": "nur das andere Konzept steht in der Ergebnisrechnung; Revenues ist eine Anhangangabe",
                          "AMBIGUOUS": "kein eindeutiger Beleg - Umsatz dieser Einreichung bleibt leer"},
            "build": {"builder": BUILDER_VERSION, "coreVersion": NORMALIZATION_LOGIC_VERSION,
                      "registryVersion": registry.version, "buildCommit": build_commit, "asOf": str(as_of),
                      "universe": {"namesSha256": universe_fingerprint(names_file), "issuers": issuers,
                                   "issuersWithConflicts": scanned},
                      "required": len(required), "requiredSha256": required_fingerprint(required),
                      "complete": complete, "pending": dict(sorted(pending.items()))},
            "summary": counts,
            "decisions": dict(sorted(decisions.items())),
            "bases": dict(sorted(bases.items())),
        }

    for k, accession in enumerate(todo):
        if max_filings is not None and fetched >= max_filings:
            pending[accession] = PENDING_BUDGET
            continue
        try:
            result = decide(Filing(required[accession], accession, client))
        except TransientFetch as exc:
            pending[accession] = f"{PENDING_TRANSIENT}: {str(exc)[:160]}"
            continue
        except (FilingUnreadable, ET.ParseError, KeyError, ValueError) as exc:
            result = {"decision": "AMBIGUOUS", "basis": "FILING_NOT_READABLE", "error": str(exc)[:160]}
        decisions[accession] = result["decision"]
        bases[accession] = result["basis"]
        fetched += 1
        if fetched % CHECKPOINT_EVERY == 0:
            # Resumable, and never a store that looks complete.
            write_atomic(out_path, snapshot(False))
            log(f"  evidence: {k + 1}/{len(todo)} ({accession} {result['decision']})")
    payload = snapshot(not pending and all(a in decisions for a in required))
    write_atomic(out_path, payload)
    # Run counters are reported, not stored: the same inputs give the same file.
    run = {"decidedThisRun": fetched, "pending": len(pending), "requests": client.stats.get("requests", 0) if client else 0,
           "cacheHits": client.stats.get("cache_hits", 0) if client else 0}
    log(f"  evidence: complete={payload['build']['complete']} {json.dumps(run)} {json.dumps(payload['summary'], sort_keys=True)}")
    return payload, run


# ------------------------------------------------------------- consumer gate

def _core_unchanged_since(commit, repo_root):
    """True if the core code at HEAD equals the core code at `commit` (git must know the commit)."""
    try:
        subprocess.run(["git", "cat-file", "-e", commit + "^{commit}"], cwd=repo_root, check=True,
                       capture_output=True)
        changed = subprocess.run(["git", "diff", "--quiet", commit, "HEAD", "--", *CORE_PATHS], cwd=repo_root,
                                 capture_output=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return changed.returncode == 0


def check_compatible(payload, as_of, registry_version, names_file, repo_root=None):
    """Raise EvidenceIncompatible unless the store belongs to this consumer build.

    With repo_root the build commit is verified, not only its format: git must
    know it and the core code (CORE_PATHS) must be identical to HEAD."""
    if not payload:
        raise EvidenceIncompatible("MISSING", str(REVENUE_EVIDENCE_PATH))
    if payload.get("schema") != SCHEMA:
        raise EvidenceIncompatible("SCHEMA", f"{payload.get('schema')} != {SCHEMA}")
    build = payload.get("build") or {}
    if build.get("builder") != BUILDER_VERSION:
        raise EvidenceIncompatible("BUILDER", f"{build.get('builder')} != {BUILDER_VERSION}")
    if build.get("coreVersion") != NORMALIZATION_LOGIC_VERSION:
        raise EvidenceIncompatible("CORE_VERSION", f"{build.get('coreVersion')} != {NORMALIZATION_LOGIC_VERSION}")
    if build.get("registryVersion") != registry_version:
        raise EvidenceIncompatible("REGISTRY_VERSION", f"{build.get('registryVersion')} != {registry_version}")
    if not re.fullmatch(r"[0-9a-f]{40}", str(build.get("buildCommit") or "")):
        raise EvidenceIncompatible("BUILD_COMMIT", f"{build.get('buildCommit')!r} is not a commit")
    if repo_root is not None:
        unchanged = _core_unchanged_since(build["buildCommit"], repo_root)
        if unchanged is None:
            raise EvidenceIncompatible("BUILD_COMMIT", f"{build['buildCommit']} unknown to this checkout")
        if not unchanged:
            raise EvidenceIncompatible("BUILD_COMMIT", f"core code changed since {build['buildCommit'][:12]} ({', '.join(CORE_PATHS)})")
    if build.get("complete") is not True or build.get("pending"):
        raise EvidenceIncompatible("PARTIAL", f"complete={build.get('complete')} pending={len(build.get('pending') or {})}")
    if (build.get("universe") or {}).get("namesSha256") != universe_fingerprint(names_file):
        raise EvidenceIncompatible("UNIVERSE", f"built for another product universe than {names_file}")
    try:
        age = (date.fromisoformat(str(as_of)[:10]) - date.fromisoformat(str(build.get("asOf"))[:10])).days
    except ValueError as exc:
        raise EvidenceIncompatible("FRESHNESS", f"asOf {build.get('asOf')!r}") from exc
    if age < 0 or age > MAX_AGE_DAYS:
        raise EvidenceIncompatible("FRESHNESS", f"built {build.get('asOf')}, consumer as of {as_of} ({age} days, max {MAX_AGE_DAYS})")
    return build
