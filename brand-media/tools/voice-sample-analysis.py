import json,subprocess,re,numpy as np,wave
log=json.load(open('samples/log.json'));T=log['text']
exp=re.findall(r"\w+",T.lower())
def f0(path):
    subprocess.run(['ffmpeg','-v','error','-y','-i',path,'-ac','1','-ar','16000','t.wav'],check=True)
    w=wave.open('t.wav');x=np.frombuffer(w.readframes(w.getnframes()),dtype=np.int16).astype(np.float32);w.close();x/=np.abs(x).max()+1e-6
    fl=640;f=[];lo=40;hi=228
    for i in range(0,len(x)-fl,160):
        fr=x[i:i+fl]-x[i:i+fl].mean()
        if np.sqrt((fr**2).mean())<0.02:continue
        ac=np.correlate(fr,fr,'full')[fl-1:];ac/=ac[0]+1e-9;s=ac[lo:hi];k=s.argmax()
        if s[k]>0.5:f.append(16000/(lo+k))
    f=np.array(f);return int(np.median(f)),round(float((12*np.log2(f/np.median(f))).std()),2)
for it in log['items']:
    p=it['file'];subprocess.run(['ffmpeg','-v','error','-y','-i',p,'-ac','1','-ar','16000','asr.wav'],check=True)
    r=subprocess.run(['npx','--yes','hyperframes','transcribe','asr.wav','--engine','parakeet','--language','de','--json','--dir','/tmp/vox/asrdir'],capture_output=True,text=True)
    words=[]
    for line in (r.stdout+"\n"+r.stderr).splitlines():
        if "\"type\":\"words\"" in line: words=[w["text"] for w in json.loads(line[line.index("{"):])["words"]]
    got=re.findall(r"\w+"," ".join(words).lower())
    hit=sum(1 for a,b in zip(exp,got) if a==b) if len(got)==len(exp) else sum(1 for w in exp if w in got)
    it['f0_median_hz'],it['f0_sd_semitones']=f0(p);it['asr_words_ok']=f"{hit}/{len(exp)}";it['asr_text']=" ".join(words)
    mp3=p.replace('.wav','.mp3');subprocess.run(['ffmpeg','-v','error','-y','-i',p,'-b:a','128k',mp3],check=True);it['mp3']=mp3
    print(it['who'],it['name'][:28].ljust(28),round(it['duration'],1),it['f0_median_hz'],it['f0_sd_semitones'],it['asr_words_ok'],'|',it['asr_text'])
json.dump(log,open('samples/log.json','w'),indent=1,ensure_ascii=False)
