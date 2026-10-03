"""Independent issuer-identity and reference-quality guards for audit artifacts."""
import json,unittest
from pathlib import Path
D=Path(__file__).parent
class EuropeReferenceIntegrity(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.r=json.loads((D/'top_europe_reference.json').read_text());cls.rows=cls.r['companies'];cls.bridge=json.loads((D/'tiingo_europe_adr_bridge.json').read_text())['companies']
 def entities(self,name):return [r for r in self.rows if name==r['company'] or name in r.get('aliases',[])]
 def test_representative_reference_scale(self):self.assertTrue(500<=len(self.rows)<=1000)
 def test_company_ids_unique(self):self.assertEqual(len(self.rows),len({r['companyId'] for r in self.rows}))
 def test_distinct_parent_operating_issuers_preserved(self):
  for a,b in [('Porsche','Porsche SE'),('BW LPG','Hafnia Limited'),('Fresenius','Fresenius Medical Care'),('Siemens','Siemens Energy')]:
   self.assertEqual(len(self.entities(a)),1,a);self.assertEqual(len(self.entities(b)),1,b);self.assertNotEqual(self.entities(a)[0]['companyId'],self.entities(b)[0]['companyId'])
 def test_same_issuer_renames_and_share_classes_collapsed(self):
  for a,b in [('Maersk','A.P. Møller-Mærsk (class B)'),('Evonik','Evonik Industries'),('Howden Joinery','Howdens Joinery'),('IHG Hotels & Resorts','InterContinental Hotels Group'),('LVMH','LVMH Moët Hennessy Louis Vuitton')]:
   self.assertEqual(self.entities(a)[0]['companyId'],self.entities(b)[0]['companyId'])
 def test_merged_source_rows_preserved(self):self.assertEqual(sum(len(r['sourceConstituentRows']) for r in self.rows),self.r['sourceRows'])
 def test_non_company_and_malformed_rows_excluded(self):
  for n in ['GCP Infrastructure Investments','Vietnam Enterprise Investments','Computer Center','Scottish Mortgage Investment Trust']:self.assertEqual(self.entities(n),[])
 def test_ihg_bridge_survives_issuer_alias_dedupe(self):
  matches=[r for r in self.bridge if 'InterContinental Hotels Group' in [r['company']]+r.get('aliases',[])];self.assertEqual(len(matches),1);self.assertEqual(matches[0]['usBridge']['symbol'],'IHG')
 def test_otc_not_equated_with_primary_coverage(self):
  nestle=[r for r in self.bridge if r['company']=='Nestlé'][0];self.assertFalse(nestle['otcCandidate']['countsAsUsefulBridge']);self.assertIsNone(nestle['usBridge'])
 def test_recycled_symbol_cannot_cover_previous_company(self):
  golden=[r for r in self.bridge if r['company']=='Golden Ocean Group'][0]
  candidate=golden['otcCandidate']
  if candidate.get('metadataEvidence',{}).get('status')==200:
   self.assertIn('ETF',candidate['metadataEvidence']['payload']['name'])
   self.assertFalse(candidate['providerNameMatchesReviewedIssuer'])
   self.assertFalse(candidate['currentAccountPriceResponseVerified'])
   self.assertIn('DIFFERENT_INSTRUMENT',candidate['rejectionReason'])
 def test_archival_lse_prices_do_not_count_as_current_coverage(self):
  path=D/'tiingo_top_europe_coverage.json'
  if path.exists():
   coverage=json.loads(path.read_text());archives=coverage.get('archivedLseEvidence',[])
   if archives and all(r['archivalPriceEvidence'].get('status')==200 for r in archives):
    self.assertEqual({r['symbol'] for r in archives},{'AOF','HYVE'})
    self.assertTrue(all(r['historicalPriceResponseHasBars'] for r in archives))
    self.assertTrue(all(not r['currentEodAvailable'] for r in archives))
    self.assertEqual(coverage['COVERED_BY_LOCAL_TIINGO'],0)
if __name__=='__main__':unittest.main()
