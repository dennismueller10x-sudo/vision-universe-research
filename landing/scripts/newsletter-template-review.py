"""Manual template review/preparation; no contact writes or send endpoints."""
import json, os, re, urllib.error, urllib.request
from pathlib import Path
BREVO='https://api.brevo.com/v3'
NAME='VU | Newsletter | DE | Double Opt In | v1'
SUBJECT='Bestätige deine Anmeldung zum Vision-Universe-Newsletter'
def api(origin, path, key, method='GET', body=None):
    # Only creating a new named template is permitted; existing templates remain untouched.
    if origin != BREVO or (method != 'GET' and not (path == '/smtp/templates' and method == 'POST')):
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
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or os.environ.get('GITHUB_REF')!='refs/heads/feat/brevo-app-waitlist-doi':raise ValueError('Only isolated manual operator')
    operation=os.environ.get('NEWSLETTER_OPERATION','audit')
    if operation not in ('audit','prepare'):raise ValueError('Unsupported operation')
    key=os.environ['BREVO_API_KEY']
    def read(path):
        status,value=api(BREVO,path,key)
        if status!=200:raise ValueError('Required read inaccessible')
        return value
    def contacts(n):
        result=[]
        for offset in range(0,10000,50):
            page=read('/contacts/lists/%d/contacts?limit=50&offset=%d'%(n,offset)).get('contacts',[])
            result.extend(page)
            if len(page)<50:return sorted(result,key=lambda c:c['id'])
        raise ValueError('Incomplete pagination')
    before={n:contacts(n) for n in (4,5,6)}
    old_before={n:read('/smtp/templates/'+str(n)) for n in (1,2,3)}
    report={'operation':operation,'emails_sent':0,'contact_write_calls':0,'lists_before':{str(n):len(c) for n,c in before.items()},'old_template_usage':{}}
    for n,t in old_before.items():
        status,events=api(BREVO,'/smtp/statistics/events?templateId=%d&days=90&limit=1&offset=0'%n,key)
        report['old_template_usage'][str(n)]={'active':t.get('isActive') is True,'events_http':status,
            'events_present_last_90_days':bool(events.get('events')) if status==200 else None,
            'form_or_automation_binding':'not_verifiable_with_available_api_access'}
    status,campaigns=api(BREVO,'/emailCampaigns?limit=1&offset=0&excludeHtmlContent=true',key)
    report['campaign_inventory_http']=status
    report['campaign_count']=campaigns.get('count') if status==200 and type(campaigns.get('count')) is int else None
    report['campaign_usage_proven_absent']=report['campaign_count']==0
    account=read('/account');report['free_plan']=any(p.get('type')=='free' for p in account.get('plan',[]))
    domain=read('/senders/domains/visionuniverse.de');report['domain_verified']=domain.get('verified') is True;report['domain_authenticated']=domain.get('authenticated') is True
    senders=[s['id'] for s in read('/senders').get('senders',[]) if s.get('active') is True and s.get('email','').endswith('@visionuniverse.de')]
    report['verified_sender_ids']=senders
    templates=[]
    for offset in range(0,10000,50):
        page=read('/smtp/templates?limit=50&offset='+str(offset)).get('templates',[])
        templates.extend(page)
        if len(page)<50:break
    else:raise ValueError('Template pagination incomplete')
    matches=[t for t in templates if t.get('name')==NAME]
    if len(matches)>1:raise ValueError('Duplicate newsletter template')
    html=Path(__file__).resolve().parents[1].joinpath('mail/newsletter-doi.html').read_text()
    if '{{ doubleoptin }}' not in html or 'params.' in html or 'App-Warteliste' in html:raise ValueError('Wrong template purpose')
    if operation=='prepare' and not matches:
        if len(senders)!=1 or not all(report[n] for n in ('free_plan','domain_verified','domain_authenticated')):raise ValueError('Preparation prerequisites changed')
        status,value=api(BREVO,'/smtp/templates',key,'POST',{'templateName':NAME,'subject':SUBJECT,'sender':{'id':senders[0],'name':'Vision Universe'},'htmlContent':html,'isActive':True,'tag':'optin'})
        if status not in (200,201) or type(value.get('id')) is not int:raise ValueError('Template creation blocked')
        matches=[{'id':value['id']}]
    report['newsletter_template_ids']=[t['id'] for t in matches]
    if matches:
        t=read('/smtp/templates/'+str(matches[0]['id']))
        report['newsletter_template_readback']={'active':t.get('isActive') is True,'native_doi_link':'{{ doubleoptin }}' in t.get('htmlContent',''),
            'source_match_normalized':''.join(t.get('htmlContent','').split())==''.join(html.split()),
            'subject_matches':t.get('subject')==SUBJECT,'actual_form_selection':'not_verified','actual_live_flow_tested':False}
        if not all(report['newsletter_template_readback'][n] for n in ('active','native_doi_link','source_match_normalized','subject_matches')):raise ValueError('Existing template differs; no overwrite')
    after={n:contacts(n) for n in before};old_after={n:read('/smtp/templates/'+str(n)) for n in old_before}
    report['protected_contact_objects_unchanged']=before==after;report['old_templates_unchanged']=old_before==old_after
    report['lists_after']={str(n):len(c) for n,c in after.items()}
    if before!=after or old_before!=old_after:raise ValueError('Protected state changed externally')
    return report

if __name__=='__main__':
    try:print(json.dumps(run()))
    except Exception:print('Scoped review blocked; no keys, raw responses or personal data emitted.');raise SystemExit(1) from None
