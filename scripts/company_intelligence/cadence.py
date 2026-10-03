"""Source-level scheduling. Calendar priority never overrides source failure backoff."""
from datetime import datetime, timedelta


def interval_hours(source, upcoming=False):
    if source.get('provider') == 'GLOBENEWSWIRE_RSS':
        return 4
    default = 12 if source.get('type') in ('IR_EVENTS', 'IR_MATERIALS') else 4
    base = max(4, source.get('intervalHours', default))
    if upcoming and source.get('verified') and source.get('type') in ('IR_EVENTS', 'IR_FEED'):
        return min(base, 2)
    return base


def due(source, now, upcoming=False):
    if not source.get('active', True):
        return False
    if source.get('failureCount', 0):
        return (source.get('nextCheck') or '') <= now
    if not source.get('lastSuccess'):
        return True
    last = datetime.fromisoformat(source['lastSuccess'].replace('Z', '+00:00'))
    return last + timedelta(hours=interval_hours(source, upcoming)) <= datetime.fromisoformat(now.replace('Z', '+00:00'))
