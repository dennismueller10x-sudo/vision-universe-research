"""Two bounded official-source QA corrections, only in REVIEW_ONLY preparation.

The accepted operational ledger and its coverage are never changed. A retained,
source-authorized, confirmed release at the exact URL/date is required. No crawl,
body republication, page-time generation, or imputed release clock occurs.
"""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import json
from .model import stable_id


def apply_review(payload, reviewed=None, source_generation=None):
    if payload.get('sourceUsagePolicy') != 'OWNED_IR_SEC_METADATA_PREVIEW_V1':
        raise ValueError('EVENT_REVIEW_REQUIRES_FILTERED_PREVIEW')
    reviewed = json.loads((Path(__file__).resolve().parents[2] / 'company-intelligence/config/consumer-event-review.json').read_text()) if reviewed is None else reviewed
    if reviewed.get('schema') != 1 or reviewed.get('releaseState') != 'REVIEW_ONLY' or len(reviewed.get('rows', [])) > 10:
        raise ValueError('INVALID_BOUNDED_EVENT_REVIEW')
    value = deepcopy(payload)
    if reviewed.get('sourceGeneration') and source_generation != reviewed['sourceGeneration']:
        return value  # Frozen review cannot silently carry into a newer dataset.
    for row in reviewed['rows']:
        if row['companyId'] != payload['companyId']:
            continue
        parent = next((e for e in payload.get('events', []) if e.get('companyId') == row['companyId'] and
                       e.get('eventType') == 'EARNINGS_SCHEDULED' and e.get('confirmationStatus') == 'CONFIRMED' and
                       e.get('sourceUrl') == row['parentSourceUrl'] and e.get('date') == row['parentReleaseDate']), None)
        if not parent:
            continue
        dt = datetime.fromisoformat(row['callDate'] + 'T' + row['localCallTime']).replace(tzinfo=ZoneInfo(row['timeZone']))
        start = dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
        if start <= payload['generatedAt'] or any(e.get('eventType') == 'EARNINGS_CALL' and (e.get('startsAt') == start or e.get('sourceUrl') == row['parentSourceUrl'] or e.get('date') == row['callDate']) for e in value.get('events', [])):
            continue
        event = {'companyId': row['companyId'], 'eventId': stable_id(row['companyId'], 'reviewed-official-call', start),
                 'eventType': 'EARNINGS_CALL', 'confirmationStatus': 'CONFIRMED', 'date': row['callDate'], 'startsAt': start,
                 'sourceTimeZone': row['timeZone'], 'sourceUrl': row['parentSourceUrl'], 'sourceId': parent.get('sourceId'),
                 'headline': 'Ergebnisgespräch', 'fiscalYear': row['fiscalYear'], 'fiscalQuarter': row['fiscalQuarter'],
                 'reviewEvidence': {'method': row['method'], 'sourceContentHash': row['sourceContentHash'],
                                    'sourceCapturedAt': row['sourceCapturedAt'], 'releaseState': 'REVIEW_ONLY'}}
        if row.get('webcastUrl'):
            event['webcastUrl'] = row['webcastUrl']
        value.setdefault('events', []).append(event)
    return value
