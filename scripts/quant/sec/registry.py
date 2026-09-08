"""Canonical Metric Registry loader.

The registry is data, not code (quant/config/sec-metric-registry.json). Adding a
metric or accepting another XBRL concept is a config change; the pipeline is
never edited for a specific company. This module loads, validates and indexes it.
"""
import json
from pathlib import Path

from .version import METRIC_REGISTRY_MIN_VERSION

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REGISTRY_PATH = ROOT / "quant" / "config" / "sec-metric-registry.json"

KIND_DURATION = "duration"
KIND_INSTANT = "instant"


class RegistryError(ValueError):
    pass


class ConceptRule:
    __slots__ = ("taxonomy", "concept", "priority")

    def __init__(self, taxonomy, concept, priority):
        self.taxonomy = taxonomy
        self.concept = concept
        self.priority = int(priority)

    @property
    def qualified(self):
        return f"{self.taxonomy}:{self.concept}"

    def __repr__(self):
        return f"ConceptRule({self.qualified}, p={self.priority})"


class MetricDefinition:
    __slots__ = ("name", "label", "kind", "statement", "units", "concepts", "optional", "sign")

    def __init__(self, name, payload):
        self.name = name
        self.label = payload.get("label", name)
        self.kind = payload.get("kind")
        if self.kind not in (KIND_DURATION, KIND_INSTANT):
            raise RegistryError(f"metric {name}: kind must be duration or instant")
        self.statement = payload.get("statement")
        self.units = tuple(payload.get("units") or ())
        if not self.units:
            raise RegistryError(f"metric {name}: at least one allowed unit is required")
        self.optional = bool(payload.get("optional", False))
        self.sign = payload.get("sign")
        rules = [ConceptRule(rule["taxonomy"], rule["concept"], rule["priority"])
                 for rule in payload.get("concepts") or []]
        if not rules:
            raise RegistryError(f"metric {name}: no accepted concepts")
        priorities = [rule.priority for rule in rules]
        if len(set(priorities)) != len(priorities):
            # Equal priority makes concept selection non-deterministic, which is
            # exactly the AMBIGUOUS_MAPPING case we refuse to guess at.
            raise RegistryError(f"metric {name}: duplicate concept priorities {priorities}")
        self.concepts = tuple(sorted(rules, key=lambda rule: rule.priority))

    def allows_unit(self, unit):
        return unit in self.units

    def priority_of(self, taxonomy, concept):
        for rule in self.concepts:
            if rule.taxonomy == taxonomy and rule.concept == concept:
                return rule.priority
        return None


class SectorRule:
    __slots__ = ("rule_id", "sic_min", "sic_max", "not_applicable", "reason", "note")

    def __init__(self, payload):
        self.rule_id = payload["id"]
        self.sic_min = int(payload["sic_min"])
        self.sic_max = int(payload["sic_max"])
        self.not_applicable = frozenset(payload.get("not_applicable") or ())
        self.reason = payload.get("reason", "UNSUPPORTED_ACCOUNTING_STRUCTURE")
        self.note = payload.get("note", "")

    def matches(self, sic):
        try:
            code = int(sic)
        except (TypeError, ValueError):
            return False
        return self.sic_min <= code <= self.sic_max


class MetricRegistry:
    def __init__(self, payload):
        schema_version = payload.get("schema_version")
        if schema_version is None or int(schema_version) < METRIC_REGISTRY_MIN_VERSION:
            raise RegistryError(
                f"registry schema_version {schema_version} is older than the "
                f"minimum supported {METRIC_REGISTRY_MIN_VERSION}"
            )
        self.schema_version = int(schema_version)
        self.mapping_version = payload.get("mapping_version", "unversioned")
        self.metrics = {
            name: MetricDefinition(name, body)
            for name, body in (payload.get("metrics") or {}).items()
        }
        if not self.metrics:
            raise RegistryError("registry contains no metrics")
        self.sector_rules = [SectorRule(rule) for rule in payload.get("sector_rules") or []]

        # concept index: (taxonomy, concept) -> [(metric_name, priority), ...]
        self._by_concept = {}
        for metric in self.metrics.values():
            for rule in metric.concepts:
                self._by_concept.setdefault((rule.taxonomy, rule.concept), []).append(
                    (metric.name, rule.priority)
                )

    @classmethod
    def load(cls, path=DEFAULT_REGISTRY_PATH):
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(payload)

    @property
    def version(self):
        return {"schema_version": self.schema_version, "mapping_version": self.mapping_version}

    def metrics_for_concept(self, taxonomy, concept):
        """All (metric_name, priority) pairs a raw concept can feed."""
        return list(self._by_concept.get((taxonomy, concept), ()))

    def get(self, name):
        return self.metrics.get(name)

    def names(self):
        return sorted(self.metrics)

    def not_applicable_metrics(self, sic):
        """Metrics that are structurally undefined for this issuer's sector."""
        blocked = {}
        for rule in self.sector_rules:
            if rule.matches(sic):
                for metric in rule.not_applicable:
                    blocked[metric] = rule
        return blocked
