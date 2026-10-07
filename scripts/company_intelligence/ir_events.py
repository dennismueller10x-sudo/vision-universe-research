"""First-party event evidence: explicit dates, JSON-LD and iCalendar. No guessed dates."""
import json
import re
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from html.parser import HTMLParser
from .model import canonical_url, clean, stable_id, timestamp, within_domain

MONTHS = {m.lower(): n for n, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], 1)}
DATE = re.compile(r'\b(' + '|'.join(MONTHS) + r')\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b', re.I)
EARNINGS = re.compile(r'earnings|(?:quarter|quarterly|fiscal|financial|full.year).{0,30}results|\bQ[1-4]\b(?:\s+(?:FY\s*(?:20)?\d{2}|20\d{2}))?\s+results\b', re.I)
ANNOUNCEMENT = re.compile(r'\b(will|scheduled|schedule|to (?:report|announce|release|host|present|participate)|sets|date for)\b', re.I)
# Some issuer schedules place the full event date between a clock and its zone.
# Admit that exact grammar only; never bridge arbitrary text or another clock.
CLOCK_DATE = (r'(?:on\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?'
              r'(?:' + '|'.join(MONTHS) + r')\s+\d{1,2}(?:st|nd|rd|th)?,?\s+20\d{2},?\s+)?')
TIME = re.compile(r'\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\s*' + CLOCK_DATE +
                  r'(?:U\.?S\.?\s+)?(ET|EST|EDT|PT|PST|PDT|UTC|GMT|Eastern(?: Daylight| Standard)? Time|Pacific(?: Daylight| Standard)? Time)\b', re.I)


def publication_dateline(text, match):
    """Wire labels adjacent to either side of a date identify publication."""
    return bool(re.search(r'^\s*[,–—-]*\s*[( /]*(?:GLOBE NEWSWIRE|Business Wire|PRNewswire)\b',
                          text[match.end():match.end() + 45], re.I)
                or re.search(r'\(?(?:BUSINESS WIRE|GLOBE NEWSWIRE|PRNewswire)\)?\s*[-–—:]*\s*$',
                             text[max(0, match.start() - 80):match.start()], re.I))


def event_type(name):
    operating = re.search(r'\b(production|deliveries|delivery|operating results|operational results|phase[ -]?[123]|clinical|trial|study)\b', name, re.I) and not re.search(r'financial results|earnings', name, re.I)
    if EARNINGS.search(name) and not operating:
        return 'EARNINGS_CALL' if re.search(r'call|webcast', name, re.I) else 'EARNINGS_SCHEDULED'
    if re.search(r'investor day|capital markets day|conference|analyst day|shareholder|annual meeting|presentation', name, re.I):
        return 'IR_EVENT'
    return None


def event(source, name, url, day, now, start=None, evidence=None, clock=None, zone=None):
    kind = event_type(name)
    if not kind or not canonical_url(url):
        return None
    try:
        date.fromisoformat(day)
    except (ValueError, TypeError):
        return None
    from .sec_documents import release_period
    fiscal = release_period(name) if kind in ('EARNINGS_CALL', 'EARNINGS_SCHEDULED') else None
    return {'eventId': stable_id(source['companyId'], source['sourceId'], url, kind, clean(name)), 'companyId': source['companyId'],
            **(fiscal or {}), 'periodEvidence': 'EXPLICIT_OFFICIAL_EVENT_TITLE' if fiscal else None,
            'sourceId': source['sourceId'], 'eventType': kind, 'headline': clean(name), 'date': day, 'time': clock, 'timezone': zone,
            'startsAt': start, 'confirmationStatus': 'CONFIRMED', 'confidence': 1.0,
            'sourceUrl': url, 'sourceDocuments': [{'type': 'OFFICIAL_COMPANY_EVENT', 'url': url}],
            'evidence': evidence, 'discoveredAt': now, 'updatedAt': now,
            'webcastUrl': None, 'presentationUrl': None, 'transcriptUrl': None}


def from_announcement(item, source, now):
    if not source.get('verified') or source.get('type') not in ('IR_FEED', 'IR_EVENTS'):
        return []
    structured = source.get('type') == 'IR_EVENTS' and source.get('format') in ('RSS_EVENTS', 'GCS_EVENTS', 'STOCKPR_EVENTS')
    text = clean(item.get('headline', '') + ' ' + item.get('evidenceText', ''), 3000)
    if re.search(r'\bboard\b.{0,80}\b(meet|meeting|consider|review|approve)\b', text, re.I) and not re.search(r'\b(?:will|to)\s+(?:release|report|announce|host)\s+(?:its?\s+)?(?:financial results|earnings|conference call|webcast)', text, re.I):
        return []  # Approval/review dates do not establish publication or call dates.
    if not (EARNINGS.search(text) or event_type(text) == 'IR_EVENT') or (not structured and not ANNOUNCEMENT.search(text)):
        return []
    # Multiple dates require structured evidence: avoid choosing one at random.
    dates = list(DATE.finditer(text))
    parsed = set()
    for match in dates:
        if re.search(r'\b(?:quarter|year|period|months?)\s+ended\s*$', text[max(0, match.start() - 70):match.start()], re.I):
            continue  # A reporting-period end is not the announced event date.
        # Ignore a syndicated press-release dateline; it is publication evidence, not an event date.
        if publication_dateline(text, match):
            continue
        try:
            parsed.add(date(int(match[3]), MONTHS[match[1].lower()], int(match[2])).isoformat())
        except ValueError:
            continue
    if len(parsed) != 1:
        return []
    day = next(iter(parsed))
    published = item.get('publishedAt')
    historical = bool((structured or (published and published[:10] <= day)) and (date.fromisoformat(now[:10]) - date.fromisoformat(day)).days <= 365)
    if (day < now[:10] and not historical) or (date.fromisoformat(day) - date.fromisoformat(now[:10])).days > 365:
        return []
    time_match = TIME.search(text)
    clock, zone, start = None, None, None
    if time_match:
        clock_date = DATE.search(time_match[0])
        if clock_date:
            try:
                clock_day = date(int(clock_date[3]), MONTHS[clock_date[1].lower()], int(clock_date[2])).isoformat()
            except ValueError:
                return []
            if clock_day != day:
                return []
        hour, minute = int(time_match[1]), int(time_match[2] or 0)
        if not 1 <= hour <= 12 or not 0 <= minute < 60:
            return []
        hour = hour % 12 + (12 if time_match[3].lower().startswith('p') else 0)
        clock = f'{hour:02d}:{minute:02d}'
        label = time_match[4].upper()
        zone = 'America/New_York' if label in ('ET', 'EST', 'EDT') or label.startswith('EASTERN') else 'America/Los_Angeles' if label in ('PT', 'PST', 'PDT') or label.startswith('PACIFIC') else 'UTC'
        dt = datetime.fromisoformat(day + 'T' + clock).replace(tzinfo=ZoneInfo(zone))
        if dt.replace(fold=0).utcoffset() != dt.replace(fold=1).utcoffset():
            return []  # Ambiguous/nonexistent wall times need explicit offset evidence.
        # Explicit daylight/standard abbreviations must agree with the date.
        if label in ('EST', 'EDT', 'PST', 'PDT') and dt.tzname() != label:
            return []
        start = dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    name = item['headline']
    composite_release = False
    legacy_call_mismatch = False
    composite_call = r'(?:[,;]\s*related\s+|\band\s+)(?:conference|earnings)\s+call'
    if not structured and re.search(composite_call, name, re.I):
        # Composite headlines can name a call whose date lacks a year. Keep only
        # the release clause supported by the one explicit full date in the body.
        release_clause = re.split(composite_call, name, flags=re.I)[0]
        release_date = any(f'{match[3]}-{MONTHS[match[1].lower()]:02d}-{int(match[2]):02d}' == day and re.search(r'(?:will\s+|plans\s+to\s+)(?:release|report|announce)\s+(?:its?\s+|the\s+company.s\s+)?(?:(?:20\d{2}\s+)?(?:first|second|third|fourth)\s+quarter\s+)?(?:financial\s+(?:and\s+operating\s+)?results|earnings)(?:(?!\b(?:call|webcast)\b).){0,240}$', text[max(0, match.start() - 300):match.start()], re.I) for match in dates)
        if release_date:
            name = release_clause
            composite_release = True
            call_clause = re.split(composite_call, item['headline'], flags=re.I, maxsplit=1)[1]
            short_dates = list(re.finditer(r'\b('+'|'.join(MONTHS)+r')\s+(\d{1,2})(?:st|nd|rd|th)?\b',call_clause,re.I))
            if len(short_dates)==1:
                mention=short_dates[0]
                legacy_call_mismatch=f'{MONTHS[mention[1].lower()]:02d}-{int(mention[2]):02d}' != day[5:]
        elif not any(f'{match[3]}-{MONTHS[match[1].lower()]:02d}-{int(match[2]):02d}' == day and re.search(r'\b(?:conference|earnings)\s+call(?:(?!\b(?:release|report|announce|announced)\b).){0,180}$',text[max(len(clean(item['headline'])) + 1,match.start()-200):match.start()],re.I) for match in dates):
            return []  # A composite title cannot assign an unrelated body date to its call.
    result = event(source, name, item['url'], day, now, start=start,
                   evidence={'method': 'EXPLICIT_OFFICIAL_ANNOUNCEMENT', 'excerpt': text[:300]}, clock=clock, zone=zone)
    if result:
        if composite_release:
            result['evidence'].update(method='EXPLICIT_FIRST_PARTY_RELEASE_CLAUSE_IN_COMPOSITE_HEADLINE',originalHeadline=clean(item['headline']),retireLegacyCallOnReleaseDate=legacy_call_mismatch)
        for material in item.get('materialLinks', []):
            label, url = material['label'], canonical_url(material['url'])
            if not url:
                continue
            pdf = (material.get('mediaType','').split(';',1)[0].strip().lower() == 'application/pdf' or
                   bool(re.search(r'\.pdf(?:$|[?#])', url, re.I)) or
                   bool(re.search(r'\.pdf(?:\b|view\b|download\b)', label, re.I)))
            kind = None
            if re.search(r'transcript', label, re.I) and any(within_domain(url, s) for s in source.get('allowedSites', [])):
                result['transcriptUrl'] = url
                kind = 'COMPANY_TRANSCRIPT'
            elif pdf and re.search(r'presentation|slides', label, re.I):
                result['presentationUrl'] = url
                kind = 'PRESENTATION'
            elif not pdf and re.search(r'webcast|listen', label, re.I):
                result['webcastUrl'] = url
            elif re.search(r'presentation|slides', label, re.I):
                result['presentationUrl'] = url
            if pdf and kind:
                result['sourceDocuments'].append({'type':kind,'url':url,'mimeType':'application/pdf'})
    if result and result['eventType'] == 'EARNINGS_SCHEDULED' and not structured and not TIME.search(name) and re.search(r'conference call|earnings call|webcast', item.get('evidenceText', ''), re.I):
        # A call's body time does not establish the separate release time.
        result.update(startsAt=None, time=None, timezone=None)
    values = [result] if result else []
    # A release headline can omit a call explicitly dated in the feed snippet.
    # Require the call clause itself to contain the same full date; proximity or
    # an undated/different-day mention never creates a second calendar event.
    if result and result['eventType'] == 'EARNINGS_SCHEDULED':
        snippet = clean(item.get('evidenceText', ''), 2000)
        call = re.search(r'\b(?:conference call|earnings call|live call|internet webcast)\b', snippet, re.I)
        if call:
            clause = snippet[call.start():call.start() + 300]
            explicit = DATE.search(clause)
            if explicit and f'{explicit[3]}-{MONTHS[explicit[1].lower()]:02d}-{int(explicit[2]):02d}' == day:
                call_item = {**item, 'headline': clean(TIME.sub('', name)) + ' · Earnings conference call', 'evidenceText': clause}
                calls = from_announcement(call_item, source, now)
                for value in calls:
                    if value['eventType'] == 'EARNINGS_CALL':
                        value['relatedCalendarEventId'] = result['eventId']
                        value['evidence']['method'] = 'EXPLICIT_FIRST_PARTY_CALL_CLAUSE_WITH_SAME_FULL_DATE'
                        values.append(value)
    return values


class JsonLD(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active, self.parts, self.blocks = False, [], []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and (dict(attrs).get('type') or '').lower() == 'application/ld+json':
            self.active, self.parts = True, []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            self.blocks.append(''.join(self.parts))
            self.active = False


def parse_jsonld(body, source, now):
    parser = JsonLD()
    parser.feed(body.decode('utf-8', 'replace'))
    out = []
    def walk(data, depth=0):
        if depth > 20:
            return
        if isinstance(data, list):
            for child in data[:1000]:
                walk(child, depth + 1)
        elif isinstance(data, dict):
            types = data.get('@type', [])
            if isinstance(types, str):
                types = [types]
            if any(t in ('Event', 'BusinessEvent', 'PublicationEvent') for t in types):
                raw = data.get('startDate')
                stamp = timestamp(raw)
                day = raw[:10] if isinstance(raw, str) else None
                url = canonical_url(data.get('url') or source['url'])
                if isinstance(raw, str) and (len(raw) == 10 or stamp):
                    result = event(source, data.get('name', ''), url, day, now, start=stamp,
                                   evidence={'method': 'OFFICIAL_JSON_LD', 'startDate': raw})
                    if result:
                        location = data.get('location')
                        if isinstance(location, dict) and location.get('@type') == 'VirtualLocation':
                            result['webcastUrl'] = canonical_url(location.get('url'))
                        result['eventStatus'] = clean(data.get('eventStatus')) or 'SCHEDULED'
                        if stamp:
                            original = datetime.fromisoformat(raw.replace('Z', '+00:00'))
                            result['time'] = original.strftime('%H:%M')
                            offset = original.strftime('%z')
                            result['timezone'] = 'UTC' if offset == '+0000' else 'UTC' + offset[:3] + ':' + offset[3:]
                        if 'Cancelled' in result['eventStatus']:
                            result['confirmationStatus'] = 'CANCELLED'
                        out.append(result)
            for key in ('@graph', 'event', 'events', 'subEvent', 'mainEntity'):
                if key in data:
                    walk(data[key], depth + 1)
    for block in parser.blocks[:30]:
        try:
            walk(json.loads(block))
        except (ValueError, TypeError):
            continue
    return out


def parse_ics(body, source, now):
    text = re.sub(r'\r?\n[ \t]', '', body.decode('utf-8', 'replace'))
    if not text.startswith('BEGIN:VCALENDAR'):
        raise ValueError('NOT_ICALENDAR')
    out = []
    for block in re.findall(r'BEGIN:VEVENT\r?\n(.*?)END:VEVENT', text, re.S)[:500]:
        fields = {}
        for line in block.splitlines():
            if ':' in line:
                k, v = line.split(':', 1)
                fields[k] = v
        key = next((k for k in fields if k.split(';')[0] == 'DTSTART'), None)
        if not key:
            continue
        raw, zone, stamp, clock = fields[key], None, None, None
        try:
            if len(raw) == 8:
                day = datetime.strptime(raw, '%Y%m%d').date().isoformat()
            else:
                dt = datetime.strptime(raw.rstrip('Z'), '%Y%m%dT%H%M%S')
                zone_match = re.search(r'TZID=([^;]+)', key)
                zone = 'UTC' if raw.endswith('Z') else zone_match[1] if zone_match else None
                if not zone:
                    continue  # Floating times cannot be safely represented as confirmed instants.
                day, clock = dt.date().isoformat(), dt.strftime('%H:%M')
                local = dt.replace(tzinfo=ZoneInfo(zone))
                if local.replace(fold=0).utcoffset() != local.replace(fold=1).utcoffset():
                    continue
                stamp = local.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
            result = event(source, fields.get('SUMMARY', '').replace('\\,', ','), fields.get('URL') or source['url'], day, now,
                           start=stamp, clock=clock, zone=zone, evidence={'method': 'OFFICIAL_ICALENDAR', 'uid': clean(fields.get('UID'))})
            if result:
                if fields.get('UID'):
                    result['eventId'] = stable_id(source['companyId'], source['sourceId'], fields['UID'])
                if fields.get('STATUS') == 'CANCELLED':
                    result['confirmationStatus'] = 'CANCELLED'
                out.append(result)
        except (ValueError, ZoneInfoNotFoundError):
            continue
    return out


def guidance_evidence(item, source):
    """Narrow, unambiguous range extraction, retained as unverified evidence, never a fact."""
    if not source.get('verified'):
        return []
    text = clean(item.get('evidenceText'), 2000)
    pattern = r'(?:expects|guides|guidance for)\s+(?:revenue|sales)\s+(?:of|between|in the range of)\s*\$([\d,.]+)\s*(?:to|and|[-–])\s*\$?([\d,.]+)\s*(million|billion)'
    ranges = []
    for match in re.finditer(pattern, text, re.I):
        low, high = float(match[1].replace(',', '')), float(match[2].replace(',', ''))
        if 0 <= low <= high and high <= max(1, low) * 3:
            ranges.append({'metric': 'revenue', 'low': low, 'high': high, 'scale': match[3].lower(), 'currencySymbol': '$', 'currency': None,
                           'period': None, 'confidence': .8, 'status': 'UNVERIFIED_EVIDENCE', 'evidence': match[0][:250], 'sourceUrl': item['url'],
                           'reason': 'CURRENCY_AND_GUIDANCE_PERIOD_REQUIRE_VERIFICATION'})
    return ranges
