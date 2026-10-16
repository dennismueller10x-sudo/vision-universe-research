"""Load an explicitly approved public policy without changing the tested DOI operator.

No API credentials, provider requests, email addresses, contact writes or sends.
The existing operator still verifies the actual main-branch acceptance run and
the exact policy checksum before it can change the public runtime gates.
"""
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re

POLICY = 'legal-drafts/newsletter-release-2026-10-14.html'
# These files produced the genuinely tested signup, DOI request, mail and
# confirmation flow. A relevant change blocks reuse of the prior acceptance.
TESTED_FILES = (
    'server/newsletter.mjs', 'newsletter.js', 'index.html', 'scripts/build.mjs',
    'scripts/newsletter_mail.py', 'mail/newsletter-api-doi.html',
    'mail/newsletter-test-confirmed.html', 'newsletter/bestaetigen/index.html',
    'newsletter/bestaetigt/index.html', 'newsletter/fehler/index.html',
    'styles.css', 'legal.css', 'presentation.js',
)


class PolicyDocument(HTMLParser):
    def __init__(self):
        super().__init__()
        self.roots = []

    def handle_starttag(self, tag, attrs):
        if tag == 'html':
            if len(dict(attrs)) != len(attrs):
                raise ValueError('Ambiguous policy attributes')
            self.roots.append(dict(attrs))


def read_owned(root, relative):
    path = root / relative
    if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Unsafe publication source')
    return path.read_bytes()


def prepare_public_policy(tested, publication, expected_sha):
    if not re.fullmatch('[a-f0-9]{64}', expected_sha):
        raise ValueError('Exact approved public policy checksum required')
    if tested.resolve() == publication.resolve():
        raise ValueError('Independent tested checkout required')
    for relative in TESTED_FILES:
        if read_owned(tested, relative) != read_owned(publication, relative):
            raise ValueError('Tested newsletter flow changed; prior acceptance cannot be reused')
    policy = read_owned(publication, POLICY)
    digest = hashlib.sha256(policy).hexdigest()
    if digest != expected_sha:
        raise ValueError('Public policy differs from explicit approval')
    text = policy.decode('utf-8')
    document = PolicyDocument()
    document.feed(text)
    document.close()
    if len(document.roots) != 1 or any(document.roots[0].get(k) != v for k, v in {
        'lang': 'de', 'data-policy-status': 'approved',
        'data-newsletter-release-scope': 'public',
    }.items()) or re.search(r'\bOFFEN\b|\[ZUR FREIGABE\]|\[NOCH ZU KLÄREN\]', text):
        raise ValueError('Complete explicitly approved public policy required')
    # Only the reviewed legal document is overlaid. Git HEAD, the operator and
    # every functional newsletter file remain the actually tested version.
    target = tested / POLICY
    read_owned(tested, POLICY)  # Check the existing owned destination first.
    target.write_bytes(policy)
    return {'approved_public_policy_sha256': digest,
            'tested_newsletter_files_identical': len(TESTED_FILES),
            'functional_files_overwritten': 0}


def run():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch' or os.environ.get('GITHUB_REF') != 'refs/heads/main' or os.environ.get('NEWSLETTER_OPERATOR_OPERATION') != 'public':
        raise ValueError('Manual main-branch public release required')
    root = Path.cwd()
    print(json.dumps(prepare_public_policy(root / 'landing', root / '.newsletter-public-source/landing',
                                          os.environ.get('NEWSLETTER_OPERATOR_PRIVACY_SHA256', ''))))


if __name__ == '__main__':
    try:
        run()
    except Exception:
        print('Public release blocked: approved policy or unchanged tested newsletter source not verified.')
        raise SystemExit(1) from None
