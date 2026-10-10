"""Reusable IR platform fingerprints and bounded endpoint inventory.

Fingerprints classify already fetched official HTML; they never establish
issuer ownership or authorize a guessed third-party API endpoint.
"""
import re
from .model import domain, within_domain

SHARED_PUBLISHERS = ('businesswire.com', 'globenewswire.com', 'prnewswire.com')


def shared_publisher(url):
    host = domain(url)
    return any(host == h or host.endswith('.' + h) for h in SHARED_PUBLISHERS)


def fingerprint(body, fallback='GENERIC'):
    html = body.decode('utf-8', 'replace')
    for family, pattern in [('GCS', r'/profiles/nasdaqir/'),
                             ('STOCKPR', r'(?:/ir\.stockpr\.css|equisolve\.com)'),
                             ('WEB_DRIVER', r'/webdriver\.js'),
                             ('Q4', r'(?:q4cdn\.com|q4inc\.com|q4web\.com|q4api\b)'),
                             ('GCS', r'(?:gcs-web\.com|investor\.gcs|drupalSettings.*?gcs)'),
                             ('NOTIFIED', r'(?:notified\.com|intrado\.com)'),
                             ('INVESTIS', r'(?:investis\.com|investisdigital\.com)'),
                             ('WORDPRESS', r'(?:/wp-content/|/wp-includes/)')]:
        # Only URL/script/meta attributes, never a prose mention of a vendor.
        if re.search(r'(?:src|href|content)\s*=\s*["\'][^"\']*' + pattern, html, re.I):
            return family
    return fallback


def endpoints(links, homepage):
    patterns = {'newsroom': r'newsroom|news room', 'pressReleaseUrl': r'press releases?|news releases?',
                'eventsUrl': r'events|calendar', 'earningsUrl': r'earnings|quarterly results|financial results',
                'presentationsUrl': r'\bpresentations?\b|\bslides?\b', 'reportsUrl': r'annual reports|financial reports|quarterly reports',
                'callsUrl': r'webcasts|earnings calls'}
    return {key: next((l['url'] for l in links if within_domain(l['url'], homepage) and re.search(pattern, l['text'], re.I) and not (key == 'eventsUrl' and re.search(r'news[-_/]?releases|press[-_/]?releases', l['url'], re.I))), None)
            for key, pattern in patterns.items()}
