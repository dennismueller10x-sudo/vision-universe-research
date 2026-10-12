"""Read-only profile/source funnel over the authoritative fresh restoration.

Emit categorical decisions, hashes/counts and public provenance for mandatory
cases; never export registry rows, checkpoints, raw filings or private ledgers.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.consumer_usage import first_party, publisher, host, filter_for_preview
from company_intelligence.current_state_acceptance import database_proof
from company_intelligence.profiles import public_profile
from company_intelligence.store import Store, atomic_json, item_time
from company_intelligence.model import normalize
from company_intelligence.top46_content import identities

NON_BUSINESS = re.compile(r'\b(?:makes it a priority|have come a long way|has come a long way|first company to|our mission|was founded|is incorporated|reincorporated|traded on|registered office)\b', re.I)
CONCRETE = re.compile(r'\b(?:bank(?:ing)?|insurance|financial|payments?|lending|loans?|biotech(?:nology)?|biopharmaceutical|pharmaceutical|clinical|therapeutics?|gene editing|genome editing|medical|healthcare|software|cloud|semiconductor|computing|data|telecommunications?|retail|restaurants?|food|beverages?|agriculture|agribusiness|industrial|manufactur\w*|mining|metals?|oil|gas|energy|electric\w*|solar|transport\w*|aerospace|aviation|real estate|properties|REIT|mortgages?|acquisition company|blank check|investment|asset management|chemicals?|construction|engineering|education|entertainment|media|travel|hotels?|hospitality|logistics|shipping|distribution|apparel|clothing|furniture|packaging|paper|water|waste|security|safety|wireless|network\w*|equipment|devices?|vehicles?|machinery)\b', re.I)
ACTIVITY = re.compile(r'\b(?:is (?:a|an|the)|designs?|develops?|manufactures?|markets?|sells?|provides?|operates?|offers?|distributes?|produces?|supplies?|commercializes?|researches?|licenses?|delivers?|builds?|specializes?|engages?|focuses?)\b', re.I)

def source_profile_status(profile, cid, now, mapping_ok=True, web_owned=False, source_conflict=False):
    if not mapping_ok:
        return 'MAPPING_BLOCKED'
    if not profile:
        return 'NO_PROFILE_SOURCE'
    if source_conflict and all(s.get('type') != 'SEC' for s in profile.get('sources', [])):
        return 'SOURCE_CONFLICT'
    value = public_profile(profile, cid, now)
    if not value:
        if profile.get('priorState') == 'AVAILABLE' and public_profile({**profile, 'state': 'AVAILABLE'}, cid, now):
            return 'SOURCE_AVAILABLE_WEAK'
        return 'SOURCE_POLICY_BLOCKED' if profile.get('sources') else 'NO_PROFILE_SOURCE'
    if any(s['type'] == 'FIRST_PARTY_WEB' for s in value['sources']) and not web_owned:
        return 'SOURCE_POLICY_BLOCKED'
    if value.get('stale'):
        return 'SOURCE_AVAILABLE_WEAK'
    if value.get('editorialStatus') == 'WITHHELD_CONSUMER':
        return 'SOURCE_AVAILABLE_WEAK'
    if value.get('language') == 'de':
        return 'PROFILE_APPROVED_DE'
    sentences = profile.get('businessActivities') or [profile.get('description', '')]
    strong = [s for s in sentences if not NON_BUSINESS.search(s) and CONCRETE.search(s) and ACTIVITY.search(s)]
    return 'SOURCE_AVAILABLE_NO_DE_COPY' if strong else 'SOURCE_AVAILABLE_WEAK'

def audit(state, identity_root, eligibility_path, out, now=None):
    state, identity_root, out = Path(state), Path(identity_root), Path(out)
    if not (state / 'state.sqlite').is_file():
        raise ValueError('CURRENT_FULL_RESTORED_STATE_REQUIRED')
    before = database_proof(state / 'state.sqlite')
    stamp = now or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    decisions = json.loads(Path(eligibility_path).read_text())['issuers'] if eligibility_path else None
    catalogue = json.loads((ROOT / 'company-intelligence/config/company-profiles.json').read_text())['profiles']
    configured = json.loads((ROOT / 'company-intelligence/config/sources.json').read_text())
    reviewed = json.loads((ROOT / 'company-intelligence/config/profile-reviewed-de.json').read_text())
    store = Store(state / 'state.sqlite')
    profiles, source_flags, by_issuer, source_ids = Counter(), Counter(), defaultdict(list), set()
    rows, mandatory, matched, available, safe, raw_de = {}, {}, 0, 0, 0, 0
    registry_counts, proven_providers, proven_roles = Counter(), Counter(), Counter()
    try:
        current = identities(ROOT, store)
        companies = {**current, **identities(identity_root, store)}
        if decisions is None:
            # Read-only projection on the actual restored tables. It is a
            # baseline projection, never a claim about currently served scope.
            from company_intelligence.universe_eligibility import generate
            _, projected = generate(store, companies, out.parent / (out.stem + '-projection'), stamp, current)
            decisions = projected['issuers']
        sources = [json.loads(r[0]) for r in store.db.execute('SELECT payload FROM sources')]
        for s in sources:
            source_ids.add(s['sourceId'])
            by_issuer[s.get('companyId')].append(s)
        for cid, row in decisions.items():
            # The full eligibility report is private inside the restored runner;
            # use its explicit payload membership, not Company Master totals.
            if not row.get('hasPrivatePayload'):
                continue
            p = store.state('companyProfile:' + cid)
            issuer_sources = by_issuer[cid]
            owned = {host(u) for s in issuer_sources if first_party(s, cid) for u in [s.get('url'), *s.get('allowedSites', [])]}
            official = store.state('officialSite:' + cid, {})
            if official.get('status') == 'VALIDATED':
                owned.add(host(official.get('url')))
            web_owned = bool(p) and all(s.get('type') == 'SEC' or host(s.get('url')) in owned for s in p.get('sources', []))
            mapping_ok = row['status'] != 'INELIGIBLE_MAPPING'
            conflict = official.get('status') == 'CONFLICTING_OWNER' or 'CONFLICTING' in official.get('reason', '')
            status = source_profile_status(p, cid, stamp, mapping_ok, web_owned, conflict)
            withheld = reviewed.get('withheld', {}).get(cid, {})
            if status == 'SOURCE_AVAILABLE_NO_DE_COPY' and withheld.get('sourceDescriptionHash') == hashlib.sha256(p.get('description','').encode()).hexdigest():
                status = 'SOURCE_AVAILABLE_WEAK'
            if row.get('modules', {}).get('profile') and mapping_ok:
                status = 'PROFILE_APPROVED_DE'
            profiles[status] += 1
            approved = [s for s in issuer_sources if s.get('active') and first_party(s, cid) and not publisher(s.get('url'))]
            owner_withheld = official.get('status') in ('CONFLICTING_OWNER','WRONG_COMPANY','AMBIGUOUS')
            if owner_withheld:
                approved = []
            proven = [s for s in approved if s.get('lastSuccess') and not s.get('unsupported')]
            news = [s for s in proven if s['type'] == 'IR_FEED']
            registry_counts['approvedActiveFirstPartyRowsForPrivateIssuers'] += len(approved)
            registry_counts['provenPollableFirstPartyRowsForPrivateIssuers'] += len(proven)
            registry_counts['provenNewsSourceRowsForPrivateIssuers'] += len(news)
            proven_providers.update(s.get('provider', 'UNKNOWN') for s in proven)
            proven_roles.update(s['type'] for s in proven)
            source_status = 'SOURCE_POLICY_WITHHELD' if owner_withheld and issuer_sources else 'POLLABLE_PROVEN' if proven else 'REGISTERED_NOT_POLLING_PROVEN' if approved else 'NO_APPROVED_REGISTERED_SOURCE'
            source_flags[source_status] += 1
            available += bool(p)
            safe += status in ('PROFILE_APPROVED_DE', 'SOURCE_AVAILABLE_NO_DE_COPY', 'SOURCE_AVAILABLE_WEAK')
            raw_de += bool(p and p.get('language') == 'de')
            c = catalogue.get(cid)
            matches = bool(p and c and p.get('language') == 'en' and p['description'] == c['description'] and sorted(s['contentHash'] for s in p.get('sources', [])) == sorted(s['contentHash'] for s in c.get('sources', [])))
            matched += matches
            rows[cid] = {'profileStatus': status, 'sourceStatus': source_status, 'newsPollingProven': bool(news), 'committedSourceProfileMatches': matches, 'consumerEligible': row['status'].startswith('ELIGIBLE_')}
            if cid in ('iss_cik_0001633917', 'iss_cik_0001652130'):
                raw = store.company_payload(companies[cid], stamp)
                policy_sources = issuer_sources
                if official.get('status') in ('CONFLICTING_OWNER', 'WRONG_COMPANY', 'AMBIGUOUS'):
                    policy_sources = []
                safe_payload, usage = filter_for_preview(raw, policy_sources)
                repair = Counter()
                for item in raw['news']:
                    if not item.get('canonicalUrl','').startswith('http://'):
                        continue
                    target = 'https://' + item['canonicalUrl'][7:]
                    refs = [ref for ref in item.get('provenance',[]) if ref.get('originalUrl') == target]
                    if not refs:repair['NO_EXACT_HTTPS_SIGHTING'] += 1;continue
                    exact = [ref for ref in refs if normalize(ref.get('headline','')) == normalize(item['headline'])]
                    if not exact:repair['HEADLINE_MISMATCH'] += 1;continue
                    dated = [ref for ref in exact if item_time(ref) == item_time(item)]
                    if not dated:repair['PUBLICATION_PRECISION_OR_TIME_MISMATCH'] += 1;continue
                    if not any('VERIFIED_FIRST_PARTY_SOURCE' in ref.get('match',{}).get('evidence',[]) for ref in dated):repair['NO_EXPLICIT_OWNED_SOURCE_MATCH'] += 1
                    else:repair['EXACT_OWNED_HTTPS_NOT_PROMOTED'] += 1
                onboard = store.state('sourceOnboarding:german-profile-source-20261012:'+cid,{})
                mandatory[cid] = {**rows[cid], 'companyName': raw['companyName'], 'tickers': row.get('tickers', []),
                    'sourceProfile': public_profile(p, cid, stamp), 'ledgerNewsCount': len(raw['news']),
                    'ledgerNewsLatestPublishedAt': max((e.get('publishedAt') or e.get('publishedDate') or '' for e in raw['news']), default=None),
                    'ledgerPrimaryUrlSchemes': dict(Counter((e.get('canonicalUrl') or '').split(':', 1)[0] for e in raw['news'])),
                    'httpsRepairClasses':dict(repair), 'currentOnboardingStatus':onboard.get('status'),'currentOnboardingReasonCode':onboard.get('reasonCode'),'currentOnboardingTransportReasonCode':onboard.get('transportReasonCode'),
                    'currentOfficialRootStatus':official.get('status'),
                    'policyAllowedNews': len(safe_payload['news']), 'policyExcludedNews': usage['excluded']['news'],
                    'officialRootPolicyWithheld': not policy_sources and bool(issuer_sources),
                    'approvedRegisteredSources': len(approved), 'provenPollableSources': len(proven),
                    'committedBootstrapSourcesMissingFromLedger': sum(s.get('companyId') == cid and s.get('sourceId') not in source_ids and first_party(s, cid) for s in configured)}
        missing = [s for s in configured if s.get('sourceId') not in source_ids and first_party(s, s.get('companyId')) and not publisher(s.get('url')) and s.get('bootstrapValidatedAt')]
        from company_intelligence.universe_scheduler import source_queue
        blocked={cid for cid in companies if store.state('officialSite:'+cid,{}).get('status') in ('CONFLICTING_OWNER','WRONG_COMPANY','AMBIGUOUS')}
        _, scheduler = source_queue(sources, companies, stamp, blocked_issuers=blocked)
        report = {'schema': 1, 'asOf': stamp, 'privateIssuers': len(rows), 'profileClassifications': dict(profiles),
            'stages': {'storedSourceProfileStatesIncludingWithdrawals': available,
                       'approvedProvenanceIncludingWeakSources': safe, 'rawGermanProfiles': raw_de, 'matchedCommittedEnglishInputs': matched,
                       'approvedGermanConsumerProfiles': sum(r.get('modules', {}).get('profile', False) for r in decisions.values())},
            'sourceRegistryCounts': {'allRegistryRows': len(sources), **dict(registry_counts)},
            'provenSourceProviderCounts': dict(proven_providers), 'provenSourceRoleCounts': dict(proven_roles),
            'sourceClassifications': dict(source_flags), 'publicIssuersWithoutProvenPollableSource': sum(r['consumerEligible'] and r['sourceStatus'] != 'POLLABLE_PROVEN' for r in rows.values()),
            'scheduler': scheduler,
            'approvedNewsCoverage': {key: sum(decisions[cid].get('news', {}).get(key, 0)>0 for cid in rows) for key in ('days30','days90','retained180','currentIntelligence90')},
            'eligibleModuleCoverage': {key: sum(row.get('modules', {}).get(key, False) for cid, row in decisions.items() if cid in rows and row['status'].startswith('ELIGIBLE_')) for key in ('profile','aktuelles','financials','whatChanged','nextEvent','calls','documents')},
            'missingApprovedBootstrapSources': len(missing), 'missingApprovedBootstrapIssuers': len({s['companyId'] for s in missing}),
            'missingApprovedBootstrapByProvider': dict(Counter(s.get('provider') for s in missing)), 'mandatoryCases': mandatory, 'issuers': rows,
            'privateOperationalRowsIncluded': False, 'sourceRequests': 0, 'remoteWrites': 0}
    finally:
        store.close()
    if before != database_proof(state / 'state.sqlite'):
        raise ValueError('PROFILE_AUDIT_CHANGED_PRIVATE_TABLES')
    atomic_json(out, report)
    return report

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state', required=True); p.add_argument('--identity-root', required=True)
    p.add_argument('--eligibility'); p.add_argument('--out', required=True)
    a = p.parse_args(); r = audit(a.state, a.identity_root, a.eligibility, a.out)
    print(json.dumps({k: r[k] for k in ('privateIssuers', 'profileClassifications', 'stages', 'sourceClassifications', 'missingApprovedBootstrapSources')}))
