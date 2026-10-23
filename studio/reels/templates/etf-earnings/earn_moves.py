import json,sys,statistics as st
R='/home/user/vision-universe-research/quant/data/market/golden-preview/daily/'
S=sys.argv[1]
T={'MSFT':'0000789019','GOOGL':'0001652044','AMZN':'0001018724','AAPL':'0000320193'}
W={'MSFT':4.00,'GOOGL':3.99,'AMZN':2.67,'AAPL':5.41}
out={}
for tk,cik in T.items():
    d=json.load(open(f'{S}/CIK{cik}.json'))['filings']['recent']
    dates=sorted({d['filingDate'][i] for i in range(len(d['form'])) if d['form'][i]=='8-K' and '2.02' in (d['items'][i] or '')})
    bars=json.load(open(f'{R}ref_{tk}.json')); bars=bars if isinstance(bars,list) else bars.get('bars') or bars.get('points')
    px={b['date']:b['adjustedClose'] for b in bars}; days=sorted(px)
    mv=[]
    for e in dates[-12:]:
        if e not in px: continue
        i=days.index(e)
        if i+1>=len(days): continue
        r=px[days[i+1]]/px[e]-1; mv.append((e,round(r*100,2)))
    out[tk]=mv
    a=[abs(x[1]) for x in mv[-8:]]
    print(tk,'letzte 8:',mv[-8:],'Ø|Bewegung|',round(st.mean(a),2),'max',max(a))
# Gewichteter Effekt auf den ETF je Quartal (gleiche Saison, wenn alle vier berichteten)
