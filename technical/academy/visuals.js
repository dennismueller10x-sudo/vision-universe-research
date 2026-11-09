/* Presentation only: hand-drawn teaching scenes, never market/indicator calculations. */
(function (g) {
  'use strict';
  var kinds = { trend: ['structure', 'filter', 'gap'], breakout: ['touch', 'close', 'return'], rsi: ['scale', 'high', 'low'], diagram:['observe','compare','limit'] };
  var styles=['ta-price-line','ta-muted-line','ta-reference-line','ta-structure-line','ta-point','ta-wick','ta-candle-up','ta-candle-down','ta-boundary-zone','ta-rsi-zone','ta-rsi-line','ta-axis-label','ta-reference-label','ta-plot-label','ta-grid','ta-card-zone'];
  function validGraphic(items) {
    return Array.isArray(items) && items.length>0 && items.length<=80 && items.every(function(a){
      if(!a || !Object.prototype.hasOwnProperty.call({line:1,path:1,text:1,rect:1,point:1,candle:1},a.op) || (a.cls && styles.indexOf(a.cls)<0))return false;
      var fields={line:['x1','y1','x2','y2'],path:['d'],text:['x','y','text'],rect:['x','y','w','h'],point:['x','y'],candle:['x','high','low','open','close']}[a.op];
      if(Object.keys(a).some(function(k){return ['op','cls'].concat(fields).indexOf(k)<0;}))return false;
      return fields.every(function(k){
        if(k==='d')return typeof a.d==='string' && a.d.length<1800 && /^[MLCQHVZmlcqh vz\d.,+\s-]+$/.test(a.d);
        if(k==='text')return typeof a.text==='string' && a.text.length>0 && a.text.length<=48;
        return Number.isFinite(a[k]) && a[k]>=0 && a[k]<=360;
      }) && (a.op!=='rect'||a.x+a.w<=360&&a.y+a.h<=270) && (a.op!=='candle'||a.high<=Math.min(a.open,a.close)&&a.low>=Math.max(a.open,a.close));
    });
  }
  function valid(p) {
    return !!(p && p.version === 1 && Object.prototype.hasOwnProperty.call(kinds,p.kind) && (p.kind!=='diagram'||/^[a-z]+-[1-4]$/.test(p.topic)) &&
      ['intro', 'why', 'mistake'].every(function (k) { return typeof p[k] === 'string' && p[k].trim(); }) &&
      Array.isArray(p.scenes) && p.scenes.length === 3 && p.scenes.every(function (s, i) {
        return !!s && s.id === kinds[p.kind][i] && ['label', 'title', 'observed', 'meaning', 'description'].every(function (k) { return typeof s[k] === 'string' && s[k].trim(); }) && (p.kind!=='diagram'||validGraphic(s.graphic));
      }));
  }
  function render(p, lessonId, initialScene) {
    if (!valid(p) || p.kind==='diagram' && p.topic!==lessonId) return null;
    var D = g.document, NS = 'http://www.w3.org/2000/svg';
    function el(tag, text, attrs) {
      var n = D.createElement(tag); if (text !== null) n.textContent = text;
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); }); return n;
    }
    function svgEl(tag, attrs, text) {
      var n = D.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text) n.textContent = text; return n;
    }
    var wrap = el('div', null, { class: 'ta-lab' }), group = el('div', null, { class: 'ta-scenes', role: 'group', 'aria-label': 'Chart-Beispiele' });
    var body = el('div', null, { class: 'ta-scene', id: 'scene-' + lessonId });
    var figure = el('figure', null, { class: 'ta-chart' }), notes = el('div', null, { class: 'ta-observations' });
    var title = el('h3', ''), measured = el('p', ''), meaning = el('p', '');
    var counter = el('p', '', { class: 'ta-scene-count', role: 'status', 'aria-live': 'polite' });
    notes.append(title, el('span', 'Was du siehst', { class: 'ta-note-label' }), measured, el('span', 'Was das bedeutet', { class: 'ta-note-label' }), meaning);
    body.append(figure, notes); wrap.append(group, counter, body);
    var buttons = p.scenes.map(function (s, i) {
      var b = el('button', (i + 1) + ' · ' + s.label, { type: 'button', 'aria-pressed': 'false', 'aria-controls': body.id, 'data-scene':s.id });
      b.addEventListener('click', function () { show(i); }); group.append(b); return b;
    });
    function show(index) {
      var scene = p.scenes[index], svg = svgEl('svg', { viewBox: '0 0 360 270', role: 'img', 'aria-labelledby': 'chart-title-' + lessonId + ' chart-desc-' + lessonId });
      svg.append(svgEl('title', { id: 'chart-title-' + lessonId }, scene.title), svgEl('desc', { id: 'chart-desc-' + lessonId }, scene.description));
      function line(x1, y1, x2, y2, cls) { svg.append(svgEl('line', { x1:x1, y1:y1, x2:x2, y2:y2, class:cls || 'ta-grid' })); }
      function label(x, y, text, cls) { svg.append(svgEl('text', { x:x, y:y, class:cls || 'ta-plot-label' }, text)); }
      function path(d, cls) { svg.append(svgEl('path', { d:d, class:cls || 'ta-price-line' })); }
      function dot(x, y, text, dx, dy) { svg.append(svgEl('circle', { cx:x, cy:y, r:4, class:'ta-point' })); label(x + dx, y + dy, text); }
      function candle(x, high, low, open, close) {
        line(x, high, x, low, 'ta-wick');
        // These are screen coordinates authored for illustration, not OHLC inputs.
        svg.append(svgEl('rect', { x:x-6, y:Math.min(open, close), width:12, height:Math.max(3, Math.abs(open-close)), class:close < open ? 'ta-candle-up' : 'ta-candle-down' }));
      }
      if(p.kind==='diagram'){
        scene.graphic.forEach(function(a){
          if(a.op==='path')path(a.d,a.cls);
          else if(a.op==='line')line(a.x1,a.y1,a.x2,a.y2,a.cls);
          else if(a.op==='text')label(a.x,a.y,a.text,a.cls);
          else if(a.op==='point')svg.append(svgEl('circle',{cx:a.x,cy:a.y,r:4,class:a.cls||'ta-point'}));
          else if(a.op==='rect')svg.append(svgEl('rect',{x:a.x,y:a.y,width:a.w,height:a.h,rx:4,class:a.cls||'ta-card-zone'}));
          else if(a.op==='candle')candle(a.x,a.high,a.low,a.open,a.close);
        });
      }else{
        label(24, 24, p.kind === 'rsi' ? 'Kurs · schematisch' : 'Kursverlauf · schematisch', 'ta-axis-label');
        [60,110,160,210].forEach(function(y){line(24,y,336,y);}); label(280,255,'Zeit →','ta-axis-label');
      }
      if (p.kind === 'trend') {
        if (index === 0) {
          path('M28 208 L75 148 L112 180 L164 108 L205 140 L260 62 L326 92');
          path('M112 180 L205 140','ta-structure-line');
          dot(75,148,'Hoch 1',-32,-18); dot(164,108,'Hoch 2',-30,-18); dot(260,62,'Hoch 3',-24,-18);
          dot(112,180,'Tief 1',-22,27); dot(205,140,'Tief 2',-15,30);
        } else if (index === 1) {
          path('M28 88 L74 42 L118 105 L166 65 L210 126 L257 90 L326 142');
          line(28,184,330,184,'ta-reference-line'); label(28,208,'SMA 200 · skizziert','ta-reference-label');
          path('M74 42 L166 65 L257 90','ta-structure-line');
          dot(74,42,'Hoch 1',-30,-14); dot(166,65,'Hoch 2',-22,-14); dot(257,90,'Hoch 3',-12,-14);
          dot(326,142,'Kurs',-32,-16);
        } else {
          path('M28 160 L75 186 L120 171 L167 201 L215 189 L262 197','ta-muted-line');
          line(28,147,330,147,'ta-reference-line'); label(28,135,'SMA 200 · skizziert','ta-reference-label');
          path('M262 197 L302 63 L332 77'); dot(302,63,'Sprung',-44,-18);
          label(32,234,'Noch keine Folge höherer Tiefs');
        }
      } else if (p.kind === 'breakout') {
        svg.append(svgEl('rect',{x:24,y:108,width:312,height:8,class:'ta-boundary-zone'}));
        line(24,112,336,112,'ta-reference-line'); label(25,95,'Begrenzung · skizziert','ta-reference-label');
        path('M28 180 L65 136 L100 186 L139 144 L175 180','ta-muted-line');
        candle(207,130,188,176,146);
        if(index===0){
          candle(264,63,166,151,137); dot(264,63,'Hoch',-44,-16); dot(264,137,'Schluss',12,9);
          label(28,232,'Hoch darüber ≠ Schluss darüber');
        }else{
          candle(264,54,150,139,78); dot(264,78,'Schluss',-57,-22);
          if(index===2){candle(318,72,184,82,156);dot(318,156,'Zurück',-65,30);}
          label(28,232,index===1?'Die bestehende Regel entscheidet.':'Späterer Verlauf: wieder in der Spanne.');
        }
      } else if(p.kind==='rsi') {
        // Price and RSI are independently hand-sketched; no RSI is derived here.
        if(index===2)path('M28 42 L70 63 L112 55 L154 85 L196 77 L238 110 L280 100 L332 125');
        else path('M28 124 L70 109 L112 114 L154 79 L196 89 L238 54 L280 65 L332 37');
        label(24,153,'RSI · frei skizziert','ta-axis-label');
        svg.append(svgEl('rect',{x:24,y:167,width:312,height:22,class:'ta-rsi-zone'}),svgEl('rect',{x:24,y:217,width:312,height:22,class:'ta-rsi-zone'}));
        [[167,'100'],[189,'70'],[217,'30'],[239,'0']].forEach(function(pair){line(49,pair[0],336,pair[0],'ta-rsi-grid');label(24,pair[0]+5,pair[1],'ta-axis-label');});
        if(index===0){path('M54 211 L91 208 L128 219 L165 199 L202 204 L239 185 L276 192 L329 185','ta-rsi-line');dot(329,185,'75',-25,-12);}
        if(index===1)path('M54 206 L91 195 L128 186 L165 181 L202 184 L239 176 L276 182 L329 174','ta-rsi-line');
        if(index===2)path('M54 207 L91 219 L128 223 L165 218 L202 228 L239 224 L276 230 L329 227','ta-rsi-line');
      }
      figure.replaceChildren(svg, el('figcaption','Konstruiertes Lernbild. Skizzen und Beispielzahlen, keine historischen Marktdaten. Keine neue Handelsregel oder Erfolgszusage.'));
      title.textContent = scene.title; measured.textContent = scene.observed; meaning.textContent = scene.meaning;
      counter.textContent = 'Lernbild ' + (index + 1) + ' von 3 · ' + scene.label;
      buttons.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === index)); });
    }
    var start=p.scenes.findIndex(function(s){return s.id===initialScene;});show(start>=0?start:0); return wrap;
  }
  var api = { valid:valid, validGraphic:validGraphic, render:render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  g.VUAcademyVisuals = api;
})(globalThis);
