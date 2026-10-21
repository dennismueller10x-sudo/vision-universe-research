/* Vorlade-Modul (`node --import`) fuer Kindprozess-Tests von `refresh-run.mjs observe`: ersetzt globalThis.fetch durch einen
 * In-Memory-Dienst, damit der ECHTE S3-Treiber (createS3DriverFromEnv) und die ECHTE Auslieferungspruefung laufen, ohne Netz.
 * Steuerung ueber OBSERVE_MOCK (Pfad zu JSON): {objects:{key:base64}, delivery:{status,body}|{throw:true}, put:{status}, get:{status}}.
 * Am Prozessende schreibt es OBSERVE_MOCK+'.out' ({puts:[keys], objects:{key:text}}). Wartezeiten >= 20 s werden verkuerzt. */
import {readFileSync,writeFileSync} from 'node:fs';
const cfg=JSON.parse(readFileSync(process.env.OBSERVE_MOCK,'utf8'));
const objects=new Map(Object.entries(cfg.objects||{}).map(([k,v])=>[k,Buffer.from(v,'base64')]));
const puts=[];
const realSetTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...a)=>realSetTimeout(fn,ms>=20000?0:ms,...a);
const reply=(status,body=Buffer.alloc(0))=>({ok:status>=200&&status<300,status,headers:new Headers(),
 text:async()=>Buffer.from(body).toString('utf8'),arrayBuffer:async()=>{const b=Buffer.from(body);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);},
 json:async()=>JSON.parse(Buffer.from(body).toString('utf8'))});
globalThis.fetch=async(url,init={})=>{
 const u=new URL(String(url));
 if(u.host==='research.visionuniverse.de'){
  if(cfg.delivery?.throw)throw new TypeError('fetch failed');
  return reply(cfg.delivery?.status??200,JSON.stringify(cfg.delivery?.body??{}));
 }
 const key=decodeURIComponent(u.pathname.replace(/^\/[^/]+\//,'')),method=init.method||'GET';
 if(method==='PUT'){
  if(cfg.put?.status&&cfg.put.status!==200)return reply(cfg.put.status,'<Error>AccessDenied</Error>');
  puts.push(key);objects.set(key,Buffer.from(init.body));return reply(200);
 }
 if(cfg.get?.status&&cfg.get.status!==200&&key.endsWith('observed.json'))return reply(cfg.get.status,'<Error>Denied</Error>');
 return objects.has(key)?reply(200,objects.get(key)):reply(404);
};
process.on('exit',()=>{try{writeFileSync(process.env.OBSERVE_MOCK+'.out',JSON.stringify({puts,objects:Object.fromEntries([...objects].map(([k,v])=>[k,v.toString('utf8')]))}));}catch{}});
