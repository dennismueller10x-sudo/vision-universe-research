"""Corporate CMS feeds can contain comments, defaults and unrelated agency blogs.

Ownership of a site does not make every CMS entry a company announcement.
This filter is intentionally conservative and does not fetch article bodies.
"""
import re
from .model import Resolver,normalize,SUFFIX,AMBIGUOUS,AMBIGUOUS_ALIASES


def promotional_solicitation(headline):
    """Identify legal advertising templates, preserving factual legal news."""
    if not isinstance(headline, str):
        return False
    existing = r'law firm|law offices|law office|lead plaintiff|secure counsel|contact.{0,80}(?:law|llp)|opportunity to lead.{0,100}lawsuit|(?:investors?|shareholders?).{0,100}(?:urged|encouraged).{0,80}(?:contact|act)|(?:investors?|shareholders?).{0,80}deadline|class action.{0,100}deadline|\b(?:ROSEN|Bronstein|Kaplan Fox|Robbins LLP|Hagens Berman|Grabar Law)\b'
    alert = r'\b(?:investor|shareholder)s?\s+alert\b.{0,260}\b(?:LLP|law firm|law offices?|class action|secure counsel|(?:Julie\s*(?:&|and)\s*Holleman|Johnson\s+Fistel)\s+investigates?)\b'
    recruitment = r'\bopportunity\b.{0,80}\b(?:investors?|shareholders?)\b.{0,40}\blead\b.{0,80}\b(?:class action|lawsuit)\b'
    return bool(re.search(existing, headline, re.I) or re.search(alert, headline, re.I)
                or re.search(recruitment, headline, re.I))


def owned_actor(title,company):
    """Explicit authoritative name on an already verified corporate CMS feed.

    External matching needs financial context for a single word. Here ownership
    is independently proven, so a non-ambiguous corporate name can also identify
    ordinary company announcements. No category keyword alone proves an actor.
    """
    text=normalize(title)
    def legal(value):
        value=normalize(re.sub(r'/[A-Z]{2,3}/?$', '', value, flags=re.I))
        for long,short in [('corporation','corp'),('incorporated','inc'),('limited','ltd'),('company','co')]:
            value=re.sub(r'\b'+long+r'\b',short,value)
        return value
    legal_title=legal(title)
    for name in company['names']:
        full=legal(name)
        if len(full.split())>=2 and re.search(r'(?<!\w)'+re.escape(full)+r'(?!\w)',legal_title):return True
        base=normalize(SUFFIX.sub('',re.sub(r'/[A-Z]{2,3}/?$', '',name,flags=re.I)))
        if base in AMBIGUOUS or base in AMBIGUOUS_ALIASES:continue
        if len(base.split())>=2 or len(base)>=4:
            if base and re.search(r'(?<!\w)'+re.escape(base)+r'(?!\w)',text):return True
        words=[w for w in normalize(SUFFIX.sub('',name)).split() if w not in ('the','co','company','group')]
        acronym=''.join(w[0] for w in words)
        if 3<=len(acronym)<=5 and acronym not in AMBIGUOUS and re.search(r'(?<!\w)'+re.escape(acronym.upper())+r'(?!\w)',title):return True
    return False


def wordpress_feed(body):
    return bool(re.search(br'<generator\b[^>]*>[^<]*wordpress\.org',body,re.I))


def eligible(entry, company, wordpress=False):
    title=entry.get('headline') or ''
    if re.fullmatch(r'\s*hello world[!.\s]*',title,re.I) or re.match(r'\s*comment on\b',title,re.I):
        return False
    if not wordpress:return True
    # A general CMS blog item needs an explicit high-confidence issuer actor.
    # Source ownership alone cannot turn an agency podcast into company news.
    return owned_actor(title,company) or bool(Resolver({company['companyId']:company}).resolve(entry,{'type':'RSS','verified':False}))
