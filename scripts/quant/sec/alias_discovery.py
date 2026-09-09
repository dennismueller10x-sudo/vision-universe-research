"""Offline XBRL alias coverage and candidate discovery.

Candidates are evidence for review only.  This module never mutates the metric
registry and never feeds an unknown concept into canonical normalization.
"""
from collections import defaultdict
import re

from .provider import PERIODIC_FORMS, normalize_cik


_CAMEL = re.compile(r"(?<!^)(?=[A-Z])")
_STOP = frozenset({
    "and", "of", "the", "net", "total", "current", "noncurrent", "from",
    "provided", "used", "in", "activities", "amount", "value",
})


def _tokens(value):
    text = _CAMEL.sub(" ", str(value).replace("_", " ")).lower()
    return {token for token in re.findall(r"[a-z]+", text)
            if len(token) > 2 and token not in _STOP}


def _periodic_entries(body):
    for unit, entries in ((body or {}).get("units") or {}).items():
        for entry in entries or []:
            if entry.get("form") in PERIODIC_FORMS:
                yield unit, entry


def build_alias_discovery(company_payloads, registry, target_metrics=None,
                          min_candidate_companies=2, candidates_per_metric=10):
    payloads = list(company_payloads)
    target_metrics = tuple(target_metrics or registry.names())
    concept_companies = defaultdict(set)
    concept_facts = defaultdict(int)
    concept_units = defaultdict(set)
    concept_kinds = defaultdict(set)

    for cik, payload in payloads:
        cik = normalize_cik(cik)
        for taxonomy, concepts in (payload.get("facts") or {}).items():
            for concept, body in (concepts or {}).items():
                qualified = f"{taxonomy}:{concept}"
                seen = False
                for unit, entry in _periodic_entries(body):
                    seen = True
                    concept_facts[qualified] += 1
                    concept_units[qualified].add(unit)
                    concept_kinds[qualified].add(
                        "duration" if entry.get("start") else "instant")
                if seen:
                    concept_companies[qualified].add(cik)

    total_companies = len({normalize_cik(cik) for cik, _ in payloads})
    accepted = {
        f"{rule.taxonomy}:{rule.concept}"
        for metric in registry.metrics.values() for rule in metric.concepts
    }
    unknown = [qualified for qualified in concept_companies if qualified not in accepted]
    metrics = {}
    for metric_name in target_metrics:
        definition = registry.get(metric_name)
        if definition is None:
            metrics[metric_name] = {
                "status": "DERIVED_OR_UNREGISTERED",
                "knownConcepts": [], "companies": 0, "coverage": 0.0,
                "mappingCandidates": [],
            }
            continue
        known = []
        covered = set()
        for rule in definition.concepts:
            qualified = rule.qualified
            companies = concept_companies.get(qualified, set())
            covered.update(companies)
            known.append({
                "concept": qualified,
                "priority": rule.priority,
                "companies": len(companies),
                "facts": concept_facts.get(qualified, 0),
            })

        desired = _tokens(metric_name) | _tokens(definition.label)
        candidates = []
        for qualified in unknown:
            companies = concept_companies[qualified]
            if len(companies) < min_candidate_companies:
                continue
            candidate_tokens = _tokens(qualified.split(":", 1)[1])
            overlap = sorted(desired & candidate_tokens)
            if not overlap:
                continue
            if definition.kind not in concept_kinds[qualified]:
                continue
            if not set(definition.units) & concept_units[qualified]:
                continue
            candidates.append({
                "concept": qualified,
                "companies": len(companies),
                "facts": concept_facts[qualified],
                "units": sorted(concept_units[qualified]),
                "kinds": sorted(concept_kinds[qualified]),
                "matchedTokens": overlap,
                "status": "MAPPING_CANDIDATE_NOT_ACCEPTED",
            })
        candidates.sort(key=lambda row: (-row["companies"], -row["facts"], row["concept"]))
        metrics[metric_name] = {
            "status": "REGISTERED",
            "knownConcepts": known,
            "companies": len(covered),
            "coverage": round(len(covered) / total_companies, 6) if total_companies else 0.0,
            "mappingCandidates": candidates[:candidates_per_metric],
        }

    frequent_unknown = sorted(({
        "concept": qualified,
        "companies": len(companies),
        "facts": concept_facts[qualified],
        "units": sorted(concept_units[qualified]),
        "kinds": sorted(concept_kinds[qualified]),
        "status": "UNMAPPED_NOT_CANONICAL",
    } for qualified, companies in concept_companies.items() if qualified not in accepted),
        key=lambda row: (-row["companies"], -row["facts"], row["concept"]))
    return {
        "schemaVersion": 1,
        "companiesAnalyzed": total_companies,
        "canonicalMetrics": metrics,
        "frequentUnknownConcepts": frequent_unknown[:100],
        "candidatePolicy": (
            "Candidates are lexical evidence only and are never accepted without "
            "semantic review, unit/period validation and registry change tests."
        ),
    }
