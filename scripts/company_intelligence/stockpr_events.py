"""Observed StockPR/Equisolve event cards under independently verified IR hosts.

Dates stay inside a bounded card and must agree with its time element. No
news timestamps, guessed endpoints or implicit timezones establish an event.
"""
import re
from datetime import datetime
from company_intelligence.structured_sources import _GCSFragments
from company_intelligence.feeds import parse_links
from company_intelligence.ir_events import MONTHS,from_announcement
from company_intelligence.model import clean,within_domain

def parse(body,source,now):
 if not source.get('verified') or source.get('provider')!='STOCKPR' or len(body)>2*1024*1024:return []
 p=_GCSFragments(lambda tag,attrs,parents:tag=='article' and 'media' in (attrs.get('class') or '').split());p.feed(body.decode('utf-8','replace'));out=[]
 for card in p.fragments:
  ts=re.findall(r'<time\b([^>]*)>(.*?)</time\s*>',card,re.I|re.S)
  if len(ts)!=1:continue
  attrs,text=ts[0];m=re.search(r'\bdatetime\s*=\s*["\']([^"\']+)',attrs,re.I)
  if not m or not re.fullmatch(r'20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?',m[1]):continue
  try:machine=datetime.fromisoformat(m[1].replace('Z','+00:00'))
  except ValueError:continue
  text=clean(text,500)
  def full(m):
   month=next((x for x in MONTHS if x[:3]==m[1].lower()[:3]),None)
   return month.title()+' '+m[2]+', '+m[3] if month else m[0]
  text=re.sub(r'\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b',full,text,flags=re.I)
  ls=parse_links(card.encode(),source['url']);primary=next((l for l in ls if re.search(r'/(?:ir-calendar|events)/detail/',l['url']) and any(within_domain(l['url'],u) for u in source.get('allowedSites',[])) and l['text']),None)
  if not primary:continue
  item={'url':primary['url'],'headline':primary['text'],'evidenceText':text,'materialLinks':[{'url':l['url'],'label':l['text'],'mediaType':l.get('type','')} for l in ls if l!=primary]}
  for e in from_announcement(item,{**source,'type':'IR_EVENTS','format':'STOCKPR_EVENTS'},now):
   if e['date']!=machine.date().isoformat():continue
   if machine.tzinfo and e.get('startsAt') and datetime.fromisoformat(e['startsAt'].replace('Z','+00:00'))!=machine:continue
   if not machine.tzinfo and 'T' in m[1] and e.get('time') and machine.strftime('%H:%M')!=e['time']:continue
   e['confirmationEvidence']='VALIDATED_STOCKPR_EVENT_CARD_EXPLICIT_TIME_ELEMENT';out.append(e)
 return list({e['eventId']:e for e in out}.values())
