"""Verify advertised bare/www roots independently before resolving ambiguity."""
from urllib.parse import urlsplit

from .model import canonical_url
from .site_inventory import candidate_routes
from .transport import SourceError

VERSION = 'corporate-root-alias-1'


def root_alias_candidates(value):
    if value.get('status') != 'AMBIGUOUS':
        return []
    routes = candidate_routes(value)
    if len(routes) != 2:
        return []
    try:
        parts = [urlsplit(route.get('url') or '') for route in routes]
        unsafe = any(p.scheme != 'https' or p.path != '/' or p.query or p.fragment
                     or p.port not in (None, 443) or not p.hostname for p in parts)
    except ValueError:
        return []
    if unsafe:
        return []
    base = parts[0].hostname.removeprefix('www.')
    if '.' not in base or {p.hostname for p in parts} != {base, 'www.' + base}:
        return []
    return sorted(routes, key=lambda route: route['url'])


def validate_root_aliases(company, routes, http, now):
    from .discovery import validate_candidate
    routes = root_alias_candidates({'status': 'AMBIGUOUS', 'candidates': routes})
    if not routes:
        raise SourceError('OFFICIAL_SITE_CANDIDATE_ALIAS_SCOPE_NOT_PROVEN')
    allowed_hosts = {urlsplit(route['url']).hostname for route in routes}
    proofs, sites, destinations = [], [], set()
    try:
        for route in routes:
            # No DNS alias fallback or cross-domain redirect recovery: both
            # advertised forms must supply their own current ownership proof.
            site = validate_candidate(company, route, http, now)
            target = urlsplit(canonical_url(site['url']))
            if target.hostname not in allowed_hosts or target.port not in (None, 443):
                raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED')
            destinations.add((target.hostname.removeprefix('www.'), target.path, target.query))
            proofs.append({'candidateUrl': route['url'], 'verifiedUrl': site['url'],
                           'contentHash': site['contentHash'], 'evidence': site['evidence'],
                           'ownershipEvidence': site['ownershipEvidence']})
            sites.append(site)
        if len(destinations) != 1:
            raise SourceError('OFFICIAL_SITE_CANDIDATE_REDIRECT_OWNER_NOT_VALIDATED')
    except SourceError as error:
        error.ownershipEvidence = {**getattr(error, 'ownershipEvidence', {}),
                                   'verifiedRootAliases': proofs, 'rootAliasVerifierVersion': VERSION}
        raise
    site = dict(sites[0])
    site['ownershipEvidence'] = {**site['ownershipEvidence'],
                                'rootAliasVerification': {'version': VERSION,
                                    'method': 'INDEPENDENT_OWNERSHIP_ON_ALL_ADVERTISED_ROOT_FORMS',
                                    'aliases': proofs}}
    site['evidence'] = [*site['evidence'], 'INDEPENDENTLY_VERIFIED_WWW_ROOT_ALIASES']
    return site
