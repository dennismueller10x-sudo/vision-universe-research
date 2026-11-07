"""Prepared German facts pinned to reviewed evidence; never a page-time service."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def catalogue():
    path = Path(__file__).resolve().parents[2] / 'company-intelligence/config/profile-editorial-de.json'
    return json.loads(path.read_text())


# Entscheidung Steuerung 07.11.2026 (Weg B2): Aendert sich die Quelle (z. B. neuer 10-K), bleibt
# der zuletzt geprueften deutschen Fassung hoechstens SOURCE_CHANGE_GRACE_DAYS nach reviewedAt
# stehen, markiert mit reviewStatus SOURCE_CHANGED_REVIEW_REQUIRED; danach gilt die englische
# Quelle. Gleicher Grundsatz wie reviewed_profiles.py: neue Quellformulierung ueberschreibt eine
# gepruefte Beschreibung nie still. Stichtag ist der Stand des Exports (as_of), nie die Uhr.
SOURCE_CHANGE_GRACE_DAYS = 120


def _within_grace(reviewed_at, as_of, days=SOURCE_CHANGE_GRACE_DAYS):
    from datetime import datetime, timedelta
    try:
        reviewed = datetime.fromisoformat(str(reviewed_at).replace('Z', '+00:00'))
        stand = datetime.fromisoformat(str(as_of).replace('Z', '+00:00'))
    except ValueError:
        return False
    return reviewed <= stand <= reviewed + timedelta(days=days)


def german_profile(profile, reviewed=None, as_of=None):
    if not profile:
        return None
    # A second consumer projection preserves already prepared German content.
    if profile.get('language') == 'de':
        return profile
    reviewed = catalogue() if reviewed is None else reviewed
    withdrawal = reviewed.get('withheld', {}).get(profile['companyId'])
    # A corrected future source is reviewed afresh; never permanently suppress
    # an issuer merely because its preceding fragment was inadequate.
    if isinstance(withdrawal, str) or (isinstance(withdrawal, dict) and
        withdrawal.get('sourceDescriptionHash') == hashlib.sha256(profile['description'].encode()).hexdigest() and
        withdrawal.get('sourceHashes') == sorted(s['contentHash'] for s in profile['sources'])):
        return None
    entry = reviewed.get('profiles', {}).get(profile['companyId'])
    if not entry:
        return profile
    matches = (entry.get('sourceDescriptionHash') == hashlib.sha256(profile['description'].encode()).hexdigest()
               and entry.get('sourceHashes') == sorted(s['contentHash'] for s in profile['sources']))
    if not matches and not (as_of and _within_grace(entry.get('reviewedAt'), as_of)):
        return profile
    value = {**profile, 'description': entry['description'], 'language': 'de',
             'editorialStatus': entry['usageStatus'],
             'primaryBusinessActivity': entry['description'], 'businessActivities': [],
             'productsServices': [], 'customerMarkets': [], 'majorSegments': []}
    if not matches:
        value['reviewStatus'] = 'SOURCE_CHANGED_REVIEW_REQUIRED'
    return value
