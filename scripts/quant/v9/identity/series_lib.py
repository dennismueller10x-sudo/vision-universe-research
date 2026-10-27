"""V9 identity: weekly-series helpers (stdlib). Split convention identical to
quant/engines/return-series.js#splitFactors: a split acts FROM its date, so a bar dated d
is divided by the product of all factors whose date is > d."""
import datetime
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[4]
SERIES_DIR = ROOT / 'quant' / 'data' / 'market' / 'discover-series-long'


def load(security_id):
    return json.loads((SERIES_DIR / (security_id + '.json')).read_text())


def iso_week(date):
    return datetime.date.fromisoformat(date).isocalendar()[:2]


def later_split_product(doc, date):
    f = 1.0
    for d, k in (doc.get('corporateActions') or {}).get('splits', []):
        if d > date:
            f *= k
    return f


def bar_for(doc, date):
    """Weekly bar of the ISO week containing `date` (or None)."""
    wk = iso_week(date)
    for d, p in doc['points']:
        if iso_week(d) == wk:
            return d, p
    return None


def price_check(doc, date, raw_price, tolerance_same_day=0.02, tolerance_same_week=0.15):
    """Compare a source-stated raw close with the split-adjusted weekly bar of that ISO week.
    MATCH: bar is the stated trading day (or the stated date is a weekend 'as of' and the bar is the
    Friday before it) and |ratio-1| <= 2 %. WEAK_MATCH: other day of the same ISO week, <= 15 %.
    MISMATCH_SAME_DAY / MIDWEEK_DEVIATION otherwise. Mid-week comparisons are descriptive only."""
    bar = bar_for(doc, date)
    if not bar:
        return {'state': 'NO_BAR_IN_WEEK', 'date': date, 'sourceRawPrice': raw_price}
    factor = later_split_product(doc, date)
    adjusted = raw_price / factor
    ratio = bar[1] / adjusted
    wd = datetime.date.fromisoformat(date).weekday()
    same_day = bar[0] == date or (wd >= 5 and bar[0] < date)
    if same_day:
        state = 'MATCH' if abs(ratio - 1) <= tolerance_same_day else 'MISMATCH_SAME_DAY'
    else:
        state = 'WEAK_MATCH' if abs(ratio - 1) <= tolerance_same_week else 'MIDWEEK_DEVIATION'
    return {'state': state, 'date': date, 'barDate': bar[0], 'sameDay': same_day, 'sourceRawPrice': raw_price,
            'laterSplitProduct': round(factor, 12), 'sourceAdjustedPrice': round(adjusted, 6), 'seriesClose': bar[1],
            'ratioSeriesToSource': round(ratio, 6)}


def discontinuity(doc, date, lookback=52):
    """Weekly log return of the first bar on/after `date` relative to the trailing weekly log-return
    standard deviation. Descriptive only; a large |z| flags a possible level break."""
    pts = doc['points']
    idx = next((i for i, (d, _) in enumerate(pts) if d >= date), None)
    if idx is None or idx == 0:
        return {'date': date, 'state': 'OUTSIDE_SERIES'}
    r = math.log(pts[idx][1] / pts[idx - 1][1])
    hist = [math.log(pts[i][1] / pts[i - 1][1]) for i in range(max(1, idx - lookback), idx)]
    if len(hist) < 10:
        return {'date': date, 'state': 'INSUFFICIENT_HISTORY', 'bar': pts[idx][0], 'logReturn': round(r, 6)}
    m = sum(hist) / len(hist)
    sd = math.sqrt(sum((x - m) ** 2 for x in hist) / (len(hist) - 1))
    z = r / sd if sd > 0 else None
    return {'date': date, 'state': 'LEVEL_BREAK_SUSPECT' if z is not None and abs(z) > 4 else 'NO_LEVEL_BREAK',
            'prevBar': pts[idx - 1], 'bar': pts[idx], 'logReturn': round(r, 6), 'trailingSd': round(sd, 6),
            'z': round(z, 3) if z is not None else None, 'rule': '|z|>4 flags LEVEL_BREAK_SUSPECT'}
