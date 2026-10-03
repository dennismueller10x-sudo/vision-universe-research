"""Corporate CMS feeds can contain comments, defaults and unrelated agency blogs.

Ownership of a site does not make every CMS entry a company announcement.
This filter is intentionally conservative and does not fetch article bodies.
"""
import re
from .model import classify, Resolver


def wordpress_feed(body):
    return bool(re.search(br'<generator\b[^>]*>[^<]*wordpress\.org',body,re.I))


def eligible(entry, company, wordpress=False):
    title=entry.get('headline') or ''
    if re.fullmatch(r'\s*hello world[!.\s]*',title,re.I) or re.match(r'\s*comment on\b',title,re.I):
        return False
    if not wordpress:return True
    if classify(title)['categories']!=['Other']:return True
    # A general CMS blog item needs an explicit high-confidence issuer actor.
    # Source ownership alone cannot turn an agency podcast into company news.
    return bool(Resolver({company['companyId']:company}).resolve(entry,{'type':'RSS','verified':False}))
