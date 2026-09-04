(async function () {
  const app = document.querySelector('#app');
  const view = document.body.dataset.view || 'home';
  const params = new URLSearchParams(location.search);
  const selected = params.get('symbol') || 'NVDA';
  const rangeDays = [22, 252, 756].includes(Number(params.get('days'))) ? Number(params.get('days')) : 756;
  const get = (path) => fetch('/dashboard/' + path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); });
  const esc = (v) => String(v == null ? '—' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const norm = (v) => esc(String(v == null ? '—' : v).replace(/percent/gi, '%').replace(/ratio/gi, 'x'));
  const scoreClass = (v) => v < 50 ? 'score-red' : v < 70 ? 'score-yellow' : v < 80 ? 'score-lightgreen' : 'score-darkgreen';
  const picker = (stocks, symbol, target, id) => `<section class="picker"><input class="search" id="${id}" placeholder="Aktie oder Symbol suchen"><div class="stock-buttons">${stocks.map((s) => `<a class="stock-button ${s.symbol === symbol ? 'selected' : ''}" data-search="${esc((s.symbol + ' ' + s.name).toLowerCase())}" href="/dashboard/${target}/?symbol=${s.symbol}${target === 'charting' ? '&days=' + rangeDays : ''}"><b>${s.symbol}</b><span>${esc(s.name)}</span></a>`).join('')}</div></section>`;
  const bindSearch = (id) => { const input = document.getElementById(id); if (input) input.oninput = () => document.querySelectorAll('.stock-button').forEach((el) => { el.hidden = !el.dataset.search.includes(input.value.toLowerCase()); }); };

  if (view === 'home') {
    app.innerHTML = `<section class="home"><div class="kicker">VISION UNIVERSE</div><h1>Was möchtest du heute verstehen?</h1><p class="intro">Unabhängiges Research für fundiertere Anlageentscheidungen.</p><div class="actions"><a class="action" href="/dashboard/research/"><b>Research</b><span>Fundamentale Analyse und Score</span></a><a class="action" href="/dashboard/charting/"><b>Charting</b><span>Kurs, Trend und Szenarien</span></a><a class="action" href="/dashboard/discover/"><b>Entdecken</b><span>Aktien suchen und auswählen</span></a><a class="action" href="/dashboard/watchlist/"><b>Watchlist</b><span>Scores und Kennzahlen vergleichen</span></a></div></section>`;
    return;
  }

  try {
    if (view === 'research') {
      const [u, f, p, m, t] = await Promise.all([get('config/universe.json'), get('data/fundamental_scores.json'), get('data/research_profiles.json'), get('data/fundamental_metrics.json'), get('data/technical_scores.json')]);
      const stocks = u.stocks.filter((s) => s.active), stock = stocks.find((s) => s.symbol === selected) || stocks[0];
      const s = f.symbols[stock.symbol], profile = p.symbols[stock.symbol], metric = m.symbols[stock.symbol], tech = t.symbols[stock.symbol];
      const reasons = {
        Quality: `Geschäftsqualität, Margen, Kapitalrendite, Bilanz und Cashflow-Stabilität ergeben ${s.quality}/100.`,
        Growth: `Umsatz-, Ergebnis- und Cashflow-Dynamik sowie die verfügbare Guidance ergeben ${s.growth}/100.`,
        Value: `Bewertungsmultiplikatoren und Free-Cashflow-Rendite ergeben ${s.value}/100.`,
        Risiko: `Volatilität, Bewertung, Bilanz- und unternehmensspezifische Risiken ergeben ${s.risk}/100. Ein höherer Wert bedeutet höheres Risiko.`,
        Momentum: `Relative Kursentwicklung und Trendstärke ergeben ${Math.round(tech.momentum_score_beta)}/100.`,
        Timing: `${tech.trend_template_tests_passed} von 8 regelbasierten Trendtests sind erfüllt; daraus ergeben sich ${Math.round(tech.timing_score_beta)}/100.`
      };
      const scoreItems = [['Quality', s.quality], ['Growth', s.growth], ['Value', s.value], ['Risiko', s.risk], ['Momentum', tech.momentum_score_beta], ['Timing', tech.timing_score_beta]];
      app.innerHTML = `<div class="kicker">Fundamentale Analyse</div><h1 class="heading">Research</h1>${picker(stocks, stock.symbol, 'research', 'researchSearch')}<section class="research-grid"><div class="orb ${scoreClass(s.fundamental_score_beta)}"><small>Score</small><b>${s.fundamental_score_beta}</b><span>/100</span></div><div class="profile"><h2>${esc(profile.name)}</h2><p>${esc(profile.summary)}</p><ul>${(profile.highlights || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section><h2 class="section-title">Score-Analyse</h2><section class="scores score-details">${scoreItems.map(([name, value]) => `<article class="score"><span>${name}</span><b class="${scoreClass(value)}-text">${Math.round(value)}</b><i class="${scoreClass(value)}" style="width:${Math.min(value, 100)}%"></i><p>${esc(reasons[name])}</p></article>`).join('')}</section><h2 class="section-title">Fundamentale Kennzahlen</h2><section class="metrics">${[['Umsatzwachstum', metric.revenue_growth], ['KGV', metric.pe_ratio], ['KUV', metric.ps_ratio], ['FCF-Rendite', metric.fcf_yield]].map(([name, value]) => `<div class="metric"><span>${name}</span><b>${norm(value)}</b></div>`).join('')}</section><p class="data-note">Datenstand ${esc(s.data_as_of)}. Die derzeit strukturiert vorliegenden Claude-/Handoff-Daten enthalten diese vier Kennzahlen. Nicht verfügbare Werte werden nicht geschätzt.</p>`;
      bindSearch('researchSearch'); return;
    }

    if (view === 'charting') {
      const [u, t, market] = await Promise.all([get('config/universe.json'), get('data/technical_scores.json'), get('data/market_data.json')]);
      const stocks = u.stocks.filter((s) => s.active), stock = stocks.find((s) => s.symbol === selected) || stocks[0], tech = t.symbols[stock.symbol];
      const all = market.symbols[stock.symbol] || [], allCloses = all.map((r) => Number(r.close));
      if (all.length < 22) throw new Error('Keine Kursdaten');
      const emaAll = (n) => { let v = allCloses[0], k = 2 / (n + 1); return allCloses.map((c, i) => { v = i ? c * k + v * (1 - k) : c; return i < n - 1 ? null : v; }); };
      const smaAll = (n) => allCloses.map((_, i) => i < n - 1 ? null : allCloses.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n);
      const e20all = emaAll(20), e50all = emaAll(50), s200all = smaAll(200), bbAll = smaAll(20);
      const sdAll = allCloses.map((_, i) => i < 19 ? null : Math.sqrt(allCloses.slice(i - 19, i + 1).reduce((a, v) => a + (v - bbAll[i]) ** 2, 0) / 20));
      const start = Math.max(0, all.length - rangeDays), rows = all.slice(start), closes = allCloses.slice(start), e20 = e20all.slice(start), e50 = e50all.slice(start), s200 = s200all.slice(start), upper = bbAll.map((v, i) => v == null ? null : v + 2 * sdAll[i]).slice(start), lower = bbAll.map((v, i) => v == null ? null : v - 2 * sdAll[i]).slice(start);
      const values = closes.concat(e20, e50, s200, upper, lower).filter(Number.isFinite), lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * .08 || 1;
      const W = 1000, H = 610, L = 74, R = 96, T = 30, B = 70, x = (i) => L + i * (W - L - R) / (rows.length - 1), y = (v) => T + (hi + pad - v) * (H - T - B) / (hi - lo + 2 * pad);
      const path = (vals) => vals.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      const yTicks = Array.from({ length: 5 }, (_, i) => lo - pad + i * (hi - lo + 2 * pad) / 4), xIdx = [0, .25, .5, .75, 1].map((v) => Math.round(v * (rows.length - 1)));
      const grid = yTicks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${W - R + 10}" y="${y(v) + 4}">${fmt(v, 2)} USD</text>`).join('') + xIdx.map((i) => `<line class="grid" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"/><text class="axis-label x-label" x="${x(i)}" y="${H - 28}">${new Date(rows[i].date + 'T00:00:00').toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })}</text>`).join('');
      const pivots = [];
      for (let i = 3; i < closes.length - 3; i++) { const nearby = closes.slice(i - 3, i).concat(closes.slice(i + 1, i + 4)); if (closes[i] > Math.max(...nearby) || closes[i] < Math.min(...nearby)) pivots.push(i); }
      const waves = pivots.slice(-6), wavePoints = waves.map((i) => `${x(i)},${y(closes[i])}`).join(' '), last = closes.at(-1), swingLow = Math.min(...closes.slice(-Math.min(60, closes.length))), swingHigh = Math.max(...closes.slice(-Math.min(60, closes.length))), impulse = Math.max(last - swingLow, (swingHigh - swingLow) * .5), target1 = last + impulse * .618, target2 = last + impulse, invalid = swingLow;
      const futureX1 = W - R + 15, futureX2 = W - 20, projection = `<polyline class="elliott-projection" points="${x(waves.at(-1) || 0)},${y(closes[waves.at(-1) || 0])} ${futureX1},${y(Math.min(target1, hi + pad))} ${futureX2},${y(Math.min(target2, hi + pad))}"/><text class="wave-label" x="${futureX1 - 10}" y="${y(Math.min(target1, hi + pad)) - 8}">(1)</text><text class="wave-label" x="${futureX2 - 22}" y="${y(Math.min(target2, hi + pad)) - 8}">(3)</text><line class="zone-stop" x1="${L}" x2="${W - R}" y1="${y(invalid)}" y2="${y(invalid)}"/><text class="zone-stop-text" x="${L + 8}" y="${y(invalid) - 7}">Invalidierung · ${fmt(invalid, 2)} USD</text>`;
      app.innerHTML = `<div class="kicker">Technische Analyse β</div><h1 class="heading">Charting</h1>${picker(stocks, stock.symbol, 'charting', 'chartSearch')}<div class="chart-head"><div><h2>${stock.symbol} · ${esc(stock.name)}</h2><b>${fmt(tech.close, 2)} USD</b></div><nav class="range"><a class="${rangeDays === 22 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=22">1 Monat</a><a class="${rangeDays === 252 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=252">1 Jahr</a><a class="${rangeDays === 756 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=756">3 Jahre</a></nav></div><div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}">${grid}<path class="band" d="${path(upper)}"/><path class="band" d="${path(lower)}"/><path class="indicator ema20" d="${path(e20)}"/><path class="indicator ema50" d="${path(e50)}"/><path class="indicator sma200" d="${path(s200)}"/><path class="price" d="${path(closes)}"/>${waves.length > 1 ? `<polyline class="elliott-history" points="${wavePoints}"/>${waves.map((i, n) => `<circle class="wave-dot" cx="${x(i)}" cy="${y(closes[i])}" r="4"/><text class="wave-label" x="${x(i) + 6}" y="${y(closes[i]) - 8}">${n < 5 ? n + 1 : 'A'}</text>`).join('')}${projection}` : ''}</svg></div><div class="legend"><span class="lg-price">Kurs</span><span class="lg-e20">EMA 20</span><span class="lg-e50">EMA 50</span><span class="lg-s200">200-Tage-Linie</span><span class="lg-bb">Bollinger-Bänder</span><span class="lg-wave">Elliott/Fibonacci β</span></div><section class="technical-cards">${[['RSI 14', fmt(tech.rsi14)], ['Momentum', fmt(tech.momentum_score_beta, 0) + '/100'], ['Timing', fmt(tech.timing_score_beta, 0) + '/100'], ['Volatilität', fmt(tech.annualized_volatility_pct) + ' %'], ['Trendtests', tech.trend_template_tests_passed + '/8']].map(([name, value]) => `<div class="metric"><span>${name}</span><b>${value}</b></div>`).join('')}</section><article class="notice"><b>Elliott-/Fibonacci-Szenario β:</b> Swing-Punkte und Projektionsziele werden für den gewählten Zeitraum neu berechnet. Ziel 1: ${fmt(target1, 2)} USD · Ziel 2: ${fmt(target2, 2)} USD · Invalidierung: ${fmt(invalid, 2)} USD. Die Zählung ist heuristisch, noch nicht backtest-validiert und keine Anlageempfehlung.</article>`;
      bindSearch('chartSearch'); return;
    }

    if (view === 'discover' || view === 'watchlist') {
      const [u, f, m] = await Promise.all([get('config/universe.json'), get('data/fundamental_scores.json'), get('data/fundamental_metrics.json')]);
      const stocks = u.stocks.filter((s) => s.active).sort((a, b) => f.symbols[b.symbol].fundamental_score_beta - f.symbols[a.symbol].fundamental_score_beta);
      if (view === 'discover') { app.innerHTML = `<div class="kicker">Aktienauswahl</div><h1 class="heading">Entdecken</h1><input class="search" id="discoverSearch" placeholder="Aktie oder Symbol suchen"><div id="discoverList"></div>`; const render = (term) => { document.getElementById('discoverList').innerHTML = stocks.filter((s) => (s.symbol + ' ' + s.name).toLowerCase().includes(term.toLowerCase())).map((s) => `<div class="row"><b>${s.symbol}</b><span>${esc(s.name)}</span><span class="row-actions"><a href="/dashboard/research/?symbol=${s.symbol}">Research</a><a href="/dashboard/charting/?symbol=${s.symbol}">Chart</a></span></div>`).join(''); }; render(''); document.getElementById('discoverSearch').oninput = (e) => render(e.target.value); return; }
      app.innerHTML = `<div class="kicker">Nach Fundamental-Score sortiert</div><h1 class="heading">Watchlist</h1>${picker(stocks, '', 'research', 'watchSearch')}<div class="watch-cards">${stocks.map((s) => { const score = f.symbols[s.symbol], metric = m.symbols[s.symbol]; return `<a class="watch-card" data-search="${esc((s.symbol + ' ' + s.name).toLowerCase())}" href="/dashboard/research/?symbol=${s.symbol}"><div><b>${s.symbol}</b><span>${esc(s.name)}</span><em>KGV ${norm(metric.pe_ratio)} · KUV ${norm(metric.ps_ratio)}</em></div><strong class="score-badge ${scoreClass(score.fundamental_score_beta)}">${score.fundamental_score_beta}</strong></a>`; }).join('')}</div>`; bindSearch('watchSearch'); return;
    }
  } catch (error) { console.error(error); app.innerHTML = '<p class="notice">Die Daten konnten nicht vollständig geladen werden. Bitte die Seite neu laden.</p>'; }
}());

