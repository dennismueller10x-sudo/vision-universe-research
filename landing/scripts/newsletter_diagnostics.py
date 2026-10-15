"""Fixed-vocabulary provider errors only; never emit raw recipients or keys."""
import re
CODES={'invalid_parameter','bad_request','unauthorized','permission_denied','document_not_found','not_found','not_exist','duplicate_parameter','not_enough_credits','out_of_range','method_not_allowed'}
WORDS=set('we our t don doesn does exist templateid type language old new designer design creation created create marked test tested enabled cannot content html body greater less than zero string number integer format variable variables contain contains required invalid valid blank empty other only supported currently supports support unsupported s cant couldnt kindly support team activation sent sending emails whitelist whitelisted approve approved approval rejected permitted cannot mail mails a an and api are as at be been by can cannot code confirm confirmation contact contacts contain contains content could disabled doi doiurl double doubleoptin doubleoptinconfirmation email enabled error exists feature field fields for found from has have id if in inactive include includelistids invalid is it key link list lists mandatory missing must no not of on only opt or parameter parameters params permission pixel please provide recipient request required requires send sender should smtp status suspended template templates that the there this to tracking transactional trying unable unknown use used using valid value verified was when which with you your account activated activation active blacklisted blocked already configured contactpixeltrackingconsent subscribed consent'.split())
def safe_error(value):
    code=value.get('code') if isinstance(value,dict) else None
    message=value.get('message') if isinstance(value,dict) else None
    safe=None
    if isinstance(message,str) and len(message)<=300 and re.fullmatch(r'''[A-Za-z0-9 _.,:;!?(){}'"/\-]+''',message):
        tokens=set(re.findall('[a-z]+',message.lower()));digits=re.findall(r'\d+',message)
        if tokens<=WORDS and all(n in ('4','8') for n in digits):safe=message
    flags={name:bool(isinstance(message,str) and re.search(pattern,message,re.I)) for name,pattern in {
        'template':'template','doi_link':'DOIurl|double.?opt|confirmation link','tracking':'pixel|tracking|consent',
        'account_activation':'activat|smtp account','permission':'permission|unauthor|not allowed|suspend',
        'recipient':'recipient|email address|contact.*exist','list':'list','mandatory_field':'mandatory|required|missing'}.items()}
    # Preserve only fixed generic vocabulary in order. Unknown words, values,
    # complete addresses and URLs never become diagnostic output.
    cleaned=re.sub(r'https?://\S+|[^\s<>"\']+@[^\s<>"\']+','[redacted]',message or '') if isinstance(message,str) else ''
    redacted=' '.join(word.lower() if word.lower() in WORDS else '[redacted]' for word in re.findall(r'[A-Za-z]+|\d+',cleaned))[:500]
    return {'safe_code':code if code in CODES else 'unclassified','safe_message':safe,'redacted_message':redacted,'reason_flags':flags}
