"""Prepared German facts pinned to reviewed evidence; never a page-time service."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def catalogue():
    path = Path(__file__).resolve().parents[2] / 'company-intelligence/config/profile-editorial-de.json'
    return json.loads(path.read_text())


def german_profile(profile, reviewed=None):
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
    if not entry or entry.get('sourceDescriptionHash') != hashlib.sha256(profile['description'].encode()).hexdigest():
        return profile
    if entry.get('sourceHashes') != sorted(s['contentHash'] for s in profile['sources']):
        return profile
    return {**profile, 'description': entry['description'], 'language': 'de',
            'editorialStatus': entry['usageStatus'],
            'primaryBusinessActivity': entry['description'], 'businessActivities': [],
            'productsServices': [], 'customerMarkets': [], 'majorSegments': []}
