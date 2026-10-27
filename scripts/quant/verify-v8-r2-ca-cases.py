"""Independent publisher-contract replay plus separate exact-decimal diagnostics.

Source JSON has already been decoded to ECMAScript Numbers by the producer.
The published contract operates on binary64, including each cumulative product
and division. Above $1 it rounds the binary64 product with 100 (ties upward);
below $1 toPrecision(4) rounds the exact value of the binary64 input. Decimal
HALF_UP on the source number's shortest decimal spelling is a different model,
so its differences are counted, never silently accepted as numerical slack.
No JavaScript imports or source prices are included in this tool's output.
"""
import decimal
import json
import math
import sys
from pathlib import Path

D = decimal.Decimal


def prices(rows, exact=False):
    out = [None] * len(rows)
    factor = D(1) if exact else 1.0
    for i in range(len(rows) - 1, -1, -1):
        close = D(str(rows[i]['close'])) if exact else float(rows[i]['close'])
        split = D(str(rows[i]['splitFactor'])) if exact else float(rows[i]['splitFactor'])
        out[i] = close / factor
        factor *= split
    return out


def decimal_rounded(value):
    quantum = D('.01') if value >= 1 else D(1).scaleb(value.adjusted() - 3)
    return float(value.quantize(quantum, rounding=decimal.ROUND_HALF_UP))


def published_rounded(value):
    if not math.isfinite(value) or value <= 0:
        raise ValueError('NONFINITE_OR_NONPOSITIVE_RECONSTRUCTION')
    if value >= 1:
        scaled = value * 100.0
        # floor(x + .5) can itself double-round a value immediately below .5.
        floor = math.floor(scaled)
        return (floor + (scaled - floor >= .5)) / 100.0
    # toPrecision rounds the binary64 value, not its shortest decimal spelling.
    exact_binary_value = D.from_float(value)
    quantum = D(1).scaleb(exact_binary_value.adjusted() - 3)
    return float(exact_binary_value.quantize(quantum, rounding=decimal.ROUND_HALF_UP))


def verify(x):
    raw = x['raw']['bars']
    old = [b for b in raw if b['date'] <= x['weekly']['asOf']]
    new_prices, old_prices = prices(raw), prices(old)
    exact_new, exact_old = prices(raw, True), prices(old, True)
    checks = {}
    diagnostics = {}
    for label, actual, expected, exact in [
        ('newPrices', x['newPrices'], new_prices, exact_new),
        ('oldPrices', x['oldPrices'], old_prices, exact_old),
    ]:
        checks[label] = (abs(len(actual) - len(expected)) +
                         sum(a != b for a, b in zip(actual, expected)))
        # Retain the original Decimal reconstruction precision threshold.
        checks[label + 'DecimalPrecision'] = sum(
            not math.isclose(a, float(b), rel_tol=1e-12, abs_tol=1e-12)
            for a, b in zip(actual, exact))
    old_by = {r['date']: v for r, v in zip(old, old_prices)}
    new_by = {r['date']: v for r, v in zip(raw, new_prices)}
    exact_old_by = {r['date']: v for r, v in zip(old, exact_old)}
    exact_new_by = {r['date']: v for r, v in zip(raw, exact_new)}
    for label, points, binary_by, exact_by in [
        ('oldWeekly', x['weekly']['points'], old_by, exact_old_by),
        ('currentDaily', x['daily']['points'], new_by, exact_new_by),
        ('reconstructedWeekly', x['revised']['points'], new_by, exact_new_by),
    ]:
        mismatches = differences = 0
        max_difference = 0.0
        for date, actual in points:
            if date not in binary_by:
                mismatches += 1
                continue
            expected = published_rounded(binary_by[date])
            mismatches += actual != expected
            decimal_value = decimal_rounded(exact_by[date])
            if expected != decimal_value:
                differences += 1
                max_difference = max(max_difference, abs(expected - decimal_value))
        checks[label] = mismatches
        diagnostics[label] = {'differentPublishedPoints': differences,
                              'maxAbsolutePublishedDifference': max_difference}
    checks['observedWeeklyDates'] = int(
        [r[0] for r in x['weekly']['points']] != [r[0] for r in x['revised']['points']])
    checks['newSplitEvidence'] = int(not any(
        r['date'] > x['weekly']['asOf'] and r['splitFactor'] != 1 for r in raw))
    return dict(state='FAIL' if any(checks.values()) else 'PASS',
                rawPrices=len(new_prices), oldBasisPrices=len(old_prices),
                oldWeeklyPoints=len(x['weekly']['points']),
                currentDailyPoints=len(x['daily']['points']),
                reconstructedWeeklyPoints=len(x['revised']['points']),
                mismatchCounts=checks,
                decimalDiagnostics=dict(
                    model='Exact Decimal arithmetic on serialized source-number decimal spellings; HALF_UP cents or four significant digits',
                    publishedDifferences=diagnostics),
                method='Independent Python binary64 backward split-factor reconstruction and exact publisher rounding; strict published-number equality; observed dates only')


def main(file):
    with decimal.localcontext() as context:
        context.prec = 100
        result = verify(json.loads(Path(file).read_text()))
    print(json.dumps(result))
    return 0 if result['state'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
