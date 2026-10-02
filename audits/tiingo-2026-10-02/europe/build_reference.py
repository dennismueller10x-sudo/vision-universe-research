"""Build a transparent European reference from captured public constituent tables.
Snapshot capture and live API evidence are separate; no production imports.
"""
import pandas as pd,json,re,hashlib,unicodedata,gzip,io
from pathlib import Path
from lxml import html
D=Path(__file__).parent
SOURCES=[('STOXX_Europe_600', 'reference-source-0.raw.gz',3,'Company','Ticker',None),('FTSE_250_Index','reference-FTSE_250_Index.html.gz',3,'Company','Ticker','United Kingdom'),('FTSE_100_Index','reference-FTSE_100_Index.html.gz',6,'Company','Ticker','United Kingdom'),('DAX','reference-DAX.html.gz',4,'Company','Ticker','Germany'),('MDAX','reference-MDAX.html.gz',2,'Name','Symbol','Germany'),('CAC_40','reference-CAC_40.html.gz',4,'Company','Ticker','France'),('AEX_index','reference-AEX_index.html.gz',3,'Company','Ticker','Netherlands'),('Swiss_Market_Index','reference-Swiss_Market_Index.html.gz',2,'Name','Ticker','Switzerland'),('OMX_Stockholm_30','reference-OMX_Stockholm_30.html.gz',1,'Company','Ticker','Sweden'),('OMX_Helsinki_25','reference-OMX_Helsinki_25.html.gz',1,'Company','Ticker','Finland'),('OMX_Copenhagen_25','reference-OMX_Copenhagen_25.html.gz',0,'Company','Ticker symbol','Denmark'),('FTSE_MIB','reference-FTSE_MIB.html.gz',1,'Company','Ticker','Italy'),('IBEX_35','reference-IBEX_35.html.gz',2,'Company','Ticker','Spain')]
SOURCES += [('EURO_STOXX_50','reference-EURO_STOXX_50.html.gz',3,'Name','Ticker',None),('OBX_Index','reference-OBX_Index.html.gz',0,'Company','Ticker symbol','Norway'),('ISEQ_20','reference-ISEQ_20.html.gz',0,'Company','MNEM code','Ireland'),('BEL_20','reference-BEL_20.html.gz',2,'Company','Ticker symbol','Belgium')]
def clean(x): return '' if pd.isna(x) else re.sub(r'\[[^\]]+\]','',str(x)).strip()
def norm(x):
 x=unicodedata.normalize('NFKD',x).encode('ascii','ignore').decode().lower()
 x=re.sub(r'\b(international|holding|holdings|group|incorporated|corporation|corp|inc|limited|ltd|plc|ag|sa|se|nv|oyj|ab|spa)\b','',x)
 return re.sub(r'[^a-z0-9]','',x)
raw=[];excluded=[];sources=[]
for src,file,idx,nc,tc,country in SOURCES:
 b=gzip.decompress((D/file).read_bytes()) if file.endswith('.gz') else (D/file).read_bytes(); t=pd.read_html(io.BytesIO(b))[idx];soup=html.fromstring(b); name_links={}
 for a in soup.xpath('//table//a[@href]'):
  text=a.text_content().strip();href=a.get('href','')
  href=href.removeprefix('https://en.wikipedia.org')
  if href.startswith('./'): href='/wiki/'+href[2:]
  if href.startswith('/wiki/') and ':' not in href[6:]: name_links.setdefault(text,href.split('#')[0])
 used=0
 for _,r in t.iterrows():
  name=clean(r[nc]);ticker=clean(r[tc]);sector=next((clean(r[c]) for c in t.columns if 'Sector' in str(c) or 'sector' in str(c)),None)
  if not name:continue
  record={'company':name,'localSymbol':ticker or None,'country':clean(r.get('Country',country)) or country,'countryBasis':'constituent-country' if 'Country' in t else 'index-geography (not issuer domicile)','sector':sector,'referenceIndices':[src],'sourcePage':'https://en.wikipedia.org/wiki/'+src,'article':name_links.get(name),'referenceConfidence':'SECONDARY_PUBLIC_CONSTITUENT_TABLE'}
  if name in ['Computer Center','GCP Infrastructure Investments','Vietnam Enterprise Investments','International Public Partnerships','Pantheon International','3i Infrastructure','Renewables Infrastructure Group','HICL Infrastructure','Greencoat UK Wind','Greencoat Renewables'] or (sector and ('Investment Trust' in sector or sector=='Hedge Funds')) or re.search(r'Investment Trust|Income Trust|Equity Trust|Technology Trust|Income Fund|Opportunity Fund',name,re.I):
   record['exclusion']='Malformed issuer identity: source Computer Center/CTG cannot be safely resolved to Computacenter/CCC' if name=='Computer Center' else 'Investment trust/fund, not operating-company common equity';excluded.append(record);continue
  # These public links point at parents or conflate different legal issuers.
  if name in ['BW LPG','Hafnia Limited','Porsche','Porsche SE']:record['article']=None
  record['sourceConstituentRows']=[{k:record[k] for k in ['company','localSymbol','country','sourcePage','article']} ]
  record['sourceConstituentRows'][0]['index']=src
  record['dedupeKey']=record['article'] or 'name:'+norm(name)
  if name in ['Porsche','Porsche SE']:record['dedupeKey']='name:'+name
  raw.append(record);used+=1
 sources.append({'index':src,'url':'https://en.wikipedia.org/wiki/'+src,'file':str(D/file),'sha256':hashlib.sha256(b).hexdigest(),'tableRows':len(t),'companyRowsIncluded':used,'limitations':'Captured secondary source, not an official index membership assertion. STOXX table is incomplete; union does not claim exact current STOXX 600 membership.'})
# Prefer same corporate article; then legal-suffix-normalized company name; preserve all aliases and index memberships.
merged={};normkey={}
for r in raw:
 n=norm(r['company']);
 if r['company'] in ['Porsche','Porsche SE']:n=r['company']
 if re.search(r' [ABCD]$',r['company']) and norm(r['company'][:-2]) in normkey: n=norm(r['company'][:-2])
 k=normkey.get(n,r['dedupeKey']); normkey[n]=k
 if k in merged:
  q=merged[k];q['sourceConstituentRows']+=r['sourceConstituentRows'];q['referenceIndices']=sorted(set(q['referenceIndices']+r['referenceIndices']));q['aliases']=sorted(set(q.get('aliases',[])+[r['company']]));q['localSymbols']=sorted(set(q.get('localSymbols',[q['localSymbol']])+([r['localSymbol']] if r['localSymbol'] else [])))
 else:merged[k]=r
# Canonical corporate title variants not fully captured by legal-suffix normalization.
manual_groups=[['Orkla','Orkla ASA'],['Redeia','Redeia Corporación'],['LVMH','LVMH Moët Hennessy Louis Vuitton'],['A.P. Møller-Mærsk (class A)','A.P. Møller-Mærsk (class B)','Maersk'],['Evonik','Evonik Industries'],['Howden Joinery','Howdens Joinery'],['IHG Hotels & Resorts','InterContinental Hotels Group'],['Spirax Group','Spirax-Sarco Engineering'],['Orange','Orange S.A.'],['Stora Enso','Stora Enso R'],['Fresenius Medical Care','Fresenius Medical Care AG & Co. KGaA'],['Volkswagen','Volkswagen Group'],['Thyssenkrupp','ThyssenKrupp'],['Swiss Re','Swiss Reinsurance Company Ltd'],['Richemont','Compagnie Financière Richemont SA'],['London Stock Exchange','London Stock Exchange Group'],['BT Group','BT'],['JDE Peet’s',"JDE Peet's"],['H&M','Hennes & Mauritz'],['Industrivärden','Industrivarden'],['Nordea','Nordea Bank'],['Banco Santander','Santander'],['Banco Sabadell','Sabadell'],['International Airlines Group','International Consolidated Airlines Group'],['DHL Group','Deutsche Post'],['Fuchs SE','Fuchs Petrolub']]
for group in manual_groups:
 keys=[k for k,r in merged.items() if norm(r['company']) in {norm(v) for v in group}]
 if len(keys)>1:
  q=merged[keys[0]]
  for k in keys[1:]:
   r=merged.pop(k);q['sourceConstituentRows']+=r['sourceConstituentRows'];q['aliases']=sorted(set(q.get('aliases',[])+[r['company']]+r.get('aliases',[])));q['referenceIndices']=sorted(set(q['referenceIndices']+r['referenceIndices']))
rows=sorted(merged.values(),key=lambda r:r['company'].lower())
for r in rows:
 if r['company']=='Rational':r['referenceWarnings']=['STOXX secondary table gives FRA, which collides with Fraport; MDAX source gives RAA. Local symbol is unresolved unless venue and issuer identity are independently validated.']
 r['companyId']='eu_'+hashlib.sha256(r['dedupeKey'].encode()).hexdigest()[:12]
out={'asOf':'2026-10-02','methodology':'Union of captured STOXX Europe 600 (incomplete public table) and major regional constituent tables plus FTSE 250; investment trusts and hedge funds excluded; corporate article and normalized name dedupe. Reference is representative, not authoritative exact membership or a market-cap rank. REIT operating companies retained. UK index membership does not establish issuer domicile.','sourceRows':len(raw),'deduplicatedCompanies':len(rows),'duplicateRowsRemoved':len(raw)-len(rows),'excludedNonCompanyRows':excluded,'sources':sources,'companies':rows}
(D/'top_europe_reference.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
print(len(raw),len(rows),len(excluded))
