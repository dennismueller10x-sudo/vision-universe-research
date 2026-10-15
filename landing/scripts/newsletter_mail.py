"""Read isolated email HTML; never pass Research browser navigation to Brevo."""
from pathlib import Path


def mail_source(name):
    if name not in ('newsletter-api-doi.html','newsletter-test-confirmed.html'):
        raise ValueError('Unknown email source')
    html=Path(__file__).resolve().parents[1].joinpath('mail',name).read_text()
    # The shared navigation producer can add these exact browser-only snippets
    # to any HTML source. They are not part of an email's approved content.
    for snippet in ('<link rel="stylesheet" href="/assets/site-navigation.css">','<vu-navigation></vu-navigation>','<script src="/assets/site-navigation.js"></script>'):
        html=html.replace(snippet,'')
    if any(marker in html.lower() for marker in ('<script','<vu-navigation','<link','<iframe')):
        raise ValueError('Browser content in email source')
    return html
