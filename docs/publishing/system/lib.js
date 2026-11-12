// Bausteine des Aktienmagazins. Seiten registrieren Inhalte mit VUM.k(key, fn); finish() setzt sie ein.
// Ausgabedaten (Nummer, Datum, Seitenfolge, Quellen) kommen aus window.VU_AUSGABE (system/build.mjs), Daten aus data.js.
(function () {
  const D = window.VU_DATA, A = window.VU_AUSGABE, ROOT = window.VU_ROOT || '', { de, sg } = window.VUC;
  const K = {};
  const nr2 = (n) => String(n).padStart(2, '0');
  const C = (t) => { const c = D.cards[t]; if (!c) throw new Error('Karte fehlt: ' + t); return c; };
  const pc = (v, d = 1) => (v == null ? '–' : sg(v, d) + '&nbsp;%');
  const pill = (v, d = 1) => `<span class="pill ${v >= 0 ? 'up' : 'dn'}">${sg(v, d)}&nbsp;%</span>`;
  const usd = (v) => de(v, 2) + '&nbsp;$';
  const bn = (v) => (v >= 1e12 ? de(v / 1e12, 2) + '&nbsp;Bio.&nbsp;$' : de(v / 1e9, 0) + '&nbsp;Mrd.&nbsp;$');
  const kgv = (v) => (v == null ? 'k.&nbsp;A.' : v > 300 ? '>&nbsp;300' : de(v, 1));
  const logoSrc = (t) => (C(t).logo ? ROOT + C(t).logo : null);
  const logo = (t, h = 7) => (logoSrc(t) ? `<img class="lg" style="height:${h}mm" src="${logoSrc(t)}" alt="${t}">` : `<b>${t}</b>`);
  const struct = { BULLISH: 'aufwärts', BEARISH: 'abwärts', MIXED: 'gemischt' };
  const datum = (iso) => (iso ? iso.split('-').reverse().join('.') : 'k. A.');
  const ttm = (s) => (s ? s.replace(/FY(\d{4})Q(\d)/, 'Q$2 Geschäftsjahr $1') : 'k. A.');
  const seite = (id) => { const s = A.seiten.find((x) => x.id === id); if (!s) throw new Error('Seite fehlt: ' + id); return nr2(s.nr); };

  function spark(t, o = {}) {
    const s = C(t).series.slice(-(o.n || 130));
    return window.VUC.line(s, { w: o.w || 300, h: o.h || 90, pr: o.pr ?? 34, pb: o.pb ?? 14, tick: o.tick || autoTick(s), mstep: o.mstep || 2, marks: o.marks || [] });
  }
  function autoTick(s) { const v = s.map((p) => p[1]); const r = (Math.max(...v) - Math.min(...v)) || Math.abs(v[0]) || 1; const raw = r / 3; const m = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * m).find((x) => x >= raw) || m * 10; }

  // Datenkasten zu einer Aktie (alles aus VU-Daten, Stichtage aus dem Schnappschuss)
  function box(t, o = {}) {
    const c = C(t), ink = o.ink ? ' ink' : '', snap = D.snapshot || {};
    const rows = [
      [`Kurs ${datum(snap.kurse).slice(0, 6)}`, usd(c.price)], ['Woche', pill(c.week)], ['12 Monate', pc(c.r12m * 100, 0)],
      ['Abstand 52W-Hoch', pc(c.hi * 100, 0)], ['KGV (TTM)', kgv(c.pe)], ['Umsatzwachstum (TTM)', c.growth == null ? '–' : pc(c.growth * 100, 0)],
      ['Relative Stärke', c.rs == null ? '–' : de(c.rs, 0) + '. Perzentil'], ['Trend laut Technik-Engine', c.tech ? struct[c.tech.structure] || '–' : '–'],
    ];
    return `<div class="card${ink} box" style="${o.style || ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:3mm"><div style="${o.ink ? 'filter:invert(1) grayscale(1) brightness(1.6)' : ''}">${logo(t, 6)}</div><span class="app-badge"><i></i>VU-Daten</span></div>
      <div style="margin-top:2.5mm">${o.chart === false ? '' : spark(t, { w: 300, h: o.h || 80 })}</div>
      <div style="margin-top:2mm">${rows.map((r) => `<div class="fact"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div>
      <div class="xs ${o.ink ? '' : 'mu'}" style="margin-top:2mm;${o.ink ? 'color:#9a9a9a' : ''}">${c.n} · ${t}. KGV und Wachstum: letzte vier Quartale bis ${ttm(c.ttmThrough)} (SEC, Stand ${datum(snap.fundamentaldaten)}).</div>
    </div>`;
  }

  // Quellen: einmal nummeriert (Reihenfolge der ersten Nennung), Seiten nennen in der Fußzeile nur die Nummern
  const QNR = {}; let qn = 0;
  A.seiten.forEach((s) => (s.quellen || []).forEach((id) => { if (!QNR[id]) QNR[id] = ++qn; }));
  const quellNummern = (s) => [...new Set((s.quellen || []).map((id) => QNR[id]))].sort((a, b) => a - b).join(', ');
  function quellenListe() {
    const Q = A.quellen || {};
    return Object.entries(QNR).sort((a, b) => a[1] - b[1]).map(([id, n]) => { const q = Q[id]; const t = `${q.medium}, ${q.datum}${q.status === 'offen' ? ' (Fundstelle offen)' : ''}`; return `<div class="qz"><b>${n}</b><span>${q.url ? `<a href="${q.url}">${t}</a>` : t}</span></div>`; }).join('');
  }
  // Inhaltsverzeichnis aus ausgabe.json (Einträge mit "toc")
  function inhalt() {
    return A.seiten.filter((s) => s.toc && s.toc.bild).map((s) => `<div style="display:grid;grid-template-columns:22mm 1fr;gap:3mm;align-items:center"><div class="ph" style="height:15mm;border-radius:4px;background-image:url(${s.toc.bild})"></div><div><div style="font-size:6.8pt;font-weight:900;letter-spacing:.12em;color:var(--lime);text-transform:uppercase">${nr2(s.nr)} · ${s.toc.rubrik}</div><div style="font-size:9.4pt;font-weight:800;line-height:1.15;margin-top:.6mm">${s.toc.titel}</div></div></div>`).join('')
      + `<div style="margin-top:2mm;border-top:1px solid #262626;padding-top:3mm;font-size:7.8pt;color:#9a9a9a;line-height:1.5"><b style="color:#fff">Außerdem:</b> ${A.seiten.filter((s) => s.toc && !s.toc.bild).map((s) => `${s.toc.titel} ${nr2(s.nr)}`).join(' · ')}</div>`;
  }

  function finish() {
    const impressum = A.seiten.find((s) => s.id === 'quellen') || A.seiten.find((s) => s.id === 'impressum');
    document.querySelectorAll('.page').forEach((p) => {
      const n = Number(p.dataset.nr);
      p.querySelectorAll('[data-run]').forEach((el) => {
        el.className = 'run';
        el.innerHTML = `<span class="wm"><img class="logo" src="${ROOT}docs/design/redesign-2027/img/vu-logo.png" style="height:2.6mm;${p.classList.contains('dark') || p.classList.contains('imgtop') ? 'filter:invert(1)' : ''}"><span style="margin-left:2mm">${A.reihe || 'Aktienmagazin'} · Nr. ${nr2(A.nummer)}</span></span><span>${el.dataset.run}</span>`;
      });
      p.querySelectorAll('[data-foot]').forEach((el) => {
        el.className = 'foot';
        const sd = A.seiten.find((x) => x.nr === n) || {}; const qs = quellNummern(sd);
        el.innerHTML = `<span><b>${nr2(n)}</b> · Vision Universe ${A.reihe || 'Aktienmagazin'} · ${A.datumText}</span><span>Keine Anlageberatung${qs && impressum ? ` · Quellen ${qs} (S. ${nr2(impressum.nr)})` : ''}</span>`;
      });
    });
    K.quellen = quellenListe;
    K.inhalt = inhalt;
    document.querySelectorAll('[data-k]').forEach((el) => {
      const f = K[el.dataset.k]; if (!f) throw new Error('fehlt: ' + el.dataset.k);
      el.innerHTML = typeof f === 'function' ? f() : f;
    });
    document.documentElement.dataset.ready = '1';
  }

  window.VUM = { D, A, ROOT, C, K, k: (key, f) => { K[key] = f; }, pc, pill, usd, bn, kgv, logo, logoSrc, spark, box, finish, de, sg, struct, datum, seite };
})();
