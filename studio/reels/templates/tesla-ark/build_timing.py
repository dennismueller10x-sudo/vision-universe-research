#!/usr/bin/env python3 -I
import sys,json
W=json.load(open(sys.argv[1])); assert len(W)==106,len(W)
st=lambda i:W[i]["start"]; en=lambda i:W[i]["end"]
SC=[0.0,round(st(26)-.08,2),round(st(38)-.08,2),round(st(68)-.08,2),round(st(82)-.08,2),round(st(88)-.08,2),round(en(105)+.55,2)]
P=[("Über <b>1.200 Prozent</b> Rendite.",0,3),("So viel traut <b>ARK Invest</b><br>der Tesla-Aktie im <b>Bull Case</b> zu.",4,14),("Das klingt <b>verrückt.</b>",15,17),("Dann schau dir an,<br>was dafür <b>passieren muss.</b>",18,25),
 ("Tesla steht aktuell bei<br>rund <b>370 Dollar.</b>",26,32),("Das Ziel für 2031:<br><b>5.000 Dollar.</b>",33,37),("Der Grund: <b>Robotaxis.</b>",38,40),
 ("Sie machen rund <b>80 Prozent</b><br>des Werts aus.",41,48),("Im Bull Case fahren<br><b>zehn Millionen</b> davon.",49,55),
 ("Ein <b>Cybercab</b> soll pro Meile<br><b>40 Prozent weniger</b> kosten als ein Waymo.",56,67),
 ("Dazu <b>1,2 Millionen</b> Optimus-Roboter,<br>verkauft an Kunden.",68,76),("Über <b>250 Mrd. Dollar</b> Umsatz.",77,81),("Das ist ein <b>Modell,</b><br>keine <b>Prognose.</b>",82,87),
 ("<b>Tesla</b> findest du in der<br>Vision Universe App.",88,95),("In den Themen <b>Autonomes Fahren</b>",96,100),("und <b>Humanoide Robotik.</b>",101,103),("<b>Bald verfügbar.</b>",104,105)]
SUBS=[]
for k,(h,a,b) in enumerate(P):
    s=st(a); e=en(b)+0.12
    if k+1<len(P): e=min(e,st(P[k+1][1])-0.02)
    SUBS.append([round(s,2),round(e,2),h])
TM={"sc":SC,"tok":[round(st(i),3) for i in range(len(W))],"clips":[[0.0,SC[1]]]}
TOTAL=round(SC[-1]+0.05+1.8,2)
json.dump({"TM":TM,"SUBS":SUBS,"TOTAL":TOTAL,"SPEECH_END":round(en(105),2)},open(sys.argv[2],"w"),ensure_ascii=False,indent=1)
print("Szenen",SC,"Gesamt",TOTAL)
