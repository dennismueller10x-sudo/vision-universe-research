"""Seed the committed profile catalogue into the restored private state.

The catalogue (company-intelligence/config/company-profiles.json, produced by profile_catalogue.py)
holds the prepared English source profiles from the annual reports. Only the manual CLI commands
seeded it into the private ledger; production runs (profile-source) restored the ledger without it,
so reviewed German copies had no source (NO_PROFILE_SOURCE). This step imports the catalogue with the
existing `seed` rules (validated profiles only, never replaces a newer verified profile) before the
consumer is built. No network, no output of private rows: aggregate counts only.
"""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.pipeline import utcnow
from company_intelligence.profile_catalogue import seed
from company_intelligence.store import Store
from company_intelligence.top46_content import identities


def run(state, identity_root, catalogue_path, now=None):
    catalogue = json.loads(Path(catalogue_path).read_text())
    store = Store(Path(state) / 'state.sqlite')
    try:
        companies = {**identities(ROOT, store), **identities(Path(identity_root), store)}
        imported = seed(store, companies, catalogue, now or utcnow())
    finally:
        store.close()
    return {'schema': 1, 'catalogueProfiles': len(catalogue.get('profiles', {})), 'seeded': imported,
            'universeCompanies': len(companies)}


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--state', type=Path, required=True)
    p.add_argument('--identity-root', type=Path, required=True)
    p.add_argument('--catalogue', type=Path, default=ROOT / 'company-intelligence/config/company-profiles.json')
    p.add_argument('--out', type=Path)
    args = p.parse_args(argv)
    result = run(args.state, args.identity_root, args.catalogue)
    text = json.dumps(result, sort_keys=True)
    if args.out:
        args.out.write_text(text + '\n')
    print(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
