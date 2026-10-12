"""Import reviewed static German copy. No inference, translation or HTTP.

The English factual source and exact provenance are pinned independently from
the reviewed copy. Annual-source changes are queued for review; refreshed source
wording never silently overwrites a reviewed description.
"""
from copy import deepcopy
from collections import Counter, defaultdict
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
from .model import timestamp, SUFFIX
from .profiles import public_profile, later, display_name
from .consumer_usage import first_party, host, publisher

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = 'reviewed-static-german-profiles-1'
METHODS = {'MODEL_ASSISTED_STATIC_PARAPHRASE', 'SOURCE_REVIEWED_STATIC_PARAPHRASE'}
PROMOTION = re.compile(r'\b(?:führend(?:e[rsnm]?)?|Weltmarktführer|revolutionär\w*|innovativ\w*|einzigartig\w*|erstklassig\w*|unterbewertet|Kaufempfehlung|Kursziel|Aktienkurs|renditestark)\b', re.I)
STAFF_COUNT = re.compile(r'\b(?:\d[\d., ]*|tausend\w*|million\w*)\s+(?:Mitarbeiter\w*|Beschäftigte\w*|Angestellte\w*)\b|Mitarbeiterzahl', re.I)
GERMAN_ACTIVITY = re.compile(r'\b(?:ist|sind|entwickelt|betreibt|bietet|liefert|produziert|fertigt|stellt|vertreibt|verkauft|bündelt|vermietet|vermittelt|verwaltet|erbringt|forscht|konzentriert|gehört|umfasst|befinden|verarbeitet|fördert|finanziert|versichert|handelt|beschafft|transportiert|verbindet|unterstützt|gestaltet|vermarktet|führt|investiert|baut)\b', re.I)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def copy_version(entry):
    pins = {'text': entry.get('profileTextHash'), 'sourceDescription': entry.get('sourceDescriptionHash'),
            'sourceHashes': entry.get('sourceHashes'), 'additionalSources': entry.get('additionalSources', [])}
    return 'reviewed-de-' + digest(json.dumps(pins, sort_keys=True, ensure_ascii=False))[:24]

@lru_cache(maxsize=1)
def catalogue():
    value = json.loads((ROOT / 'company-intelligence/config/profile-reviewed-de.json').read_text())
    if value.get('schema') != SCHEMA or not isinstance(value.get('profiles'), dict):
        raise ValueError('INVALID_STATIC_PROFILE_CATALOGUE')
    return value

def approved_copy(source, entry, cid, now):
    if not entry or entry.get('status') != 'APPROVED' or entry.get('method') not in METHODS:
        raise ValueError('PROFILE_COPY_NOT_APPROVED')
    source = public_profile(source, cid, now)
    if not source or source.get('stale'):
        raise ValueError('PROFILE_SOURCE_INVALID_OR_STALE')
    if entry.get('companyId') != cid or entry.get('companyName') != source['companyName']:
        raise ValueError('PROFILE_COPY_ISSUER_MISMATCH')
    if entry.get('sourceDescriptionHash') != digest(source['description']) or entry.get('sourceHashes') != sorted(s['contentHash'] for s in source['sources']):
        raise ValueError('PROFILE_COPY_SOURCE_CHANGED')
    reviewed = timestamp(entry.get('reviewedAt'))
    if not reviewed or reviewed > now or entry.get('profileVersion') != copy_version(entry):
        raise ValueError('INVALID_PROFILE_REVIEW_VERSION')
    text = entry.get('description')
    if not isinstance(text, str) or not 40 <= len(text) <= 900 or not 15 <= len(text.split()) <= 95 or not GERMAN_ACTIVITY.search(text):
        raise ValueError('INVALID_GERMAN_CONSUMER_COPY')
    style_text = text.replace(source['companyName'], '')
    if entry.get('profileTextHash') != digest(text) or PROMOTION.search(style_text) or STAFF_COUNT.search(text) or re.search(r'<[^>]+>|https?://', text):
        raise ValueError('INVALID_PROFILE_STYLE_OR_HASH')
    if re.search(r'clinical[ -]stage|preclinical[ -]stage', source['description'], re.I) and (not re.search(r'klinisch|präklinisch|Wirkstoffkandidat|Therapiekandidat', text, re.I) or re.search(r'verkauft|zugelassen\w*|vermarktet Medikamente', text, re.I)):
        raise ValueError('CLINICAL_CANDIDATE_MISREPRESENTED')
    result = deepcopy(source)
    for extra in entry.get('additionalSources', []):
        result['sources'] = [s for s in result['sources'] if s.get('url') != extra.get('url')]
        if extra not in result['sources']:
            result['sources'].append(deepcopy(extra))
        if timestamp(extra.get('verifiedAt')):
            result['lastVerifiedAt'] = max(result['lastVerifiedAt'], timestamp(extra['verifiedAt']))
    result.update(description=text, language='de', editorialStatus='APPROVED_CONSUMER',
                  primaryBusinessActivity=text, businessActivities=[], productsServices=[], customerMarkets=[], majorSegments=[],
                  reviewedAt=reviewed, profileVersion=entry['profileVersion'], profileTextHash=entry['profileTextHash'],
                  sourceDescriptionHash=entry['sourceDescriptionHash'], generationMethod=entry['method'],
                  nextReviewAt=later(reviewed, 90), refreshPolicy='STATIC_REVIEWED_COPY_SOURCE_CHANGE_REVIEW')
    if not public_profile(result, cid, now):
        raise ValueError('INVALID_SUPPLEMENTARY_PROFILE_SOURCE')
    return result

def apply(store, companies, now, reviewed=None):
    reviewed = catalogue() if reviewed is None else reviewed
    updated, skipped, rejected, pending = [], 0, {}, 0
    owned = defaultdict(set)
    for s in store.sources():
        if first_party(s, s.get('companyId')):
            owned[s['companyId']].update(host(u) for u in [s.get('url'), *s.get('allowedSites', [])] if host(u) and not publisher(u))
    def withhold(cid, profile, reason):
        if profile.get('editorialStatus') == 'WITHHELD_CONSUMER':
            return
        store.set_state('profileReviewHistory:' + cid + ':' + digest(json.dumps(profile, sort_keys=True)), profile)
        store.set_state('companyProfile:' + cid, {**profile, 'editorialStatus': 'WITHHELD_CONSUMER'})
        store.set_state('profileReviewPending:' + cid, {'status': 'REVIEW_REQUIRED', 'reasons': [reason], 'detectedAt': now})
        store.audit(now, cid, 'REVIEWED_PROFILE_CONSUMER_WITHHELD', reason=reason)
    signature = lambda name: re.sub(r'[^a-z0-9]', '', SUFFIX.sub('', display_name(name)).casefold())
    def current_identity(cid, value):
        names = companies[cid].get('names', [])
        if names and signature(value['companyName']) not in {signature(name) for name in names}:
            raise ValueError('PROFILE_CURRENT_MASTER_NAME_REVIEW_REQUIRED')
        official = store.state('officialSite:' + cid, {})
        allowed = set(owned[cid])
        if official.get('status') == 'VALIDATED':
            allowed.add(host(official.get('url')))
        if any(s.get('type') == 'FIRST_PARTY_WEB' and (publisher(s.get('url')) or host(s.get('url')) not in allowed or official.get('status') in ('CONFLICTING_OWNER','WRONG_COMPANY','AMBIGUOUS')) for s in value['sources']):
            raise ValueError('PROFILE_WEB_OWNERSHIP_NOT_VERIFIED')
    # Explicit removal/revocation withdraws only this consumer module. Full
    # descriptions, source records and correction history stay in the ledger.
    if hasattr(store, 'db'):
        for row in store.db.execute("SELECT key,payload FROM state WHERE key LIKE 'companyProfile:%'").fetchall():
            cid=row[0].split(':',1)[1];profile=json.loads(row[1]);entry=reviewed['profiles'].get(cid)
            if cid in companies and profile.get('generationMethod') in METHODS and (entry is None or entry.get('status') in ('WITHHELD','REVOKED')):
                withhold(cid, profile, 'PROFILE_REVIEW_REVOKED')
    for cid, entry in sorted(reviewed['profiles'].items()):
        if cid not in companies:
            skipped += 1
            continue
        prior = store.state('companyProfile:' + cid)
        if prior and prior.get('language') == 'de':
            try: current_identity(cid, prior)
            except ValueError as error:
                withhold(cid, prior, str(error));prior=store.state('companyProfile:' + cid)
        if prior and entry.get('status') in ('WITHHELD','REVOKED'):
            withhold(cid, prior, 'PROFILE_REVIEW_REVOKED')
            rejected[cid]='PROFILE_COPY_NOT_APPROVED'
            continue
        unchanged = prior and prior.get('editorialStatus') != 'WITHHELD_CONSUMER' and prior.get('language') == 'de' and prior.get('profileVersion') == entry.get('profileVersion')
        if unchanged:
            changed = store.state('profileRefreshPending:' + cid)
            original = store.state('profileReviewSource:' + cid)
            if changed and original and changed.get('description') != original.get('description'):
                value = {'status': 'SOURCE_CHANGED_REVIEW_REQUIRED', 'profileVersion': prior['profileVersion'],
                         'sourceDescriptionHash': digest(changed.get('description', '')), 'detectedAt': now}
                old = store.state('profileReviewPending:' + cid)
                if not old or old.get('sourceDescriptionHash') != value['sourceDescriptionHash']:
                    store.set_state('profileReviewPending:' + cid, value)
                pending += 1
        # Existing independently reviewed German copy is never replaced by an
        # English-catalogue overlay. New entries require their actual source.
        source = store.state('profileReviewSource:' + cid) if prior and prior.get('language') == 'de' else prior
        candidate = store.state('profileRefreshPending:' + cid)
        if candidate and digest(candidate.get('description', '')) == entry.get('sourceDescriptionHash'):
            source = candidate
        snapshot = entry.get('reviewedSourceSnapshot')
        # A separately reviewed annual/About source can fill an extractor gap.
        # It goes through the same issuer, policy, age, hash and ownership gates.
        if snapshot and snapshot.get('language') == 'en' and digest(snapshot.get('description', '')) == entry.get('sourceDescriptionHash'):
            source = snapshot
        try:
            value = approved_copy(source, entry, cid, now)
            current_identity(cid, value)
        except ValueError as error:
            rejected[cid] = str(error)
            continue
        if unchanged:
            skipped += 1
            continue
        if prior and prior.get('language') == 'de' and not source:
            skipped += 1
            continue
        if prior and prior != source:
            prior_hash = digest(json.dumps(prior, sort_keys=True))
            history_key = 'profileReviewHistory:' + cid + ':' + prior_hash
            if store.state(history_key) is None:
                store.set_state(history_key, prior)
        store.set_state('profileReviewSource:' + cid, public_profile(source, cid, now))
        store.set_state('companyProfile:' + cid, value)
        store.set_state('profileReviewPending:' + cid, {'status': 'REVIEWED', 'profileVersion': value['profileVersion'], 'reviewedAt': value['reviewedAt']})
        store.audit(now, cid, 'REVIEWED_STATIC_GERMAN_PROFILE_IMPORTED', profileVersion=entry['profileVersion'], profileTextHash=entry['profileTextHash'])
        updated.append(cid)
    return {'updatedProfiles': len(updated), 'updatedIssuerIds': updated, 'unchangedProfiles': skipped,
            'rejectedProfiles': len(rejected), 'rejectionReasons': dict(Counter(rejected.values())), 'sourceChangesAwaitingReview': pending}

def flag_reviews(store, companies, now):
    """Queue dated checks and existing policy-safe material signals; no rewriting.

    A filing category or news classification is a reason to inspect the source,
    not proof that a transaction completed or a medicine was approved.
    """
    from .consumer_usage import filter_for_preview
    sources = store.sources()
    total = Counter()
    for cid in companies:
        profile = store.state('companyProfile:' + cid)
        if not profile or not profile.get('profileVersion') or not timestamp(profile.get('reviewedAt')):
            continue
        since = profile['reviewedAt']; reasons = []
        if profile.get('nextReviewAt', now) < now:
            reasons.append('PERIODIC_SOURCE_REVIEW_DUE')
        news = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM items WHERE company=? AND published>=?', (cid, since))]
        events = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM events WHERE company=? AND date>=?', (cid, since[:10]))]
        safe, _ = filter_for_preview({'companyId': cid, 'news': news, 'events': events}, sources)
        signals = sorted({r.get('newsId') or r.get('eventId') for r in safe['news'] + safe['events']
            if (set(r.get('categories', [])) & {'M&A', 'Product', 'Regulation', 'Restructuring', 'Bankruptcy'}
                or set(r.get('secItems', [])) & {'1.03', '2.01', '2.05'}) and (r.get('newsId') or r.get('eventId'))})
        if signals:
            reasons.append('MATERIAL_SIGNAL_SOURCE_REVIEW_REQUIRED')
        old = store.state('profileReviewPending:' + cid, {})
        if reasons:
            value = {**old, 'status': 'REVIEW_REQUIRED', 'profileVersion': profile['profileVersion'],
                     'reasons': sorted(set(old.get('reasons', []) + reasons)), 'signalIdentityHash': digest(json.dumps(signals)),
                     'signalCount': len(signals), 'firstDetectedAt': old.get('firstDetectedAt', now)}
            if value != old:
                store.set_state('profileReviewPending:' + cid, value)
            total.update(reasons)
    return dict(total)
