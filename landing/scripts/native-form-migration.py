"""One-off operator; no contact writes, delivery endpoints, DNS or artifacts."""
import json, os, re, urllib.error, urllib.request
from pathlib import Path

BREVO = 'https://api.brevo.com/v3'
CF = 'https://api.cloudflare.com/client/v4'
NAME = 'VU | App-Warteliste | Brevo-Formular DOI | v1'
OWN_KEYS = ('BREVO_API_KEY', 'WAITLIST_TOKEN_KEY', 'WAITLIST_DOI_TEMPLATE_ID',
            'WAITLIST_CONFIRMATION_TEMPLATE_ID', 'WAITLIST_PUBLIC_ENABLED',
            'WAITLIST_PRIVACY_APPROVED', 'WAITLIST_E2E_VERIFIED')


def api(origin, path, key, method='GET', body=None):
    # Only the explicitly scoped template and Pages changes are permitted.
    if method != 'GET' and not (
        origin == BREVO and path == '/smtp/templates' and method == 'POST' or
        origin == CF and re.fullmatch(r'/accounts/[a-f0-9]{32}/pages/projects/vision-universe', path) and method == 'PATCH'):
        raise ValueError('Unapproved endpoint')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs): return None
    headers = {'Accept':'application/json', 'User-Agent':'VisionUniverse-Waitlist/1.0'}
    headers['api-key' if origin == BREVO else 'Authorization'] = key if origin == BREVO else 'Bearer '+key
    if body is not None: headers['Content-Type']='application/json'
    request = urllib.request.Request(origin+path, method=method, headers=headers,
                                    data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            raw=response.read(); return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        error.close(); return error.code, {}


def run():
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_EVENT_NAME') != 'workflow_dispatch' or os.environ.get('GITHUB_REF') != 'refs/heads/feat/brevo-app-waitlist-doi':
        raise ValueError('Only isolated manual operator run')
    operation=os.environ.get('WAITLIST_OPERATION','audit')
    if operation not in ('audit','prepare_native','cleanup'): raise ValueError('Invalid operation')
    key=os.environ['BREVO_API_KEY']
    def brevo(path):
        status, value=api(BREVO,path,key)
        if status != 200: raise ValueError('Brevo read blocked')
        return value
    def contacts(list_id):
        found=[]
        for offset in range(0,10000,50):
            page=brevo('/contacts/lists/%d/contacts?limit=50&offset=%d' % (list_id,offset)).get('contacts',[])
            found.extend(page)
            if len(page)<50: return sorted(found,key=lambda c:c['id'])
        raise ValueError('Pagination limit')
    before={n:contacts(n) for n in (4,5,6)}
    report={'operation':operation, 'emails_sent':0, 'contact_write_calls':0, 'live_e2e_performed':False,
            'lists':{str(n):len(v) for n,v in before.items()}}
    account=brevo('/account'); report['free_plan']=any(p.get('type')=='free' for p in account.get('plan',[]))
    domain=brevo('/senders/domains/visionuniverse.de')
    report['domain_verified']=domain.get('verified') is True
    report['domain_authenticated']=domain.get('authenticated') is True
    sender_ids=[s['id'] for s in brevo('/senders').get('senders',[]) if s.get('active') is True and s.get('email','').endswith('@visionuniverse.de')]
    report['verified_sender_ids']=sender_ids
    templates=[]
    for offset in range(0,10000,50):
        page=brevo('/smtp/templates?limit=50&offset='+str(offset)).get('templates',[])
        templates.extend(page)
        if len(page)<50: break
    else: raise ValueError('Template pagination limit')
    report['old_template_1_api_placeholder']='{{ params.DOIurl }}' in brevo('/smtp/templates/1').get('htmlContent','')
    report['old_template_2_custom_unsubscribe']='params.unsubscribe_url' in brevo('/smtp/templates/2').get('htmlContent','')
    matches=[t for t in templates if t.get('name')==NAME]
    if len(matches)>1: raise ValueError('Duplicate native template')
    html=Path(__file__).resolve().parents[1].joinpath('mail/app-doi.html').read_text()
    if '{{ doubleoptin }}' not in html or 'params.' in html: raise ValueError('Incorrect native template')
    if operation=='prepare_native' and not matches:
        if before.keys()!={4,5,6} or [len(before[n]) for n in (4,5,6)]!=[135,0,2] or not all(report[n] for n in ('free_plan','domain_verified','domain_authenticated')) or len(sender_ids)!=1:
            raise ValueError('Preparation prerequisites changed')
        status,value=api(BREVO,'/smtp/templates',key,'POST',{'templateName':NAME,
            'subject':'Bestätige deine Anmeldung zur App-Warteliste','sender':{'id':sender_ids[0],'name':'Vision Universe'},
            'htmlContent':html,'isActive':True,'tag':'optin'})
        if status not in (200,201) or type(value.get('id')) is not int: raise ValueError('Native template creation blocked')
        matches=[{'id':value['id']}]
    report['native_template_ids']=[t['id'] for t in matches]
    if matches:
        template=brevo('/smtp/templates/'+str(matches[0]['id']))
        report['native_template_readback']={'active':template.get('isActive') is True,
            'native_link': '{{ doubleoptin }}' in template.get('htmlContent',''),
            'normalized_source_match': ''.join(template.get('htmlContent','').split())==''.join(html.split()),
            'actually_selected_in_form':False,'actually_delivered_and_clicked':False}
    report['controlled_address_secret_present']=bool(os.environ.get('BREVO_DOI_TEST_EMAIL'))
    account_id=os.environ.get('CLOUDFLARE_ACCOUNT_ID','')
    if not re.fullmatch(r'[a-f0-9]{32}',account_id):
        match=re.fullmatch(r'https://([a-f0-9]{32})\.r2\.cloudflarestorage\.com/?',os.environ.get('VU_HISTORY_S3_ENDPOINT',''))
        account_id=match[1] if match else ''
    token=os.environ.get('CLOUDFLARE_API_TOKEN','')
    if not account_id or not token: raise ValueError('Pages operator unavailable')
    path='/accounts/'+account_id+'/pages/projects/vision-universe'
    status,value=api(CF,path,token)
    report['pages_read_http']=status
    if status!=200 or not value.get('success'): raise ValueError('Pages read unavailable')
    project=value['result']; configs=project.get('deployment_configs',{})
    report['own_pages_keys']={stage:{name:c.get('env_vars',{}).get(name,{}).get('type') for name in OWN_KEYS} for stage,c in configs.items()}
    report['d1_binding_present']=any(c.get('d1_databases',{}).get('WAITLIST_DB') for c in configs.values())
    report['public_gates_false']=all(c.get('env_vars',{}).get(n,{}).get('value')=='false' for c in configs.values() for n in OWN_KEYS[-3:])
    if operation=='cleanup':
        # These seven bindings were added by runs 38427920720/38430030211 for PR659.
        # Main has no Pages backend and the revised branch publishes static output.
        # Never alter GitHub secrets, other project bindings or an unexpected state.
        if project.get('name')!='vision-universe' or project.get('production_branch')!='main' or set(configs)!={'preview','production'} or report['d1_binding_present'] or not report['public_gates_false']:
            raise ValueError('Cleanup ownership/state changed')
        expected={'WAITLIST_DOI_TEMPLATE_ID':'1','WAITLIST_CONFIRMATION_TEMPLATE_ID':'2',
                  'WAITLIST_PUBLIC_ENABLED':'false','WAITLIST_PRIVACY_APPROVED':'false','WAITLIST_E2E_VERIFIED':'false'}
        for config in configs.values():
            variables=config.get('env_vars',{})
            if any(variables.get(n,{}).get('type')!='secret_text' for n in OWN_KEYS[:2]): raise ValueError('Secret ownership/type changed')
            if any(variables.get(n,{}).get('value')!=v for n,v in expected.items()): raise ValueError('Binding value changed')
            if any(n.startswith('WAITLIST_') and n not in OWN_KEYS for n in variables): raise ValueError('Unexpected runtime consumer')
        status,value=api(CF,path,token,'PATCH',{'deployment_configs':{stage:{'env_vars':{name:None for name in OWN_KEYS}} for stage in configs}})
        report['pages_cleanup_http']=status
        if status!=200 or not value.get('success'): raise ValueError('Cleanup failed')
        status,value=api(CF,path,token)
        if status!=200: raise ValueError('Cleanup readback failed')
        after=value['result']
        report['own_pages_keys_removed']=all(name not in after['deployment_configs'][stage].get('env_vars',{}) for stage in configs for name in OWN_KEYS)
        report['other_pages_configuration_unchanged']=all(after.get(n)==project.get(n) for n in ('name','source','build_config','production_branch','domains')) and all(
            {n:v for n,v in config.get('env_vars',{}).items() if n not in OWN_KEYS}==after['deployment_configs'][stage].get('env_vars',{}) and
            {n:v for n,v in config.items() if n!='env_vars'}=={n:v for n,v in after['deployment_configs'][stage].items() if n!='env_vars'}
            for stage,config in configs.items())
        if not report['own_pages_keys_removed'] or not report['other_pages_configuration_unchanged']: raise ValueError('Cleanup readback mismatch')
    after={n:contacts(n) for n in before}
    report['protected_contact_records_unchanged']=before==after
    report['lists_after']={str(n):len(v) for n,v in after.items()}
    if before!=after: raise ValueError('Contact state changed externally')
    return report

if __name__=='__main__':
    try: print(json.dumps(run()))
    except Exception: print('Scoped operator blocked; no raw responses, credentials or contact data emitted.'); raise SystemExit(1) from None
