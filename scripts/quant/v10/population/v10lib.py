"""V10 POPULATION: shared helpers (stdlib only).

SEC access goes through the V9 identity wrapper (scripts/quant/v9/identity/sec_lib.py), which itself uses the
repository fair-access client scripts/quant/sec/http_client.py (User-Agent with contact address, RateLimiter 2 req/s,
on-disk cache). The cache directory is redirected to this strand's private scratchpad BEFORE the import, so raw SEC
bodies never land in the repository.
"""
import datetime as dt
import hashlib
import json
import math
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
PRIVATE = pathlib.Path(os.environ.get(
    'V10_POPULATION_PRIVATE',
    '/tmp/claude-0/-home-user-vision-universe-research/f429e7bd-1176-554d-8fa5-5081d98ef531/scratchpad/v10-private/population'))
os.environ['V9_IDENTITY_PRIVATE'] = str(PRIVATE)
sys.path.insert(0, str(ROOT / 'scripts' / 'quant' / 'v9' / 'identity'))
import sec_lib  # noqa: E402  (fair-access client, private cache)

WEEKLY_DIR = ROOT / 'quant' / 'data' / 'market' / 'discover-series-long'
DAILY_DIR = ROOT / 'quant' / 'data' / 'market' / 'discover-series'
MASTER = ROOT / 'quant' / 'data' / 'market' / 'security-master' / 'us-security-master.json'


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


BOT_TAG = re.compile(rb'<script type="text/javascript"\s+src="/[^"]*"></script>(?=</body>)')


def norm_body(b):
    """Remove the per-request bot-manager script tag www.sec.gov injects before </body> (amendment 1.0.2)."""
    return BOT_TAG.sub(b'', b)


def get(url, prefix=False):
    body, meta = sec_lib.get(url, prefix=prefix)
    meta = dict(meta)
    meta['sha256Normalized'] = sha256_bytes(norm_body(body))
    return body, meta


def sha256_file(p):
    return sha256_bytes(pathlib.Path(p).read_bytes())


def js_hash(obj):
    """weekly-real-adapter hash(): sha256 of JSON.stringify(obj) (compact separators, no ASCII escaping)."""
    return sha256_bytes(json.dumps(obj, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))


def load_weekly(sid):
    return json.loads((WEEKLY_DIR / (sid + '.json')).read_text())


def load_daily(sid):
    p = DAILY_DIR / (sid + '.json')
    return json.loads(p.read_text()) if p.exists() else None


def master_rows():
    m = json.loads(MASTER.read_text())
    by = {}
    for r in m['rows']:
        if r.get('baseline_security_id'):
            by.setdefault(r['baseline_security_id'], []).append(r)
    return m, by


def tail_run(points):
    if not points:
        return None
    last = points[-1][1]
    run = 1
    for i in range(len(points) - 2, -1, -1):
        if points[i][1] != last:
            break
        run += 1
    return {'run': run, 'since': points[len(points) - run][0], 'close': last, 'to': points[-1][0], 'points': len(points)}


def iso_week(d):
    return dt.date.fromisoformat(d).isocalendar()[:2]


def later_split_product(doc, date):
    f = 1.0
    for d, k in (doc.get('corporateActions') or {}).get('splits', []):
        if d > date:
            f *= k
    return f


def add_days(d, n):
    return (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()


def days_between(a, b):
    return (dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days


# ------------------------------------------------------------------ NYSE holidays (for 'prior to the opening on D')
def _easter(y):
    a = y % 19; b = y // 100; c = y % 100; d = b // 4; e = b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; month = (h + l - 7 * m + 114) // 31; day = ((h + l - 7 * m + 114) % 31) + 1
    return dt.date(y, month, day)


def _observed(d):
    if d.weekday() == 5:
        return d - dt.timedelta(days=1)
    if d.weekday() == 6:
        return d + dt.timedelta(days=1)
    return d


def _nth(y, m, wd, n):
    d = dt.date(y, m, 1)
    while d.weekday() != wd:
        d += dt.timedelta(days=1)
    return d + dt.timedelta(days=7 * (n - 1))


def _last(y, m, wd):
    d = dt.date(y, m + 1, 1) - dt.timedelta(days=1) if m < 12 else dt.date(y, 12, 31)
    while d.weekday() != wd:
        d -= dt.timedelta(days=1)
    return d


def nyse_holidays(y):
    h = {_observed(dt.date(y, 1, 1)), _nth(y, 1, 0, 3) if y >= 1998 else None, _nth(y, 2, 0, 3), _easter(y) - dt.timedelta(days=2),
         _last(y, 5, 0), _observed(dt.date(y, 7, 4)), _nth(y, 9, 0, 1), _nth(y, 11, 3, 4), _observed(dt.date(y, 12, 25))}
    if y >= 2022:
        h.add(_observed(dt.date(y, 6, 19)))
    h.discard(None)
    return h


def is_trading_day(d):
    d = dt.date.fromisoformat(d) if isinstance(d, str) else d
    return d.weekday() < 5 and d not in nyse_holidays(d.year)


def prev_trading_day(d):
    x = dt.date.fromisoformat(d) - dt.timedelta(days=1)
    while not is_trading_day(x):
        x -= dt.timedelta(days=1)
    return x.isoformat()


# ------------------------------------------------------------------ price statements
MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
DATE_TXT = r'(?:%s)\.? \d{1,2},? \d{4}' % MONTHS
PHRASE = r'(?:last reported (?:sale|sales|closing) price|last reported sale|closing (?:sale |sales |market )?price|last sale price|closing stock price)'
PRICE = r'\$\s?(?P<price>\d{1,6}(?:,\d{3})*\.\d{2,4})(?!\d)(?!\s*(?:million|billion|thousand|trillion|mm\b|bn\b))'
RX_A = re.compile(PHRASE + r'(?:[^$.;]|\.(?=\d)){0,170}?(?:on|as of|at) (?P<date>' + DATE_TXT + r')(?:[^$;]){0,70}?' + PRICE, re.I)
RX_B = re.compile(PHRASE + r'(?:[^$.;]|\.(?=\d)){0,80}?' + PRICE + r'(?:[^$.;]|\.(?=\d)){0,110}?(?:on|as of|at) (?P<date>' + DATE_TXT + r')', re.I)
REJECT = re.compile(r'exercise|conversion|convert|offering price|public offering|tender|purchase price|strike|\bwould\b|implied|average|\bhigh\b|\blow\b|range|vwap|volume[- ]weighted|warrant|preferred|notes?\b|debenture|premium|per unit', re.I)
SHARE_WORDS = re.compile(r'common|share|stock|ordinary', re.I)


def parse_date(txt):
    t = re.sub(r'\s+', ' ', txt.replace('.', '').replace(',', ', ')).replace(' ,', ',')
    t = re.sub(r',\s*', ', ', t)
    for fmt in ('%B %d, %Y',):
        try:
            return dt.datetime.strptime(t.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def price_statements(text):
    """[(isoDate, price, quote<=300, span)] from tag-stripped text."""
    out, seen = [], set()
    for rx in (RX_A, RX_B):
        for m in rx.finditer(text):
            window = text[m.start():m.end()]
            if REJECT.search(window):
                continue
            ctx = text[max(0, m.start() - 160):m.end() + 40]
            if not SHARE_WORDS.search(ctx):
                continue
            d = parse_date(m.group('date'))
            if not d:
                continue
            p = float(m.group('price').replace(',', ''))
            if p <= 0 or (d, p) in seen:
                continue
            seen.add((d, p))
            s = max(0, m.start() - 80)
            out.append({'date': d, 'price': p, 'quote': text[s:m.end() + 20][:300], 'start': m.start()})
    return out


def text_of(body):
    return sec_lib._text(body.decode('utf-8', errors='replace'))


def norm_sym(s):
    return re.sub(r'[\s.\-/_]', '', (s or '').upper())


EXCHANGE_MIC = [
    (re.compile(r'nyse american|nyse mkt|american stock exchange|\bamex\b|nyse amex', re.I), 'XASE'),
    (re.compile(r'nyse arca', re.I), 'ARCX'),
    (re.compile(r'nasdaq', re.I), 'XNAS'),
    (re.compile(r'new york stock exchange|\bnyse\b', re.I), 'XNYS'),
]
MASTER_MIC = {'NYSE': 'XNYS', 'NASDAQ': 'XNAS', 'NYSE MKT': 'XASE', 'AMEX': 'XASE', 'NYSE AMERICAN': 'XASE', 'NYSE ARCA': 'ARCX', 'BATS': 'BATS'}


def exchange_mic(name):
    for rx, mic in EXCHANGE_MIC:
        if rx.search(name or ''):
            return mic
    return None


def same_day_check(weekly, daily, date, raw_price, tol=0.02):
    """Protocol Q-PX sameDay/match. Returns dict with state MATCH / MISMATCH_SAME_DAY / NOT_SAME_DAY / NO_BAR."""
    factor = later_split_product(weekly, date)
    adj = raw_price / factor
    wk = iso_week(date)
    wbar = next((p for p in weekly['points'] if iso_week(p[0]) == wk), None)
    res = {'date': date, 'sourceRawPrice': raw_price, 'laterSplitProduct': round(factor, 12), 'sourceAdjustedPrice': round(adj, 6)}
    bar, basis = None, None
    if wbar and (wbar[0] == date or (dt.date.fromisoformat(date).weekday() >= 5 and wbar[0] < date)):
        bar, basis = wbar, 'WEEKLY'
    elif daily and daily['points'] and daily['points'][0][0] <= date <= daily['points'][-1][0] and wbar:
        dmap = dict((d, c) for d, c in daily['points'])
        if date in dmap and dmap.get(wbar[0]) == wbar[1]:
            bar, basis = [date, dmap[date]], 'DAILY_CROSSCHECKED'
    if not bar:
        res['state'] = 'NO_BAR_IN_WEEK' if not wbar else 'NOT_SAME_DAY'
        if wbar:
            res['weekBar'] = wbar
        return res
    ratio = bar[1] / adj
    res.update({'bar': bar, 'basis': basis, 'ratioSeriesToSource': round(ratio, 6),
                'state': 'MATCH' if abs(ratio - 1) <= tol else 'MISMATCH_SAME_DAY'})
    return res


def zscore_at(points, idx, lookback=52):
    if idx <= 0:
        return None
    r = math.log(points[idx][1] / points[idx - 1][1])
    hist = [math.log(points[i][1] / points[i - 1][1]) for i in range(max(1, idx - lookback), idx)]
    if len(hist) < 10:
        return None
    m = sum(hist) / len(hist)
    sd = math.sqrt(sum((x - m) ** 2 for x in hist) / (len(hist) - 1))
    return r / sd if sd > 0 else None


def write_json(path, obj, gz=False):
    p = pathlib.Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(obj, indent=1, ensure_ascii=False) + '\n').encode('utf-8')
    if gz:
        import gzip
        with gzip.GzipFile(filename='', mode='wb', fileobj=open(p, 'wb'), mtime=0) as fh:
            fh.write(data)
    else:
        p.write_bytes(data)
