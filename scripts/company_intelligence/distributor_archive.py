"""Bounded, resumable publisher-advertised archive metadata discovery.

URLs/slugs select candidates only. News needs explicit publisher headline/date,
and issuer ownership needs independent legal-author + exchange/ticker evidence.
Article bodies exist transiently during parsing; no full-text storage/export.
"""
import json,re,hashlib
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
from urllib.parse import urlsplit,unquote,quote
from .model import canonical_url,clean,domain
from .feeds import parse_date,parse_links
from .transport import SourceError,BudgetExhausted
from .pipeline import advance


def pinned_archive(url):
    p=urlsplit(url)
    return p.scheme=='https' and p.netloc=='sitemaps.globenewswire.com' and not p.query and bool(re.fullmatch(r'/news/en/\d{4}-\d{2}\.xml',p.path))


def archive_urls(body,url):
    if not pinned_archive(url) or len(body)>8*1024*1024 or re.search(br'<!\s*(DOCTYPE|ENTITY)\b',body,re.I):raise SourceError('UNSAFE_DISTRIBUTOR_ARCHIVE')
    try:root=ET.fromstring(body)
    except ET.ParseError as exc:raise SourceError('MALFORMED_DISTRIBUTOR_ARCHIVE') from exc
    ns='{http://www.sitemaps.org/schemas/sitemap/0.9}'
    if root.tag!=ns+'urlset' or len(root)>50000:raise SourceError('INVALID_DISTRIBUTOR_ARCHIVE_SCHEMA')
    def release_url(value):
        # Publisher month indexes also advertise root-relative release paths.
        # Their article origin is the approved publisher, not the sitemap host.
        # Only dated release routes qualify; arbitrary relative destinations
        # and scheme-relative hosts never acquire publisher scope.
        if isinstance(value, str) and re.match(r'^/news-release/\d{4}/\d{2}/\d{2}/\d+/', value):
            if '..' in urlsplit(value).path.split('/'):
                return None
            value = 'https://www.globenewswire.com' + value
        return canonical_url(value)
    return list(dict.fromkeys(u for row in root if (u:=release_url(row.findtext(ns+'loc'))) and domain(u)=='www.globenewswire.com' and '/news-release/' in u))


def article_request_url(value):
    """Encode advertised IRI paths for HTTP without changing ledger identities."""
    canonical = canonical_url(value)
    if not canonical:
        return None
    parts = urlsplit(canonical)
    # Preserve existing escapes and reserved path delimiters. No decoding,
    # origin rewrite or redirect trust is introduced by UTF-8 percent encoding.
    return parts._replace(path=quote(parts.path, safe="!$&'()*+,-./:;=@_~%")).geturl()


class Metadata(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.jsonld=[];self.script=False;self.buffer=[];self.paragraph=False;self.p=[];self.paragraphs=[];self.meta={};self.depth=0;self.body_depth=None;self.body_links=[];self.anchor=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag not in ('meta','link','br','hr','img','input','source','wbr'):self.depth+=1
        if a.get('itemprop')=='articleBody' and self.body_depth is None:self.body_depth=self.depth
        if tag=='a' and self.body_depth is not None and a.get('href'):
            self.anchor={'url':a['href'],'label':''};self.body_links.append(self.anchor)
        if tag=='script':self.script=a.get('type')=='application/ld+json';self.buffer=[]
        if tag=='meta' and a.get('content'):self.meta[(a.get('name') or a.get('property') or '').lower()]=a['content']
        if tag=='p' and self.body_depth is not None:self.paragraph=True;self.p=[]
    def handle_data(self,data):
        if self.script:self.buffer.append(data)
        elif self.paragraph:self.p.append(data)
        if self.anchor is not None:self.anchor['label']+=data
    def handle_endtag(self,tag):
        if tag=='a':self.anchor=None
        if tag not in ('meta','link','br','hr','img','input','source','wbr') and self.body_depth==self.depth:self.body_depth=None
        if tag not in ('meta','link','br','hr','img','input','source','wbr'):self.depth=max(0,self.depth-1)
        if tag=='script' and self.script:
            try:self.jsonld.append(json.loads(''.join(self.buffer)))
            except ValueError:pass
            self.script=False
        if tag=='p' and self.paragraph:self.paragraphs.append(clean(' '.join(self.p),2000));self.paragraph=False




def publisher_call_actor(headline, company):
    """A joint release's author/ticker does not make every participant the host."""
    from .model import normalize, SUFFIX, issuer_earnings_announcement
    # Keep the leading issuer actor while removing an explicit parent descriptor.
    actor_headline = re.sub(r',\s*a subsidiary of.{1,160}?,\s*(?=(?:schedules?|announces?|reports?|hosts?)\b)',
                            ' ', headline, flags=re.I)
    title = normalize(actor_headline)
    names = {normalize(n) for n in company['names']} | {
        normalize(SUFFIX.sub('', n)) for n in company['names']}
    action = re.search(r'\b(?:announces?|reports?|releases?|hosts?|presents?)\b', title)
    actor = title[:action.start()].strip() if action else ''
    if ' and ' in ' ' + actor + ' ' and actor not in names:
        return False
    if issuer_earnings_announcement(headline, company):
        return True
    actor_words = r'(?:reports?|announces?|releases?|hosts?|presents?|schedules?|sets?|enters?|completes?|to|will)\b'
    if any(len(name) >= 3 and re.match(re.escape(name) + r'\s+' + actor_words, title) for name in names):
        return True
    # Shortened financial brands must share the legal-name prefix and put the
    # reporting actor immediately after it; a different company cannot pass.
    if not earnings_call_context(headline, ''):
        return False
    words = title.split()
    for name in names:
        common = 0
        for left, right in zip(words, name.split()):
            if left != right:
                break
            common += 1
        next_actor = common
        if common == 1 and len(words[0]) >= 6 and len(words) > common and words[common] == 'group':
            next_actor += 1
        if common and (common >= 2 or len(words[0]) >= 6) and len(words) > next_actor and re.fullmatch(actor_words, words[next_actor]):
            return True
    return False


def earnings_call_context(headline, evidence):
    """Financial reporting proof distinguishes earnings from other investor calls."""
    from .model import financial_release_evidence
    from .ir_events import event_type
    return bool(financial_release_evidence(headline, evidence)) or event_type(
        headline + ' ' + evidence) in ('EARNINGS_CALL', 'EARNINGS_SCHEDULED')


def metadata(body,url):
    if len(body)>2*1024*1024 or domain(url)!='www.globenewswire.com' or '/news-release/' not in url:raise SourceError('UNSAFE_DISTRIBUTOR_ARTICLE')
    p=Metadata();p.feed(body.decode('utf-8','replace'))
    nodes=[]
    for data in p.jsonld:
        nodes.extend(data if isinstance(data,list) else data.get('@graph',[data]) if isinstance(data,dict) else [])
    nodes=[n for n in nodes if isinstance(n,dict) and n.get('@type')=='NewsArticle']
    if len(nodes)!=1:raise SourceError('MISSING_UNIQUE_PUBLISHER_NEWS_METADATA')
    n=nodes[0];publisher=n.get('publisher') or {};author=n.get('author') or {}
    if not isinstance(publisher,dict) or not isinstance(author,dict):
        raise SourceError('INVALID_PUBLISHER_NEWS_METADATA')
    stamp=parse_date(n.get('datePublished'));headline=clean(n.get('headline'),400);canonical=canonical_url(n.get('url') or n.get('@id'))
    if not stamp or not headline or publisher.get('name')!='GlobeNewswire' or not canonical or article_request_url(canonical)!=article_request_url(url):raise SourceError('INVALID_PUBLISHER_NEWS_METADATA')
    contributor=clean(author.get('name'),200) if isinstance(author,dict) else ''
    # Exact publisher ticker meta is distinct from arbitrary article body references.
    stock=clean(p.meta.get('ticker'),100)
    paragraphs=[v for v in p.paragraphs if re.search(r'(?:conference|earnings) call|webcast',v,re.I) and re.search(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}',v,re.I)]
    # Keep a short scheduling evidence clause, never the complete article.
    evidence=next((v for v in paragraphs if re.search(r'(?:will|to)\s+(?:host|hold)|(?:conference|earnings) call.{0,100}(?:will be held|will follow|is scheduled|scheduled at|scheduled for)|\bwill\s+(?:review|discuss)\b.{0,100}\bconference call\b',v,re.I) and not re.search(r'forward.looking|risk factors|risks and uncertainties',v,re.I)),'')[:1200]
    links=[]
    from .q4_events import public_link
    for l in p.body_links:
        link=public_link(l['url']);label=clean(l['label'],200)
        if not link or domain(link)=='www.globenewswire.com' and '/Tracker?' in link:continue
        if re.search(r'webcast|replay|presentation|slides|prepared remarks|shareholder letter|transcript',label,re.I):links.append({'url':link,'label':label})
    # The validated canonical may use an encoded spelling of the index IRI.
    # Keep the index identity so ingestion retires the exact staged ledger key.
    return {'headline':headline,'publishedAt':stamp,'url':canonical_url(url),'publisher':'GlobeNewswire','evidenceText':'',
            'distributionMetadata':{'contributor':contributor,'stocks':[x.strip() for x in stock.split(',') if x.strip()][:20]},'callEvidence':evidence,
            'materialLinks':links[:10],'authorSiteCandidate':canonical_url(author.get('url')) if isinstance(author,dict) else None,
            'articleContentHash':hashlib.sha256(body).hexdigest(),'metadataEvidence':'PUBLISHER_NEWSARTICLE_EXPLICIT_HEADLINE_DATE_AUTHOR_AND_TICKER'}


def collect(source,response,http,store,resolver,now):
    urls=archive_urls(response['body'],response['finalUrl']);out=[];attempted=0;temporary=0;consecutive_temporary=0;stop='BATCH_COMPLETED';limit=min(300,max(1,int(source.get('batchSize',100))))
    for url in sorted(urls,reverse=True):
        if len(out)>=limit:break
        slug=unquote(urlsplit(url).path.rsplit('/',1)[-1]).removesuffix('.html').replace('-',' ')
        if re.search(r'law firm|law offices|lead plaintiff|secure counsel|lawsuit|class action|investor alert|shareholder alert|ROSEN|Bronstein|Kaplan Fox|Robbins LLP|Hagens Berman|Grabar Law',slug,re.I):continue
        # Slugs may omit legal suffixes and common brands. This loose filter
        # only budgets document discovery; it never assigns company news.
        normalized=' '+re.sub(r'[^\w]+',' ',slug.casefold()).strip()+' '
        candidates={alias for token in normalized.split() for alias in resolver.by_token.get(token,set()) if len(alias)>=4}
        if not any(' '+alias+' ' in normalized for alias in candidates):continue
        key='distributorArchive:'+url;prior=store.state(key,{})
        if prior.get('status')=='INGESTED' or prior.get('nextAttempt','')>now:continue
        if prior.get('status')=='PARSED' and prior.get('entry'):
            entry=prior['entry']
            if article_request_url(entry.get('url'))==article_request_url(url):
                entry={**entry,'url':url}
            out.append(entry)
            if len(out)>=limit:break
            continue
        if attempted>=limit:break
        attempted+=1
        request_url=article_request_url(url)
        try:
            # Only parsed metadata is resumable state; raw article responses
            # must never enter transport caches, including before a hard stop.
            r=http.get(request_url,ttl=86400,persist=False)
            if article_request_url(r['finalUrl'])!=request_url:raise SourceError('DISTRIBUTOR_ARTICLE_REDIRECT_REQUIRES_REVALIDATION')
            entry=metadata(r['body'],url);out.append(entry)
            consecutive_temporary=0
            store.set_state(key,{'status':'PARSED','checkedAt':now,'publishedAt':entry['publishedAt'],'sourceId':source['sourceId'],'entry':entry})
        except BudgetExhausted:
            stop='BUDGET_DEFERRED';break
        except (SourceError,ValueError,TypeError) as exc:
            transient=any(code in str(exc) for code in ('HTTP_429','HTTP_50','DNS_UNAVAILABLE','NETWORK_UNAVAILABLE','NETWORK_TIMEOUT','RATE_LIMIT'))
            consecutive_temporary=consecutive_temporary+1 if transient else 0
            temporary+=int(transient)
            store.set_state(key,{'status':'TEMPORARY_FAILURE' if transient else 'DEGRADED','checkedAt':now,'nextAttempt':advance(now,1 if transient else 168),'reason':str(exc)[:160]})
            store.audit(now,source['sourceId'],'DISTRIBUTOR_METADATA_FAILURE',url=url,reason=str(exc)[:160])
            if consecutive_temporary>=3:
                stop='PUBLISHER_TEMPORARY_FAILURE_PAUSE';break
        finally:
            # PublicHTTP persists cache by default. Article bodies are deliberately
            # removed after metadata extraction, including HTTP memo copies.
            for cache_url in {canonical_url(url),request_url}:
                for path in http._paths(cache_url):
                    path.unlink(missing_ok=True)
                http.memo.pop((cache_url, True),None)
    store.set_state('distributorArchiveRun:'+source['sourceId'],{'checkedAt':now,'indexedURLs':len(urls),'attempted':attempted,'parsed':len(out),'temporaryFailures':temporary,'stopReason':stop})
    return out
