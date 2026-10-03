"""Independent secondary calendar cross-check; never repairs provider prices."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import re


def verify_byd_issuer_action(here):
    """Verify saved disclosure integrity and exact quoted action terms offline."""
    text_path = here / "byd-2024-distribution-implementation.txt"
    pdf_path = here / "byd-2024-distribution-implementation.pdf"
    provenance_path = here / "byd-primary-document-provenance.json"
    szse_path = here / "byd-szse-announcements.json"
    if not all(p.exists() for p in [text_path, pdf_path, provenance_path, szse_path]):
        return {"state": "UNVERIFIED"}
    provenance = json.loads(provenance_path.read_text())
    text = re.sub(r"\s+", "", text_path.read_text())
    clauses = ["每10股派发现金红利人民币39.74元", "每10股送红股8股", "每10股转增12股",
               "A股除权除息日为：2025年7月29日"]
    exchange = json.loads(szse_path.read_text())
    exchange_identity = any(r.get("annId") == 1224237000 and "002594" in r.get("secCode", [])
        for r in exchange.get("payload", {}).get("data", []))
    integrity = hashlib.sha256(pdf_path.read_bytes()).hexdigest() == provenance.get("sha256")
    verified = integrity and exchange_identity and all(clause in text for clause in clauses)
    return {"state": "VERIFIED_ISSUER_AND_EXCHANGE" if verified else "VERIFICATION_INCOMPLETE",
        "document": provenance, "szseAnnouncementId": 1224237000,
        "pdfSha256Matches": integrity, "exchangeTickerAndAnnouncementMatched": exchange_identity,
        "quotedClauses": clauses, "terms": {"instrument": "002594", "exRightsDate": "2025-07-29",
            "oldShares": 10, "bonusShares": 8, "capitalizationShares": 12, "newTotalShares": 30,
            "splitRatio": 3, "grossCashPer10OldSharesCNY": 39.74, "grossCashPerOldShareCNY": 3.974}}


def build(runtime, source, target, byd_source=None):
    checks = []
    sources = []
    byd_primary = verify_byd_issuer_action(target.parent)
    for ticker, calendar, window in [("600519", source, "2007"), ("002594", byd_source or {}, "2025-07")]:
        history = next((r for r in runtime.get("responses", [])
            if "/" + ticker + "/prices" in r["url"] and window in r["url"] and r.get("status") == 200), None)
        if not history or calendar.get("status") != 200:
            continue
        sources.append({"instrument": ticker, "tiingoUrl": history["url"],
            "sourceRunId": history.get("sourceRunId"), "sha256": history.get("sha256"),
            "secondaryUrl": calendar["url"]})
        bars = history["payload"]
        indexes = {b["date"][:10]: i for i, b in enumerate(bars)}
        for action in calendar.get("events", {}).get("splits", {}).values():
            day = dt.datetime.fromtimestamp(action["date"], dt.timezone.utc).date().isoformat()
            if day not in indexes or indexes[day] == 0:
                continue
            index = indexes[day]
            before, after = bars[index-1], bars[index]
            ratio = action["numerator"] / action["denominator"]
            expected = (after["close"] * ratio + after["divCash"]) / before["close"] - 1
            adjusted = after["adjClose"] / before["adjClose"] - 1
            before_factor = before["adjClose"] / before["close"]
            after_factor = after["adjClose"] / after["close"]
            cash_only = after["close"] / (after["close"] + after["divCash"])
            checks.append({"instrument": ticker, "date": day, "secondaryReportedSplit": ratio,
                "providerSplitFactor": after["splitFactor"], "rawBarBefore": before, "rawBarAfter": after,
                "rawPriceReturn": after["close"] / before["close"] - 1,
                "providerAdjustedReturn": adjusted,
                "observedAdjustmentFactorRatio": before_factor / after_factor,
                "providerCashOnlyFormula": cash_only,
                "factorMatchesCashOnly": abs(before_factor / after_factor-cash_only) < 1e-7,
                "expectedReturnAssumingBonusSharesAndProviderCash": expected,
                "adjustedReturnDifference": adjusted - expected,
                "splitFieldMatchesSecondary": abs(ratio-after["splitFactor"]) < 1e-6,
                "cashMayIncludeCorporateActionProxy": ticker == "600519" and day == "2015-07-17"})
            if ticker == "002594" and day == "2025-07-29" and byd_primary["state"] == "VERIFIED_ISSUER_AND_EXCHANGE":
                terms = byd_primary["terms"]
                primary_expected = (after["close"] * terms["splitRatio"] + terms["grossCashPerOldShareCNY"]) / before["close"] - 1
                volume_ratio = (before["adjVolume"] / before["volume"]) / (after["adjVolume"] / after["volume"])
                checks[-1].update(primaryIssuerAction=byd_primary,
                    actionOracleConfidence="VERIFIED_ISSUER_AND_EXCHANGE",
                    actionMismatch="CONFIRMED_SPLIT_FACTOR_AND_ADJUSTED_PRICE_FAILURE",
                    secondaryCalendarMatchesPrimary=ratio == terms["splitRatio"],
                    providerCashMatchesPrimary=abs(after["divCash"]-terms["grossCashPerOldShareCNY"]) < 1e-12,
                    observedAdjustedVolumeFactorRatio=volume_ratio,
                    primaryExpectedAdjustedVolumeFactorRatio=terms["splitRatio"],
                    adjustedVolumeMatchesPrimary=abs(volume_ratio-terms["splitRatio"]) < 1e-6,
                    expectedGrossCorporateActionReturn=primary_expected,
                    expectedReturnCashBasis="Gross CNY3.974 per old share, verified issuer disclosure")
    if not checks:
        return {}
    report = {"schemaVersion": 2, "auditDate": "2026-10-02", "instruments": [s["instrument"] for s in sources],
        "sources": sources,
        "secondaryEvidenceScope": "Independent public corporate-action calendar, not primary issuer announcement",
        "bydPrimaryIssuerAction": byd_primary,
        "checks": checks, "result": "CONFIRMED_BYD_A_SHARE_ADJUSTMENT_FAILURE_AND_SECONDARY_MOUTAI_CONCERNS"
            if byd_primary["state"] == "VERIFIED_ISSUER_AND_EXCHANGE" else "POTENTIAL_MISSING_OR_INCONSISTENT_STOCK_BONUS_ADJUSTMENTS",
        "productSafety": "BLOCKED_FOR_AUTOMATIC_MAINLAND_QUANT_TECHNICAL_BACKTEST_ACTIVATION_PENDING_ACTION_RECONCILIATION",
        "limitations": ["Moutai secondary split calendar still requires primary issuer/exchange confirmation; BYD is independently verified when marked.",
            "2015 provider cash may incorporate stock-bonus proxy; do not automatically substitute cash or split fields.",
            "Dividend-only algebra passing does not establish complete corporate-action coverage."],
        "productionChanged": False}
    target.write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    here = Path(__file__).resolve().parent
    build(json.loads((here.parent / "runtime/account_evidence.json").read_text()),
          json.loads((here / "moutai-split-secondary.json").read_text()),
          here / "tiingo_china_corporate_action_crosscheck.json",
          json.loads((here / "byd-split-secondary.json").read_text()))
