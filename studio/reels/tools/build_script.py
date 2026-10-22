#!/usr/bin/env python3 -I
"""Skript-DSL -> TTS-Text und Zeitplan. Markup im Skript:
  [[s2]]            Szenenstart (s2..s6) vor dem nächsten Wort
  [[e:name]]        Ereignis-Marke (Zeit des nächsten Wortes) für Grafiken
  {gesprochen|Anzeige}   gesprochene Form (ausgeschrieben) und Untertitel-Form (Ziffern); **fett** erlaubt
  **Wort**          fett im Untertitel
Aufruf:
  build_script.py script.txt tts out_dir/tts_request.json          (schreibt Sprechtext, Sprecher aus --voice)
  build_script.py script.txt timing words.json timing.json         (words.json = Wortzeiten nach tighten.py)
"""
import sys,re,json
def parse(src):
    toks=[];marks=[]   # marks: (token_index, name)
    for m in re.finditer(r'\[\[(.*?)\]\]|\{(.*?)\|(.*?)\}|(\S+)',src,re.S):
        if m.group(1) is not None: marks.append((len(toks),m.group(1).strip())); continue
        if m.group(2) is not None: say=m.group(2).split(); show=m.group(3).strip()
        else:
            w=m.group(4); say=[w.replace('**','')]; show=w
        bold='**' in show; show=show.replace('**','')
        if toks and re.fullmatch(r'[.,!?:;]+',show):
            toks[-1]['say'][-1]+=show; toks[-1]['show']+=show; toks[-1]['end']=bool(re.search(r'[.!?:]$',show)) or toks[-1]['end']; continue
        toks.append({"say":say,"show":show,"bold":bold,"end":bool(re.search(r'[.!?:]$',say[-1]))})
    return toks,marks
def main():
    src=open(sys.argv[1],encoding='utf-8').read(); toks,marks=parse(src)
    if sys.argv[2]=='tts':
        text=' '.join(w for t in toks for w in t['say'])
        req={"voice_id":"e8b866d761284bd6b188848f3c9f5d4e","text":text,"language":"de","engine":"elevenlabs","settings":{"model_id":"eleven_v3"}}
        json.dump(req,open(sys.argv[3],'w'),ensure_ascii=False,indent=1); print(len(text.split()),'Wörter'); return
    W=json.load(open(sys.argv[3])); n=sum(len(t['say']) for t in toks)
    assert n==len(W),(n,len(W))
    i=0
    for t in toks:
        t['s']=W[i]['start']; i+=len(t['say']); t['e']=W[i-1]['end']
    sc={"s1":0.0}; ev={}
    for ti,name in marks:
        tt=toks[ti]['s'] if ti<len(toks) else W[-1]['end']
        if name.startswith('e:'): ev[name[2:]]=round(tt,3)
        else: sc[name]=round(max(0,tt-0.08),2)
    end=W[-1]['end']; names=['s1','s2','s3','s4','s5','s6']
    SC=[sc.get(k) for k in names]; assert all(v is not None for v in SC),SC
    SC=SC[:]+[round(end+0.55,2)]
    # Untertitel-Gruppen
    groups=[];cur=[]
    for t in toks:
        cur.append(t)
        if t['end'] or (len(cur)>=6 and t['say'][-1].endswith(',')) or len(cur)>=8: groups.append(cur);cur=[]
    if cur: groups.append(cur)
    SUBS=[]
    for gi,g in enumerate(groups):
        words=[('<b>'+t['show']+'</b>') if t['bold'] else t['show'] for t in g]
        plain=' '.join(t['show'] for t in g)
        if len(plain)>26:
            best=None;acc=0
            for k,t in enumerate(g[:-1]):
                acc+=len(t['show'])+1
                d=abs(acc-len(plain)/2)
                if best is None or d<best[0]: best=(d,k)
            k=best[1]; html=' '.join(words[:k+1])+'<br>'+' '.join(words[k+1:])
        else: html=' '.join(words)
        s=g[0]['s']; e=g[-1]['e']+0.12
        if gi+1<len(groups): e=min(e,groups[gi+1][0]['s']-0.02)
        SUBS.append([round(s,2),round(e,2),html])
    TM={"sc":SC,"ev":ev,"clips":[[0.0,SC[1]]]}
    TOTAL=round(SC[-1]+0.05+1.8,2)
    json.dump({"TM":TM,"SUBS":SUBS,"TOTAL":TOTAL,"SPEECH_END":round(end,2)},open(sys.argv[4],'w'),ensure_ascii=False,indent=1)
    print("Szenen",SC,"Ereignisse",ev,"Gesamt",TOTAL)
main()
