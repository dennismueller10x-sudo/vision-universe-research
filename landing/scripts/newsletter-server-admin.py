"""Isolated manual operator. No send, contact-write, WAF, DNS or billing endpoint."""
import json,os,re,secrets,urllib.error,urllib.request,urllib.parse
from pathlib import Path
BREVO='https://api.brevo.com/v3';CF='https://api.cloudflare.com/client/v4'
NAME='VU | Newsletter | DE | API Double Opt In | v1';TAG='vu-newsletter-api-doi-v1'
SUBJECT='Bestätige deine Anmeldung zum Vision-Universe-Newsletter'
RUNTIME=('BREVO_API_KEY','NEWSLETTER_RATE_KEY','NEWSLETTER_DOI_TEMPLATE_ID','NEWSLETTER_STAGE','NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED','NEWSLETTER_TEST_EMAIL','NEWSLETTER_TEST_MODE','NEWSLETTER_FORM_MODE')

def api(origin,path,key,method='GET',body=None):
    if method!='GET' and not (origin==BREVO and method=='POST' and path=='/smtp/templates' or origin==CF and method=='PATCH' and re.fullmatch(r'/accounts/[a-f0-9]{32}/pages/projects/vision-universe',path)):
        raise ValueError('Unapproved mutation')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    headers={'Accept':'application/json','User-Agent':'VisionUniverse-Brevo/1.0'}
    headers['api-key' if origin==BREVO else 'Authorization']=key if origin==BREVO else 'Bearer '+key
    if body is not None:headers['Content-Type']='application/json'
    request=urllib.request.Request(origin+path,method=method,headers=headers,data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response:
            raw=response.read();return response.status,json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        try:value=json.loads(error.read(65536))
        except Exception:value={}
        return error.code,{'safe_codes':[e['code'] for e in value.get('errors',[]) if type(e.get('code')) is int]}

def run():
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or os.environ.get('GITHUB_REF')!='refs/heads/feat/brevo-app-waitlist-doi':raise ValueError('Manual isolated branch only')
    operation=os.environ.get('NEWSLETTER_OPERATOR_OPERATION','audit')
    if operation not in ('audit','setup'):raise ValueError('Unknown mode')
    key=os.environ.get('BREVO_API_KEY','')
    report={'operation':operation,'emails_sent':0,'contact_write_calls':0,'brevo_secret_present':bool(key)}
    def read(path):
        status,value=api(BREVO,path,key)
        if status!=200:raise ValueError('Brevo read blocked')
        return value
    def contacts(n):
        result=[]
        for offset in range(0,10000,50):
            page=read('/contacts/lists/%d/contacts?limit=50&offset=%d'%(n,offset)).get('contacts',[])
            result.extend(page)
            if len(page)<50:return sorted(result,key=lambda c:c['id'])
        raise ValueError('Contact pagination incomplete')
    before={n:contacts(n) for n in (4,5,6)};old={n:read('/smtp/templates/'+str(n)) for n in (1,2,3,4)}
    report['free_plan']=any(p.get('type')=='free' for p in read('/account').get('plan',[]))
    report['lists_before']={str(n):len(v) for n,v in before.items()}
    report['native_template_4_uses_form_link']='{{ doubleoptin }}' in old[4].get('htmlContent','')
    domain=read('/senders/domains/visionuniverse.de');report['domain_flags']={n:domain.get(n) is True for n in ('verified','authenticated')}
    sender=[s['id'] for s in read('/senders').get('senders',[]) if s.get('active') is True and s.get('email','').endswith('@visionuniverse.de')];report['sender_ids']=sender
    blocked=read('/smtp/blockedContacts?limit=1&offset=0');report['smtp_suppression_readable']=isinstance(blocked.get('contacts'),list)
    report['smtp_suppression_count']=blocked.get('count') if type(blocked.get('count')) is int else None
    daily=read('/smtp/statistics/aggregatedReport?days=1&tag='+TAG);report['tag_budget_readable']=type(daily.get('requests')) is int
    test_email=os.environ.get('BREVO_DOI_TEST_EMAIL','').strip().lower();report['controlled_test_address_present']=bool(test_email)
    if test_email:
        if not re.fullmatch(r'[^\s@]{1,64}@[^\s@]+\.[^\s@]+',test_email) or len(test_email)>254:raise ValueError('Test address malformed')
        status,_=api(BREVO,'/contacts/'+urllib.parse.quote(test_email,safe=''),key)
        report['controlled_test_address_new']=status==404
        if operation=='setup' and status!=404:raise ValueError('Controlled test address not proven new')
    templates=[]
    for offset in range(0,10000,50):
        page=read('/smtp/templates?limit=50&offset='+str(offset)).get('templates',[]);templates.extend(page)
        if len(page)<50:break
    else:raise ValueError('Template pagination incomplete')
    matches=[t for t in templates if t.get('name')==NAME]
    if len(matches)>1:raise ValueError('Duplicate API DOI template')
    html=Path(__file__).resolve().parents[1].joinpath('mail/newsletter-api-doi.html').read_text()
    if '{{ params.DOIurl }}' not in html or '{{ doubleoptin }}' in html:raise ValueError('Wrong API template link')
    if operation=='setup' and not matches:
        if not report['free_plan'] or len(sender)!=1 or not all(report['domain_flags'].values()) or not report['smtp_suppression_readable'] or not report['tag_budget_readable']:raise ValueError('Brevo setup prerequisites')
        status,value=api(BREVO,'/smtp/templates',key,'POST',{'templateName':NAME,'subject':SUBJECT,'sender':{'id':sender[0],'name':'Vision Universe'},'htmlContent':html,'isActive':True,'tag':TAG})
        if status not in (200,201) or type(value.get('id')) is not int:raise ValueError('Template creation failed')
        matches=[{'id':value['id']}]
    report['api_template_ids']=[t['id'] for t in matches]
    if matches:
        t=read('/smtp/templates/'+str(matches[0]['id']))
        check={'active':t.get('isActive') is True,'api_link':'{{ params.DOIurl }}' in t.get('htmlContent',''),
               'source_match_normalized':''.join(t.get('htmlContent','').split())==''.join(html.split()),
               'tag_matches':t.get('tag')==TAG,'subject_matches':t.get('subject')==SUBJECT}
        report['api_template_readback']=check
        if not all(check.values()) or matches[0]['id']<=4:raise ValueError('API template mismatch; no overwrite')
    account_id=os.environ.get('CLOUDFLARE_ACCOUNT_ID','')
    if not re.fullmatch(r'[a-f0-9]{32}',account_id):
        match=re.fullmatch(r'https://([a-f0-9]{32})\.r2\.cloudflarestorage\.com/?',os.environ.get('VU_HISTORY_S3_ENDPOINT',''));account_id=match[1] if match else ''
    report['cloudflare_account_available']=bool(account_id);report['cloudflare']={};selected=None
    for name in ('LANDING_CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_TOKEN','BREVO_CLOUDFLARE_DNS_TOKEN'):
        token=os.environ.get(name,'');result={'secret_present':bool(token)};report['cloudflare'][name]=result
        if not token or not account_id:continue
        path='/accounts/'+account_id+'/pages/projects/vision-universe'
        status,value=api(CF,path,token);result['pages_read_http']=status
        if status==200 and value.get('success'):
            project=value['result'];result['existing_project_matches']=project.get('name')=='vision-universe'
            result['runtime_types']={stage:{n:c.get('env_vars',{}).get(n,{}).get('type') for n in RUNTIME} for stage,c in project.get('deployment_configs',{}).items()}
            result['public_gates_closed']=all(c.get('env_vars',{}).get(n,{}).get('value')=='false' for c in project.get('deployment_configs',{}).values() for n in ('NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED'))
            result['template_bindings_match']=bool(matches) and all(c.get('env_vars',{}).get('NEWSLETTER_DOI_TEMPLATE_ID',{}).get('value')==str(matches[0]['id']) for c in project.get('deployment_configs',{}).values())
            if selected is None and name!='BREVO_CLOUDFLARE_DNS_TOKEN':selected=(name,token,path,project)
        status,zones=api(CF,'/zones?name=visionuniverse.de',token);result['zone_read_http']=status
        if status==200 and zones.get('success'):
            zone=[z for z in zones.get('result',[]) if z.get('name')=='visionuniverse.de'];result['zone_matches']=len(zone)
            if len(zone)==1:
                status,value=api(CF,'/zones/'+zone[0]['id']+'/rulesets/phases/http_ratelimit/entrypoint',token);result['rate_rules_read_http']=status;result['rate_rules_error_codes']=value.get('safe_codes',[])
                if status==200 and value.get('success'):result['rate_rule_count']=len(value['result'].get('rules',[]))
    if operation=='setup':
        if selected is None or not matches:raise ValueError('Pages setup unavailable')
        name,token,path,project=selected;configs=project.get('deployment_configs',{})
        if project.get('name')!='vision-universe' or set(configs)!={'preview','production'}:raise ValueError('Unexpected project')
        changed={};salt=secrets.token_hex(32)
        for stage,config in configs.items():
            variables=config.get('env_vars',{});env={}
            for n,v in [('BREVO_API_KEY',key),('NEWSLETTER_RATE_KEY',salt)]:
                if n in variables and variables[n].get('type')!='secret_text':raise ValueError('Unsafe existing key binding')
                if n not in variables:env[n]={'type':'secret_text','value':v}
            plain={'NEWSLETTER_DOI_TEMPLATE_ID':str(matches[0]['id']),'NEWSLETTER_STAGE':stage,
                   'NEWSLETTER_PUBLIC_ENABLED':'false','NEWSLETTER_PRIVACY_APPROVED':'false','NEWSLETTER_E2E_VERIFIED':'false',
                   'NEWSLETTER_TEST_MODE':'true' if stage=='preview' and test_email else 'false',
                   'NEWSLETTER_FORM_MODE':'test' if stage=='preview' and test_email else 'closed'}
            env.update({n:{'type':'plain_text','value':v} for n,v in plain.items()})
            if stage=='preview' and test_email:env['NEWSLETTER_TEST_EMAIL']={'type':'secret_text','value':test_email}
            changed[stage]={'env_vars':env}
        status,value=api(CF,path,token,'PATCH',{'deployment_configs':changed});report['pages_setup_http']=status
        if status!=200 or value.get('success') is not True:raise ValueError('Pages setup failed')
        status,value=api(CF,path,token)
        if status!=200 or not value.get('success'):raise ValueError('Pages setup readback failed')
        after=value['result'];report['runtime_secret_types_verified']=all(after['deployment_configs'][s].get('env_vars',{}).get(n,{}).get('type')=='secret_text' for s in configs for n in ('BREVO_API_KEY','NEWSLETTER_RATE_KEY'))
        report['public_gates_closed']=all(after['deployment_configs'][s]['env_vars'][n].get('value')=='false' for s in configs for n in ('NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED'))
        report['other_project_configuration_unchanged']=all(after.get(n)==project.get(n) for n in ('name','source','build_config','production_branch','domains')) and all(
            all(after['deployment_configs'][s].get('env_vars',{}).get(n)==v for n,v in c.get('env_vars',{}).items() if n not in changed[s]['env_vars']) and
            {n:v for n,v in c.items() if n!='env_vars'}=={n:v for n,v in after['deployment_configs'][s].items() if n!='env_vars'} for s,c in configs.items())
        if not all(report[n] for n in ('runtime_secret_types_verified','public_gates_closed','other_project_configuration_unchanged')):raise ValueError('Pages readback mismatch')
    after={n:contacts(n) for n in before};old_after={n:read('/smtp/templates/'+str(n)) for n in old}
    report['protected_contact_objects_unchanged']=before==after;report['old_templates_unchanged']=old==old_after;report['lists_after']={str(n):len(v) for n,v in after.items()}
    if before!=after or old!=old_after:raise ValueError('Protected data changed externally')
    return report
if __name__=='__main__':
    try:print(json.dumps(run()))
    except Exception:print('Scoped operator blocked; no raw responses, keys or personal data emitted.');raise SystemExit(1) from None
