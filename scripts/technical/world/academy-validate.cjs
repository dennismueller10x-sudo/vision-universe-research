/* Read-only content gate. Executed by node:test and usable by editorial tooling. */
const M = require('../../../technical/academy/model.js');
module.exports = function validate(c, contracts) {
  const errors=[]; const check=(v,s)=>{if(!v)errors.push(s);};
  check(c.schemaVersion==='technical-academy-1.0.0' && c.contentVersion===1,'version');
  check(c.paths.length===8,'8 paths');check(c.lessons.length===32,'32 lessons');
  for(const [kind,rows] of [['path',c.paths],['lesson',c.lessons],['glossary',c.glossary]]) {
    check(new Set(rows.map(x=>x.id)).size===rows.length,kind+' duplicate id');
    for(const r of rows)check(/^[a-z][a-z0-9-]*$/.test(r.id),kind+' id');
  }
  check(new Set(c.lessons.map(l=>l.title)).size===32,'duplicate title');
  check(new Set(c.lessons.map(l=>l.foundations[0])).size===32,'duplicate lesson');
  const refs=c.paths.flatMap(p=>p.lessons);
  check(new Set(refs).size===32 && refs.length===32,'duplicate/missing membership');
  for(const p of c.paths){check(p.lessons.length===4,'4 lessons '+p.id);for(const id of p.lessons)check(c.lessons.some(l=>l.id===id&&l.pathId===p.id),'path reference '+id);}
  for(const l of c.lessons){
    check(Number.isInteger(l.version) && l.version>=1 && c.paths.some(p=>p.id===l.pathId),'lesson version/path '+l.id);
    for(const key of ['title','question'])check(typeof l[key]==='string'&&l[key].trim(),key+' '+l.id);
    for(const key of ['objectives','foundations','limits','sources','glossary'])check(Array.isArray(l[key])&&l[key].length>0&&l[key].every(s=>typeof s==='string'&&s.trim()),key+' '+l.id);
    check(['sequence','candle'].includes(l.visual.type)&&l.visual.labels.length>=1&&!!l.visual.caption,'visual '+l.id);
    check(l.example.kind==='constructed'&&l.example.text.length>30,'example '+l.id);
    for(const ref of l.glossary)check(c.glossary.some(t=>t.id===ref),'glossary '+ref);
    for(const ref of l.reading||[])check(c.readings.some(r=>r.id===ref),'reading '+ref);
    const q=l.quiz;
    check(q.type==='single-choice'&&q.prompt&&q.explanation,'quiz type '+l.id);
    check(q.choices.length>=2 && new Set(q.choices.map(x=>x.id)).size===q.choices.length && q.choices.every(x=>x.text),'quiz choices '+l.id);
    check(q.choices.filter(x=>x.id===q.answer).length===1,'quiz answer '+l.id);
    check(l.practice.instruction.length>20&&c.targets[l.practice.target],'practice '+l.id);
  }
  for(const [key,t] of Object.entries(c.targets)){
    check(M.safeLink(t.href),'unsafe target '+key);
    const r=contracts.parseRoute(t.href);
    check(['assistant','chart','screener','templates'].includes(r.view),'target route '+key);
    if(r.view==='assistant'&&r.id)check(!!contracts.assistant.get(r.id),'assistant '+key);
    if(r.view==='templates'&&r.id)check(!!contracts.templates.get(r.id),'template '+key);
  }
  check(new Set(c.readings.map(r=>r.id)).size===c.readings.length,'duplicate reading');
  for(const r of c.readings)check(/^https:\/\//.test(r.url) && ['primary','secondary'].includes(r.kind) && r.title,'reading source '+r.id);
  const strings=[];function walk(x){if(typeof x==='string')strings.push(x);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')Object.values(x).forEach(walk);}walk(c);
  for(const s of strings){
    check(!/<\/?[a-z][^>]*>|javascript:|\bonerror\s*=/i.test(s),'markup');
    check(!/garantierte Gewinne|sichere Rendite|schlägt (?:immer|sicher) den Markt|Erfolgsgarantie|kaufen Sie|verkaufen Sie/i.test(s),'unsupported promise');
  }
  for(const item of c.lessons.concat(c.glossary))for(const src of item.sources)check(contracts.exists(src),'missing source '+src);
  return errors;
};
