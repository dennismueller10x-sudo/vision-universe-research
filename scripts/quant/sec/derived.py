"""Vision Universe derived metrics.

Everything computed here is VU intelligence, not SEC data. Each result carries
source = VISION_UNIVERSE_DERIVED, the formula version, and the inputs it was
built from, so a derived number can never be mistaken for something the company
reported (Phase 4 § 13, § 26).

A derived metric with a missing input is missing, never zero and never a guess.
"""
import logging

from .model import (
    NormalizedFact, Provenance, SOURCE_DERIVED, TRANSFORM_FORMULA,
    QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW,
    MISSING_INPUT, DIVISION_BY_ZERO, NOT_APPLICABLE_FOR_SECTOR,
    INSUFFICIENT_HISTORY, PERIOD_TTM,
)
from .restatements import POLICY_AS_OF_LATEST, to_instant
from .version import FORMULA_VERSION

LOGGER = logging.getLogger("vu.sec.derived")

BASIS_TTM = "TTM"
BASIS_FY = "FY"

# Ratios whose denominator is a stock quantity are reported as a fraction, not a
# percentage; presentation is the UI's job, not the data layer's.
UNIT_RATIO = "ratio"
UNIT_GROWTH = "ratio_yoy"


class DerivedContext:
    """Point-in-time inputs for one company, on one basis, at one as_of date."""

    def __init__(self, resolver, as_of, basis=BASIS_TTM,
                 policy=POLICY_AS_OF_LATEST, lag_days=0):
        if basis not in (BASIS_TTM, BASIS_FY):
            raise ValueError(f"unknown basis: {basis}")
        self.resolver = resolver
        self.as_of = as_of
        self.basis = basis
        self.policy = policy
        self.lag_days = lag_days
        self.cik = resolver.factbook.cik
        self._flow = {}
        self._prior = {}
        self._stock = {}
        self._anchor = resolver.latest_reported_quarter(
            "revenue", as_of, policy=policy, lag_days=lag_days)
        self._fy_anchor = self._latest_complete_fy()

    def _latest_complete_fy(self):
        for fiscal_year in reversed(self.resolver.factbook.fiscal_years()):
            fact = self.resolver.annual("revenue", fiscal_year, self.as_of,
                                        policy=self.policy, lag_days=self.lag_days)
            if fact.available:
                return fiscal_year
        return None

    # -------------------------------------------------------------- accessors

    def flow(self, metric, lag_years=0):
        """A flow metric (income statement / cash flow) on the configured basis."""
        cache = self._prior if lag_years else self._flow
        if metric in cache:
            return cache[metric]
        if self.basis == BASIS_TTM:
            if self._anchor is None:
                fact = self.resolver.ttm(metric, self.as_of, policy=self.policy,
                                         lag_days=self.lag_days)
            else:
                year, index = self._anchor
                if lag_years:
                    year, index = self.resolver.step_back(year, index, 4 * lag_years)
                fact = self.resolver.ttm_ending(metric, year, index, self.as_of,
                                                policy=self.policy, lag_days=self.lag_days)
        else:
            if self._fy_anchor is None:
                fact = NormalizedFact(cik=self.cik, metric=metric, value=None, unit=None,
                                      fiscal_year=None, fiscal_period=None,
                                      period_start=None, period_end=None,
                                      available=False, reason=INSUFFICIENT_HISTORY)
            else:
                fact = self.resolver.annual(metric, self._fy_anchor - lag_years, self.as_of,
                                            policy=self.policy, lag_days=self.lag_days)
        cache[metric] = fact
        return fact

    def flow_at(self, metric, lag_years):
        """A flow metric shifted back whole years, for growth and CAGR."""
        if self.basis == BASIS_TTM:
            if self._anchor is None:
                return self.flow(metric)
            year, index = self.resolver.step_back(*self._anchor, 4 * lag_years)
            return self.resolver.ttm_ending(metric, year, index, self.as_of,
                                            policy=self.policy, lag_days=self.lag_days)
        if self._fy_anchor is None:
            return self.flow(metric)
        return self.resolver.annual(metric, self._fy_anchor - lag_years, self.as_of,
                                    policy=self.policy, lag_days=self.lag_days)

    def stock(self, metric):
        """A balance-sheet metric at the most recent date visible at as_of."""
        if metric not in self._stock:
            self._stock[metric] = self.resolver.latest_instant(
                metric, self.as_of, policy=self.policy, lag_days=self.lag_days)
        return self._stock[metric]


def _derive(context, metric, value, unit, inputs, formula, quality=QUALITY_HIGH,
            fiscal_year=None, fiscal_period=None, flags=None):
    available_from = None
    for fact in inputs:
        candidate = fact.provenance.available_from or fact.provenance.filed
        if candidate and (available_from is None
                          or to_instant(candidate) > to_instant(available_from)):
            available_from = candidate
    input_ids = []
    for fact in inputs:
        input_ids.append(f"{fact.metric}@FY{fact.fiscal_year}{fact.fiscal_period}")
    provenance = Provenance(
        source=SOURCE_DERIVED,
        transformation=TRANSFORM_FORMULA,
        inputs=input_ids,
        formula_version=FORMULA_VERSION,
        available_from=available_from,
        filed=available_from,
        registry_version=context.resolver.registry.version,
    )
    worst = min((fact.quality for fact in inputs),
                key=lambda state: (QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW).index(state)
                if state in (QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW) else 3,
                default=QUALITY_HIGH)
    if worst != QUALITY_HIGH:
        quality = worst
    reference = inputs[0] if inputs else None
    return NormalizedFact(
        cik=context.cik, metric=metric, value=value, unit=unit,
        fiscal_year=fiscal_year if fiscal_year is not None else getattr(reference, "fiscal_year", None),
        fiscal_period=fiscal_period if fiscal_period is not None else getattr(reference, "fiscal_period", None),
        period_start=getattr(reference, "period_start", None),
        period_end=getattr(reference, "period_end", None),
        period_kind=getattr(reference, "period_kind", PERIOD_TTM),
        available=True, quality=quality,
        flags=sorted(set(flags or []) | {f"FORMULA:{formula}"}),
        provenance=provenance,
    )


def _unavailable(context, metric, reason, detail=None, inputs=()):
    fact = NormalizedFact(
        cik=context.cik, metric=metric, value=None, unit=None,
        fiscal_year=None, fiscal_period=None, period_start=None, period_end=None,
        available=False, reason=reason, quality="UNKNOWN",
        provenance=Provenance(source=SOURCE_DERIVED, transformation=TRANSFORM_FORMULA,
                              formula_version=FORMULA_VERSION,
                              inputs=[f"{fact.metric}" for fact in inputs if fact is not None]),
    )
    if detail:
        fact.flags = [detail]
    return fact



def _sector_guard(context, metric):
    """Refuse to compute a metric the issuer's sector makes meaningless.

    Checked on the OUTPUT metric, not only the inputs: debt/equity for a bank is
    computable from available inputs and still not a leverage ratio, so the
    sector rule has to win over arithmetic. `_derived` suffixes resolve to the
    canonical metric name so the registry needs only one entry.
    """
    canonical = metric[: -len("_derived")] if metric.endswith("_derived") else metric
    for name in (metric, canonical):
        rule = context.resolver.sector_block(name)
        if rule:
            return _unavailable(context, metric, NOT_APPLICABLE_FOR_SECTOR,
                                f"SECTOR_RULE_{rule.rule_id}")
    return None


def _ratio(context, metric, numerator, denominator, formula, unit=UNIT_RATIO,
           allow_negative_denominator=False):
    blocked = _sector_guard(context, metric)
    if blocked is not None:
        return blocked
    for name, fact in (("numerator", numerator), ("denominator", denominator)):
        if fact is None:
            return _unavailable(context, metric, MISSING_INPUT, f"MISSING:{name}")
        if not fact.available:
            reason = fact.reason if fact.reason == NOT_APPLICABLE_FOR_SECTOR else MISSING_INPUT
            return _unavailable(context, metric, reason, f"MISSING:{fact.metric}", [fact])
    if denominator.value == 0:
        return _unavailable(context, metric, DIVISION_BY_ZERO, f"ZERO:{denominator.metric}")
    if denominator.value < 0 and not allow_negative_denominator:
        # A negative equity base makes ROE/D-E arithmetically defined but
        # economically meaningless; we refuse rather than publish a sign flip.
        return _unavailable(context, metric, DIVISION_BY_ZERO,
                            f"NEGATIVE_DENOMINATOR:{denominator.metric}")
    return _derive(context, metric, numerator.value / denominator.value, unit,
                   [numerator, denominator], formula)


def _difference(context, metric, left, right, formula, unit="USD"):
    blocked = _sector_guard(context, metric)
    if blocked is not None:
        return blocked
    for fact in (left, right):
        if fact is None or not fact.available:
            reason = (fact.reason if fact is not None and fact.reason == NOT_APPLICABLE_FOR_SECTOR
                      else MISSING_INPUT)
            detail = f"MISSING:{fact.metric}" if fact is not None else "MISSING:input"
            return _unavailable(context, metric, reason, detail,
                                [item for item in (left, right) if item is not None])
    return _derive(context, metric, left.value - right.value, unit, [left, right], formula)


def _growth(context, metric, current, prior, formula):
    blocked = _sector_guard(context, metric)
    if blocked is not None:
        return blocked
    for fact in (current, prior):
        if fact is None or not fact.available:
            return _unavailable(context, metric, MISSING_INPUT,
                                f"MISSING:{fact.metric}" if fact is not None else "MISSING:input",
                                [item for item in (current, prior) if item is not None])
    if prior.value == 0:
        return _unavailable(context, metric, DIVISION_BY_ZERO, "ZERO:prior")
    if prior.value < 0:
        # Growth off a negative base is not interpretable as a rate.
        return _unavailable(context, metric, DIVISION_BY_ZERO, "NEGATIVE_BASE:prior")
    return _derive(context, metric, current.value / prior.value - 1.0, UNIT_GROWTH,
                   [current, prior], formula)


def _cagr(context, metric, current, prior, years, formula):
    blocked = _sector_guard(context, metric)
    if blocked is not None:
        return blocked
    for fact in (current, prior):
        if fact is None or not fact.available:
            return _unavailable(context, metric, INSUFFICIENT_HISTORY,
                                f"MISSING:{fact.metric}" if fact is not None else "MISSING:input",
                                [item for item in (current, prior) if item is not None])
    if prior.value <= 0 or current.value <= 0:
        return _unavailable(context, metric, DIVISION_BY_ZERO, "NON_POSITIVE_BASE")
    value = (current.value / prior.value) ** (1.0 / years) - 1.0
    return _derive(context, metric, value, UNIT_GROWTH, [current, prior], formula,
                   flags=[f"CAGR_YEARS:{years}"])


def compute_derived(resolver, as_of, basis=BASIS_TTM, policy=POLICY_AS_OF_LATEST,
                    lag_days=0, cagr_years=(3, 5)):
    """All Vision Universe derived metrics for one company at one point in time."""
    context = DerivedContext(resolver, as_of, basis=basis, policy=policy, lag_days=lag_days)
    out = {}

    revenue = context.flow("revenue")
    cost_of_revenue = context.flow("cost_of_revenue")
    gross_profit = context.flow("gross_profit")
    operating_income = context.flow("operating_income")
    net_income = context.flow("net_income")
    operating_cash_flow = context.flow("operating_cash_flow")
    capex = context.flow("capital_expenditures")
    pretax = context.flow("pretax_income")
    tax = context.flow("income_tax_expense")
    eps_diluted = context.flow("eps_diluted")

    equity = context.stock("stockholders_equity")
    assets = context.stock("total_assets")
    cash = context.stock("cash_and_equivalents")
    long_term_debt = context.stock("long_term_debt")
    short_term_debt = context.stock("short_term_debt")
    reported_total_debt = context.stock("total_debt")

    # Gross profit: prefer the reported line, reconstruct only when absent.
    if gross_profit.available:
        effective_gross_profit = gross_profit
    else:
        effective_gross_profit = _difference(
            context, "gross_profit_derived", revenue, cost_of_revenue,
            "revenue - cost_of_revenue")
        out["gross_profit_derived"] = effective_gross_profit

    # Total debt: reported combined line, else the sum of its two components.
    sector_blocked_debt = _sector_guard(context, "total_debt_derived")
    if sector_blocked_debt is not None:
        effective_total_debt = sector_blocked_debt
        out["total_debt_derived"] = effective_total_debt
    elif reported_total_debt.available:
        effective_total_debt = reported_total_debt
    else:
        if long_term_debt.available and short_term_debt.available:
            effective_total_debt = _derive(
                context, "total_debt_derived",
                long_term_debt.value + short_term_debt.value, "USD",
                [long_term_debt, short_term_debt], "long_term_debt + short_term_debt")
        elif long_term_debt.reason == NOT_APPLICABLE_FOR_SECTOR or \
                reported_total_debt.reason == NOT_APPLICABLE_FOR_SECTOR:
            effective_total_debt = _unavailable(
                context, "total_debt_derived", NOT_APPLICABLE_FOR_SECTOR, "SECTOR_RULE")
        else:
            effective_total_debt = _unavailable(
                context, "total_debt_derived", MISSING_INPUT, "MISSING:debt_components")
        out["total_debt_derived"] = effective_total_debt

    free_cash_flow = _difference(context, "free_cash_flow", operating_cash_flow, capex,
                                 "operating_cash_flow - capital_expenditures")
    out["free_cash_flow"] = free_cash_flow

    out["net_debt"] = _difference(context, "net_debt", effective_total_debt, cash,
                                  "total_debt - cash_and_equivalents")

    out["gross_margin"] = _ratio(context, "gross_margin", effective_gross_profit, revenue,
                                 "gross_profit / revenue")
    out["operating_margin"] = _ratio(context, "operating_margin", operating_income, revenue,
                                     "operating_income / revenue")
    out["net_margin"] = _ratio(context, "net_margin", net_income, revenue,
                               "net_income / revenue")
    out["fcf_margin"] = _ratio(context, "fcf_margin", free_cash_flow, revenue,
                               "free_cash_flow / revenue")
    out["roe"] = _ratio(context, "roe", net_income, equity, "net_income / stockholders_equity")
    out["roa"] = _ratio(context, "roa", net_income, assets, "net_income / total_assets")
    out["debt_to_equity"] = _ratio(context, "debt_to_equity", effective_total_debt, equity,
                                   "total_debt / stockholders_equity")

    out["asset_turnover"] = _ratio(context, "asset_turnover", revenue, assets,
                                   "revenue / total_assets")
    out["capex_to_revenue"] = _ratio(context, "capex_to_revenue", capex, revenue,
                                     "capital_expenditures / revenue")
    out["roic"] = _roic(context, operating_income, pretax, tax, effective_total_debt, equity, cash)

    out["revenue_growth_yoy"] = _growth(context, "revenue_growth_yoy", revenue,
                                        context.flow_at("revenue", 1), "revenue YoY")
    out["eps_growth_yoy"] = _growth(context, "eps_growth_yoy", eps_diluted,
                                    context.flow_at("eps_diluted", 1), "eps_diluted YoY")
    prior_ocf = context.flow_at("operating_cash_flow", 1)
    prior_capex = context.flow_at("capital_expenditures", 1)
    prior_fcf = _difference(context, "free_cash_flow_prior", prior_ocf, prior_capex,
                            "operating_cash_flow - capital_expenditures")
    out["fcf_growth_yoy"] = _growth(context, "fcf_growth_yoy", free_cash_flow, prior_fcf,
                                    "free_cash_flow YoY")

    for years in cagr_years:
        out[f"revenue_cagr_{years}y"] = _cagr(
            context, f"revenue_cagr_{years}y", revenue,
            context.flow_at("revenue", years), years, f"revenue {years}y CAGR")
        out[f"eps_cagr_{years}y"] = _cagr(
            context, f"eps_cagr_{years}y", eps_diluted,
            context.flow_at("eps_diluted", years), years, f"eps_diluted {years}y CAGR")

    return out


def _roic(context, operating_income, pretax, tax, total_debt, equity, cash):
    """NOPAT / invested capital, with the effective tax rate from the filings."""
    metric = "roic"
    blocked = context.resolver.sector_block(metric)
    if blocked:
        return _unavailable(context, metric, NOT_APPLICABLE_FOR_SECTOR,
                            f"SECTOR_RULE_{blocked.rule_id}")
    inputs = {"operating_income": operating_income, "pretax_income": pretax,
              "income_tax_expense": tax, "total_debt": total_debt,
              "stockholders_equity": equity, "cash_and_equivalents": cash}
    for name, fact in inputs.items():
        if fact is None or not fact.available:
            reason = (fact.reason if fact is not None and fact.reason == NOT_APPLICABLE_FOR_SECTOR
                      else MISSING_INPUT)
            return _unavailable(context, metric, reason, f"MISSING:{name}")
    if pretax.value <= 0:
        return _unavailable(context, metric, DIVISION_BY_ZERO, "NON_POSITIVE_PRETAX")
    tax_rate = tax.value / pretax.value
    if not 0.0 <= tax_rate <= 1.0:
        # An effective rate outside [0,1] means a loss year or a one-off; we do
        # not clamp it into a plausible-looking number.
        return _unavailable(context, metric, DIVISION_BY_ZERO, "IMPLAUSIBLE_TAX_RATE")
    invested_capital = total_debt.value + equity.value - cash.value
    if invested_capital <= 0:
        return _unavailable(context, metric, DIVISION_BY_ZERO, "NON_POSITIVE_INVESTED_CAPITAL")
    nopat = operating_income.value * (1.0 - tax_rate)
    return _derive(context, metric, nopat / invested_capital, UNIT_RATIO,
                   [operating_income, pretax, tax, total_debt, equity, cash],
                   "operating_income * (1 - tax_rate) / (total_debt + equity - cash)",
                   quality=QUALITY_MEDIUM)
