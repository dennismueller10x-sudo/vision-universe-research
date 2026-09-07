"""Reconstruction of canonical metrics that SEC does not report as a line item.

Scope note (Phase 4 integration): this module used to compute margins, returns,
growth rates and CAGRs. It no longer does. Those are factor inputs and the
Vision Universe quant engine already owns them (`quant/engines/factors.js`,
`quant-score.js`). Computing them here a second time would be exactly the
parallel architecture the integration audit forbids.

What remains is the narrow job SEC ingestion actually has: producing the
canonical metrics of `quant/engines/schema.js` (`METRIC_UNITS`) that no filer
reports directly, from ones they do report. Each result is a
`VISION_UNIVERSE_DERIVED` value with its formula version and inputs, and its
availability is the LATEST of its inputs' — a reconstructed number is only known
once its last ingredient has been published.
"""
import logging

from .model import (
    NormalizedFact, Provenance, SOURCE_DERIVED, TRANSFORM_FORMULA,
    QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW,
    MISSING_INPUT, DIVISION_BY_ZERO, NOT_APPLICABLE_FOR_SECTOR,
)
from .restatements import POLICY_AS_OF_LATEST, to_instant
from .version import FORMULA_VERSION

LOGGER = logging.getLogger("vu.sec.derived")

# Canonical metrics this module reconstructs, in dependency order.
RECONSTRUCTED = ("gross_profit", "free_cash_flow", "total_debt", "net_debt",
                 "invested_capital", "accruals")

FORMULAS = {
    "gross_profit": "revenue - cost_of_revenue",
    "free_cash_flow": "operating_cash_flow - capital_expenditures",
    "total_debt": "long_term_debt + short_term_debt",
    "net_debt": "total_debt - cash_and_equivalents",
    "invested_capital": "total_debt + stockholders_equity - cash_and_equivalents",
    "accruals": "(net_income - operating_cash_flow) / total_assets",
}


def _quality(inputs):
    order = (QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW)
    worst = QUALITY_HIGH
    for fact in inputs:
        state = getattr(fact, "quality", QUALITY_HIGH)
        if state in order and order.index(state) > order.index(worst):
            worst = state
    return worst


def _latest_availability(inputs):
    latest = None
    for fact in inputs:
        stamp = fact.provenance.available_from or fact.provenance.filed
        if stamp and (latest is None or to_instant(stamp) > to_instant(latest)):
            latest = stamp
    return latest


def _derived_fact(cik, metric, value, unit, inputs, fiscal_year, fiscal_period,
                  reference):
    available_from = _latest_availability(inputs)
    provenance = Provenance(
        source=SOURCE_DERIVED,
        transformation=TRANSFORM_FORMULA,
        inputs=[f"{fact.metric}@FY{fact.fiscal_year}{fact.fiscal_period}" for fact in inputs],
        formula_version=FORMULA_VERSION,
        available_from=available_from,
        filed=available_from,
        form=reference.provenance.form,
        accession=reference.provenance.accession,
        retrieved_at=reference.provenance.retrieved_at,
        registry_version=reference.provenance.registry_version,
        normalization_version=reference.provenance.normalization_version,
    )
    return NormalizedFact(
        cik=cik, metric=metric, value=value, unit=unit,
        fiscal_year=fiscal_year, fiscal_period=fiscal_period,
        period_start=reference.period_start, period_end=reference.period_end,
        period_kind=reference.period_kind, available=True,
        quality=_quality(inputs), flags=[f"FORMULA:{FORMULAS[metric]}"],
        provenance=provenance,
    )


def _unavailable(cik, metric, reason, detail, fiscal_year, fiscal_period):
    return NormalizedFact(
        cik=cik, metric=metric, value=None, unit=None,
        fiscal_year=fiscal_year, fiscal_period=fiscal_period,
        period_start=None, period_end=None, available=False, reason=reason,
        quality="UNKNOWN", flags=[detail] if detail else [],
        provenance=Provenance(source=SOURCE_DERIVED, transformation=TRANSFORM_FORMULA,
                              formula_version=FORMULA_VERSION),
    )


def reconstruct(resolver, fiscal_year, fiscal_period, as_of,
                policy=POLICY_AS_OF_LATEST, lag_days=0):
    """Canonical derived metrics for one company and one fiscal period.

    Returns {metric: NormalizedFact}. Every entry is either available with a
    value, or explicitly unavailable with a reason — never a zero stand-in.
    """
    cik = resolver.factbook.cik

    def read(metric):
        if fiscal_period == "FY":
            return resolver.annual(metric, fiscal_year, as_of, policy=policy,
                                   lag_days=lag_days)
        index = int(fiscal_period[1])
        return resolver.quarter(metric, fiscal_year, index, as_of, policy=policy,
                                lag_days=lag_days)

    out = {}

    def emit(metric, operands, compute, unit="USD"):
        blocked = resolver.sector_block(metric)
        if blocked:
            out[metric] = _unavailable(cik, metric, NOT_APPLICABLE_FOR_SECTOR,
                                       f"SECTOR_RULE_{blocked.rule_id}",
                                       fiscal_year, fiscal_period)
            return None
        facts = []
        for name in operands:
            fact = out.get(name) if name in out else read(name)
            if fact is None or not fact.available:
                reason = (fact.reason if fact is not None
                          and fact.reason == NOT_APPLICABLE_FOR_SECTOR else MISSING_INPUT)
                out[metric] = _unavailable(cik, metric, reason, f"MISSING:{name}",
                                           fiscal_year, fiscal_period)
                return None
            facts.append(fact)
        try:
            value = compute(*[fact.value for fact in facts])
        except ZeroDivisionError:
            out[metric] = _unavailable(cik, metric, DIVISION_BY_ZERO, "ZERO_DENOMINATOR",
                                       fiscal_year, fiscal_period)
            return None
        fact = _derived_fact(cik, metric, value, unit, facts, fiscal_year,
                             fiscal_period, facts[0])
        out[metric] = fact
        return fact

    # Gross profit: prefer the reported line, reconstruct only when absent.
    reported_gross = read("gross_profit")
    if reported_gross.available:
        out["gross_profit"] = reported_gross
    else:
        emit("gross_profit", ("revenue", "cost_of_revenue"), lambda r, c: r - c)

    emit("free_cash_flow", ("operating_cash_flow", "capital_expenditures"),
         lambda ocf, capex: ocf - capex)

    reported_debt = read("total_debt")
    if reported_debt.available:
        out["total_debt"] = reported_debt
    else:
        emit("total_debt", ("long_term_debt", "short_term_debt"),
             lambda lt, st: lt + st)

    emit("net_debt", ("total_debt", "cash_and_equivalents"), lambda debt, cash: debt - cash)
    emit("invested_capital", ("total_debt", "stockholders_equity", "cash_and_equivalents"),
         lambda debt, equity, cash: debt + equity - cash)

    accrual_inputs = ("net_income", "operating_cash_flow", "total_assets")
    assets = read("total_assets")
    if assets.available and assets.value == 0:
        out["accruals"] = _unavailable(cik, "accruals", DIVISION_BY_ZERO,
                                       "ZERO:total_assets", fiscal_year, fiscal_period)
    else:
        emit("accruals", accrual_inputs,
             lambda ni, ocf, ta: (ni - ocf) / ta, unit="ratio")

    return out
