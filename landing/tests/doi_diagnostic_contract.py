import importlib.util,sys,unittest,os
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
spec=importlib.util.spec_from_file_location('diagnose',Path(__file__).resolve().parents[1]/'scripts/newsletter-doi-diagnose.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Contract(unittest.TestCase):
 def test_safe_generic_error(self):
  value=module.safe_error({'code':'invalid_parameter','message':'Your template must contain a mandatory field: {{ params.DOIurl }}'})
  self.assertEqual(value['safe_message'],'Your template must contain a mandatory field: {{ params.DOIurl }}')
  self.assertTrue(value['reason_flags']['template']);self.assertTrue(value['reason_flags']['doi_link'])
 def test_personal_and_secret_messages_are_not_emitted(self):
  for text in ['Recipient private@example.test invalid','api key xkeysib-SYNTHETIC-PRIVATE-123 invalid','Error for Dennis Example','Visit https://private.example.test/link?token=private','Unknown numeric id 123456789']:
   self.assertIsNone(module.safe_error({'code':'private@example.test','message':text})['safe_message'])
   self.assertEqual(module.safe_error({'code':'private@example.test','message':text})['safe_code'],'unclassified')
 def test_no_authorization_no_request(self):
  with patch.dict(os.environ,{},clear=True),patch.object(module,'request') as request:
   with self.assertRaises(ValueError):module.run()
   request.assert_not_called()
 def test_private_payload_mismatch_never_requests_api(self):
  env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/main','NEWSLETTER_AUTHORIZE_CONTROLLED_TEST':'true','BREVO_IMPORT_PAYLOAD':'synthetic-invalid'}
  with patch.dict(os.environ,env,clear=True),patch.object(module,'request') as request:
   with self.assertRaises(ValueError):module.run()
   request.assert_not_called()
if __name__=='__main__':unittest.main()
