from datetime import datetime, timedelta
import json
import tempfile
import unittest
from pathlib import Path

from company_intelligence import profile_catalogue_seed as seeder
from company_intelligence.store import Store

ROOT = Path(__file__).resolve().parents[3]


class ProfileCatalogueSeedTests(unittest.TestCase):
    def test_seeds_catalogue_profiles_into_empty_state_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            Store(state / 'state.sqlite').close()
            catalogue = ROOT / 'company-intelligence/config/company-profiles.json'
            # Pruefzeit nach der juengsten Verifikation des Katalogs (ein fester Wert wuerde mit jedem neuen Lauf des Erzeugers ungueltig).
            latest = max(p['lastVerifiedAt'] for p in json.loads(catalogue.read_text())['profiles'].values())
            now = (datetime.strptime(latest, '%Y-%m-%dT%H:%M:%SZ') + timedelta(minutes=1)).strftime('%Y-%m-%dT%H:%M:%SZ')
            first = seeder.run(state, ROOT, catalogue, now)
            self.assertGreater(first['seeded'], 3000)
            store = Store(state / 'state.sqlite')
            try:
                cost = store.state('companyProfile:iss_cik_0000909832')
                self.assertEqual(cost['state'], 'AVAILABLE')
                self.assertEqual(cost['companyId'], 'iss_cik_0000909832')
            finally:
                store.close()
            second = seeder.run(state, ROOT, catalogue, now)
            self.assertEqual(second['seeded'], 0)

    def test_invalid_catalogue_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp)
            Store(state / 'state.sqlite').close()
            bad = state / 'bad.json'
            bad.write_text(json.dumps({'schema': 'wrong', 'profiles': {}}))
            with self.assertRaises(ValueError):
                seeder.run(state, ROOT, bad, '2026-11-12T06:00:00Z')


if __name__ == '__main__':
    unittest.main()
