// SVG-Bausteine im VU-Stil: eine Chart-Form (schwarze Linie, neongrüne Fläche), Balken plus/minus.
(function(){
const de=(v,d=1)=>v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const sg=(v,d=1)=>(v>0?'+':v<0?'−':'±')+de(Math.abs(v),d);
const mo=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
function line(pts,o={}){
  const w=o.w||600,h=o.h||220,pl=o.pl??0,pr=o.pr??44,pt=o.pt??10,pb=o.pb??18,ink=o.ink||'#000',grid=o.grid||'#e6e6e6';
  const vals=pts.map(p=>p[1]).concat((o.lines||[]).flatMap(l=>l.v.filter(x=>x!=null)));
  let mn=Math.min(...vals),mx=Math.max(...vals);const padv=(mx-mn)*.06;mn-=padv;mx+=padv;
  const X=i=>pl+(w-pl-pr)*i/(pts.length-1),Y=v=>pt+(h-pt-pb)*(1-(v-mn)/(mx-mn));
  let s=`<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;overflow:visible">`;
  const step=o.tick||100;for(let v=Math.ceil(mn/step)*step;v<mx;v+=step){s+=`<line x1="${pl}" x2="${w-pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${grid}" stroke-width="1"/><text x="${w-pr+6}" y="${Y(v)+3}" font-size="9" fill="#8c8c8c" font-weight="600">${de(v,0)}</text>`;}
  // Monatsachse
  let lastM=-1;pts.forEach((p,i)=>{const m=+p[0].slice(5,7)-1;if(m!==lastM&&i>3&&i<pts.length-3){if(m%(o.mstep||2)===0)s+=`<text x="${X(i)}" y="${h-4}" font-size="8.5" fill="#8c8c8c" text-anchor="middle" font-weight="600">${mo[m]}${m===0?' '+p[0].slice(2,4):''}</text>`;}lastM=m;});
  const d=pts.map((p,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  s+=`<path d="${d}L${X(pts.length-1)},${h-pb}L${X(0)},${h-pb}Z" fill="#c8f531" opacity=".85"/>`;
  (o.lines||[]).forEach(l=>{const dd=l.v.map((v,i)=>v==null?'':`${l.v[i-1]==null?'M':'L'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');s+=`<path d="${dd}" fill="none" stroke="${l.c||'#5c5c5c'}" stroke-width="1.2" stroke-dasharray="${l.dash||'3 3'}"/>`;const li=l.v.length-1;s+=`<text x="${X(li)+4}" y="${Y(l.v[li])+(l.dy||0)}" font-size="8" fill="${l.c||'#5c5c5c'}" font-weight="700">${l.name}</text>`;});
  s+=`<path d="${d}" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
  (o.marks||[]).forEach(m=>{const i=m.i,x=X(i),y=Y(pts[i][1]);const up=m.up??true;s+=`<circle cx="${x}" cy="${y}" r="3.6" fill="#000" stroke="#fff" stroke-width="1.5"/><line x1="${x}" x2="${x}" y1="${y+(up?-5:5)}" y2="${y+(up?-22:22)}" stroke="#000" stroke-width="1"/><g transform="translate(${x+(m.dx||0)},${y+(up?-26:34)})"><text font-size="9" font-weight="800" text-anchor="${m.anchor||'middle'}" fill="#000">${m.t}</text>${m.s?`<text y="10" font-size="8" font-weight="600" text-anchor="${m.anchor||'middle'}" fill="#5c5c5c">${m.s}</text>`:''}</g>`;});
  const lx=X(pts.length-1),ly=Y(pts[pts.length-1][1]);s+=`<circle cx="${lx}" cy="${ly}" r="4" fill="#000"/>`;
  return s+'</svg>';
}
function hbars(rows,o={}){ // rows: [{l, s?, v}] · Werte immer in fester rechter Spalte, nie am Balken
  const w=o.w||600,rh=o.rh||22,lw=o.lw||120,vw=o.vw||64,gap=8,dark=o.dark;
  const fmt=o.fmt||(v=>sg(v)+' %');
  const neg=Math.max(0,...rows.map(r=>-r.v)),pos=Math.max(0,...rows.map(r=>r.v)),tot=(neg+pos)||1;
  const x0=lw,x1=w-vw-gap,span=x1-x0,zero=x0+span*neg/tot;const h=rows.length*rh;
  let s=`<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block">`;
  rows.forEach((r,i)=>{const y=i*rh,cy=y+rh/2+3.5;const bw=Math.abs(r.v)/tot*span;const x=r.v<0?zero-bw:zero;
    s+=`<text x="0" y="${cy}" font-size="10" font-weight="800" fill="${dark?'#fff':'#000'}">${r.l}</text>`;
    if(r.s)s+=`<text x="${o.sx||46}" y="${cy}" font-size="8.5" font-weight="500" fill="${dark?'#9a9a9a':'#5c5c5c'}">${r.s}</text>`;
    s+=`<rect x="${x}" y="${y+4}" width="${Math.max(bw,1.5)}" height="${rh-8}" rx="3" fill="${r.v>=0?'#c8f531':(dark?'#fff':'#000')}"/>`;
    s+=`<text x="${w}" y="${cy}" font-size="9.5" font-weight="800" text-anchor="end" fill="${dark?'#fff':'#000'}">${fmt(r.v)}</text>`;});
  if(neg&&pos)s+=`<line x1="${zero}" x2="${zero}" y1="0" y2="${h}" stroke="${dark?'#444':'#8c8c8c'}" stroke-width="1"/>`;
  return s+'</svg>';
}
function vbars(rows,o={}){ // rows [[label, v]]
  const w=o.w||600,h=o.h||160,pb=16,pt=16;const max=Math.max(...rows.map(r=>r[1]));const min=Math.min(0,...rows.map(r=>r[1]));
  const bw=(w/rows.length)*.66,gap=(w/rows.length);const Y=v=>pt+(h-pt-pb)*(1-(v-min)/(max-min));
  let s=`<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;overflow:visible">`;
  rows.forEach((r,i)=>{const x=i*gap+(gap-bw)/2;const y0=Y(0),y=Y(r[1]);const hl=o.hl?o.hl(r,i):i===rows.length-1;
    s+=`<rect x="${x}" y="${Math.min(y,y0)}" width="${bw}" height="${Math.max(Math.abs(y0-y),1)}" rx="2.5" fill="${hl?'#c8f531':(o.dark?'#fff':'#000')}"/>`;
    if(o.vals!==false&&(o.allvals||i===0||i===rows.length-1||hl))s+=`<text x="${x+bw/2}" y="${(r[1]>=0?y:y0)-4}" font-size="8.5" font-weight="800" text-anchor="middle" fill="${o.dark?'#fff':'#000'}">${o.fmt?o.fmt(r[1]):r[1]}</text>`;
    s+=`<text x="${x+bw/2}" y="${h-3}" font-size="8" font-weight="600" text-anchor="middle" fill="#8c8c8c">${r[0]}</text>`;});
  return s+'</svg>';
}
function meter(share,o={}){const w=o.w||200;return `<svg viewBox="0 0 ${w} 10" width="100%" style="display:block"><rect width="${w}" height="10" rx="5" fill="${o.dark?'#262626':'#e6e6e6'}"/><rect width="${w*share}" height="10" rx="5" fill="${o.c||'#c8f531'}"/><line x1="${w/2}" x2="${w/2}" y1="-2" y2="12" stroke="${o.dark?'#666':'#8c8c8c'}" stroke-width="1"/></svg>`;}
window.VUC={line,hbars,vbars,meter,de,sg};
window.fill=function(map){document.querySelectorAll('[data-k]').forEach(el=>{const v=map[el.dataset.k];if(v==null)throw new Error('fehlt: '+el.dataset.k);el.innerHTML=v;});};
})();
