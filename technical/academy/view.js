(function (g) {
  'use strict';
  var D = g.document, M = g.VUAcademyModel, cached, request = 0, current = null, memorySession = null;
  function node(tag, text, attrs, children) {
    var n = D.createElement(tag);
    if (text !== null && text !== undefined) n.textContent = text;
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { n.append(c); });
    return n;
  }
  function link(text, href) { return node('a', text, { href: href }); }
  function list(items) { return node('ul', null, {}, items.map(function (s) { return node('li', s); })); }
  function section(title, children) { return node('section', null, {}, [node('h2', title)].concat(children)); }
  function sessionStore() { try { return g.sessionStorage; } catch (_) { return null; } }
  function capture(clear) {
    if (!current) return;
    var selected = current.form.querySelector('input:checked');
    memorySession = { id: current.lesson.id, contentVersion: current.content.contentVersion, lessonVersion: current.lesson.version,
      choice: selected ? selected.value : null, checked: current.checked, y: g.scrollY };
    var scene=current.visual && current.visual.querySelector('button[aria-pressed=true]');
    if(scene)memorySession.scene=scene.getAttribute('data-scene');
    M.saveSession(sessionStore(), memorySession); if(clear)current = null;
  }
  // Registered before app.js, so the old lesson still exists when navigation starts.
  g.addEventListener('hashchange', function(){capture(true);});
  g.addEventListener('pagehide', function(){capture(false);});
  function store() { try { return g.localStorage; } catch (_) { return null; } }
  function header(title) { return node('header', null, { class: 'tc-head' }, [link('← Technical', '#/'), node('h1', title, { class: 'tc-title', tabindex: '-1' })]); }
  function figure(visual) {
    var fig = node('figure', null, { class: 'ta-figure' });
    if (visual.type === 'candle') {
      var svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 320 200'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', visual.labels.join(', '));
      [['line',{x1:65,y1:15,x2:65,y2:180}],['rect',{x:45,y:77,width:40,height:62}],['line',{x1:85,y1:77,x2:115,y2:77}],['line',{x1:85,y1:139,x2:115,y2:139}]].forEach(function (x) {
        var n = D.createElementNS(svg.namespaceURI, x[0]); Object.keys(x[1]).forEach(function(k){n.setAttribute(k,x[1][k]);}); svg.append(n);
      });
      visual.labels.forEach(function (label, i) { var t=D.createElementNS(svg.namespaceURI,'text');t.setAttribute('x',125);t.setAttribute('y',[22,82,144,185][i]);t.textContent=label;svg.append(t); });
      fig.append(svg);
    } else {
      fig.append(node('ul', null, { class: 'ta-diagram', 'aria-label': 'Schematische Gegenüberstellung' }, visual.labels.map(function(s) { return node('li',s); })));
    }
    fig.append(node('figcaption', visual.caption)); return fig;
  }
  function paint(host, content, id, focus) {
    var resume = M.session(sessionStore(), content) || memorySession;
    var completed = M.read(store(), content), lesson = content.lessons.find(function (l) { return l.id === id; });
    var wrap = node('div', null, { class: 'ta' }); host.replaceChildren(wrap);
    if (!id) {
      wrap.append(link('← Vision Universe Academy','/academy/'),header('Strategie-Akademie'),node('p','Technische Werkzeuge verstehen, Befunde prüfen und im vorhandenen Technical anwenden. 8 Lernpfade · 32 Lektionen.'),
        node('p','Beschreibende Chartanalyse ist kein nachgewiesener Handelsvorteil. Alle Beispiele sind konstruiert; keine Anlageempfehlung.'),
        node('p', completed.length + ' von 32 Lektionen abgeschlossen · nur in diesem Browser gespeichert.', { role:'status' }));
      if(M.outdated(store(),content))wrap.append(node('p','Lerninhalte wurden überarbeitet. Abschlüsse geänderter Lektionen müssen erneut markiert werden.',{role:'status'}));
      var reset = node('button','Lokalen Fortschritt zurücksetzen',{type:'button'});
      reset.addEventListener('click',function(){
        if (!g.confirm('Alle lokalen Lektionsabschlüsse zurücksetzen?')) return;
        if (M.save(store(),content,[])) { paint(host,content,null,false); host.querySelector('button').focus({preventScroll:true}); } else wrap.append(node('p','Speichern ist gesperrt. Der lokale Fortschritt wurde nicht verändert.',{role:'status'}));
      });
      wrap.append(reset);
      if (resume && content.lessons.some(function(l){return l.id===resume.id;})) wrap.append(link('Begonnene Lektion fortsetzen', '#/akademie/'+resume.id));
      var grid=node('div',null,{class:'ta-paths'});
      content.paths.forEach(function (path) {
        var done=path.lessons.filter(function(k){return completed.indexOf(k)>=0;}).length;
        grid.append(section(path.title,[node('details',null,{},[node('summary','So übst du diesen Lernpfad'),node('p',path.studyHint)]),node('p',done+' von 4 abgeschlossen'),node('ol',null,{},path.lessons.map(function(key){
          var l=content.lessons.find(function(x){return x.id===key;}); return node('li',null,{},[link(l.title+(completed.indexOf(key)>=0?' · abgeschlossen':''),'#/akademie/'+key)]);
        }))]));
      }); wrap.append(grid);
      wrap.append(link('Einheitliches Glossar', '#/akademie/glossar'));
    } else if (id === 'glossar') {
      wrap.append(header('Glossar'),link('← Alle Lernpfade','#/akademie'));
      content.glossary.forEach(function(t){ wrap.append(node('section',null,{id:'begriff-'+t.id},[node('h2',t.title),node('p',t.definition),sources(t.sources)])); });
    } else if (!lesson) {
      wrap.append(header('Lektion nicht gefunden'),link('Zu den Lernpfaden','#/akademie'));
    } else {
      var terms=node('div');lesson.glossary.forEach(function(key){var t=content.glossary.find(function(x){return x.id===key;});terms.append(node('details',null,{},[node('summary',t.title),node('p',t.definition)]));});
      var path=content.paths.find(function(p){return p.id===lesson.pathId;}), index=path.lessons.indexOf(id);
      D.title=lesson.title+' · Strategie-Akademie · Technical';
      var p=lesson.presentation, lab=g.VUAcademyVisuals && g.VUAcademyVisuals.render(p,lesson.id,resume && resume.id===id?resume.scene:null), pilot=!!lab;
      if(pilot){
        wrap.classList.add('ta-pilot');
        wrap.append(node('nav',null,{'aria-label':'Lernpfad',class:'ta-breadcrumb'},[link('← Alle Lernpfade','#/akademie'),node('span',path.title+' · '+(index+1)+' / 4')]),node('header',null,{class:'ta-lesson-head'},[node('p','VISUELL LERNEN',{class:'ta-eyebrow'}),node('h1',lesson.title,{class:'tc-title',tabindex:'-1'}),node('p',lesson.question,{class:'ta-question'})]));
        var goals=section('Dein Lernziel',[list(lesson.objectives)]);goals.className='ta-goals';
        var chart=section('So sieht es im Chart aus',[lab]);chart.className='ta-visual-block';
        var basics=section('Was ist das?',[node('p',p.intro),node('details',null,{},[node('summary','Grundlagen und Begriffe vertiefen')].concat(lesson.foundations.map(function(s){return node('p',s);})).concat([terms]))]);basics.className='ta-basics';
        var why=section('Warum ist das wichtig?',[node('p',p.why)]);why.className='ta-why';
        var mistake=section('Typischer Fehler',[node('p',p.mistake,{class:'ta-mistake'}),node('h3','Gegenbeispiel'),node('p',lesson.example.text),list(lesson.limits)]);mistake.className='ta-counterexample';
        wrap.append(chart,goals,basics,why,mistake);
      }else{
        wrap.append(header(lesson.title),link('← Alle Lernpfade','#/akademie'),node('p',path.title+' · Lektion '+(index+1)+' von 4'),node('p',lesson.question,{class:'ta-question'}),section('Lernziele',[list(lesson.objectives)]),section('Begriffe vorab',[terms]),section('Grundlagen',lesson.foundations.map(function(s){return node('p',s);})),figure(lesson.visual),
          section('Konkretes Beispiel · konstruiert',[node('p',lesson.example.text)]),section('Grenzen und Gegenbeispiel',[list(lesson.limits)]));
      }
      var feedback=node('p','Wähle eine Antwort und prüfe sie.',{role:'status','aria-live':'polite'}), form=node('form'), field=node('fieldset',null,{},[node('legend',lesson.quiz.prompt)]);
      lesson.quiz.choices.forEach(function(c){var input=node('input',null,{type:'radio',name:'answer',value:c.id,required:''});field.append(node('label',null,{},[input,node('span',c.text)]));});
      var check=node('button','Antwort prüfen',{type:'submit'});form.append(field,check,feedback);
      current = { lesson: lesson, content: content, form: form, checked: false, visual:lab };
      function showAnswer() {
        var selected=form.querySelector('input:checked');if(!selected)return;
        feedback.textContent=(M.answer(lesson.quiz,selected.value)?'Richtig. ':'Noch nicht richtig. ')+lesson.quiz.explanation;
        current.checked=true;
      }
      form.addEventListener('change',function(){feedback.textContent='Antwort geändert. Prüfe deine Auswahl erneut.';current.checked=false;});
      form.addEventListener('submit',function(e){e.preventDefault();showAnswer();});
      if(resume && resume.id===id && resume.lessonVersion===lesson.version) {
        var radio=Array.from(form.querySelectorAll('input')).find(function(n){return n.value===resume.choice;});
        if(radio){radio.checked=true;if(resume.checked)showAnswer();}
      }
      wrap.append(section('Lernkontrolle',[form]));
      var target=content.targets[lesson.practice.target];
      var practice=section(pilot?'Jetzt selbst ansehen':'In Technical anwenden',[node('p',lesson.practice.instruction),M.safeLink(target.href)?node('a',target.label,{href:target.href,'data-practice':'',class:pilot?'ta-primary':''}):node('p','Praxisziel derzeit nicht verfügbar.')]);
      if(pilot){
        practice.className='ta-practice';
        practice.append(node('p',lesson.practice.target==='chart'?'Titel wählen → RSI-Unterfenster einschalten → Kurs und RSI vergleichen.':'Kriterien ansehen → im Screener einen Treffer wählen → im Chart prüfen.',{class:'ta-practice-route'}));
        var more=node('div',null,{class:'ta-practice-links'});
        if(lesson.practice.target==='chart')more.append(link('Momentum im Assistenten','#/assistent/momentum'));
        more.append(link('Screener öffnen','#/screener'));
        if(lesson.practice.target!=='chart')more.append(link('Chart Studio öffnen','#/chart'));
        practice.append(more,node('p','Zurück kommst du über „Zur Lektion“ in Technical. Deine Quiz-Auswahl und dein lokaler Abschluss bleiben erhalten.',{class:'tc-note'}));
      }
      wrap.append(practice);
      var sourceContent=[sources(lesson.sources),node('ul',null,{},(lesson.reading||[]).map(function(id){var r=content.readings.find(function(x){return x.id===id;});return node('li',null,{},[link(r.title+' · '+(r.kind==='primary'?'Primärquelle':'ergänzende Fachliteratur'),r.url)]);})),node('p','Quellen öffnen den geprüften Quelltext beziehungsweise das interne Dokument. Kriterien werden nur in den bestehenden Engines ausgewertet.')];
      wrap.append(node('p','Ein beschreibender Chartbefund ist kein Nachweis eines Handelsvorteils nach Kosten.',{class:'tc-note'}),section('Fachquellen',pilot?[node('details',null,{},[node('summary','Quellen und Methodik öffnen')].concat(sourceContent))]:sourceContent));
      var mark=node('button',completed.indexOf(id)>=0?'Abschluss aufheben':'Lektion als abgeschlossen markieren',{type:'button','aria-pressed':String(completed.indexOf(id)>=0)}), status=node('p','Abschluss ist unabhängig vom Quiz und freiwillig.',{role:'status'});
      mark.addEventListener('click',function(){
        var ids=M.read(store(),content), done=ids.indexOf(id)>=0;ids=done?ids.filter(function(k){return k!==id;}):ids.concat(id);
        if(!M.save(store(),content,ids)){status.textContent='Speichern ist gesperrt. Dein Abschluss konnte nicht dauerhaft gespeichert werden.';return;}
        mark.textContent=done?'Lektion als abgeschlossen markieren':'Abschluss aufheben';mark.setAttribute('aria-pressed',String(!done));status.textContent=done?'Abschluss aufgehoben.':'Abgeschlossen · lokal in diesem Browser gespeichert.';
      });
      wrap.append(mark,status);
      var nav=node('nav',null,{'aria-label':'Lektionen',class:'ta-next'});
      if(index>0)nav.append(link('← Vorherige Lektion','#/akademie/'+path.lessons[index-1]));
      if(index<3)nav.append(link('Nächste Lektion →','#/akademie/'+path.lessons[index+1]));
      wrap.append(nav);
    }
    if(focus)wrap.querySelector('h1').focus({preventScroll:true});
    if(lesson && resume && resume.id===id && resume.lessonVersion===lesson.version && resume.y>0) {
      g.requestAnimationFrame(function(){if(current && current.lesson.id===id){
        var practice=wrap.querySelector('a[data-practice]');if(practice)practice.focus({preventScroll:true});g.scrollTo(0,resume.y);
      }});
    }
  }
  function sources(paths) {return node('ul',null,{},paths.map(function(p){return node('li',null,{},[link(p,'https://github.com/dennismueller10x-sudo/vision-universe-research/blob/46fca1f420087067cdfd25e0e62189a61cccc41d/'+p)]);}));}
  function load() {
    if(!cached)cached=fetch('/technical/academy/content.json').then(function(r){if(!r.ok)throw Error('content');return r.json();}).then(function(c){if(!c || !Array.isArray(c.paths) || c.paths.length!==8 || !Array.isArray(c.lessons) || c.lessons.length!==32 || !Array.isArray(c.glossary))throw Error('content shape');return c;}).catch(function(e){cached=null;throw e;});
    return cached;
  }
  function renderReturn(host) {
    // No academy request for visitors who have never opened a lesson in this tab.
    var raw=null;try{raw=sessionStore().getItem(M.SESSION_KEY);}catch(_){}
    if(!raw && !memorySession)return;
    load().then(function(c){
      var state=M.session(sessionStore(),c)||memorySession;
      if(!state || /^#\/akademie(?:\/|$)/.test(g.location.hash))return;
      var l=c.lessons.find(function(x){return x.id===state.id && x.version===state.lessonVersion;});if(!l)return;
      host.querySelectorAll('.ta-return').forEach(function(n){n.remove();});
      host.prepend(node('nav',null,{class:'ta ta-return','aria-label':'Zur Akademie zurück'},[link('← Zur Lektion: '+l.title,'#/akademie/'+l.id)]));
    }).catch(function(){ /* A practice view must remain usable if lesson content cannot load. */ });
  }
  function render(host, id) {
    var token=++request; D.title='Strategie-Akademie · Technical';host.replaceChildren(node('p','Lerninhalte werden geladen …',{role:'status'}));
    load().then(function(c){if(token===request && /^#\/akademie(?:\/|$)/.test(g.location.hash))paint(host,c,id,true);}).catch(function(){cached=null;if(token!==request || !/^#\/akademie(?:\/|$)/.test(g.location.hash))return;var retry=node('button','Erneut versuchen',{type:'button'});retry.addEventListener('click',function(){render(host,id);});host.replaceChildren(node('p','Die Lerninhalte konnten nicht geladen werden.'),retry);});
  }
  g.VUAcademy={render:render, renderReturn:renderReturn};
})(window);
