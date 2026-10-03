"""Corroborated issuer metadata from advertised public distributor RSS.

Never trust arbitrary RSS category text or a ticker alone. This adapter requires
GlobeNewswire feed origin, its stock namespace, master exchange, and a unique
matching contributor/legal name. No article body downloads or query-per-ticker.
"""
import re
from .model import domain, normalize, SUFFIX


def issuer_name(value):
    return normalize(SUFFIX.sub('', value or ''))


def resolve(item, source, index):
    rss=source.get('provider')=='GLOBENEWSWIRE_RSS' and domain(source.get('url',''))=='www.globenewswire.com' and '/RssFeed/' in source.get('url','')
    from .distributor_archive import pinned_archive
    archive=source.get('provider')=='GLOBENEWSWIRE_ARTICLE' and source.get('format')=='GNN_ARCHIVE' and pinned_archive(source.get('url',''))
    if not rss and not archive:return None
    if domain(item.get('url', '')) != 'www.globenewswire.com':
        return []
    metadata = item.get('distributionMetadata') or {}
    contributor = issuer_name(metadata.get('contributor'))
    if not contributor:
        return []
    if contributor == 'nasdaq' and re.search(r'\bnasdaq[ -](?:100|composite|index)\b', normalize(item.get('headline'))):
        return []  # Membership notices concern the added issuer, not NDAQ results.
    # Ambiguous common words are acceptable only with a legal-name AND listing
    # match. Multi-class tickers still resolve to the authoritative one issuer.
    matches = {}
    for stock in metadata.get('stocks', [])[:20]:
        parsed = re.fullmatch(r'(Nasdaq|NYSE|NYSE American|AMEX):\s*([A-Z][A-Z0-9.-]{0,14})', stock, re.I)
        if not parsed:
            continue
        exchange, ticker = parsed.group(1).upper(), parsed.group(2).upper()
        aliases = {'NASDAQ': {'NASDAQ', 'XNAS'}, 'NYSE': {'NYSE', 'XNYS'}, 'AMEX': {'AMEX', 'NYSE_AMERICAN', 'NYSE AMERICAN', 'XASE'}, 'NYSE AMERICAN': {'AMEX', 'NYSE_AMERICAN', 'NYSE AMERICAN', 'XASE'}}
        candidates = set().union(*(index.get((contributor, ticker, e), set()) for e in aliases[exchange]))
        if len(candidates) == 1:
            cid = next(iter(candidates))
            matches[cid] = {'companyId': cid, 'confidence': .99,
                                    'evidence': ['DISTRIBUTOR_STOCK_METADATA:' + exchange + ':' + ticker, 'EXACT_MASTER_CONTRIBUTOR:' + metadata['contributor']]}
    return list(matches.values())
