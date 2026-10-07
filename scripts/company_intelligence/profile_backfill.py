"""Bounded profile conversion over an existing ledger; discovery queues are untouched."""
import hashlib
import re
import time
from collections import Counter
from pathlib import Path
from .profiles import VERSION, PARSER_VERSION, annual_filing, extract, later
from .transport import BudgetExhausted, SourceError
from .discovery import same_web_host, _validate_response
from .discovery_circuit import DiscoveryCircuit, guarded_poll
from .feeds import parse_links
from .model import canonical_url


def submissions_for(root, store, company):
    from quant.sec.store import JsonRawStore
    return JsonRawStore(Path(root) / 'quant/data/sec/raw').get_latest(company.get('cik'), 'submissions') or store.state('sec-submissions:' + company['companyId'])


def cached_sec(root, url):
    # Annual primary documents are immutable by accession. Reuse existing SEC
    # cache without its normal polling TTL; never download a filing again just
    # to reinterpret it. The protected SEC cache is read, not copied to exports.
    from quant.sec.http_client import DiskCache
    if not (Path(root) / '.sec-cache').is_dir():
        return None
    return DiskCache(Path(root) / '.sec-cache', ttl_seconds=None).get(url)


def roots_for(company, store, sites):
    cid = company['companyId']
    proof = store.state('officialSite:' + cid, {})
    seeded = sites.get(company.get('cik'), {})
    roots = []
    if proof.get('status') == 'VALIDATED':
        roots.append(proof['url'])
    elif seeded.get('url'):
        roots.append(seeded['url'])
    # Delegated IR hosts must already have issuer-owned discovery proof. A
    # candidate or an arbitrary subdomain is not a first-party profile source.
    ir = store.state('ir:' + cid, {})
    for cfg in ir.get('configurations', []):
        if (ir.get('lastSuccess') and cfg.get('companyId') == cid and cfg.get('lastVerified')
                and cfg.get('evidence') == 'LINK_FROM_VERIFIED_OFFICIAL_SITE' and cfg.get('irHomepage')):
            roots.append(cfg['irHomepage'])
    if seeded.get('irHomepage'):
        roots.append(seeded['irHomepage'])
    return list(dict.fromkeys(canonical_url(u) for u in roots if canonical_url(u)))[:2]


def web_profile(company, store, http, sites, now, allow_network):
    roots = roots_for(company, store, sites)
    if not roots:
        return None
    website = roots[0]
    for root in roots:
        if allow_network:
            response = http.get(root, ttl=90 * 86400)
        else:
            meta, body = http._cached(root)
            if body is None or not 0 <= http.clock() - meta.get('checked', 0) <= 180 * 86400:
                continue
            response = {**meta, 'body': body}
        final = response.get('finalUrl', root)
        if not same_web_host(final, root):
            # Independent legal proof on a changed destination; no candidate
            # shortcut, no access exception and no domain-state mutation.
            _validate_response(company, {'url': final}, response, now)
        candidates = [(response, final)]
        about = next((l['url'] for l in parse_links(response['body'], final)
                      if same_web_host(l['url'], final) and l['url'] != canonical_url(final)
                      and re.fullmatch(r'about(?: us| the company)?|company overview|corporate profile|who we are|our company', l['text'].strip(), re.I)), None)
        if about:
            if allow_network:
                extra = http.get(about, ttl=90 * 86400)
            else:
                meta, body = http._cached(about)
                extra = {**meta, 'body': body} if body is not None and 0 <= http.clock() - meta.get('checked', 0) <= 180 * 86400 else None
            if extra:
                destination = extra.get('finalUrl', about)
                if not same_web_host(destination, final):
                    _validate_response(company, {'url': destination}, extra, now)
                candidates.insert(0, (extra, destination))
        for page, url in candidates:
            observed = datetime_utc(page.get('checked')) or now
            result = extract(company, page['body'], {'companyId': company['companyId'], 'type': 'FIRST_PARTY_WEB', 'ownershipVerified': True, 'url': url}, observed, website)
            if result['state'] == 'AVAILABLE':
                return result
    return None


def datetime_utc(value):
    from datetime import datetime, timezone
    if type(value) not in (int, float):
        return None
    try:
        return datetime.fromtimestamp(value, timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    except (ValueError, OverflowError, OSError):
        return None


def refresh_cached_sec(root, store, company, submissions, now):
    """Filing-driven hook; zero HTTP, unchanged filings skip parsing entirely."""
    filing = annual_filing(company, submissions, now)
    if not filing:
        return None
    cid = company['companyId']
    prior = store.state('companyProfile:' + cid, {})
    attempt = store.state('profileAttempt:' + cid, {})
    if any(s.get('filingId') == filing['filingId'] for s in prior.get('sources', [])) and prior.get('parserVersion') == PARSER_VERSION:
        return prior
    superseded = (prior.get('state') == 'AVAILABLE' and any(s.get('type') == 'SEC' for s in prior.get('sources', []))
                  and not any(s.get('filingId') == filing['filingId'] for s in prior.get('sources', [])))
    if superseded:
        store.set_state('companyProfile:' + cid, {**prior, 'supersededAnnualFiling': filing['filingId']})
    body = cached_sec(root, filing['url'])
    if body is None:
        return None
    digest = hashlib.sha256(body).hexdigest()
    if attempt.get('secContentHash') == digest and attempt.get('parserVersion') == PARSER_VERSION:
        return None
    result = extract(company, body, filing, now, prior.get('officialWebsite'))
    store.set_state('profileAttempt:' + cid, {**attempt, 'checkedAt': now, 'parserVersion': PARSER_VERSION,
                                            'annualFilingId': filing['filingId'], 'secContentHash': digest,
                                            'state': result['state'], 'reason': result.get('reason')})
    if result['state'] == 'AVAILABLE':
        store.set_state('companyProfile:' + cid, result)
        return result
    return None


def refresh_changed_sec(root, store, company, submissions, now, client=None):
    """One new annual document on an already authorized SEC change refresh.

    Offline projections and first-time discovery stay cache-only. Restored
    prepared profiles skip unchanged accessions even when document cache is
    absent, so a new runner does not redownload its entire profile catalogue.
    """
    result = refresh_cached_sec(root, store, company, submissions, now)
    if result or client is None:
        return result
    cid = company['companyId']
    prior = store.state('companyProfile:' + cid, {})
    filing = annual_filing(company, submissions, now)
    attempt = store.state('profileAttempt:' + cid, {})
    if (not filing or prior.get('state') != 'AVAILABLE'
            or not any(s.get('type') == 'SEC' for s in prior.get('sources', []))
            or any(s.get('filingId') == filing['filingId'] for s in prior.get('sources', []))
            or (attempt.get('annualFilingId') == filing['filingId'] and attempt.get('parserVersion') == PARSER_VERSION
                and attempt.get('state') == 'UNAVAILABLE')
            or attempt.get('retryAfter', '') > now):
        return None
    try:
        client.get_bytes(filing['url'])  # Existing SEC client/cache and budget.
        return refresh_cached_sec(root, store, company, submissions, now)
    except BudgetExhausted:
        store.set_state('profileAttempt:' + cid, {**attempt, 'state': 'DEFERRED', 'checkedAt': now,
                                                  'annualFilingId': filing['filingId']})
        raise
    except Exception as exc:
        store.set_state('profileAttempt:' + cid, {**attempt, 'state': 'FAILED', 'checkedAt': now,
                                                  'annualFilingId': filing['filingId'],
                                                  'reason': str(exc)[:240], 'retryAfter': later(now, 1)})
        raise


def run(pipeline, companies, sites, allow_network=False, fetch_sec=False, limit=25, max_seconds=600, sec_budget=60):
    """Each completed issuer persists immediately; budget deferrals remain due.

    This lane does not poll news, reset source schedules, import an inventory,
    reconstruct discovery, or mark an unavailable profile as intelligence.
    """
    store, now, root, http = pipeline.store, pipeline.now, pipeline.root, pipeline.http
    health_key = 'discoveryCircuit:profiles'
    old_circuit = store.state(health_key, {})
    network = allow_network and not (old_circuit.get('open') and old_circuit.get('retryAfter', '') > now)
    circuit = DiscoveryCircuit()
    counts = Counter()
    started = time.monotonic()
    attempted, changed, sec_bytes = [], [], 0
    ordered = sorted(companies, key=lambda c: (store.state('companyProfile:' + c['companyId'], {}).get('state') == 'AVAILABLE', c['companyId']))
    with guarded_poll(http, circuit):
        for original in ordered:
            if len(attempted) >= limit or time.monotonic() - started >= max_seconds:
                break
            cid = original['companyId']
            pipeline.ensure_aliases([cid])
            company = pipeline.companies[cid]
            previous = store.state('companyProfile:' + cid, {})
            attempt = store.state('profileAttempt:' + cid, {})
            submissions = submissions_for(root, store, company)
            filing = annual_filing(company, submissions, now)
            annual_id = filing['filingId'] if filing else None
            filing_changed = annual_id and annual_id != attempt.get('annualFilingId') and not any(s.get('filingId') == annual_id for s in previous.get('sources', []))
            parser_changed = attempt.get('parserVersion') != PARSER_VERSION
            if not parser_changed and not filing_changed and attempt.get('nextCheck', '') > now:
                counts['NOT_DUE'] += 1
                continue
            if attempt.get('retryAfter', '') > now:
                counts['COOLDOWN'] += 1
                continue
            attempted.append(cid)
            try:
                profile = refresh_cached_sec(root, store, company, submissions, now)
                if profile is None and fetch_sec and network and company.get('cik'):
                    if store.state('sec:' + cid, {}).get('retryAfter', '') > now:
                        counts['SEC_COOLDOWN'] += 1
                    else:
                        from quant.sec.provider import SECProvider
                        client = pipeline.sec_client(sec_budget)
                        if not submissions:
                            submissions = SECProvider(client).get_submissions(company['cik'], include_history=False)
                            if str(submissions.get('cik', '')).zfill(10) != company['cik']:
                                raise SourceError('PROFILE_SEC_IDENTITY_MISMATCH')
                            # Store only the reusable existing compact metadata contract.
                            cols = submissions.get('filings', {}).get('recent', {})
                            compact = {'cik': company['cik'], 'name': submissions.get('name'), 'filings': {'recent': {k: v[:1000] for k, v in cols.items() if isinstance(v, list)}}}
                            store.set_state('sec-submissions:' + cid, compact)
                        filing = annual_filing(company, submissions, now)
                        annual_id = filing['filingId'] if filing else None
                        if filing and not any(s.get('filingId') == annual_id for s in previous.get('sources', [])):
                            body = cached_sec(root, filing['url'])
                            if body is None:
                                body = client.get_bytes(filing['url'])
                                sec_bytes += len(body)
                            profile = refresh_cached_sec(root, store, company, submissions, now)
                # A currently stored SEC profile is preferred; do not turn its
                # filing-driven cadence into quarterly website polling.
                current = profile or previous
                if current.get('state') == 'AVAILABLE' and any(s['type'] == 'SEC' for s in current.get('sources', [])) and not filing_changed:
                    profile = current
                if profile is None:
                    profile = web_profile(company, store, http, sites, now, network)
                status = 'AVAILABLE' if profile and profile.get('state') == 'AVAILABLE' else 'UNAVAILABLE'
                if status == 'AVAILABLE':
                    if profile != previous:
                        store.set_state('companyProfile:' + cid, profile)
                        changed.append(cid)
                # A failed refresh preserves the preceding verified description.
                store.set_state('profileAttempt:' + cid, {**store.state('profileAttempt:' + cid, {}), 'state': status,
                    'checkedAt': now, 'parserVersion': PARSER_VERSION, 'annualFilingId': annual_id,
                    'nextCheck': later(now, 365 if profile and any(s['type'] == 'SEC' for s in profile['sources']) else 90),
                    'retryAfter': None, 'reason': None if status == 'AVAILABLE' else 'NO_RELIABLE_CACHED_OR_PERMITTED_BUSINESS_EVIDENCE'})
                counts[status] += 1
            except BudgetExhausted as exc:
                counts['DEFERRED'] += 1
                store.audit(now, cid, 'PROFILE_BUDGET_DEFERRED', reason=str(exc)[:200])
                break
            except Exception as exc:
                ambiguous = any(code in str(exc) for code in ('IDENTITY_MISMATCH', 'CONFLICTING', 'OWNER_NOT_VALIDATED'))
                status = 'AMBIGUOUS' if ambiguous else 'FAILED'
                counts[status] += 1
                delay = 7 if any(code in str(exc) for code in ('403', '401', 'ROBOTS_DISALLOWED')) else 1
                store.set_state('profileAttempt:' + cid, {**attempt, 'checkedAt': now, 'parserVersion': PARSER_VERSION,
                    'state': status, 'reason': str(exc)[:200], 'retryAfter': later(now, delay)})
                store.audit(now, cid, 'PROFILE_SOURCE_FAILURE', reason=str(exc)[:200])
            if circuit.opened:
                break
    if circuit.opened:
        store.set_state(health_key, {**circuit.snapshot(), 'checkedAt': now, 'retryAfter': later(now, 15 / 1440)})
    elif network:
        store.set_state(health_key, {**circuit.snapshot(), 'checkedAt': now})
    result = {'parserVersion': PARSER_VERSION, 'generatedAt': now, 'attempted': len(attempted), 'changed': len(changed),
              'changedIssuerIds': changed, 'outcomes': dict(counts), 'publicRequests': http.requests,
              'secRequests': getattr(getattr(pipeline, '_sec_client', None), 'stats', {}).get('requests', 0),
              'secDocumentBytesRead': sec_bytes, 'httpStats': dict(http.stats), 'runtimeSeconds': round(time.monotonic() - started, 3),
              'circuit': circuit.snapshot() if network else old_circuit, 'networkAllowed': network}
    store.set_state('profileBackfillLatest', result)
    return result
