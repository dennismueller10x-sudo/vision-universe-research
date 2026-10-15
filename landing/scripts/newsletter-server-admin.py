"""Isolated manual operator. No send, contact-write, WAF, DNS or billing endpoint."""
import base64,hashlib,json,os,re,secrets,subprocess,time,urllib.error,urllib.request,urllib.parse
from pathlib import Path
from newsletter_mail import mail_source
BREVO='https://api.brevo.com/v3';CF='https://api.cloudflare.com/client/v4'
NAME='VU | Newsletter | DE | API Double Opt In | v1';TAG='optin'
LEGACY_TAG='vu-newsletter-api-doi-v1'
PREVIOUS_COPY_SHA='b9cb70ae3cb14cecaa608603c993110302671d480bca417616dae24ee39456c0'
SUBJECT='Bestätige deine Anmeldung zum Vision-Universe-Newsletter'
RUNTIME=('BREVO_API_KEY','NEWSLETTER_RATE_KEY','NEWSLETTER_DOI_TEMPLATE_ID','NEWSLETTER_STAGE','NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED','NEWSLETTER_TEST_EMAIL','NEWSLETTER_TEST_MODE','NEWSLETTER_FORM_MODE','NEWSLETTER_CONTROLLED_ENABLED','NEWSLETTER_TEST_ACCESS_HASH','NEWSLETTER_TEST_UNTIL')
POLICY='legal-drafts/newsletter-release-2026-10-14.html'

def deployment_finished(deployment):
    stage=deployment.get('latest_stage',{})
    return stage.get('status') in ('failure','canceled') or stage.get('name')=='deploy' and stage.get('status')=='success'

def release_prerequisites(operation):
    if operation not in ('controlled','public'):return {}
    policy=Path(__file__).resolve().parents[1].joinpath(POLICY).read_bytes()
    digest=hashlib.sha256(policy).hexdigest()
    if os.environ.get('NEWSLETTER_OPERATOR_PRIVACY_SHA256')!=digest or b'data-policy-status="approved"' not in policy or b'data-policy-status="draft"' in policy:raise ValueError('Specific approved privacy document required')
    if operation=='public' and b'data-newsletter-release-scope="controlled"' in policy:raise ValueError('Privacy approval limited to controlled test')
    proof={'privacy_document_sha256':digest}
    if operation=='controlled':
        test_hash=os.environ.get('NEWSLETTER_OPERATOR_TEST_HASH','');until=os.environ.get('NEWSLETTER_OPERATOR_TEST_UNTIL','')
        if not re.fullmatch('[a-f0-9]{64}',test_hash) or not until.isdigit() or not time.time()*1000<int(until)<=time.time()*1000+7200000:raise ValueError('Private access hash and at most two-hour window required')
    if operation=='public':
        run_id=os.environ.get('NEWSLETTER_OPERATOR_TEST_RUN_ID','')
        if not run_id.isdigit() or os.environ.get('NEWSLETTER_OPERATOR_INBOX_VERIFIED')!='true':raise ValueError('Real inbox acceptance missing')
        def github(path):
            req=urllib.request.Request('https://api.github.com/repos/dennismueller10x-sudo/vision-universe-research'+path,headers={'Authorization':'Bearer '+os.environ.get('GH_TOKEN',''),'Accept':'application/vnd.github+json','User-Agent':'VisionUniverse-Newsletter-Release/1.0'})
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self,*args,**kwargs):return None
            with urllib.request.build_opener(NoRedirect).open(req,timeout=30) as response:return json.loads(response.read())
        run=github('/actions/runs/'+run_id);jobs=github('/actions/runs/'+run_id+'/jobs')['jobs']
        if run.get('event')!='workflow_dispatch' or run.get('conclusion')!='success' or run.get('head_branch')!='main' or run.get('path')!='.github/workflows/landing-cloudflare-prepare.yml':raise ValueError('Wrong acceptance run')
        accepted_steps=('Observe owner signup and verify Brevo unsubscribe','Finish verified owner confirmation and native unsubscribe')
        if not any(j.get('conclusion')=='success' and any(s.get('name') in accepted_steps and s.get('conclusion')=='success' for s in j.get('steps',[])) for j in jobs):raise ValueError('No successful actual acceptance step')
        source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
        workflow=github('/contents/.github/workflows/landing-cloudflare-prepare.yml?ref='+run['head_sha'])
        if 'ref: '+source not in base64.b64decode(workflow['content']).decode():raise ValueError('Acceptance used another source version')
        proof['verified_test_run_id']=int(run_id)
    return proof

def api(origin,path,key,method='GET',body=None):
    owned_copy_update=origin==BREVO and method=='PUT' and path=='/smtp/templates/8' and body=={'htmlContent':mail_source('newsletter-api-doi.html')}
    if method!='GET' and not (owned_copy_update or origin==BREVO and method=='PUT' and path=='/smtp/templates/8' and body=={'tag':'optin'} or origin==BREVO and method=='POST' and path=='/smtp/templates' or origin==CF and method=='PATCH' and re.fullmatch(r'/accounts/[a-f0-9]{32}/pages/projects/vision-universe',path) or origin==CF and method=='POST' and re.fullmatch(r'/accounts/[a-f0-9]{32}/pages/projects/vision-universe/deployments/[a-f0-9-]{36}/retry',path)):
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
        message=value.get('message','')
        words={'a','an','any','are','available','been','configured','created','database','defined','do','does','doesn','don','t','exist','exists','for','found','has','have','in','is','no','not','of','on','the','there','this','to','type','web','hook','hooks','webhook','webhooks','with','your','account','transactional','marketing'}
        safe_webhook_message=(message.strip() if path.startswith('/webhooks?') and error.code==400 and isinstance(message,str)
            and re.fullmatch(r'''[A-Za-z .!,'"-]{1,160}''',message.strip()) and set(re.findall(r'[a-z]+',message.lower()))<=words else None)
        # Fixed classification only. Never return a provider's free-form message,
        # URL, authentication header or personalized response body.
        empty_webhooks=bool(path.startswith('/webhooks?') and error.code==400 and isinstance(message,str) and re.fullmatch(
            r'(?:no webhooks? (?:found|available|configured|exists?)|webhooks? (?:not found|not available|do(?:es)? not exist))(?: (?:for|with) (?:this|the) type)?[.!]?',message.strip(),re.I))
        return error.code,{'safe_codes':[e['code'] for e in value.get('errors',[]) if type(e.get('code')) is int],
                           'brevo_code':value.get('code') if value.get('code') in ('CONSENT_GROUP_NOT_ENABLED','unauthorized','permission_denied','document_not_found','not_exist','not_found','invalid_parameter','bad_request') else None,
                           'safe_webhook_message':safe_webhook_message,
                           'error_category':'no_webhooks_reported' if empty_webhooks else 'unclassified'}

def run():
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or os.environ.get('GITHUB_REF') not in ('refs/heads/feat/brevo-app-waitlist-doi','refs/heads/main'):raise ValueError('Manual approved branch only')
    operation=os.environ.get('NEWSLETTER_OPERATOR_OPERATION','audit')
    if operation not in ('audit','setup','controlled','close','public','doi-template-fix','doi-copy-update'):raise ValueError('Unknown mode')
    if operation in ('controlled','public') and os.environ.get('GITHUB_REF')!='refs/heads/main':raise ValueError('Main-domain release from main only')
    release=release_prerequisites(operation)
    key=os.environ.get('BREVO_API_KEY','')
    report={'operation':operation,'emails_sent':0,'contact_write_calls':0,'brevo_secret_present':bool(key)}
    report.update(release)
    def read(path):
        status,value=api(BREVO,path,key)
        if status!=200:
            # Fixed resource categories only; never emit a path/query/address.
            resource=next((name for prefix,name in [('/contacts/lists/','list_contacts'),('/smtp/templates','templates'),('/account','account'),('/contacts/attributes','attribute_schema'),('/senders','sender_domain'),('/smtp/blockedContacts','suppression'),('/smtp/statistics','statistics')] if path.startswith(prefix)),'other')
            print(json.dumps({'required_brevo_read':resource,'http':status}),flush=True)
            raise ValueError('Brevo read blocked')
        return value
    def contacts(n):
        result=[]
        for offset in range(0,10000,50):
            page=read('/contacts/lists/%d/contacts?limit=50&offset=%d'%(n,offset)).get('contacts',[])
            result.extend(page)
            if len(page)<50:return sorted(result,key=lambda c:c['id'])
        raise ValueError('Contact pagination incomplete')
    before={n:contacts(n) for n in (4,5,6)};old={n:read('/smtp/templates/'+str(n)) for n in (1,2,3,4)}
    account=read('/account')
    relay=account.get('relay')
    report['smtp_relay_enabled']=relay.get('enabled') if isinstance(relay,dict) and type(relay.get('enabled')) is bool else None
    report['free_plan']=any(p.get('type')=='free' for p in account.get('plan',[]))
    attribute_rows=read('/contacts/attributes').get('attributes',[])
    report['consent_attribute_compatible']=any(a.get('name')=='VU_EMAIL_CONSENT' and a.get('category')=='normal' and a.get('type')=='text' for a in attribute_rows)
    # Metadata only; no account address, email, token or raw settings response.
    def setting_keys(value,prefix=''):
        result=[]
        if isinstance(value,dict):
            for name,child in value.items():
                path=prefix+'.'+name if prefix else name
                if re.search(r'track|retention|consent|gdpr',name,re.I):result.append(path)
                if isinstance(child,(dict,list)):result.extend(setting_keys(child,path))
        elif isinstance(value,list):
            for child in value:result.extend(setting_keys(child,prefix+'[]'))
        return result
    report['privacy_metadata']={'account_tracking_or_retention_setting_keys':setting_keys(account),
        'per_contact_pixel_attribute_present':any(a.get('name')=='_PIXEL_TRACKING_CONSENT' for a in attribute_rows),
        'tracking_feature_and_default_verified':False,'transactional_retention_rule_verified':False,
        'account_specific_contract_record_verified':False}
    status,groups=api(BREVO,'/contacts/consent-groups?limit=50&offset=0',key)
    report['privacy_metadata']['consent_groups_http']=status
    if status==403:report['privacy_metadata']['consent_groups_feature_disabled']=True if groups.get('brevo_code')=='CONSENT_GROUP_NOT_ENABLED' else None
    elif status==200:
        rows=groups.get('consentGroups',groups.get('groups'))
        report['privacy_metadata']['consent_groups_returned']=len(rows) if isinstance(rows,list) else None
        report['privacy_metadata']['consent_group_total']=groups.get('total') if type(groups.get('total')) is int else None
    report['privacy_metadata']['webhooks_by_type']={}
    for webhook_type in ('transactional','marketing'):
        status,hooks=api(BREVO,'/webhooks?type='+webhook_type+'&sort=desc',key)
        result={'http':status};report['privacy_metadata']['webhooks_by_type'][webhook_type]=result
        if status==200 and isinstance(hooks.get('webhooks'),list):
            result['count']=len(hooks['webhooks'])
        elif status!=200:
            result.update({'brevo_code':hooks.get('brevo_code'),'error_category':hooks.get('error_category'),'safe_message':hooks.get('safe_webhook_message')})
    report['lists_before']={str(n):len(v) for n,v in before.items()}
    if operation=='audit':
        report['acceptance_inventory_readback']={}
        for kind,path,field in [('lists','/contacts/lists?limit=50&offset=0','lists'),('campaigns','/emailCampaigns?type=classic&limit=50&offset=0','campaigns')]:
            status,result=api(BREVO,path,key)
            rows=result.get(field)
            own=[v for v in rows if isinstance(v,dict) and v.get('name')=='VU | DOI-Abnahme | Betreiber Oktober 2026'] if isinstance(rows,list) else []
            report['acceptance_inventory_readback'][kind]={'http':status,'empty_object':result=={},'array_present':isinstance(rows,list),'rows_returned':len(rows) if isinstance(rows,list) else None,'count':result.get('count') if type(result.get('count')) is int else None,'only_known_fields':set(result)<={field,'count'},'owner_test_matches':len(own)}
    report['native_template_4_uses_form_link']='{{ doubleoptin }}' in old[4].get('htmlContent','')
    domain=read('/senders/domains/visionuniverse.de');report['domain_flags']={n:domain.get(n) is True for n in ('verified','authenticated')}
    sender=[s['id'] for s in read('/senders').get('senders',[]) if s.get('active') is True and s.get('email','').endswith('@visionuniverse.de')];report['sender_ids']=sender
    blocked=read('/smtp/blockedContacts?limit=1&offset=0');report['smtp_suppression_readable']=isinstance(blocked.get('contacts'),list)
    report['smtp_suppression_count']=blocked.get('count') if type(blocked.get('count')) is int else None
    daily=read('/smtp/statistics/aggregatedReport?days=1&tag='+TAG);report['tag_budget_readable']=type(daily.get('requests')) is int
    event_http,event_result=api(BREVO,'/smtp/statistics/events?templateId=8&days=1&limit=100&offset=0',key)
    report['doi_event_readback']={'http':event_http,'events_array':isinstance(event_result.get('events'),list),
        'returned_count':len(event_result['events']) if isinstance(event_result.get('events'),list) else None,
        'empty_response_object':event_result=={},'safe_error_code':event_result.get('brevo_code') if event_http!=200 else None}
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
    html=mail_source('newsletter-api-doi.html')
    if '{{ params.DOIurl }}' not in html or '{{ doubleoptin }}' in html:raise ValueError('Wrong API template link')
    if operation=='setup' and not matches:
        if not report['free_plan'] or len(sender)!=1 or not all(report['domain_flags'].values()) or not report['smtp_suppression_readable'] or not report['tag_budget_readable']:raise ValueError('Brevo setup prerequisites')
        status,value=api(BREVO,'/smtp/templates',key,'POST',{'templateName':NAME,'subject':SUBJECT,'sender':{'id':sender[0],'name':'Vision Universe'},'htmlContent':html,'isActive':True,'tag':TAG})
        if status not in (200,201) or type(value.get('id')) is not int:raise ValueError('Template creation failed')
        matches=[{'id':value['id']}]
    report['api_template_ids']=[t['id'] for t in matches]
    if matches:
        t=read('/smtp/templates/'+str(matches[0]['id']))
        if operation=='doi-copy-update':
            previous=hashlib.sha256(''.join(t.get('htmlContent','').split()).encode()).hexdigest()
            current=hashlib.sha256(''.join(html.split()).encode()).hexdigest()
            if t.get('id')!=8 or t.get('name')!=NAME or t.get('isActive') is not True or t.get('doiTemplate') is not True or t.get('tag')!=TAG or t.get('subject')!=SUBJECT or previous not in (PREVIOUS_COPY_SHA,current):raise ValueError('Owned template copy mismatch')
            if previous!=current:
                status,_=api(BREVO,'/smtp/templates/8',key,'PUT',{'htmlContent':html})
                report['doi_copy_update_http']=status
                if status not in (200,204):raise ValueError('DOI copy update rejected')
            updated=read('/smtp/templates/8')
            report['doi_copy_other_fields_unchanged']={k:v for k,v in t.items() if k not in ('htmlContent','modifiedAt')}=={k:v for k,v in updated.items() if k not in ('htmlContent','modifiedAt')}
            if not report['doi_copy_other_fields_unchanged']:raise ValueError('Unexpected copy mutation')
            t=updated
        if operation=='doi-template-fix':
            report['doi_template_before']=t.get('doiTemplate') if type(t.get('doiTemplate')) is bool else None
            if matches[0]['id']!=8 or t.get('id')!=8 or t.get('name')!=NAME or t.get('isActive') is not True or t.get('subject')!=SUBJECT or t.get('tag') not in (LEGACY_TAG,TAG) or ''.join(t.get('htmlContent','').split())!=''.join(html.split()):raise ValueError('Owned DOI template mismatch')
            if t.get('tag')!=TAG:
                status,_=api(BREVO,'/smtp/templates/8',key,'PUT',{'tag':TAG})
                report['doi_template_tag_update_http']=status
                if status not in (200,204):raise ValueError('DOI tag update rejected')
            updated=read('/smtp/templates/8')
            print(json.dumps({'doi_template_fix_readback':{'before':report['doi_template_before'],'after':updated.get('doiTemplate') if type(updated.get('doiTemplate')) is bool else None,'tag_matches':updated.get('tag')==TAG}}),flush=True)
            report['doi_template_other_fields_unchanged']={k:v for k,v in t.items() if k not in ('tag','doiTemplate','modifiedAt')}=={k:v for k,v in updated.items() if k not in ('tag','doiTemplate','modifiedAt')}
            if not report['doi_template_other_fields_unchanged']:raise ValueError('Unexpected template mutation')
            t=updated
        check={'active':t.get('isActive') is True,'api_link':'{{ params.DOIurl }}' in t.get('htmlContent',''),
               'doi_template':t.get('doiTemplate') is True,
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
            build_config=project.get('build_config',{})
            result['privacy_metadata']={'web_analytics_tag_present':bool(build_config.get('web_analytics_tag')),
                'web_analytics_token_present':bool(build_config.get('web_analytics_token')),
                'observability_fields':{s:sorted(k for k in c if re.search(r'log|observ',k,re.I)) for s,c in project.get('deployment_configs',{}).items()},
                'observability_enabled':{s:c.get('observability',{}).get('enabled') if isinstance(c.get('observability'),dict) else None for s,c in project.get('deployment_configs',{}).items()},
                'd1_bindings_present':any(bool(c.get('d1_databases')) for c in project.get('deployment_configs',{}).values()),
                'provider_retention_configuration_verified':False}
            result['runtime_types']={stage:{n:c.get('env_vars',{}).get(n,{}).get('type') for n in RUNTIME} for stage,c in project.get('deployment_configs',{}).items()}
            result['public_gates_closed']=all(not all(c.get('env_vars',{}).get(n,{}).get('value')=='true' for n in ('NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED')) for c in project.get('deployment_configs',{}).values())
            result['template_bindings_match']=bool(matches) and all(c.get('env_vars',{}).get('NEWSLETTER_DOI_TEMPLATE_ID',{}).get('value')==str(matches[0]['id']) for c in project.get('deployment_configs',{}).values())
            dep_status,deployments=api(CF,path+'/deployments?per_page=20',token);result['deployments_read_http']=dep_status
            if dep_status==200 and deployments.get('success'):
                result['main_git_deployment_available']=any(d.get('environment')=='production' and d.get('deployment_trigger',{}).get('metadata',{}).get('branch')=='main' for d in deployments.get('result',[]))
            if selected is None and name!='BREVO_CLOUDFLARE_DNS_TOKEN':selected=(name,token,path,project)
        status,zones=api(CF,'/zones?name=visionuniverse.de',token);result['zone_read_http']=status
        if status==200 and zones.get('success'):
            zone=[z for z in zones.get('result',[]) if z.get('name')=='visionuniverse.de'];result['zone_matches']=len(zone)
            if len(zone)==1:
                status,value=api(CF,'/zones/'+zone[0]['id']+'/rulesets/phases/http_ratelimit/entrypoint',token);result['rate_rules_read_http']=status;result['rate_rules_error_codes']=value.get('safe_codes',[])
                if status==200 and value.get('success'):result['rate_rule_count']=len(value['result'].get('rules',[]))
    if operation not in ('audit','doi-template-fix','doi-copy-update'):
        if selected is None or not matches or not report['consent_attribute_compatible']:raise ValueError('Pages or consent setup unavailable')
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
                   'NEWSLETTER_TEST_MODE':'true' if stage=='preview' and test_email and operation=='setup' else 'false',
                   'NEWSLETTER_FORM_MODE':'test' if stage=='preview' and test_email and operation=='setup' else 'closed',
                   'NEWSLETTER_CONTROLLED_ENABLED':'false','NEWSLETTER_TEST_UNTIL':'0'}
            if stage=='production' and operation in ('controlled','public'):
                plain.update({'NEWSLETTER_PRIVACY_APPROVED':'true','LANDING_PRIVACY_REVIEWED':'true','LANDING_PRIVACY_HTML_PATH':POLICY,
                              'NEWSLETTER_FORM_MODE':'controlled' if operation=='controlled' else 'public',
                              'NEWSLETTER_PUBLIC_ENABLED':'true' if operation=='public' else 'false',
                              'NEWSLETTER_E2E_VERIFIED':'true' if operation=='public' else 'false',
                              'NEWSLETTER_LIVE_VERIFIED':'true' if operation=='public' else 'false'})
                if operation=='controlled':plain.update({'NEWSLETTER_CONTROLLED_ENABLED':'true','NEWSLETTER_TEST_ACCESS_HASH':os.environ['NEWSLETTER_OPERATOR_TEST_HASH'],'NEWSLETTER_TEST_UNTIL':os.environ['NEWSLETTER_OPERATOR_TEST_UNTIL']})
            env.update({n:{'type':'plain_text','value':v} for n,v in plain.items()})
            if stage=='preview' and test_email:env['NEWSLETTER_TEST_EMAIL']={'type':'secret_text','value':test_email}
            changed[stage]={'env_vars':env}
        status,value=api(CF,path,token,'PATCH',{'deployment_configs':changed});report['pages_setup_http']=status
        if status!=200 or value.get('success') is not True:raise ValueError('Pages setup failed')
        status,value=api(CF,path,token)
        if status!=200 or not value.get('success'):raise ValueError('Pages setup readback failed')
        after=value['result'];report['runtime_secret_types_verified']=all(after['deployment_configs'][s].get('env_vars',{}).get(n,{}).get('type')=='secret_text' for s in configs for n in ('BREVO_API_KEY','NEWSLETTER_RATE_KEY'))
        report['public_gates_closed']=all(not all(after['deployment_configs'][s]['env_vars'][n].get('value')=='true' for n in ('NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED')) for s in configs)
        report['runtime_mode_readback_matches']=all(
            all(after['deployment_configs'][s].get('env_vars',{}).get(n,{}).get('value')==v['value'] for n,v in c['env_vars'].items() if v['type']=='plain_text') for s,c in changed.items())
        report['other_project_configuration_unchanged']=all(after.get(n)==project.get(n) for n in ('name','source','build_config','production_branch','domains')) and all(
            all(after['deployment_configs'][s].get('env_vars',{}).get(n)==v for n,v in c.get('env_vars',{}).items() if n not in changed[s]['env_vars']) and
            {n:v for n,v in c.items() if n!='env_vars'}=={n:v for n,v in after['deployment_configs'][s].items() if n!='env_vars'} for s,c in configs.items())
        if not all(report[n] for n in ('runtime_secret_types_verified','runtime_mode_readback_matches','other_project_configuration_unchanged')):raise ValueError('Pages readback mismatch')
        if operation in ('controlled','public','close'):
            status,value=api(CF,path+'/deployments?per_page=20',token)
            if status!=200 or not value.get('success'):raise ValueError('Deployment inventory unavailable')
            candidates=[d for d in value['result'] if d.get('environment')=='production' and d.get('deployment_trigger',{}).get('metadata',{}).get('branch')=='main']
            if not candidates:raise ValueError('Existing main deployment unavailable')
            deployment=max(candidates,key=lambda d:d.get('created_on',''));deployment_id=deployment.get('id','')
            if not re.fullmatch('[a-f0-9-]{36}',deployment_id):raise ValueError('Unexpected deployment identity')
            # Rebuild the existing Git deployment after env changes, preserving
            # project/source/domain settings. Never upload a replacement bundle.
            deadline=time.monotonic()+600
            while not deployment_finished(deployment):
                if time.monotonic()>=deadline:raise ValueError('Main deployment still busy; no blind retry')
                time.sleep(10);status,value=api(CF,path+'/deployments/'+deployment_id,token)
                if status!=200 or not value.get('success'):raise ValueError('Deployment state unavailable')
                deployment=value['result']
            status,value=api(CF,path+'/deployments/'+deployment_id+'/retry',token,'POST')
            if status not in (200,201) or not value.get('success'):raise ValueError('Existing main redeploy failed')
            report['main_redeploy_id']=value['result']['id'];report['main_redeploy_requested']=True
    after={n:contacts(n) for n in before};old_after={n:read('/smtp/templates/'+str(n)) for n in old}
    report['protected_contact_objects_unchanged']=before==after;report['old_templates_unchanged']=old==old_after;report['lists_after']={str(n):len(v) for n,v in after.items()}
    if before!=after or old!=old_after:raise ValueError('Protected data changed externally')
    return report
if __name__=='__main__':
    try:print(json.dumps(run()))
    except Exception as error:
        reasons={'Brevo read blocked':'required_read_failed','API template mismatch; no overwrite':'template_readback_mismatch','Duplicate API DOI template':'ambiguous_template','Protected data changed externally':'protected_snapshot_changed','Pages or consent setup unavailable':'pages_or_schema_missing','Pages readback mismatch':'pages_readback_mismatch'}
        reason=reasons.get(str(error),'unclassified') if type(error) is ValueError else 'transport_or_response_failure'
        print(json.dumps({'operator_failure':reason}),flush=True)
        print('Scoped operator blocked; no raw responses, keys or personal data emitted.');raise SystemExit(1) from None
