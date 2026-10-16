"""Read the late owner unsubscribe. GET-only; never resend, modify or log personal data."""
import importlib.util
import json
import os
import urllib.parse
from pathlib import Path

spec = importlib.util.spec_from_file_location('owner_e2e', Path(__file__).with_name('newsletter-e2e.py'))
owner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(owner)
admin_spec = importlib.util.spec_from_file_location('admin', Path(__file__).with_name('newsletter-server-admin.py'))
admin = importlib.util.module_from_spec(admin_spec)
admin_spec.loader.exec_module(admin)
NAME = 'VU | DOI-Abnahme | Betreiber Oktober 2026'


def verify(read, email):
    def pages(path, field, size=50):
        result = []
        for offset in range(0, 10000, size):
            value = read(path + ('&' if '?' in path else '?') + f'limit={size}&offset={offset}').get(field)
            if not isinstance(value, list):
                raise ValueError('Incomplete inventory')
            result.extend(value)
            if len(value) < size:
                return result
        raise ValueError('Incomplete pagination')

    lists = pages('/contacts/lists', 'lists')
    owned = [v for v in lists if v.get('name') == NAME]
    if len(owned) != 1 or type(owned[0].get('id')) is not int or owned[0]['id'] in (4, 5, 6):
        raise ValueError('Ambiguous private list')
    list_id = owned[0]['id']
    path = '/contacts/' + urllib.parse.quote(email, safe='')
    contact = read(path)
    events = pages('/smtp/statistics/events?templateId=8&startDate=2026-10-15&endDate=2026-10-16', 'events', 100)
    owner.verify_confirmed_owner(contact, email, events, list_id, blocked=True)
    members = pages(f'/contacts/lists/{list_id}/contacts', 'contacts')
    if len(members) != 1 or members[0].get('id') != contact['id']:
        raise ValueError('Foreign private recipient')
    campaigns = [v for v in pages('/emailCampaigns?type=classic', 'campaigns') if v.get('name') == NAME]
    if len(campaigns) != 1 or type(campaigns[0].get('id')) is not int:
        raise ValueError('Ambiguous private campaign')
    campaign_id = campaigns[0]['id']
    campaign = read('/emailCampaigns/' + str(campaign_id))
    recipients = campaign.get('recipients', {})
    includes = recipients.get('listIds', recipients.get('lists', []))
    ids = [v.get('id') if isinstance(v, dict) else v for v in includes]
    if campaign.get('name') != NAME or campaign.get('status') != 'sent' or ids != [list_id] or recipients.get('segmentIds') or recipients.get('segments'):
        raise ValueError('Campaign audience not proven')
    stats = read(path + '/campaignStats?startDate=2026-10-15&endDate=2026-10-16')
    unsubscribes = stats.get('unsubscriptions', {}).get('userUnsubscription', [])
    if not any(v.get('campaignId') == campaign_id for v in unsubscribes):
        raise ValueError('Native campaign unsubscribe not proven')
    counts = {str(n): len(pages(f'/contacts/lists/{n}/contacts', 'contacts')) for n in (4, 5, 6)}
    # A second read proves that the audit itself has not changed the profile.
    if read(path) != contact:
        raise ValueError('Contact changed during audit')
    return {'marketing_unsubscribe_verified': True, 'native_user_unsubscribe_for_owned_campaign': True,
            'original_doi_and_unique_owner_verified': True, 'lists': counts,
            'emails_sent': 0, 'contact_write_calls': 0, 'profile_unchanged_during_read': True,
            'historical_wait_timeout_remains_failed': True}


def run():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch' or os.environ.get('GITHUB_REF') not in ('refs/heads/main', 'refs/heads/feat/brevo-app-waitlist-doi') or os.environ.get('NEWSLETTER_OPERATOR_OPERATION') != 'unsubscribe-audit':
        raise ValueError('Trusted manual read required')
    if owner.hashlib.sha256(Path(__file__).resolve().parents[1].joinpath('server/newsletter.mjs').read_bytes()).hexdigest() != owner.ACCEPTED_RUNTIME_SHA:
        raise ValueError('Actual DOI runtime changed')
    key = os.environ.get('BREVO_API_KEY', '')
    if not key:
        raise ValueError('Private key missing')

    def read(path):
        code, value = admin.api(admin.BREVO, path, key)  # GET only, no data/body.
        if code != 200:
            print(json.dumps({'required_private_read_http': code}), flush=True)
            raise ValueError('Private read unavailable')
        return value

    print(json.dumps(verify(read, owner.confirmed_owner_from_payload())), flush=True)


if __name__ == '__main__':
    try:
        run()
    except Exception:
        # Never render exception strings, request paths, email, events or response bodies.
        print('Read-only unsubscribe verification incomplete; no email or contact mutation performed.', flush=True)
        raise SystemExit(1) from None
