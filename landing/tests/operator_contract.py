"""Synthetic operator contract; never opens a network connection or sends mail."""
import contextlib,importlib.util,io,json,os,unittest,urllib.parse
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('operator',Path(__file__).resolve().parents[1]/'scripts/newsletter-e2e.py')
operator=importlib.util.module_from_spec(spec);spec.loader.exec_module(operator)

class Response:
    def __init__(self,status,value):self.status=status;self.value=value
    def read(self):return json.dumps(self.value).encode()
    def __enter__(self):return self
    def __exit__(self,*args):pass

class Provider:
    def __init__(self,existing=False,bad_draft=False):
        self.calls=[];self.existing=existing;self.bad_draft=bad_draft;self.doi=0;self.lookups=0;self.sent=False;self.draft=None
        self.old={'id':1,'email':'old@example.test','listIds':[4],'emailBlacklisted':False}
        self.new={'id':2,'email':'new@example.test','listIds':[4],'emailBlacklisted':False}
    def open(self,request,**kwargs):
        path=urllib.parse.urlsplit(request.full_url).path.removeprefix('/v3');method=request.get_method()
        body=json.loads(request.data) if request.data else None;self.calls.append((path,method,body))
        if path=='/api/newsletter/subscribe':self.doi+=1;return Response(202,{})
        if path=='/contacts/new%40example.test':
            self.lookups+=1
            if self.existing:return Response(200,self.old)
            if not self.doi or self.lookups==2:
                raise operator.urllib.error.HTTPError(request.full_url,404,'Not found',{},io.BytesIO())
            return Response(200,{**self.new,'emailBlacklisted':self.sent})
        if path=='/senders/domains/visionuniverse.de':return Response(200,{'verified':True,'authenticated':True})
        if path=='/senders':return Response(200,{'senders':[{'id':1,'active':True,'email':'info@visionuniverse.de'}]})
        if path=='/contacts/lists' and method=='POST':return Response(201,{'id':7})
        if path=='/contacts/lists/7/contacts/add':
            assert body=={'ids':[2]};return Response(201,{})
        if path.endswith('/contacts'):
            n=int(path.split('/')[-2]);rows=[self.old]+([self.new] if self.doi>=2 else []) if n==4 else [self.new] if n==7 else []
            return Response(200,{'contacts':rows})
        if path=='/contacts/lists/4':return Response(200,{'folderId':1})
        if path=='/contacts/lists/7':return Response(200,{'name':'VU | DOI-Abnahme | 123'})
        if path=='/emailCampaigns':
            assert body['recipients']=={'listIds':[7]};self.draft={**body,'id':8,'status':'draft'};return Response(201,{'id':8})
        if path=='/emailCampaigns/8':return Response(200,{**self.draft,'recipients':{'listIds':[4]}} if self.bad_draft else self.draft)
        if path=='/emailCampaigns/8/sendNow':self.sent=True;return Response(204,{})
        raise AssertionError('Unexpected endpoint or mutation')

class Contract(unittest.TestCase):
    def run_operator(self,provider,authorized=True):
        env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':'refs/heads/feat/brevo-app-waitlist-doi','NEWSLETTER_AUTHORIZE_CONTROLLED_TEST':'true' if authorized else 'false','BREVO_DOI_TEST_EMAIL':'new@example.test','BREVO_API_KEY':'synthetic','GITHUB_RUN_ID':'123'}
        with patch.dict(os.environ,env,clear=True),patch.object(operator.urllib.request,'build_opener',return_value=provider),contextlib.redirect_stdout(io.StringIO()):operator.run()
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

if __name__=='__main__':unittest.main()
