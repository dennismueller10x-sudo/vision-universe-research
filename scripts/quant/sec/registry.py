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
    __slots__ = ("name", "label", "kind", "statement", "units", "concepts", "optional", "sign",
                 "industries")

    def __init__(self, name, payload):
        self.name = name
        self.label = payload.get("label", name)
        # Empty for a core metric. An industry metric names the industries it
        # is defined for and is published only for issuers in one of them.
        self.industries = tuple(payload.get("industries") or ())
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

    # EINE BILANZ IN EURO IST EINE BILANZ.
    #
    # Die Registry fuehrt 35 Kennzahlen mit `units: ["USD"]`. Fuer einen
    # 10-K-Einreicher ist das richtig. Fuer Unilever, Shell oder
    # Canadian National ist es eine Mauer: sie melden in EUR, USD oder
    # CAD, und ein korrekt gemapptes Konzept waere trotzdem an der
    # Einheit gescheitert - mit einem UNIT_MISMATCH, der aussieht wie
    # ein Datenfehler und einer ist, den wir gebaut haben.
    #
    # Akzeptiert wird deshalb JEDE ISO-Waehrung, wo USD akzeptiert wird.
    # UMGERECHNET WIRD NICHTS. Ein Kurs von heute auf eine Periode von
    # 2012 anzuwenden waere geraten und zerstoerte die
    # Point-in-Time-Eigenschaft, die diese Schicht traegt. Der Wert
    # behaelt seine Waehrung, und die Waehrung steht daneben.
    MONETARY_UNITS = {"USD"}
    PER_SHARE_UNITS = {"USD/shares"}

    @staticmethod
    def _is_currency(code):
        return len(code) == 3 and code.isalpha() and code.isupper()

    def allows_unit(self, unit):
        if unit in self.units:
            return True
        if not unit:
            return False
        # Geldbetrag: jede Waehrung, wo USD erlaubt ist.
        if self.MONETARY_UNITS & set(self.units) and self._is_currency(unit):
            return True
        # Betrag je Aktie: dasselbe, aber mit Nenner.
        if self.PER_SHARE_UNITS & set(self.units) and unit.endswith("/shares"):
            return self._is_currency(unit.split("/", 1)[0])
        return False

    def currency_of(self, unit):
        """Die Waehrung eines Werts, oder None fuer nicht-monetaere Einheiten."""
        if not unit:
            return None
        if self._is_currency(unit):
            return unit
        if unit.endswith("/shares"):
            code = unit.split("/", 1)[0]
            return code if self._is_currency(code) else None
        return None

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


class Industry:
    """An accounting industry with its own vocabulary (§10).

    A bank earns interest, an insurer earns premiums, a REIT earns rent. None
    of them tags `Revenues`, and forcing their statements into an industrial
    income statement would invent a number. The core contract stays as it is;
    an industry gets a SEPARATE metric layer that is published alongside it.
    """
    __slots__ = ("industry_id", "label", "sic_ranges", "note")

    def __init__(self, industry_id, payload):
        self.industry_id = industry_id
        self.label = payload.get("label", industry_id)
        ranges = payload.get("sic_ranges") or []
        if not ranges:
            raise RegistryError(f"industry {industry_id}: at least one SIC range is required")
        self.sic_ranges = tuple((int(low), int(high)) for low, high in ranges)
        self.note = payload.get("note", "")

    def matches(self, sic):
        try:
            code = int(sic)
        except (TypeError, ValueError):
            return False
        return any(low <= code <= high for low, high in self.sic_ranges)


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

        # Industry layer: metrics that exist only for issuers of an industry.
        # They are normalized like every other metric (a concept is a concept)
        # but never counted as core coverage and never published for an issuer
        # outside their industry.
        self.industries = {
            industry_id: Industry(industry_id, body)
            for industry_id, body in (payload.get("industries") or {}).items()
        }
        self.industry_metrics = {}
        for name, body in (payload.get("industry_metrics") or {}).items():
            if name in self.metrics:
                raise RegistryError(f"industry metric {name} collides with a core metric")
            definition = MetricDefinition(name, body)
            if not definition.industries:
                raise RegistryError(f"industry metric {name}: no industries named")
            unknown = [ind for ind in definition.industries if ind not in self.industries]
            if unknown:
                raise RegistryError(f"industry metric {name}: unknown industries {unknown}")
            self.industry_metrics[name] = definition

        # concept index: (taxonomy, concept) -> [(metric_name, priority), ...]
        self._by_concept = {}
        for metric in (*self.metrics.values(), *self.industry_metrics.values()):
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
        definition = self.metrics.get(name)
        if definition is None:
            definition = self.industry_metrics.get(name)
        return definition

    def names(self):
        """Core metric names only; the industry layer is listed separately."""
        return sorted(self.metrics)

    def is_industry_metric(self, name):
        return name in self.industry_metrics

    def industry_for(self, sic):
        """The Industry an issuer belongs to by SIC code, or None."""
        for industry in self.industries.values():
            if industry.matches(sic):
                return industry
        return None

    def industry_metric_names(self, industry_id):
        return sorted(name for name, definition in self.industry_metrics.items()
                      if industry_id in definition.industries)

    def industry_metrics_for(self, sic):
        """(Industry, [metric names]) for an issuer, or (None, [])."""
        industry = self.industry_for(sic)
        if industry is None:
            return None, []
        return industry, self.industry_metric_names(industry.industry_id)

    def not_applicable_metrics(self, sic):
        """Metrics that are structurally undefined for this issuer's sector."""
        blocked = {}
        for rule in self.sector_rules:
            if rule.matches(sic):
                for metric in rule.not_applicable:
                    blocked[metric] = rule
        return blocked
