"""Isolated manual operator. Audit never writes; no send/contact mutation endpoint."""
import json,os,re,urllib.error,urllib.request
BREVO='https://api.brevo.com/v3';CF='https://api.cloudflare.com/client/v4'

def api(origin,path,key):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    headers={'Accept':'application/json','User-Agent':'VisionUniverse-Brevo/1.0'}
    headers['api-key' if origin==BREVO else 'Authorization']=key if origin==BREVO else 'Bearer '+key
    request=urllib.request.Request(origin+path,headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(request,timeout=30) as response:
            raw=response.read();return response.status,json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        try:value=json.loads(error.read(65536))
        except Exception:value={}
        return error.code,{'safe_codes':[e['code'] for e in value.get('errors',[]) if type(e.get('code')) is int]}

def run():
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or os.environ.get('GITHUB_REF')!='refs/heads/feat/brevo-app-waitlist-doi':raise ValueError('Manual isolated branch only')
    key=os.environ.get('BREVO_API_KEY','')
    report={'operation':'audit','emails_sent':0,'contact_write_calls':0,'brevo_secret_present':bool(key)}
    def read(path):
        status,value=api(BREVO,path,key)
        if status!=200:raise ValueError('Brevo read blocked')
        return value
    report['free_plan']=any(p.get('type')=='free' for p in read('/account').get('plan',[]))
    report['lists']={str(n):read('/contacts/lists/'+str(n)).get('totalSubscribers') for n in (4,5,6)}
    report['native_template_4_uses_form_link']='{{ doubleoptin }}' in read('/smtp/templates/4').get('htmlContent','')
    report['domain_flags']={n:read('/senders/domains/visionuniverse.de').get(n) is True for n in ('verified','authenticated')}
    report['controlled_test_address_present']=bool(os.environ.get('BREVO_DOI_TEST_EMAIL'))
    account_id=os.environ.get('CLOUDFLARE_ACCOUNT_ID','')
    if not re.fullmatch(r'[a-f0-9]{32}',account_id):
        match=re.fullmatch(r'https://([a-f0-9]{32})\.r2\.cloudflarestorage\.com/?',os.environ.get('VU_HISTORY_S3_ENDPOINT',''))
        account_id=match[1] if match else ''
    report['cloudflare_account_available']=bool(account_id)
    report['cloudflare']={}
    for name in ('CLOUDFLARE_API_TOKEN','LANDING_CLOUDFLARE_API_TOKEN','BREVO_CLOUDFLARE_DNS_TOKEN'):
        token=os.environ.get(name,'');result={'secret_present':bool(token)};report['cloudflare'][name]=result
        if not token or not account_id:continue
        status,value=api(CF,'/accounts/'+account_id+'/pages/projects/vision-universe',token)
        result['pages_read_http']=status
        if status==200 and value.get('success'):
            project=value['result'];result['existing_project_matches']=project.get('name')=='vision-universe'
            result['runtime_types']={stage:{n:c.get('env_vars',{}).get(n,{}).get('type') for n in ('BREVO_API_KEY','NEWSLETTER_RATE_KEY','NEWSLETTER_DOI_TEMPLATE_ID','NEWSLETTER_PUBLIC_ENABLED','NEWSLETTER_PRIVACY_APPROVED','NEWSLETTER_E2E_VERIFIED','NEWSLETTER_TEST_EMAIL')} for stage,c in project.get('deployment_configs',{}).items()}
        status,zones=api(CF,'/zones?name=visionuniverse.de',token);result['zone_read_http']=status
        if status==200 and zones.get('success'):
            matches=[z for z in zones.get('result',[]) if z.get('name')=='visionuniverse.de']
            result['zone_matches']=len(matches)
            if len(matches)==1:
                status,value=api(CF,'/zones/'+matches[0]['id']+'/rulesets/phases/http_ratelimit/entrypoint',token)
                result['rate_rules_read_http']=status;result['rate_rules_error_codes']=value.get('safe_codes',[])
                if status==200 and value.get('success'):result['existing_rate_rule_count']=len(value['result'].get('rules',[]))
        status,value=api(CF,'/accounts/'+account_id+'/challenges/widgets',token)
        result['turnstile_inventory_http']=status
        # Never read or reuse a Research widget secret. No captcha iframe is planned.
        if status==200 and value.get('success'):result['turnstile_widget_count']=len(value.get('result',[]))
    return report
if __name__=='__main__':
    try:print(json.dumps(run()))
    except Exception:print('Scoped audit blocked; no raw responses, keys or personal data emitted.');raise SystemExit(1) from None
