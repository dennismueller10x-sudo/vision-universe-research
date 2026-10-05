import json
import tempfile
import unittest
from pathlib import Path
from company_intelligence.wordpress_news import endpoint, parse, fetch, discover
from company_intelligence.transport import PublicHTTP, SourceError
from company_intelligence.feeds import parse_links, discover_ir
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company, NOW


def source():
    return {'companyId': company()['companyId'], 'sourceId': 'wp', 'verified': True,
            'url': endpoint('https://apple.com/wp-json/'), 'format': 'WORDPRESS_REST_NEWS',
            'type': 'IR_FEED', 'provider': 'WORDPRESS', 'allowedSites': ['https://apple.com/'], 'intervalHours': 4}


def row(title='Apple Inc. announces quarterly results', url='https://apple.com/results', stamp='2026-10-01T12:00:00'):
    return {'title': {'rendered': title}, 'link': url, 'date_gmt': stamp}


class WordPressNewsTests(unittest.TestCase):
    def test_explicit_utc_metadata_and_html_title_without_body_or_local_date_fallback(self):
        s=source();body=json.dumps([row('Apple Inc. announces results &amp; outlook'),row(url='https://evil.example/news'),row(stamp='2026-10-01T12:00:00+01:00'),row(stamp='0000-00-00T00:00:00')]).encode()
        entries=parse(body,s,s['url'])
        self.assertEqual(len(entries),1);self.assertEqual(entries[0]['publishedAt'],'2026-10-01T12:00:00Z')
        self.assertEqual(entries[0]['headline'],'Apple Inc. announces results & outlook');self.assertEqual(entries[0]['evidenceText'],'')
        missing=row();missing.pop('date_gmt');self.assertEqual(parse(json.dumps([missing]).encode(),s,s['url']),[])
        self.assertEqual(parse(json.dumps([row(stamp='2026-10-01')]).encode(),s,s['url']),[])

    def test_advertised_verified_rest_root_only_with_metadata_fields(self):
        links=parse_links(b'<link rel="https://api.w.org/" href="https://apple.com/wp-json/">','https://apple.com/')
        class HTTP:
            def __init__(self):self.calls=[]
            def get(self,url,**kw):self.calls.append((url,kw));return {'body':json.dumps([row()]).encode(),'finalUrl':url}
        h=HTTP();s=discover(links,'https://apple.com/',company(),['https://apple.com/'],h,NOW)
        self.assertEqual(s['intervalHours'],4);self.assertEqual(s['format'],'WORDPRESS_REST_NEWS')
        self.assertIn('_fields=date_gmt%2Clink%2Ctitle.rendered',s['url']);self.assertEqual(len(h.calls),1)
        self.assertNotIn('robots',h.calls[0][1])
        for html in [b'<a href="https://apple.com/wp-json/">WordPress API</a>',b'<link rel="https://api.w.org/" href="https://evil.example/wp-json/">']:
            self.assertIsNone(discover(parse_links(html,'https://apple.com/'),'https://apple.com/',company(),['https://apple.com/'],h,NOW))
        self.assertEqual(len(h.calls),1)
        self.assertIsNone(endpoint('https://apple.com/wp-json/?token=secret'))

    def test_server_ignoring_fields_cannot_retain_article_content_in_cache_or_memo(self):
        with tempfile.TemporaryDirectory() as tmp:
            h=PublicHTTP(Path(tmp));s=source();url=s['url'];raw=json.dumps([{**row(),'content':{'rendered':'FULL ARTICLE BODY'}}]).encode()
            for path in h._paths(url):path.write_bytes(raw)
            key=(url,True)
            h.memo[key]={'body':raw,'finalUrl':url}
            h.get=lambda *a,**kw:h.memo[key]
            with self.assertRaisesRegex(SourceError,'BODY_FIELDS'):fetch(h,s)
            self.assertFalse(any(path.exists() for path in h._paths(url)));self.assertNotIn(key,h.memo)

    def test_unverified_changed_contract_foreign_redirect_and_invalid_schema_fail_closed(self):
        s=source();body=json.dumps([row()]).encode()
        for bad,final in [({**s,'verified':False},s['url']),({**s,'url':s['url']+'&token=x'},s['url']),(s,'https://evil.example/wp-json/wp/v2/posts')]:
            with self.assertRaises(SourceError):parse(body,bad,final)
        for raw in [b'{}',b'bad',json.dumps([row()]*101).encode(),b'x'*(2*1024*1024+1)]:
            with self.assertRaises(SourceError):parse(raw,s,s['url'])

    def test_full_discovery_and_ingestion_preserve_explicit_issuer_actor_precision(self):
        page='https://apple.com/investors/';api=endpoint('https://apple.com/wp-json/')
        class HTTP:
            def get(self,url,**kw):
                if url==api:return {'body':json.dumps([row(),row('Other Company Inc. reports quarterly results',url='https://apple.com/customer'),row('Hello world!',url='https://apple.com/default')]).encode(),'finalUrl':url}
                if url==page:return {'body':b'<script src="/wp-includes/core.js"></script><link rel="https://api.w.org/" href="https://apple.com/wp-json/">','finalUrl':url}
                raise SourceError('HTTP_404')
        h=HTTP();sources,configs=discover_ir(company(),page,h,NOW)
        self.assertEqual(len(sources),1);self.assertEqual(sources[0]['format'],'WORDPRESS_REST_NEWS')
        with tempfile.TemporaryDirectory() as tmp:
            st=Store(Path(tmp)/'s.sqlite');c=company();p=Pipeline(Path(tmp),{c['companyId']:c},st,h,NOW);p.ingest_source(sources[0])
            items=[json.loads(r[0]) for r in st.db.execute('select payload from items')]
            self.assertEqual(len(items),1);self.assertEqual(items[0]['canonicalUrl'],'https://apple.com/results')
            self.assertEqual(st.sources()[0]['cmsNewsPolicy'],'WORDPRESS_EXPLICIT_ISSUER_ACTOR')
            self.assertNotIn('content',items[0]);st.close()
