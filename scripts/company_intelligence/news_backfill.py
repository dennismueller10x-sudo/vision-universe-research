"""One-time backfill of existing verified, unpolled issuer news feeds.

The default targets issuers without stored news. Explicit covered-issuer recovery
can add first-party news after publisher coverage, with its own frozen mode.
"""
import re
from .cadence import due
from .discovery_circuit import DiscoveryCircuit, guarded_poll
from .feeds import is_event_feed, is_material_feed
from .pipeline import advance, utcnow
from .transport import BudgetExhausted


def backfill(pipeline, limit=32, run_id='unpolled-news', scope=None, include_covered=False):
    if type(include_covered) is not bool:
        raise ValueError('INVALID_NEWS_BACKFILL_COVERAGE_MODE')
    if not 1 <= limit <= 100 or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', run_id or ''):
        raise ValueError('INVALID_NEWS_BACKFILL_BOUNDS')
    store, http, now = pipeline.store, pipeline.http, pipeline.now
    key = 'newsSourceBackfill:' + run_id + ':'
    current = {s['sourceId']: s for s in store.sources()}
    selected_scope = sorted(scope) if scope is not None else None
    inventory = store.state(key + 'inventory')
    if inventory is not None and store.state(key + 'includeCovered', False) != include_covered:
        raise ValueError('NEWS_BACKFILL_COVERAGE_MODE_CHANGED')
    if inventory is not None and store.state(key + 'scope') != selected_scope:
        raise ValueError('NEWS_BACKFILL_SCOPE_CHANGED')
    if inventory is None:
        # Publisher news does not satisfy an explicit owned-feed recovery.
        # Freeze the mode with the route identities; resume cannot widen it.
        covered = {r[0] for r in store.db.execute('SELECT DISTINCT company FROM items')}
        inventory = [{'sourceId': s['sourceId'], 'companyId': s['companyId'], 'url': s['url']}
                     for s in sorted(current.values(), key=lambda s: s['sourceId'])
                     if s.get('companyId') in pipeline.companies and (include_covered or s['companyId'] not in covered)
                     and (scope is None or s['companyId'] in scope)
                     and s.get('active', True) and s.get('verified') and s['type'] == 'IR_FEED'
                     and not s.get('lastSuccess') and not is_event_feed(s['url']) and not is_material_feed(s['url'])]
        store.set_state(key + 'inventory', inventory)
        store.set_state(key + 'scope', selected_scope)
        store.set_state(key + 'includeCovered', include_covered)
    circuit_key = 'discoveryCircuit:ir'
    prior_circuit = store.state(circuit_key, store.state('discoveryCircuit', {}))
    if prior_circuit.get('open') and prior_circuit.get('retryAfter', '') > now:
        return {'requests': 0, 'httpStats': http.stats, 'attemptedSources': 0, 'frozenSources': len(inventory),
                'stopReason': 'CIRCUIT_COOLDOWN', 'circuit': prior_circuit, 'run': pipeline.run}
    selected = []
    for row in inventory:
        source = current.get(row['sourceId'])
        if (not source or source.get('companyId') != row['companyId'] or source.get('url') != row['url']
                or row['companyId'] not in pipeline.companies):
            store.set_state(key + row['sourceId'], {'status': 'SOURCE_IDENTITY_CHANGED', 'checkedAt': now})
            continue
        if source.get('lastSuccess') or not source.get('verified') or source['type'] != 'IR_FEED' or not due(source, now):
            continue
        selected.append(source)
    circuit = DiscoveryCircuit(); attempted = []; before_news = {r[0] for r in store.db.execute('SELECT DISTINCT company FROM items')}
    reason = 'BATCH_COMPLETED' if selected else 'NO_DUE_SOURCES'
    def save_circuit():
        stamp = utcnow(); value = {**circuit.snapshot(), 'checkedAt': stamp, 'scope': 'ir'}
        if value['open']: value['retryAfter'] = advance(stamp, 0.25)
        store.set_state(circuit_key, value)
        return value
    try:
        with guarded_poll(http, circuit):
            for source in selected[:limit]:
                circuit.check()
                if (store.path.parent / 'stop-source-backfill').exists():
                    reason = 'OPERATOR_CHECKPOINT_PAUSE'; break
                pipeline.ingest_source(source)
                attempted.append(source['sourceId'])
                latest = next(s for s in store.sources() if s['sourceId'] == source['sourceId'])
                store.set_state(key + source['sourceId'], {'status': 'SUCCESS' if latest.get('lastSuccess') else 'RETRY_LATER',
                    'checkedAt': now, 'nextCheck': latest.get('nextCheck'), 'lastError': latest.get('lastError')})
                save_circuit()
    except BudgetExhausted:
        reason = 'CIRCUIT_OPEN' if circuit.snapshot()['open'] else 'BUDGET_DEFERRED'
    finally:
        saved = save_circuit()
    after_news = {r[0] for r in store.db.execute('SELECT DISTINCT company FROM items')}
    return {'requests': http.requests, 'httpStats': http.stats, 'run': pipeline.run,
            'frozenSources': len(inventory), 'eligibleSources': len(selected), 'attemptedSources': len(attempted),
            'attemptedSourceIds': attempted, 'recoveredNewsIssuers': sorted(after_news - before_news),
            'stopReason': reason, 'circuit': saved}
