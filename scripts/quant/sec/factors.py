"""Quant Engine integration: Vision Universe factors on SEC fundamentals.

Which factors SEC data can and cannot carry (Phase 4 § 28):

  Growth              yes  - revenue, EPS and FCF growth from filings
  Profitability       yes  - margins and return on equity
  Quality             yes  - cash conversion, return on assets, leverage
  Capital Efficiency  yes  - ROIC, asset turnover, capex intensity
  Value               no   - needs a price; SEC publishes none
  Momentum            no   - needs OHLCV; that stays a MarketDataProvider job

Scores are cross-sectional within the supplied universe. Missing inputs are
never imputed: a company without enough inputs gets an unavailable score with a
reason, which keeps a thin-coverage universe from producing confident nonsense.
"""
import logging
import statistics

from .derived import BASIS_TTM, compute_derived
from .model import INSUFFICIENT_HISTORY, MISSING_INPUT
from .restatements import POLICY_AS_OF_LATEST

LOGGER = logging.getLogger("vu.sec.factors")

# Direction +1: higher is better. -1: lower is better.
FACTOR_DEFINITIONS = {
    "growth": {
        "inputs": {"revenue_growth_yoy": 1, "eps_growth_yoy": 1, "fcf_growth_yoy": 1},
        "min_inputs": 2,
    },
    "profitability": {
        "inputs": {"net_margin": 1, "operating_margin": 1, "roe": 1},
        "min_inputs": 2,
    },
    "quality": {
        "inputs": {"fcf_margin": 1, "roa": 1, "debt_to_equity": -1},
        "min_inputs": 2,
    },
    "capital_efficiency": {
        "inputs": {"roic": 1, "asset_turnover": 1, "capex_to_revenue": -1},
        "min_inputs": 2,
    },
}

# Factors this provider structurally cannot serve.
UNSUPPORTED_FACTORS = {
    "value": "requires price data; SEC/EDGAR publishes none",
    "momentum": "requires OHLCV; SEC/EDGAR publishes none",
}

MIN_UNIVERSE_FOR_ZSCORE = 3
# Cross-sectional z-scores are clipped so that one outlier cannot dominate a
# small universe. The clip is recorded, not hidden.
ZSCORE_CLIP = 3.0


def company_factor_inputs(resolver, as_of, basis=BASIS_TTM, policy=POLICY_AS_OF_LATEST,
                          lag_days=0):
    """Raw factor inputs for one company at one point in time."""
    derived = compute_derived(resolver, as_of, basis=basis, policy=policy, lag_days=lag_days)
    values, reasons = {}, {}
    for definition in FACTOR_DEFINITIONS.values():
        for metric in definition["inputs"]:
            fact = derived.get(metric)
            if fact is not None and fact.available:
                values[metric] = fact.value
            else:
                reasons[metric] = (fact.reason if fact is not None else MISSING_INPUT)
    return {"values": values, "reasons": reasons, "derived": derived}


def _zscores(values_by_cik, clip=ZSCORE_CLIP):
    present = {cik: value for cik, value in values_by_cik.items() if value is not None}
    if len(present) < MIN_UNIVERSE_FOR_ZSCORE:
        return {}, None
    values = list(present.values())
    mean = statistics.fmean(values)
    try:
        stdev = statistics.stdev(values)
    except statistics.StatisticsError:
        return {}, None
    if stdev == 0:
        return {cik: 0.0 for cik in present}, {"mean": mean, "stdev": 0.0}
    scores = {cik: max(-clip, min(clip, (value - mean) / stdev))
              for cik, value in present.items()}
    return scores, {"mean": mean, "stdev": stdev}


def score_universe(inputs_by_cik):
    """Cross-sectional factor scores for a universe at one point in time."""
    universe_size = len(inputs_by_cik)
    metric_scores = {}
    metric_stats = {}
    all_metrics = {metric for definition in FACTOR_DEFINITIONS.values()
                   for metric in definition["inputs"]}
    for metric in sorted(all_metrics):
        raw = {cik: payload["values"].get(metric) for cik, payload in inputs_by_cik.items()}
        scores, stats = _zscores(raw)
        metric_scores[metric] = scores
        metric_stats[metric] = stats

    out = {}
    for cik in inputs_by_cik:
        company = {}
        for factor, definition in FACTOR_DEFINITIONS.items():
            contributions = {}
            for metric, direction in definition["inputs"].items():
                score = metric_scores[metric].get(cik)
                if score is not None:
                    contributions[metric] = direction * score
            if universe_size < MIN_UNIVERSE_FOR_ZSCORE:
                company[factor] = {
                    "score": None, "available": False,
                    "reason": INSUFFICIENT_HISTORY,
                    "detail": f"cross-sectional scoring needs at least "
                              f"{MIN_UNIVERSE_FOR_ZSCORE} companies, got {universe_size}",
                    "inputs_used": sorted(contributions),
                }
                continue
            if len(contributions) < definition["min_inputs"]:
                company[factor] = {
                    "score": None, "available": False, "reason": MISSING_INPUT,
                    "detail": f"{len(contributions)}/{definition['min_inputs']} required "
                              f"inputs available",
                    "inputs_used": sorted(contributions),
                    "inputs_missing": sorted(set(definition["inputs"]) - set(contributions)),
                }
                continue
            company[factor] = {
                "score": round(statistics.fmean(contributions.values()), 6),
                "available": True,
                "inputs_used": sorted(contributions),
                "inputs_missing": sorted(set(definition["inputs"]) - set(contributions)),
            }
        for factor, reason in UNSUPPORTED_FACTORS.items():
            company[factor] = {"score": None, "available": False,
                               "reason": "NOT_AVAILABLE_FROM_PROVIDER", "detail": reason}
        out[cik] = company
    return {"universe_size": universe_size, "metric_stats": metric_stats, "scores": out}
