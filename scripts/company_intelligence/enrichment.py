"""Small deterministic evidence extractors; missing/ambiguous values stay missing.

The registry is reusable across issuers. No company-specific scraper, LLM,
currency guess, guidance-period guess or full document is stored.
"""
import re
from .model import clean, canonical_url

KPI_RULES = {
    'deliveries': (r'\b(?:vehicle\s+)?deliveries\s+(?:were|of|totaled|reached)\s+([\d,]+)', 'vehicles'),
    'production': (r'\b(?:vehicle\s+)?production\s+(?:was|of|totaled|reached)\s+([\d,]+)', 'vehicles'),
    'net_retention_rate': (r'\b(?:net revenue retention|net retention rate)\s+(?:was|of|reached)\s+([\d.]+)%', 'percent'),
    'net_interest_margin': (r'\bnet interest margin\s+(?:was|of)\s+([\d.]+)%', 'percent'),
}


def kpis(text, url, period):
    if not canonical_url(url) or not period or not period.get('fiscalYear') or not period.get('fiscalQuarter'):
        return []
    out = []
    for metric, (pattern, unit) in KPI_RULES.items():
        matches = list(re.finditer(pattern, text, re.I))
        if len(matches) != 1:
            continue  # Comparative tables/multiple values require a richer adapter.
        match = matches[0]
        context = text[max(0, match.start() - 80):match.start()]
        if re.search(r'expects?|guidance|forecast|will|target', context, re.I):
            continue
        value = float(match[1].replace(',', ''))
        if value < 0 or (unit == 'percent' and value > 200):
            continue
        out.append({'metric': metric, 'value': value, 'unit': unit, 'period': period,
                    'sourceUrl': url, 'evidence': clean(match[0], 200), 'confidence': .9,
                    'verificationState': 'SOURCE_EXPLICIT_VALUE', 'comparisonState': 'NOT_COMPARABLE'})
    return out


def guidance(text, url):
    if not canonical_url(url):
        return []
    quarters = {'first': 'Q1', 'second': 'Q2', 'third': 'Q3', 'fourth': 'Q4'}
    heading = re.search(r'(?:outlook|guidance)\s+for\s+(?:the\s+)?(first|second|third|fourth)\s+quarter\s+(?:of\s+)?(?:fiscal\s+)?(20\d{2})', text, re.I)
    if not heading:
        return []
    region = text[heading.end():heading.end() + 1500]
    # Stop at a new section instead of attributing another year's forecast.
    region = re.split(r'\b(?:Safe Harbor|Conference Call|Forward-Looking Statements)\b', region, flags=re.I)[0]
    range_pattern = r'\brevenue\s+(?:is\s+)?(?:expected to be|of|between|in the range of)\s*(USD\s*|US\$\s*|\$)([\d,.]+)\s*(?:to|and|[-–])\s*(?:USD\s*|US\$\s*|\$)?([\d,.]+)\s*(million|billion)'
    tolerance_pattern = r'\brevenue\s+(?:is\s+)?expected to be\s*(USD\s*|US\$\s*|\$)([\d,.]+)\s*(million|billion),?\s*(?:plus or minus|[±])\s*([\d.]+)\s*%'
    matches = list(re.finditer(range_pattern, region, re.I))
    tolerance = list(re.finditer(tolerance_pattern, region, re.I))
    if len(matches) + len(tolerance) != 1:
        return []
    if matches:
        m = matches[0]
        low, high, scale = float(m[2].replace(',', '')), float(m[3].replace(',', '')), m[4]
    else:
        m = tolerance[0]
        midpoint, percent = float(m[2].replace(',', '')), float(m[4])
        if not 0 <= percent <= 50:
            return []
        low, high, scale = midpoint * (1 - percent / 100), midpoint * (1 + percent / 100), m[3]
    if not 0 <= low <= high <= max(1, low) * 3:
        return []
    factor = 10**6 if scale.lower() == 'million' else 10**9
    currency = 'USD' if m[1].strip().upper() in ('USD', 'US$') or re.search(r'\b(?:U\.S\. dollars|USD)\b', text, re.I) else None
    return [{'metric': 'revenue', 'period': {'fiscalQuarter': quarters[heading[1].lower()], 'fiscalYear': int(heading[2])},
             'low': low * factor, 'high': high * factor, 'midpoint': (low + high) / 2 * factor, 'unit': currency or 'dollar_currency_unspecified', 'currency': currency,
             'sourceUrl': url, 'evidence': clean(heading[0] + ' … ' + m[0], 400), 'confidence': .95 if currency else .8,
             'verificationState': 'SOURCE_EXPLICIT_RANGE' if currency else 'UNVERIFIED_CURRENCY', 'numericalValidation': 'LOW_LE_MIDPOINT_LE_HIGH'}]
