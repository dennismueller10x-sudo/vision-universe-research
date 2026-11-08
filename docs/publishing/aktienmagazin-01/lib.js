// Bausteine des Aktienmagazins. Seiten registrieren Inhalte mit VUM.k(key, fn); finish() setzt sie ein.
(function () {
  const D = window.VU_DATA, { de, sg } = window.VUC;
  const K = {};
  const C = (t) => { const c = D.cards[t]; if (!c) throw new Error('Karte fehlt: ' + t); return c; };
  const pc = (v, d = 1) => (v == null ? '–' : sg(v, d) + '&nbsp;%');
  const pill = (v, d = 1) => `<span class="pill ${v >= 0 ? 'up' : 'dn'}">${sg(v, d)}&nbsp;%</span>`;
  const usd = (v) => de(v, 2) + '&nbsp;$';
  const bn = (v) => (v >= 1e12 ? de(v / 1e12, 2) + '&nbsp;Bio.&nbsp;$' : de(v / 1e9, 0) + '&nbsp;Mrd.&nbsp;$');
  const kgv = (v) => (v == null ? 'k.&nbsp;A.' : v > 300 ? '>&nbsp;300' : de(v, 1));
  const logo = (t, h = 7) => (C(t).logo ? `<img class="lg" style="height:${h}mm" src="${C(t).logo}" alt="${t}">` : `<b>${t}</b>`);
  const struct = { BULLISH: 'aufwärts', BEARISH: 'abwärts', MIXED: 'gemischt' };

  function spark(t, o = {}) {
    const s = C(t).series.slice(-(o.n || 130));
    return window.VUC.line(s, { w: o.w || 300, h: o.h || 90, pr: o.pr ?? 34, pb: o.pb ?? 14, tick: o.tick || autoTick(s), mstep: o.mstep || 2, marks: o.marks || [] });
  }
  function autoTick(s) { const v = s.map((p) => p[1]); const r = Math.max(...v) - Math.min(...v); const raw = r / 3; const m = Math.pow(10, Math.floor(Math.log10(raw))); return [1, 2, 2.5, 5, 10].map((k) => k * m).find((x) => x >= raw) || m * 10; }

  // Datenkasten zu einer Aktie (alles aus VU-Daten)
  function box(t, o = {}) {
    const c = C(t), ink = o.ink ? ' ink' : '';
    const rows = [
      ['Kurs 06.11.', usd(c.price)], ['Woche', pill(c.week)], ['12 Monate', pc(c.r12m * 100, 0)],
      ['Abstand 52W-Hoch', pc(c.hi * 100, 0)], ['KGV (TTM)', kgv(c.pe)], ['Umsatzwachstum (TTM)', c.growth == null ? '–' : pc(c.growth * 100, 0)],
      ['Relative Stärke', c.rs == null ? '–' : de(c.rs, 0) + '. Perzentil'], ['Trend laut Technik-Engine', c.tech ? struct[c.tech.structure] || '–' : '–'],
    ];
    return `<div class="card${ink} box" style="${o.style || ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:3mm"><div class="${o.ink ? 'inv' : ''}" style="${o.ink ? 'filter:invert(1) grayscale(1) brightness(1.6)' : ''}">${logo(t, 6)}</div><span class="app-badge"><i></i>VU-Daten</span></div>
      <div style="margin-top:2.5mm">${o.chart === false ? '' : spark(t, { w: 300, h: o.h || 80 })}</div>
      <div style="margin-top:2mm">${rows.map((r) => `<div class="fact"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div>
      <div class="xs ${o.ink ? '' : 'mu'}" style="margin-top:2mm;${o.ink ? 'color:#9a9a9a' : ''}">${c.n} · ${t} · Daten: Tiingo, SEC, Vision Universe. KGV auf Basis der letzten vier Quartale.</div>
    </div>`;
  }

  const SRC = [];
  function finish() {
    let n = 0;
    document.querySelectorAll('.page').forEach((p) => {
      n++;
      p.querySelectorAll('[data-run]').forEach((el) => {
        el.className = 'run';
        el.innerHTML = `<span class="wm"><img class="logo" src="../../../docs/design/redesign-2027/img/vu-logo.png" style="height:2.6mm;${p.classList.contains('dark') || p.classList.contains('imgtop') ? 'filter:invert(1)' : ''}"><span style="margin-left:2mm">Aktienmagazin · Nr. 01</span></span><span>${el.dataset.run}</span>`;
      });
      p.querySelectorAll('[data-foot]').forEach((el) => {
        el.className = 'foot';
        if (el.dataset.foot) SRC.push([n, p.dataset.title || '', el.dataset.foot]);
        el.innerHTML = `<span><b>${String(n).padStart(2, '0')}</b> · Vision Universe Aktienmagazin · 09.11.2026</span><span>${'Keine Anlageberatung · Quellen auf Seite ' + (document.querySelectorAll('.page').length - 1)}</span>`;
      });
    });
    K.quellen = () => SRC.map(([n, t, f]) => `<div style="display:grid;grid-template-columns:7mm 1fr;gap:1.5mm;padding:.7mm 0"><b>${String(n).padStart(2, '0')}</b><span>${f.replace(/^Quellen?: /, '')}</span></div>`).join('');
    document.querySelectorAll('[data-k]').forEach((el) => {
      const f = K[el.dataset.k]; if (!f) throw new Error('fehlt: ' + el.dataset.k);
      el.innerHTML = typeof f === 'function' ? f() : f;
    });
    document.documentElement.dataset.ready = '1';
  }

  window.VUM = { D, C, K, k: (key, f) => { K[key] = f; }, pc, pill, usd, bn, kgv, logo, spark, box, finish, de, sg, struct };
})();
