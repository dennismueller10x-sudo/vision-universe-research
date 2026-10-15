"""One explicitly authorized owner DOI diagnostic. No automatic retries/artifacts."""
import base64,gzip,hashlib,io,json,os,re,urllib.request,urllib.error,urllib.parse
from newsletter_mail import mail_source
API='https://api.brevo.com/v3'
# Opaque selection in the existing private handover; never a public address.
PAYLOAD_SHA='484d81a155374aa286207953fdf0b5bf56e5708b909eb626a542637f4c0b8319'
OWNER_RECORD_INDEX=111
from newsletter_diagnostics import safe_error
def request(path,key,body=None):
    if body is not None and path!='/contacts/doubleOptinConfirmation':raise ValueError('Mutation denied')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args,**kwargs):return None
    headers={'api-key':key,'Accept':'application/json','User-Agent':'VisionUniverse-Brevo/1.0'}
    if body is not None:headers['Content-Type']='application/json'
    req=urllib.request.Request(API+path,headers=headers,data=json.dumps(body).encode() if body is not None else None,method='POST' if body is not None else 'GET')
    try:
        with urllib.request.build_opener(NoRedirect).open(req,timeout=30) as response:
            raw=response.read(1048576);return response.status,json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        try:value=json.loads(error.read(65536))
        except Exception:value={}
        return error.code,value

def run():
    if os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('GITHUB_EVENT_NAME')!='workflow_dispatch' or os.environ.get('GITHUB_REF') not in ('refs/heads/main','refs/heads/feat/brevo-app-waitlist-doi') or os.environ.get('NEWSLETTER_AUTHORIZE_CONTROLLED_TEST')!='true':raise ValueError('Not authorized')
    encoded=os.environ.get('BREVO_IMPORT_PAYLOAD','').strip()
    if hashlib.sha256(encoded.encode()).hexdigest()!=PAYLOAD_SHA:raise ValueError('Private handover mismatch')
    with gzip.GzipFile(fileobj=io.BytesIO(base64.b64decode(encoded,validate=True))) as stream:payload=json.loads(stream.read(1048577))
    rows=payload.get('records')
    if not isinstance(rows,list) or len(rows)!=137:raise ValueError('Private handover shape')
    record=rows[OWNER_RECORD_INDEX];email=record.get('email','').strip().lower()
    if not re.fullmatch(r'[^\s@]{1,64}@[^\s@]+\.[^\s@]+',email):raise ValueError('Private recipient invalid')
    key=os.environ.get('BREVO_API_KEY','')
    def read(path):
        status,value=request(path,key)
        if status!=200:raise ValueError('Required read unavailable')
        return value
    account=read('/account')
    if account.get('relay',{}).get('enabled') is not True:raise ValueError('SMTP inactive')
    contact='/contacts/'+urllib.parse.quote(email,safe='')
    status,_=request(contact,key)
    if status!=404:raise ValueError('Recipient not proven new')
    for offset in range(0,2000,100):
        blocked=read('/smtp/blockedContacts?limit=100&offset='+str(offset)).get('contacts')
        if not isinstance(blocked,list):raise ValueError('Suppression uncertain')
        if any(c.get('email','').strip().lower()==email for c in blocked):raise ValueError('Recipient suppressed')
        if len(blocked)<100:break
    else:raise ValueError('Suppression incomplete')
    events=read('/smtp/statistics/events?templateId=8&email='+urllib.parse.quote(email,safe='')+'&days=1&limit=1')
    if events!={} and events.get('events')!=[]:raise ValueError('Prior delivery or uncertain history')
    template=read('/smtp/templates/8')
    if template.get('isActive') is not True or template.get('doiTemplate') is not True or ''.join(template.get('htmlContent','').split())!=''.join(mail_source('newsletter-api-doi.html').split()) or template.get('tag')!='optin':raise ValueError('Template mismatch')
    budget=read('/smtp/statistics/aggregatedReport?days=1&tag=optin').get('requests')
    if type(budget) is not int or budget>=50:raise ValueError('Budget uncertain')
    status,_=request(contact,key)
    if status!=404:raise ValueError('Recipient changed')
    # This deliberately matches the failed production payload. No retry.
    status,value=request('/contacts/doubleOptinConfirmation',key,{'email':email,'includeListIds':[4],'templateId':8,'redirectionUrl':'https://www.visionuniverse.de/newsletter/bestaetigt/','contactPixelTrackingConsent':False,'attributes':{'VU_EMAIL_CONSENT':'subscribed'}})
    result={'operation':'single_controlled_doi_diagnostic','doi_http':status,'accepted':status==201,'automatic_retry':False}
    if status!=201:result.update(safe_error(value))
    print(json.dumps(result),flush=True)
    if status!=201:raise SystemExit(2)
if __name__=='__main__':
    try:run()
    except SystemExit:raise
    except Exception:print(json.dumps({'diagnostic_stopped':True,'raw_data_emitted':False,'automatic_retry':False}),flush=True);raise SystemExit(1) from None
