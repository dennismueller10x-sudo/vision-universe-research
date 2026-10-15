"""Explicit controlled test only. Personal data stays in runner memory, never logs/artifacts."""
import base64,gzip,hashlib,io,json,os,time,urllib.parse,urllib.request,urllib.error
from datetime import datetime,timezone
from pathlib import Path
from newsletter_mail import mail_source
ORIGIN='https://feat-brevo-app-waitlist-doi.vision-universe.pages.dev';API='https://api.brevo.com/v3'
ACCEPTED_RUNTIME_SHA='7cdd63206784fad68e7e021ecf3f238e00a4110a985e8c172d0d9db549972173'

def confirmed_owner_from_payload():
    encoded=os.environ.get('BREVO_IMPORT_PAYLOAD','').strip()
    if hashlib.sha256(encoded.encode()).hexdigest()!='484d81a155374aa286207953fdf0b5bf56e5708b909eb626a542637f4c0b8319':raise ValueError('Private owner handover mismatch')
    with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(encoded,validate=True))) as stream:value=json.loads(stream.read(1048577))
    rows=value.get('records')
    if not isinstance(rows,list) or len(rows)!=137:raise ValueError('Private owner shape')
    email=rows[111].get('email','').strip().lower()
    if not email or '@' not in email:raise ValueError('Private owner missing')
    return email

def utc_time(value):
    stamp=datetime.fromisoformat(value.replace('Z','+00:00'))
    if stamp.tzinfo is None:raise ValueError('Provider timezone missing')
    return stamp.astimezone(timezone.utc)

def verify_confirmed_owner(contact,email,events):
    # Resume only the one genuinely new owner DOI accepted by the real form on
    # 15 October. Never make an imported customer eligible for this send path.
    start=utc_time('2026-10-15T17:54:37Z');request_end=utc_time('2026-10-15T17:57:00Z');confirmed_end=utc_time('2026-10-15T18:27:00Z')
    rows=[e for e in events if e.get('email','').strip().lower()==email]
    messages={e.get('messageId') for e in rows if e.get('messageId')}
    requests=[e for e in rows if e.get('event') in ('request','requests')]
    if len(messages)!=1 or not requests or any(not start<=utc_time(e.get('date',''))<=request_end for e in requests):raise ValueError('Actual initial DOI request not verified')
    # Confirmed list membership plus the DOI-only consent marker prove the
    # confirmation; optional individual click tracking is not a prerequisite.
    if type(contact.get('id')) is not int or contact.get('email','').strip().lower()!=email or set(contact.get('listIds',[]))!={4} or contact.get('emailBlacklisted') is not False or contact.get('attributes',{}).get('VU_EMAIL_CONSENT')!='subscribed':raise ValueError('Controlled confirmation mismatch')
    if not start<=utc_time(contact.get('createdAt',''))<=confirmed_end:raise ValueError('Only the newly created owner contact')

def owner_wait_seconds():
    until=os.environ.get('NEWSLETTER_OBSERVE_UNTIL','')
    if not until:return 600
    if not until.isdigit() or not time.time()*1000<int(until)<=time.time()*1000+7200000:
        raise ValueError('Invalid private observation deadline')
    return (int(until)-time.time()*1000)/1000

def run():
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or os.environ.get('GITHUB_REF') not in ('refs/heads/feat/brevo-app-waitlist-doi','refs/heads/main') or os.environ.get('NEWSLETTER_AUTHORIZE_CONTROLLED_TEST')!='true':raise ValueError('Controlled test not authorized')
    resume=os.environ.get('NEWSLETTER_E2E_OPERATION')=='finish-test'
    observe=os.environ.get('NEWSLETTER_E2E_OPERATION') in ('observe','finish-test')
    if resume and os.environ.get('GITHUB_REF')!='refs/heads/main':raise ValueError('Acceptance continuation from main only')
    if resume and hashlib.sha256(Path(__file__).resolve().parents[1].joinpath('server/newsletter.mjs').read_bytes()).hexdigest()!=ACCEPTED_RUNTIME_SHA:raise ValueError('Actual DOI runtime changed; new full test required')
    owner_wait=owner_wait_seconds() if observe else 600
    origin='https://www.visionuniverse.de' if observe else ORIGIN
    email=confirmed_owner_from_payload() if resume else os.environ.get('BREVO_DOI_TEST_EMAIL','').strip().lower();key=os.environ.get('BREVO_API_KEY','')
    if not key or not observe and not email:raise ValueError('Private test address/key missing')
    def request(origin,path,method='GET',body=None):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*args,**kwargs):return None
        headers={'Accept':'application/json','User-Agent':'VisionUniverse-Brevo/1.0'}
        if origin==API:headers['api-key']=key
        else:headers['Origin']=origin
        if body is not None:headers['Content-Type']='application/json'
        req=urllib.request.Request(origin+path,headers=headers,method=method,data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.build_opener(NoRedirect).open(req,timeout=40) as response:
                raw=response.read();return response.status,json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:error.close();return error.code,{}
    def read(path):
        # Only GET reads may be retried. Never retry a mutation/send endpoint.
        for attempt in range(3):
            code,value=request(API,path)
            if code==200:return value
            print(json.dumps({'read_phase':'doi_events' if path.startswith('/smtp/statistics/events?') else 'required_private_read','http':code}),flush=True)
            if code!=429 or attempt==2:raise ValueError('Read unavailable')
            time.sleep(60)
    def mutation(path,method,body=None):
        code,value=request(API,path,method,body)
        if code not in (200,201,204):raise ValueError('Mutation outcome uncertain; never retry delivery')
        return value
    def records(n):
        result=[]
        for offset in range(0,10000,50):
            page=read('/contacts/lists/%d/contacts?limit=50&offset=%d'%(n,offset)).get('contacts',[]);result.extend(page)
            if len(page)<50:return sorted(result,key=lambda c:c['id'])
        raise ValueError('Pagination incomplete')
    before={n:records(n) for n in (4,5,6)};protected={c['id'] for rows in before.values() for c in rows}
    if observe and not resume:
        req=urllib.request.Request(origin+'/',headers={'User-Agent':'VisionUniverse-Brevo/1.0'})
        with urllib.request.build_opener().open(req,timeout=30) as response:
            page=response.read(200000).decode()
            if response.status!=200 or 'data-controlled="true"' not in page or 'data-ready="false"' not in page:raise ValueError('Controlled main-domain UI not deployed')
    def events():
        result=[]
        for offset in range(0,1000,100):
            report=read('/smtp/statistics/events?templateId=8&days=1&limit=100&offset='+str(offset))
            page=[] if report=={} else report.get('events')
            if not isinstance(page,list):raise ValueError('Event shape uncertain')
            result.extend(page)
            if len(page)<100:return result
        raise ValueError('Event pagination incomplete')
    baseline_events=events() if observe else []
    if observe:
        # Capture the complete original account privately, including contacts
        # outside lists 4/5/6. Only one genuinely new DOI recipient is accepted.
        originals=[]
        for offset in range(0,10000,50):
            page=read('/contacts?limit=50&offset='+str(offset)).get('contacts')
            if not isinstance(page,list):raise ValueError('Original inventory unavailable')
            originals.extend(page)
            if len(page)<50:break
        else:raise ValueError('Original inventory incomplete')
        original_emails={c.get('email','').strip().lower() for c in originals};protected.update(c['id'] for c in originals)
    else:
        contact_path='/contacts/'+urllib.parse.quote(email,safe='');code,_=request(API,contact_path)
        if code!=404:raise ValueError('Only a proven new controlled address')
    domain=read('/senders/domains/visionuniverse.de')
    senders=[s['id'] for s in read('/senders').get('senders',[]) if s.get('active') is True and s.get('email','').endswith('@visionuniverse.de')]
    if len(senders)!=1 or not domain.get('verified') or not domain.get('authenticated'):raise ValueError('Sender/domain unavailable')
    # Phase messages contain neither email nor personalized DOI/unsubscribe URL.
    if resume:
        contact_path='/contacts/'+urllib.parse.quote(email,safe='')
        code,c=request(API,contact_path)
        if code!=200:raise ValueError('Confirmed owner missing')
        verify_confirmed_owner(c,email,baseline_events)
        template=read('/smtp/templates/8')
        if template.get('id')!=8 or template.get('doiTemplate') is not True or template.get('isActive') is not True or template.get('tag')!='optin' or ''.join(template.get('htmlContent','').split())!=''.join(mail_source('newsletter-api-doi.html').split()):raise ValueError('Current DOI template differs from reviewed copy')
        if sum(v.get('id')==c['id'] and v.get('email','').strip().lower()==email for v in originals)!=1:raise ValueError('Private inventory ambiguous')
        protected.remove(c['id']);originals=[v for v in originals if v['id']!=c['id']]
        before={n:[v for v in rows if v['id']!=c['id']] for n,rows in before.items()}
        print(json.dumps({'actual_owner_doi_request_and_confirmation_verified':True,'new_confirmed_membership_verified':True,'doi_resend_calls':0}),flush=True)
    elif observe:
        print('Ready for private owner form submission on the main domain. Enter one new controlled address; wait for the pre-click check before using the DOI link.',flush=True)
        baseline_ids={(e.get('messageId'),e.get('event'),e.get('date'),e.get('email')) for e in baseline_events}
        deadline=time.monotonic()+owner_wait
        while time.monotonic()<deadline:
            fresh=[e for e in events() if (e.get('messageId'),e.get('event'),e.get('date'),e.get('email')) not in baseline_ids]
            addresses={e.get('email','').strip().lower() for e in fresh if e.get('email')}
            if len(addresses)>1:raise ValueError('Ambiguous test recipients')
            if addresses:
                email=next(iter(addresses))
                if email in original_emails:raise ValueError('Existing contact cannot be a test recipient')
                break
            time.sleep(60)
        else:raise ValueError('No private controlled submission observed')
        contact_path='/contacts/'+urllib.parse.quote(email,safe='')
    else:
        print('Controlled test: sending one DOI request to the private preview. Inbox receipt is not proven by API acceptance.',flush=True)
        code,_=request(origin,'/api/newsletter/subscribe','POST',{'email':email,'consent':True,'consentVersion':'vu-newsletter-v1','honeypot':''})
        if code!=202:raise ValueError('DOI request not accepted')
    if not resume:
        code,c=request(API,contact_path)
        if code==200 and 4 in c.get('listIds',[]):raise ValueError('List membership before confirmation')
        if code==200 and c.get('attributes',{}).get('VU_EMAIL_CONSENT')=='subscribed':raise ValueError('Campaign consent marker applied before confirmation')
        if code not in (200,404):raise ValueError('Pre-click state uncertain')
    if not observe:
        code,_=request(origin,'/api/newsletter/subscribe','POST',{'email':email,'consent':True,'consentVersion':'vu-newsletter-v1','honeypot':''})
        if code!=202:raise ValueError('Pre-click repeat not protected')
    if not resume:print('Private inbox step: verify the German DOI content and click its confirmation button. Waiting for provider membership.',flush=True)
    deadline=time.monotonic()+600;contact=None
    while time.monotonic()<deadline:
        code,c=request(API,contact_path)
        if code==200 and 4 in c.get('listIds',[]):contact=c;break
        if code not in (200,404):raise ValueError('Provider state uncertain')
        time.sleep(10)
    if contact is None or contact['id'] in protected or contact.get('email','').lower()!=email or contact.get('emailBlacklisted') is True or contact.get('attributes',{}).get('VU_EMAIL_CONSENT')!='subscribed':raise ValueError('New DOI membership and explicit consent not verified')
    if [c['id'] for c in records(4)].count(contact['id'])!=1:raise ValueError('Membership not unique')
    if not observe:
        code,_=request(origin,'/api/newsletter/subscribe','POST',{'email':email,'consent':True,'consentVersion':'vu-newsletter-v1','honeypot':''})
        if code!=202:raise ValueError('Repeat not safely accepted')
    # A real marketing unsubscribe link requires recipient context. SMTP block
    # links or sendTest preview links cannot prove marketing suppression.
    run_id=os.environ.get('GITHUB_RUN_ID','')
    if not run_id.isdigit():raise ValueError('Run identity unavailable')
    name='VU | DOI-Abnahme | Betreiber Oktober 2026' if resume else 'VU | DOI-Abnahme | '+run_id
    if resume:
        # Stable purpose identity prevents a second delivery after an uncertain
        # send or runner failure. There is no delivery retry operation.
        for offset in range(0,10000,50):
            lists=read('/contacts/lists?limit=50&offset='+str(offset)).get('lists')
            if not isinstance(lists,list):raise ValueError('Prior test list inventory unavailable')
            if any(v.get('name')==name for v in lists):raise ValueError('Prior owner test list exists; inspect before continuation')
            if len(lists)<50:break
        else:raise ValueError('Test list inventory incomplete')
        for offset in range(0,10000,50):
            campaigns=read('/emailCampaigns?type=classic&limit=50&offset='+str(offset)).get('campaigns')
            if not isinstance(campaigns,list):raise ValueError('Prior test campaign inventory unavailable')
            if any(v.get('name')==name for v in campaigns):raise ValueError('Prior owner acceptance exists; never resend')
            if len(campaigns)<50:break
        else:raise ValueError('Test campaign inventory incomplete')
    folders=read('/contacts/lists/4').get('folderId')
    if type(folders) is not int:raise ValueError('Existing folder missing')
    test_list=mutation('/contacts/lists','POST',{'name':name,'folderId':folders}).get('id')
    if type(test_list) is not int or test_list in (4,5,6):raise ValueError('Unsafe test list')
    mutation('/contacts/lists/'+str(test_list)+'/contacts/add','POST',{'ids':[contact['id']]})
    rows=records(test_list)
    if len(rows)!=1 or rows[0]['id']!=contact['id'] or rows[0]['id'] in protected:raise ValueError('Unsafe test recipients')
    html=mail_source('newsletter-test-confirmed.html')
    if '{{ unsubscribe }}' not in html:raise ValueError('Native unsubscribe link missing')
    campaign=mutation('/emailCampaigns','POST',{'name':name,'type':'classic','sender':{'id':senders[0]},'subject':'Deine Testanmeldung ist bestätigt – kontrollierter Abmeldetest','htmlContent':html,'recipients':{'listIds':[test_list]},'inlineImageActivation':False}).get('id')
    if type(campaign) is not int:raise ValueError('Test campaign not created')
    draft=read('/emailCampaigns/'+str(campaign));recipients=draft.get('recipients',{})
    includes=recipients.get('listIds',recipients.get('lists',[]))
    ids=[x.get('id') if isinstance(x,dict) else x for x in includes]
    if draft.get('name')!=name or draft.get('status')!='draft' or draft.get('scheduledAt') or ids!=[test_list] or draft.get('sender',{}).get('id')!=senders[0] or ''.join(draft.get('htmlContent','').split())!=''.join(html.split()):raise ValueError('Test draft changed')
    rows=records(test_list)
    if len(rows)!=1 or rows[0]['id']!=contact['id'] or rows[0]['id'] in protected:raise ValueError('Recipients changed')
    print('One administrative confirmation for the new test contact only; no regular newsletter, main-list or internal-test-list delivery.',flush=True)
    mutation('/emailCampaigns/'+str(campaign)+'/sendNow','POST')
    print('Private inbox step: verify this confirmation and use its native Brevo unsubscribe link. Waiting for marketing suppression.',flush=True)
    deadline=time.monotonic()+600;withdrawn=False
    while time.monotonic()<deadline:
        c=read(contact_path)
        if c.get('emailBlacklisted') is True:withdrawn=True;break
        time.sleep(10)
    if not withdrawn:raise ValueError('Marketing unsubscribe not verified')
    if not observe:
        code,_=request(origin,'/api/newsletter/subscribe','POST',{'email':email,'consent':True,'consentVersion':'vu-newsletter-v1','honeypot':''})
        if code not in (202,429):raise ValueError('Unsubscribe repeat failed')
    if read(contact_path).get('emailBlacklisted') is not True:raise ValueError('Unsubscribe not protected')
    if observe:
        messages={e.get('messageId') for e in events() if e.get('email','').strip().lower()==email and e.get('messageId')}
        if len(messages)!=1:raise ValueError('Single DOI delivery not proven')
    after={n:[c for c in records(n) if c['id']!=contact['id']] for n in before}
    if before!=after:raise ValueError('Protected contact objects changed')
    if resume:
        after_originals=[]
        for offset in range(0,10000,50):
            rows=read('/contacts?limit=50&offset='+str(offset)).get('contacts')
            if not isinstance(rows,list):raise ValueError('Final inventory unavailable')
            after_originals.extend(v for v in rows if v.get('id')!=contact['id'])
            if len(rows)<50:break
        else:raise ValueError('Final inventory incomplete')
        if sorted(originals,key=lambda v:v['id'])!=sorted(after_originals,key=lambda v:v['id']):raise ValueError('Original account contacts changed')
    own=read('/contacts/lists/'+str(test_list));rows=records(test_list)
    if own.get('name')==name and len(rows)==1 and rows[0]['id']==contact['id']:
        mutation('/contacts/lists/'+str(test_list),'DELETE')
    print(json.dumps({'new_membership_unique':True,'marketing_unsubscribe_verified':True,'protected_contact_objects_unchanged':True,'main_list_delivery':False,'inbox_receipt_requires_private_operator_confirmation':True,'test_campaign_id':campaign}))

if __name__=='__main__':
    try:run()
    except Exception as error:
        safe=('Controlled main-domain UI not deployed','Event shape uncertain','Original inventory unavailable','Sender/domain unavailable','Read unavailable','Actual initial DOI request not verified','Controlled confirmation mismatch','Only the newly created owner contact','Prior owner acceptance exists; never resend','Actual DOI runtime changed; new full test required','Private owner handover mismatch','Provider timezone missing')
        if isinstance(error,ValueError) and str(error) in safe:print(json.dumps({'safe_failure':str(error)}))
        print('Controlled test blocked or incomplete. No personalized data emitted; never blindly retry a delivery.');raise SystemExit(1) from None
