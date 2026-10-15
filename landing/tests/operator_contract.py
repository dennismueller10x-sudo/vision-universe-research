"""Synthetic operator contract; never opens a network connection or sends mail."""
import base64,contextlib,hashlib,importlib.util,io,json,os,sys,unittest,urllib.parse
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from newsletter_mail import mail_source
spec=importlib.util.spec_from_file_location('operator',Path(__file__).resolve().parents[1]/'scripts/newsletter-e2e.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)
admin_spec=importlib.util.spec_from_file_location('admin',Path(__file__).resolve().parents[1]/'scripts/newsletter-server-admin.py')
admin=importlib.util.module_from_spec(admin_spec);admin_spec.loader.exec_module(admin)

class Response:
    def __init__(self,status,value):self.status=status;self.value=value
    def read(self,*args):return self.value.encode() if isinstance(self.value,str) else json.dumps(self.value).encode()
    def __enter__(self):return self
    def __exit__(self,*args):pass

class Provider:
    def __init__(self,existing=False,bad_draft=False,observe=False,ambiguous=False,empty_baseline=False,resume=False,prior_campaign=False):
        self.calls=[];self.existing=existing;self.bad_draft=bad_draft;self.doi=0;self.lookups=0;self.sent=False;self.draft=None
        self.resume=resume;self.prior_campaign=prior_campaign;self.observe=observe or resume;self.ambiguous=ambiguous;self.event_reads=0
        self.empty_baseline=empty_baseline
        self.old={'id':1,'email':'old@example.test','listIds':[4],'emailBlacklisted':False}
        self.new={'id':2,'email':'new@example.test','listIds':[4],'emailBlacklisted':False,'attributes':{'VU_EMAIL_CONSENT':'subscribed'},'createdAt':'2026-10-15T18:18:00Z'}
    def open(self,request,**kwargs):
        path=urllib.parse.urlsplit(request.full_url).path.removeprefix('/v3');method=request.get_method()
        body=json.loads(request.data) if request.data else None;self.calls.append((path,method,body))
        if path=='/':return Response(200,'<form data-controlled="true" data-ready="false"></form>')
        if path=='/api/newsletter/subscribe':self.doi+=1;return Response(202,{})
        if path=='/contacts/new%40example.test':
            self.lookups+=1
            if self.resume:return Response(200,{**self.new,'emailBlacklisted':self.sent or self.new['emailBlacklisted']})
            if self.existing:return Response(200,self.old)
            if not self.doi or self.lookups==(1 if self.observe else 2):
                raise operator.urllib.error.HTTPError(request.full_url,404,'Not found',{},io.BytesIO())
            return Response(200,{**self.new,'emailBlacklisted':self.sent})
        if path=='/contacts':return Response(200,{'contacts':[self.old]+([{**self.new,'emailBlacklisted':self.sent}] if self.resume else [])})
        if path=='/smtp/statistics/events':
            self.event_reads+=1
            if self.resume:
                base={'messageId':'synthetic-message-1','email':'new@example.test','date':'2026-10-15T17:55:00Z'}
                return Response(200,{'events':[{**base,'event':'requests'},{**base,'event':'click','date':'2026-10-15T18:18:00Z'}]})
            if self.event_reads==1:return Response(200,{} if self.empty_baseline else {'events':[]})
            self.doi=2
            rows=[{'messageId':'synthetic-message-1','email':'new@example.test','event':'request','date':'2026-10-14T12:00:00Z'}]
            if self.ambiguous:rows.append({**rows[0],'email':'other@example.test','messageId':'synthetic-message-2'})
            return Response(200,{'events':rows})
        if path=='/senders/domains/visionuniverse.de':return Response(200,{'verified':True,'authenticated':True})
        if path=='/senders':return Response(200,{'senders':[{'id':1,'active':True,'email':'info@visionuniverse.de'}]})
        if path=='/smtp/templates/8':return Response(200,{'id':8,'doiTemplate':True,'isActive':True,'tag':'optin','htmlContent':mail_source('newsletter-api-doi.html')})
        if path=='/contacts/lists' and method=='POST':return Response(201,{'id':7})
        if path=='/contacts/lists' and method=='GET':return Response(200,{'lists':[]})
        if path=='/contacts/lists/7/contacts/add':
            assert body=={'ids':[2]};return Response(201,{})
        if path.endswith('/contacts'):
            n=int(path.split('/')[-2]);rows=[self.old]+([self.new] if self.doi>=2 or self.resume else []) if n==4 else [self.new] if n==7 else []
            return Response(200,{'contacts':rows})
        if path=='/contacts/lists/4':return Response(200,{'folderId':1})
        if path=='/contacts/lists/7':return Response(200,{'name':'VU | DOI-Abnahme | Betreiber Oktober 2026' if self.resume else 'VU | DOI-Abnahme | 123'})
        if path=='/emailCampaigns':
            if method=='GET':return Response(200,{'campaigns':[{'name':'VU | DOI-Abnahme | Betreiber Oktober 2026'}] if self.prior_campaign else []})
            assert body['recipients']=={'listIds':[7]};self.draft={**body,'id':8,'status':'draft'};return Response(201,{'id':8})
        if path=='/emailCampaigns/8':return Response(200,{**self.draft,'recipients':{'listIds':[4]}} if self.bad_draft else self.draft)
        if path=='/emailCampaigns/8/sendNow':self.sent=True;return Response(204,{})
        raise AssertionError('Unexpected endpoint or mutation')

class MailContract(unittest.TestCase):
    def test_observer_wait_can_match_access_expiry_but_never_extend_it(self):
        with patch.object(operator.time,'time',return_value=1000):
            for until,expected in [('',600),('8200000',7200),('1060000',60)]:
                with patch.dict(os.environ,{'NEWSLETTER_OBSERVE_UNTIL':until}):self.assertEqual(operator.owner_wait_seconds(),expected)
            for until in ('999999','8200001','invalid'):
                with patch.dict(os.environ,{'NEWSLETTER_OBSERVE_UNTIL':until}):
                    with self.assertRaises(ValueError):operator.owner_wait_seconds()
    def test_shared_browser_navigation_never_becomes_mail_content(self):
        for name in ('newsletter-api-doi.html','newsletter-test-confirmed.html'):
            html=mail_source(name)
            self.assertNotIn('site-navigation',html)
            self.assertNotIn('<script',html.lower())
            self.assertNotIn('<vu-navigation',html)
        self.assertIn('{{ params.DOIurl }}',mail_source('newsletter-api-doi.html'))
        self.assertIn('{{ unsubscribe }}',mail_source('newsletter-test-confirmed.html'))
        with patch('newsletter_mail.Path.read_text',return_value='<html><script>unexpected</script></html>'):
            with self.assertRaises(ValueError):mail_source('newsletter-api-doi.html')
        with self.assertRaises(ValueError):mail_source('../other.html')

class Contract(unittest.TestCase):
    def run_operator(self,provider,authorized=True):
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/feat/brevo-app-waitlist-doi','NEWSLETTER_AUTHORIZE_CONTROLLED_TEST':'true' if authorized else 'false','BREVO_DOI_TEST_EMAIL':'new@example.test','BREVO_API_KEY':'synthetic','GITHUB_RUN_ID':'123'}
        if provider.observe:env.update({'NEWSLETTER_E2E_OPERATION':'finish-test' if provider.resume else 'observe','GITHUB_REF':'refs/heads/main','BREVO_DOI_TEST_EMAIL':''})
        with patch.dict(os.environ,env,clear=True),patch.object(operator,'confirmed_owner_from_payload',return_value='new@example.test'),patch.object(operator.urllib.request,'build_opener',return_value=provider),contextlib.redirect_stdout(io.StringIO()):operator.run()
    def test_no_authorization_opens_no_connection(self):
        p=Provider()
        with self.assertRaises(ValueError):self.run_operator(p,False)
        self.assertEqual(p.calls,[])
    def test_existing_contact_never_receives_doi_or_mutation(self):
        p=Provider(existing=True)
        with self.assertRaises(ValueError):self.run_operator(p)
        self.assertEqual(p.doi,0);self.assertTrue(all(m=='GET' for _,m,_ in p.calls))
    def test_changed_draft_target_stops_before_delivery(self):
        p=Provider(bad_draft=True)
        with self.assertRaises(ValueError):self.run_operator(p)
        self.assertFalse(p.sent)
        self.assertFalse(any(path.endswith('/sendNow') for path,_,_ in p.calls))
    def test_only_new_recipient_and_provider_unsubscribe(self):
        p=Provider();self.run_operator(p)
        self.assertTrue(p.sent)
        self.assertEqual(sum(path.endswith('/sendNow') for path,_,_ in p.calls),1)
        self.assertEqual([path for path,m,_ in p.calls if m=='DELETE'],['/contacts/lists/7'])
        self.assertFalse(any(m=='PUT' for _,m,_ in p.calls))
    def test_owner_form_observer_does_not_submit_address_itself(self):
        p=Provider(observe=True);self.run_operator(p)
        self.assertTrue(p.sent);self.assertFalse(any(path=='/api/newsletter/subscribe' for path,_,_ in p.calls))
    def test_documented_empty_event_baseline_allows_private_observation(self):
        p=Provider(observe=True,empty_baseline=True);self.run_operator(p)
        self.assertTrue(p.sent);self.assertFalse(any(path=='/api/newsletter/subscribe' for path,_,_ in p.calls))
    def test_rate_limited_reads_back_off_without_repeating_delivery(self):
        p=Provider(observe=True);original=p.open;attempts=0
        def limited(request,**kwargs):
            nonlocal attempts
            if '/smtp/statistics/events?' in request.full_url and attempts<2:
                attempts+=1
                raise operator.urllib.error.HTTPError(request.full_url,429,'Rate limited',{},io.BytesIO())
            return original(request,**kwargs)
        p.open=limited
        with patch.object(operator.time,'sleep') as pause:self.run_operator(p)
        self.assertEqual(attempts,2);self.assertEqual([c.args[0] for c in pause.call_args_list],[60,60])
        self.assertEqual(sum(path.endswith('/sendNow') for path,_,_ in p.calls),1)
    def test_persistent_read_limit_stops_before_mutations(self):
        p=Provider(observe=True);original=p.open
        def limited(request,**kwargs):
            if '/smtp/statistics/events?' in request.full_url:raise operator.urllib.error.HTTPError(request.full_url,429,'Rate limited',{},io.BytesIO())
            return original(request,**kwargs)
        p.open=limited
        with patch.object(operator.time,'sleep') as pause:
            with self.assertRaises(ValueError):self.run_operator(p)
        self.assertEqual(pause.call_count,2);self.assertTrue(all(m=='GET' for _,m,_ in p.calls))
    def test_ambiguous_observed_addresses_block_all_mutations(self):
        p=Provider(observe=True,ambiguous=True)
        with self.assertRaises(ValueError):self.run_operator(p)
        self.assertTrue(all(m=='GET' for _,m,_ in p.calls))
    def test_confirmed_owner_continues_only_unsubscribe_without_doi_or_contact_mutations(self):
        p=Provider(resume=True);self.run_operator(p)
        self.assertTrue(p.sent)
        self.assertEqual(sum(path.endswith('/sendNow') for path,_,_ in p.calls),1)
        self.assertFalse(any(path=='/api/newsletter/subscribe' or 'doubleOptinConfirmation' in path for path,_,_ in p.calls))
        self.assertFalse(any(method=='PUT' for _,method,_ in p.calls))
    def test_confirmed_owner_rejects_historical_import_and_other_lists_before_any_write(self):
        for changes in ({'createdAt':'2026-10-10T12:00:00Z'},{'listIds':[4,5]},{'emailBlacklisted':True},{'attributes':{'VU_EMAIL_CONSENT':'unknown'}}):
            p=Provider(resume=True);p.new.update(changes)
            with self.assertRaises(ValueError):self.run_operator(p)
            self.assertTrue(all(method=='GET' for _,method,_ in p.calls))
    def test_existing_owner_test_campaign_blocks_repeat_delivery(self):
        p=Provider(resume=True,prior_campaign=True)
        with self.assertRaises(ValueError):self.run_operator(p)
        self.assertTrue(all(method=='GET' for _,method,_ in p.calls))
    def test_changed_doi_runtime_blocks_continuation(self):
        p=Provider(resume=True)
        with patch.object(operator,'ACCEPTED_RUNTIME_SHA','f'*64):
            with self.assertRaises(ValueError):self.run_operator(p)
        self.assertEqual(p.calls,[])
    def test_continuation_requires_real_unique_initial_request_and_confirmed_profile(self):
        p=Provider(resume=True);email=p.new['email'];base={'email':email,'messageId':'one','event':'requests','date':'2026-10-15T17:55:00Z'}
        for rows in ([],[{**base,'date':'2026-10-10T12:00:00Z'},{**base,'event':'click'}],[base,{**base,'event':'click','messageId':'two'}]):
            with self.assertRaises(ValueError):operator.verify_confirmed_owner(p.new,email,rows)
        operator.verify_confirmed_owner(p.new,email,[base])
    def test_private_owner_payload_never_falls_back_to_another_address(self):
        with patch.dict(os.environ,{'BREVO_IMPORT_PAYLOAD':'wrong'},clear=True):
            with self.assertRaises(ValueError):operator.confirmed_owner_from_payload()

class ReleaseContract(unittest.TestCase):
    def test_copy_update_can_only_put_the_owned_template_and_exact_reviewed_html(self):
        html=mail_source('newsletter-api-doi.html')
        class Opener:
            def open(self,req,**kwargs):return Response(204,{})
        with patch.object(admin.urllib.request,'build_opener',return_value=Opener()) as request:
            self.assertEqual(admin.api(admin.BREVO,'/smtp/templates/8','synthetic','PUT',{'htmlContent':html})[0],204)
            request.reset_mock()
            for path,body in [('/smtp/templates/4',{'htmlContent':html}),('/smtp/templates/8',{'htmlContent':'other'}),('/smtp/templates/8',{'htmlContent':html,'sender':{'id':2}}),('/contacts/123',{'emailBlacklisted':False})]:
                with self.assertRaises(ValueError):admin.api(admin.BREVO,path,'synthetic','PUT',body)
            request.assert_not_called()
        legacy=html.replace('über den Abmeldelink in jedem späteren','über den Brevo-Abmeldelink in jedem späteren')
        self.assertEqual(hashlib.sha256(''.join(legacy.split()).encode()).hexdigest(),admin.PREVIOUS_COPY_SHA)
    def test_provider_errors_never_return_personalized_message_or_key(self):
        for message in ('Failure for synthetic-person@example.invalid', 'SYNTHETIC_PRIVATE_API_KEY'):
            class Opener:
                def open(self,req,**kwargs):
                    raise admin.urllib.error.HTTPError(req.full_url,400,'Bad Request',{},io.BytesIO(json.dumps({'code':'document_not_found','message':message}).encode()))
            with patch.object(admin.urllib.request,'build_opener',return_value=Opener()):
                status,result=admin.api(admin.BREVO,'/webhooks?type=marketing&sort=desc','SYNTHETIC_PRIVATE_API_KEY')
            self.assertEqual(status,400)
            self.assertEqual(result['brevo_code'],'document_not_found')
            self.assertIsNone(result['safe_webhook_message'])
            self.assertNotIn(message,json.dumps(result))
    def setUp(self):
        self.file=Path(__file__).resolve().parent/'output/operator-policy.html';self.file.parent.mkdir(parents=True,exist_ok=True)
        self.file.write_text('<html lang="de" data-policy-status="approved">Synthetic policy</html>')
        self.digest=hashlib.sha256(self.file.read_bytes()).hexdigest()
    def check(self,operation,env):
        with patch.dict(os.environ,env,clear=True),patch.object(admin,'POLICY','tests/output/operator-policy.html'),patch.object(admin.time,'time',return_value=1000):return admin.release_prerequisites(operation)
    def test_exact_privacy_and_time_limited_access_required(self):
        env={'NEWSLETTER_OPERATOR_PRIVACY_SHA256':self.digest,'NEWSLETTER_OPERATOR_TEST_HASH':'f'*64,'NEWSLETTER_OPERATOR_TEST_UNTIL':'8200000'}
        self.assertEqual(self.check('controlled',env)['privacy_document_sha256'],self.digest)
        for changes in [{'NEWSLETTER_OPERATOR_PRIVACY_SHA256':'a'*64},{'NEWSLETTER_OPERATOR_TEST_UNTIL':'8200001'},{'NEWSLETTER_OPERATOR_TEST_UNTIL':'999999'},{'NEWSLETTER_OPERATOR_TEST_HASH':'bad'}]:
            with self.assertRaises(ValueError):self.check('controlled',{**env,**changes})
        self.file.write_text('<html data-policy-status="draft">Synthetic policy</html>')
        with self.assertRaises(ValueError):self.check('controlled',{**env,'NEWSLETTER_OPERATOR_PRIVACY_SHA256':hashlib.sha256(self.file.read_bytes()).hexdigest()})
    def test_public_mode_requires_actual_observer_step_and_private_inbox_confirmation(self):
        env={'NEWSLETTER_OPERATOR_PRIVACY_SHA256':self.digest,'NEWSLETTER_OPERATOR_TEST_RUN_ID':'123','NEWSLETTER_OPERATOR_INBOX_VERIFIED':'true','GH_TOKEN':'synthetic'}
        for step_name,inbox,source,valid in [('Observe owner signup and verify Brevo unsubscribe','true','f'*40,True),('Finish verified owner confirmation and native unsubscribe','true','f'*40,True),('Private audit or closed setup','true','f'*40,False),('Observe owner signup and verify Brevo unsubscribe','false','f'*40,False),('Observe owner signup and verify Brevo unsubscribe','true','a'*40,False)]:
            def github(req,**kwargs):
                path=urllib.parse.urlsplit(req.full_url).path
                if path.endswith('/jobs'):return Response(200,{'jobs':[{'conclusion':'success','steps':[{'name':step_name,'conclusion':'success'}]}]})
                if '/contents/' in path:return Response(200,{'content':base64.b64encode(('ref: '+source).encode()).decode()})
                return Response(200,{'event':'workflow_dispatch','conclusion':'success','head_branch':'main','path':'.github/workflows/landing-cloudflare-prepare.yml','head_sha':'b'*40})
            class Opener:
                def open(self,req,**kwargs):return github(req,**kwargs)
            with patch.object(admin.urllib.request,'build_opener',return_value=Opener()),patch.object(admin.subprocess,'check_output',return_value='f'*40):
                if valid:self.assertEqual(self.check('public',{**env,'NEWSLETTER_OPERATOR_INBOX_VERIFIED':inbox})['verified_test_run_id'],123)
                else:
                    with self.assertRaises(ValueError):self.check('public',{**env,'NEWSLETTER_OPERATOR_INBOX_VERIFIED':inbox})
    def test_controlled_privacy_scope_cannot_be_promoted_to_public(self):
        self.file.write_text('<html lang="de" data-policy-status="approved" data-newsletter-release-scope="controlled">Synthetic policy</html>')
        env={'NEWSLETTER_OPERATOR_PRIVACY_SHA256':hashlib.sha256(self.file.read_bytes()).hexdigest(),'NEWSLETTER_OPERATOR_TEST_HASH':'f'*64,'NEWSLETTER_OPERATOR_TEST_UNTIL':'8200000','NEWSLETTER_OPERATOR_TEST_RUN_ID':'123','NEWSLETTER_OPERATOR_INBOX_VERIFIED':'true'}
        self.assertIn('privacy_document_sha256',self.check('controlled',env))
        with self.assertRaisesRegex(ValueError,'limited to controlled test'):self.check('public',env)
    def test_deployment_retry_waits_until_actual_deploy_finishes(self):
        self.assertFalse(admin.deployment_finished({'latest_stage':{'name':'build','status':'success'}}))
        self.assertFalse(admin.deployment_finished({'latest_stage':{'name':'deploy','status':'active'}}))
        self.assertTrue(admin.deployment_finished({'latest_stage':{'name':'deploy','status':'success'}}))
        self.assertTrue(admin.deployment_finished({'latest_stage':{'name':'build','status':'failure'}}))

if __name__=='__main__':unittest.main()
