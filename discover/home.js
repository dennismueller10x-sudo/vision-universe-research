/* Discover-Startseite (Konzept „Reihe für Reihe“, Screen n-home): der Kopf (Datum, Frage, Suche, Genre-Chips) steht vorgerendert in
   index.html und hier gleich; alle Abschnitte darunter zeichnet discover/ui/v3.js (ausserhalb des Budgets). */
(function (global) {
  'use strict';
  var V = (global.VUDiscover = global.VUDiscover || {}).Views = global.VUDiscover.Views || {};
  var D = global.VUDiscover, S = global.QuantShell, el = S.el;
  var titles = {
    'BEKANNTE NAMEN IN BEWEGUNG': 'Bekannte Namen in Bewegung',
    'DIE STÄRKSTEN AKTIEN': 'Die stärksten Aktien',
    'TOP 10 · S&P 500': 'Top 10 · S&P 500',
    'TOP 10 · NASDAQ-100': 'Top 10 · Nasdaq-100',
    'TOP 10 · DOW JONES': 'Top 10 · Dow Jones',
    'NEUE JAHRESHOCHS': 'Neue Jahreshochs',
    'DIE ENTWICKLUNG': 'Die Entwicklung',
    'UMSATZ WÄCHST STARK': 'Umsatz wächst stark',
    'GEWINNE BESCHLEUNIGEN': 'Gewinne beschleunigen',
    'TOP 10 · CASHFLOW-MASCHINEN': 'Top 10 · Cashflow-Maschinen',
    'QUALITÄT + WACHSTUM': 'Qualität + Wachstum',
    'MARGEN WERDEN STÄRKER': 'Margen werden stärker',
    'KÜNSTLICHE INTELLIGENZ': 'Künstliche Intelligenz',
    'GERADE IN BEWEGUNG': 'Gerade in Bewegung',
    'SEIT MONATEN IM AUFWIND': 'Seit Monaten im Aufwind',
    'LANGFRISTIGE COMPOUNDER': 'Langfristige Compounder',
    'DEM MARKT VORAUS': 'Dem Markt voraus',
    'DIE STÄRKSTEN JE BRANCHE': 'Die stärksten je Branche',
    'TECHNOLOGIE': 'Technologie',
    'GESUNDHEIT': 'Gesundheit',
    'QUALITÄT ZUM VERNÜNFTIGEN PREIS': 'Qualität zum vernünftigen Preis',
    'ROBOTIK & AUTOMATION': 'Robotik & Automation',
    'COMEBACK?': 'Comeback?',
    'FUNDAMENTALE TURNAROUNDS': 'Fundamentale Turnarounds',
    'AUTOS & MOBILITÄT': 'Autos & Mobilität',
    'ENERGIE': 'Energie',
    'FINANZEN': 'Finanzen',
    'KONSUM': 'Konsum',
    'STARKE BILANZ + WACHSTUM': 'Starke Bilanz + Wachstum',
    'STABILE AUFWÄRTSTRENDS': 'Stabile Aufwärtstrends',
    'UNTER DEM RADAR': 'Unter dem Radar',
    'PROFITABLES WACHSTUM': 'Profitables Wachstum'
  };
  function title(text) { return text ? (Object.prototype.hasOwnProperty.call(titles, text) ? titles[text] : text) : 'Aktien entdecken'; }
  var NS = 'http://www.w3.org/2000/svg';
  function glyph(d, fill) {
    var svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', d); path.setAttribute('fill', fill ? 'currentColor' : 'none'); path.setAttribute('stroke', fill ? 'none' : 'currentColor');
    path.setAttribute('stroke-width', '1.8'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); svg.appendChild(path); return svg;
  }
  function grid() {
    var svg = document.createElementNS(NS, 'svg'), g = document.createElementNS(NS, 'g');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true');
    g.setAttribute('fill', 'none'); g.setAttribute('stroke', 'currentColor'); g.setAttribute('stroke-width', '1.8');
    [[4, 4], [13, 4], [4, 13], [13, 13]].forEach(function (p) { var r = document.createElementNS(NS, 'rect'); r.setAttribute('x', p[0]); r.setAttribute('y', p[1]); r.setAttribute('width', '7'); r.setAttribute('height', '7'); r.setAttribute('rx', '1.8'); g.appendChild(r); });
    svg.appendChild(g); return svg;
  }
  function header(ctx) {
    var intro = el('header', { class: 'dv3-intro', 'data-product': 'discover' });
    var arrow = el('span', { class: 'v2-search-arrow' }, [glyph('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', true)]);
    var search = el('button', { class: 'v2-search-prompt', type: 'button', 'aria-label': 'Aktie, Thema oder Frage suchen' }, [glyph('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14m9 16-4-4'), el('span', { text: 'Aktie, Thema oder Frage …' }), arrow]);
    search.addEventListener('click', ctx.openSearch);
    // Genre-Chips (Konzept „Reihe für Reihe“, Entscheidung 5) ersetzen die Schnellzugriffe; ▦ fuehrt zu „Alle Reihen“.
    var chips = el('nav', { class: 'dr-genres vu-chips', 'aria-label': 'Genres' });
    [['alle', 'Alle'], ['kursbewegung', 'Kursbewegung'], ['unternehmen', 'Unternehmen'], ['themen', 'Themen'], ['indizes', 'Indizes']].forEach(function (x, i) {
      chips.appendChild(el('button', { type: 'button', class: 'vu-chip', 'data-genre': x[0], 'aria-pressed': i ? 'false' : 'true', text: x[1] }));
      /* Europa als Verweis hinter „Indizes“ (Owner 08.11.2026; Platz nach dem Konzept „Reihe für Reihe“). */
      if (x[0] === 'indizes') chips.appendChild(el('a', { class: 'vu-chip', href: '#/c/EUROPE/de', 'data-europe-chip': '', text: 'Europa' }));
    });
    chips.appendChild(el('a', { class: 'vu-chip dr-genres__all', href: '#/reihen', 'aria-label': 'Alle Reihen' }, [grid()]));
    var h1 = el('h1', { class: 'vu-lt' }); h1.append(el('span', { class: 'dr-l', text: 'Was bewegt ' }), el('span', { class: 'dr-l', text: 'die Börse heute?' }));
    var lead = el('p', { class: 'vu-lead dr-genre-lead' }); lead.hidden = true;
    intro.append(el('p', { class: 'vu-ltag dv3-asof', text: 'Discover' }), h1, lead, search, chips);
    return intro;
  }
  async function render(root, ctx) {
    var intro = ctx.intro, page = intro ? intro.parentNode : el('div', { class: 'v2-home vu-ui' }); // Kopf aus index.html (gleiches Markup) bzw. vom vorigen Zeichnen: bleibt stehen
    if (intro) { if (intro.hasAttribute('data-static')) { intro.removeAttribute('data-static'); intro.querySelector('.v2-search-prompt').addEventListener('click', ctx.openSearch); if (global.__vuSearchTap) { global.__vuSearchTap = 0; ctx.openSearch(); } } ctx.intro = null; }
    else intro = header(ctx);
    if (page.parentNode !== root) root.appendChild(page); if (intro.parentNode !== page) page.appendChild(intro);
    Array.prototype.slice.call(page.children).forEach(function (n) { if (n !== intro) n.remove(); });
    return D.V3.home(page, ctx);
  }
  V.Home = { render: render, title: title };
})(window);
