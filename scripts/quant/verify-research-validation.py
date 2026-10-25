#!/usr/bin/env python3
"""Independent arithmetic/interval reference. Reads labeled fixture JSON on stdin.
This verifier does not assert real-data eligibility or untouched holdout evidence.
"""
import datetime as dt
import json
import math
import sys


def timestamp(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00')).replace(tzinfo=dt.timezone.utc).timestamp()


def overlap(a, b, c, d):
    return max(a, c) <= min(b, d)


def holm(values):
    order = sorted(range(len(values)), key=lambda i: (values[i], i))
    answer = [None] * len(values)
    maximum = 0
    for rank, i in enumerate(order):
        maximum = max(maximum, min(1, (len(values) - rank) * values[i]))
        answer[i] = maximum
    return answer


def verify(data):
    c = data['config']
    calendar = list(map(timestamp, c['calendar']))
    asof = timestamp(c['asOf'])
    length = sum(t <= asof for t in calendar)
    train, validation, test = (c[k] for k in ('trainSize', 'validationSize', 'testSize'))
    events = sorted(data['events'], key=lambda e: (e['decisionAt'], e['id']))
    actual_folds = data['partition']['folds']
    folds = []
    for cursor in range(train + validation, length - test + 1, c.get('stepSize', test)):
        start = 0 if c['mode'] == 'EXPANDING' else cursor - validation - train
        bounds = {'train': (calendar[start], calendar[cursor - validation - 1]),
                  'validation': (calendar[cursor - validation], calendar[cursor - 1]),
                  'test': (calendar[cursor], calendar[cursor + test - 1])}
        by = {role: [e for e in events if left <= timestamp(e['decisionAt']) <= right]
              for role, (left, right) in bounds.items()}
        kept = {role: [] for role in bounds}
        excluded = []
        for role in bounds:
            cutoff = bounds['validation'][0] if role == 'train' else bounds['test'][0] if role == 'validation' else asof
            protected = by['validation'] + by['test'] if role == 'train' else by['test'] if role == 'validation' else []
            for e in by[role]:
                decision = timestamp(e['decisionAt'])
                ready = timestamp(e['outcomeAvailableAt']) if e['outcomeAvailableAt'] is not None else None
                reason = None
                if decision > asof or timestamp(e['availableAt']) > decision:
                    reason = 'INPUT_NOT_AVAILABLE_AT_DECISION'
                elif ready is None:
                    reason = 'OUTCOME_UNKNOWN'
                elif ready > asof or (ready > cutoff if role == 'test' else ready >= cutoff):
                    reason = 'OUTCOME_NOT_MATURE_AT_CUTOFF'
                elif role != 'test' and ready + c.get('embargoDays', 0) * 86400 >= cutoff:
                    reason = 'EMBARGO'
                elif any(overlap(timestamp(e['informationStart']), timestamp(e['outcomeEnd']), timestamp(p['informationStart']), timestamp(p['outcomeEnd'])) for p in protected):
                    reason = 'PURGED_INFORMATION_OUTCOME_OVERLAP'
                if reason:
                    excluded.append({'id': e['id'], 'role': role, 'reason': reason})
                else:
                    kept[role].append(e['id'])
        folds.append({**kept, 'excluded': excluded})
    assert len(folds) == len(actual_folds), 'fold count'
    for expected, actual in zip(folds, actual_folds):
        assert all(expected[key] == actual[key] for key in expected), 'partition mismatch'
    aggregate = data['aggregate']
    ids = [id_ for fold in folds for id_ in fold['test']]
    assert len(ids) == len(set(ids)) == aggregate['n']
    assert [row['id'] for row in aggregate['rows']] == ids
    expected_mean = math.fsum(row['value'] for row in aggregate['rows']) / len(ids) if ids else None
    assert expected_mean is None or math.isclose(expected_mean, aggregate['mean'], rel_tol=1e-12, abs_tol=1e-12)
    if 'execution' in data:
        observations = {r['id']: r for r in data['observations']}
        expected_rows = []
        for fold in folds:
            train_mean = math.fsum(observations[i]['outcome'] for i in fold['train']) / len(fold['train'])
            validation_mean = math.fsum(observations[i]['outcome'] for i in fold['validation']) / len(fold['validation'])
            direction = 1 if validation_mean >= train_mean else -1
            expected_rows.extend((i, direction * (observations[i]['outcome'] - train_mean)) for i in fold['test'])
        actual_rows = data['execution']['aggregate']['rows']
        assert len(expected_rows) == len(actual_rows), 'execution count'
        for (i, value), actual in zip(expected_rows, actual_rows):
            assert i == actual['id'] and math.isclose(value, actual['value'], rel_tol=1e-12, abs_tol=1e-12), 'execution arithmetic'
    assert holm(data['holm']['raw']) == data['holm']['adjusted']
    sensitivity = data['sensitivity']
    adjusted = holm([row['pValue'] for row in sensitivity['rows']])
    for row, p in zip(sensitivity['rows'], adjusted):
        q = row['parameters']
        expected = q['holdingPeriods'] / 100 - q['feeBps'] / 10000 - q['slippageBps'] / 10000 - q['entryDelay'] / 100
        assert math.isclose(expected, row['estimate'], abs_tol=1e-12)
        assert p == row['adjustedPValue']
    assert sensitivity['productionApproved'] is False
    return {'status': 'PASS', 'scope': 'INDEPENDENT_FIXTURE_REFERENCE', 'folds': len(folds), 'oosEvents': len(ids), 'sensitivityPoints': len(adjusted), 'executionVerified': 'execution' in data}


if __name__ == '__main__':
    print(json.dumps(verify(json.load(sys.stdin)), sort_keys=True))
