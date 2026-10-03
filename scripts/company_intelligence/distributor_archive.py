"""Bounded, resumable publisher-advertised archive metadata discovery.

URLs/slugs select candidates only. News needs explicit publisher headline/date,
and issuer ownership needs independent legal-author + exchange/ticker evidence.
Article bodies exist transiently during parsing; no full-text storage/export.
"""
import json,re
from html.parser import HTMLParser
from xml.etree import ElementTree as ET
from urllib.parse import urlsplit,unquote
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
    return list(dict.fromkeys(u for row in root if (u:=canonical_url(row.findtext(ns+'loc'))) and domain(u)=='www.globenewswire.com' and '/news-release/' in u))


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


def metadata(body,url):
    if len(body)>2*1024*1024 or domain(url)!='www.globenewswire.com' or '/news-release/' not in url:raise SourceError('UNSAFE_DISTRIBUTOR_ARTICLE')
    p=Metadata();p.feed(body.decode('utf-8','replace'))
    nodes=[]
    for data in p.jsonld:
        nodes.extend(data if isinstance(data,list) else data.get('@graph',[data]) if isinstance(data,dict) else [])
    nodes=[n for n in nodes if isinstance(n,dict) and n.get('@type')=='NewsArticle']
    if len(nodes)!=1:raise SourceError('MISSING_UNIQUE_PUBLISHER_NEWS_METADATA')
    n=nodes[0];publisher=n.get('publisher') or {};author=n.get('author') or {}
    stamp=parse_date(n.get('datePublished'));headline=clean(n.get('headline'),400);link=canonical_url(n.get('url') or n.get('@id'))
    if not stamp or not headline or publisher.get('name')!='GlobeNewswire' or link!=canonical_url(url):raise SourceError('INVALID_PUBLISHER_NEWS_METADATA')
    contributor=clean(author.get('name'),200) if isinstance(author,dict) else ''
    # Exact publisher ticker meta is distinct from arbitrary article body references.
    stock=clean(p.meta.get('ticker'),100)
    paragraphs=[v for v in p.paragraphs if re.search(r'(?:conference|earnings) call|webcast',v,re.I) and re.search(r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}',v,re.I)]
    # Keep a short scheduling evidence clause, never the complete article.
    evidence=next((v for v in paragraphs if re.search(r'(?:will|to) (?:host|hold)|conference call.{0,100}(?:will|held)|management.{0,100}call',v,re.I) and not re.search(r'forward.looking|risk factors|risks and uncertainties',v,re.I)),'')[:1200]
    links=[]
    from .q4_events import public_link
    for l in p.body_links:
        link=public_link(l['url']);label=clean(l['label'],200)
        if not link or domain(link)=='www.globenewswire.com' and '/Tracker?' in link:continue
        if re.search(r'webcast|replay|presentation|slides|prepared remarks|shareholder letter|transcript',label,re.I):links.append({'url':link,'label':label})
    return {'headline':headline,'publishedAt':stamp,'url':link,'publisher':'GlobeNewswire','evidenceText':'',
            'distributionMetadata':{'contributor':contributor,'stocks':[x.strip() for x in stock.split(',') if x.strip()][:20]},'callEvidence':evidence,
            'materialLinks':links[:10],'authorSiteCandidate':canonical_url(author.get('url')) if isinstance(author,dict) else None,
            'metadataEvidence':'PUBLISHER_NEWSARTICLE_EXPLICIT_HEADLINE_DATE_AUTHOR_AND_TICKER'}


def collect(source,response,http,store,resolver,now):
    urls=archive_urls(response['body'],response['finalUrl']);out=[];attempted=0;limit=min(300,max(1,int(source.get('batchSize',100))))
    for url in sorted(urls,reverse=True):
        if len(out)>=limit:break
        slug=unquote(urlsplit(url).path.rsplit('/',1)[-1]).removesuffix('.html').replace('-',' ')
        if re.search(r'law firm|law offices|lead plaintiff|secure counsel|lawsuit|class action|investor alert|shareholder alert|ROSEN|Bronstein|Kaplan Fox|Robbins LLP|Hagens Berman|Grabar Law',slug,re.I):continue
        if not resolver.resolve({'headline':slug},{'type':'RSS'}):continue  # Discovery filter only.
        key='distributorArchive:'+url;prior=store.state(key,{})
        if prior.get('status')=='INGESTED' or prior.get('nextAttempt','')>now:continue
        if prior.get('status')=='PARSED' and prior.get('entry'):
            out.append(prior['entry'])
            if len(out)>=limit:break
            continue
        if attempted>=limit:break
        attempted+=1
        try:
            r=http.get(url,ttl=86400)
            if canonical_url(r['finalUrl'])!=canonical_url(url):raise SourceError('DISTRIBUTOR_ARTICLE_REDIRECT_REQUIRES_REVALIDATION')
            entry=metadata(r['body'],url);out.append(entry)
            store.set_state(key,{'status':'PARSED','checkedAt':now,'publishedAt':entry['publishedAt'],'sourceId':source['sourceId'],'entry':entry})
        except BudgetExhausted:break
        except (SourceError,ValueError,TypeError) as exc:
            store.set_state(key,{'status':'DEGRADED','checkedAt':now,'nextAttempt':advance(now,168),'reason':str(exc)[:160]})
            store.audit(now,source['sourceId'],'DISTRIBUTOR_METADATA_FAILURE',url=url,reason=str(exc)[:160])
        finally:
            # PublicHTTP persists cache by default. Article bodies are deliberately
            # removed after metadata extraction, including HTTP memo copies.
            for path in http._paths(canonical_url(url)):
                path.unlink(missing_ok=True)
            http.memo.pop(canonical_url(url),None)
    store.set_state('distributorArchiveRun:'+source['sourceId'],{'checkedAt':now,'indexedURLs':len(urls),'attempted':attempted,'parsed':len(out)})
    return out
