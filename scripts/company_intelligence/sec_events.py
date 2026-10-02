"""Item evidence describes a disclosure category, never an invented transaction.

One material bundle per filing avoids turning a multi-item 8-K into five stories.
7.01/8.01/9.01 alone remain ordinary filings; 2.02 uses the earnings verifier.
"""
from .model import stable_id

ITEMS = {
    '1.01': ('Agreement', 'Entry into a material definitive agreement', 'HIGH'),
    '1.02': ('Agreement', 'Termination of a material definitive agreement', 'HIGH'),
    '1.03': ('Bankruptcy', 'Bankruptcy or receivership disclosure', 'CRITICAL'),
    '2.01': ('M&A', 'Completion of acquisition or disposition of assets', 'HIGH'),
    '2.03': ('Financing', 'Creation of a direct financial obligation', 'HIGH'),
    '2.04': ('Financing', 'Triggering events affecting financial obligations', 'HIGH'),
    '2.05': ('Restructuring', 'Costs associated with exit or disposal activities', 'HIGH'),
    '2.06': ('Impairment', 'Material impairment disclosure', 'HIGH'),
    '3.01': ('Listing', 'Listing compliance or delisting notice', 'HIGH'),
    '3.02': ('Financing', 'Unregistered sale of equity securities', 'MEDIUM'),
    '3.03': ('Shareholder Rights', 'Material modification to security holder rights', 'HIGH'),
    '4.01': ('Audit', 'Change in certifying accountant', 'MEDIUM'),
    '4.02': ('Accounting', 'Non-reliance on previously issued financial statements', 'HIGH'),
    '5.02': ('Management', 'Director or officer appointment, departure or compensation disclosure', 'MEDIUM'),
}


def material_event(base, items):
    relevant = sorted(set(items) & ITEMS.keys())
    if not relevant or base.get('form') not in ('8-K', '8-K/A'):
        return None
    evidence = [{'item': code, 'category': ITEMS[code][0], 'description': ITEMS[code][1],
                 'sourceUrl': base['sourceUrl'], 'filingId': base['filingId']} for code in relevant]
    rank = {'MEDIUM': 1, 'HIGH': 2, 'CRITICAL': 3}
    importance = max((ITEMS[code][2] for code in relevant), key=rank.get)
    return {**base, 'eventId': stable_id(base['companyId'], base['filingId'], 'MATERIAL_SEC_EVENT'),
            'eventType': 'MATERIAL_SEC_EVENT', 'headline': 'SEC disclosure: ' + '; '.join(ITEMS[c][1] for c in relevant),
            'importance': importance, 'categories': sorted({ITEMS[c][0] for c in relevant}),
            'secItems': relevant, 'detectionEvidence': evidence, 'verificationState': 'VERIFIED_SEC_ITEM_CATEGORY',
            'interpretation': 'DISCLOSURE_CATEGORY_ONLY; specific people, transaction terms and direction require document evidence',
            'classificationVersion': 'sec-items-1.0.0', 'confidence': 1.0,
            'fiscalQuarter': None, 'fiscalYear': None, 'reportingPeriod': None, 'dateMeaning': 'SEC_FILING_PUBLICATION_NOT_EVENT_OCCURRENCE'}
