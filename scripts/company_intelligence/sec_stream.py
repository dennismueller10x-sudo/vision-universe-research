"""Incremental material filing discovery using the existing EDGAR index parser.

The fundamentals producer watches periodic forms. This additive reader includes
8-K/6-K, joins exact master CIKs, and queues changed issuers; never polls 6,000
submissions. Completed indexes are cached by the existing SEC client.
"""
from datetime import date, timedelta
from pathlib import PurePosixPath
import json
import re
from .model import ACCESSION
from .earnings import FORMS, valid_date


def scan(store, companies, client, now, max_days=3):
    from quant.sec.daily import index_url, parse_master_index
    today = date.fromisoformat(now[:10])
    until = today - timedelta(days=1)  # Current-day index is incomplete.
    cursor = date.fromisoformat(store.state('secStreamNextDay', (today - timedelta(days=7)).isoformat()))
    if cursor < today - timedelta(days=45):
        # Never silently skip an outage gap. Bounded runs can catch up repeatedly.
        store.audit(now, 'sec-stream', 'SEC_STREAM_LONG_OUTAGE', oldestUnprocessedDay=cursor.isoformat())
    by_cik = {c['cik']: cid for cid, c in companies.items() if c.get('cik')}
    pending = store.state('secStreamPending', {})
    checked, matched = [], 0
    gaps = store.state('secStreamIndexGaps', {})
    retry_days = [date.fromisoformat(day) for day, gap in sorted(gaps.items()) if gap.get('retryAfter', '') <= now and day <= until.isoformat()][:max_days]
    attempted = 0
    while (retry_days or cursor <= until) and attempted < max_days:
        retry = bool(retry_days)
        day = retry_days.pop(0) if retry else cursor
        if not retry and cursor.weekday() >= 5:
            cursor += timedelta(days=1)
            store.set_state('secStreamNextDay', cursor.isoformat())
            continue
        attempted += 1
        try:
            payload = client.get_bytes(index_url(day), use_cache=True)
        except Exception as exc:
            if getattr(exc, 'status', None) not in (403, 404):
                raise
            # Holidays often return 403. Never call this successful/empty:
            # preserve the gap for slow retries while later days can continue.
            from .pipeline import advance
            prior_gap = gaps.get(day.isoformat(), {})
            attempts = prior_gap.get('attempts', 0) + 1
            gaps[day.isoformat()] = {'httpStatus': exc.status, 'attempts': attempts, 'lastFailure': now,
                                     'retryAfter': advance(now, min(7 * 24, 24 * 2 ** min(attempts - 1, 3)))}
            store.set_state('secStreamIndexGaps', gaps)
            store.audit(now, 'sec-stream', 'SEC_INDEX_UNAVAILABLE_RETRY_QUEUED', day=day.isoformat(), httpStatus=exc.status)
            if not retry:
                cursor += timedelta(days=1)
                store.set_state('secStreamNextDay', cursor.isoformat())
            continue
        if len(payload) > 2 * 1024 * 1024:
            raise ValueError('SEC_INDEX_OVERSIZED')
        text = payload.decode('latin-1')
        if not re.search(r'^CIK\|Company Name\|Form Type\|Date Filed\|File ?[Nn]ame\s*$', text, re.M) or '-----' not in text:
            raise ValueError('SEC_INDEX_INVALID_HEADER')
        for row in parse_master_index(text):
            if re.fullmatch(r'\d{8}', row['filed']):
                row['filed'] = row['filed'][:4] + '-' + row['filed'][4:6] + '-' + row['filed'][6:]
            cid = by_cik.get(row['cik'])
            acc = row['accession']
            filename = PurePosixPath(row['filename'])
            if not cid or row['form'] not in FORMS:
                continue
            if not ACCESSION.fullmatch(acc) or not valid_date(row['filed']) or row['filed'] != day.isoformat() or filename.parts != ('edgar', 'data', str(int(row['cik'])), acc + '.txt'):
                store.audit(now, cid, 'SEC_INDEX_ROW_REJECTED', filingId=acc)
                continue
            prior = pending.get(cid, {})
            if (row['filed'], acc) >= (prior.get('filedAt', ''), prior.get('latestAccession', '')):
                pending[cid] = {'latestAccession': acc, 'filedAt': row['filed'], 'form': row['form'], 'sourceUrl': index_url(day)}
            matched += 1
        gaps.pop(day.isoformat(), None)
        next_cursor = cursor if retry else cursor + timedelta(days=1)
        # Commit queue before advancing the cursor, in one SQLite transaction.
        with store.db:
            store.db.execute('INSERT OR REPLACE INTO state VALUES (?,?)', ('secStreamPending', json.dumps(pending)))
            store.db.execute('INSERT OR REPLACE INTO state VALUES (?,?)', ('secStreamNextDay', json.dumps(next_cursor.isoformat())))
            store.db.execute('INSERT OR REPLACE INTO state VALUES (?,?)', ('secStreamIndexGaps', json.dumps(gaps)))
        checked.append(day.isoformat())
        cursor = next_cursor
    return {'checkedDays': checked, 'matchedFilings': matched, 'pendingIssuers': len(pending), 'nextDay': cursor.isoformat(), 'unresolvedIndexDays': sorted(gaps), 'attemptedDays': attempted}
