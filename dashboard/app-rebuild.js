(async function () {
  const app = document.querySelector('#app');
  const view = document.body.dataset.view || 'home';
  const params = new URLSearchParams(location.search);
  const selected = params.get('symbol') || 'NVDA';
  const rangeDays = [22, 252, 756, 1260].includes(Number(params.get('days'))) ? Number(params.get('days')) : 756;
  const side = params.get('side') === 'short' ? 'short' : 'long';
  const get = (path) => fetch('/dashboard/' + path).then((r) => { if (!r.ok) throw new Error(path); return r.json(); });
  const esc = (v) => String(v == null ? '—' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const norm = (v) => esc(String(v == null ? '—' : v).replace(/percent/gi, '%').replace(/ratio/gi, 'x'));
  const scoreClass = (v) => v < 50 ? 'score-red' : v < 70 ? 'score-yellow' : v < 80 ? 'score-lightgreen' : 'score-darkgreen';
  const picker = (stocks, symbol, target, id) => `<section class="picker"><input class="search" id="${id}" placeholder="Aktie oder Symbol suchen"><div class="stock-buttons">${stocks.map((s) => `<a class="stock-button ${s.symbol === symbol ? 'selected' : ''}" data-search="${esc((s.symbol + ' ' + s.name).toLowerCase())}" href="/dashboard/${target}/?symbol=${s.symbol}${target === 'charting' ? '&days=' + rangeDays + '&side=' + side : ''}"><b>${s.symbol}</b><span>${esc(s.name)}</span></a>`).join('')}</div></section>`;
  const bindSearch = (id) => { const input = document.getElementById(id); if (input) input.oninput = () => document.querySelectorAll('.stock-button,.watch-card').forEach((el) => { el.hidden = !el.dataset.search.includes(input.value.toLowerCase()); }); };

  if (view === 'home') {
    app.innerHTML = `<section class="home"><div class="kicker">VISION UNIVERSE</div><h1>Was möchtest du heute verstehen?</h1><p class="intro">Unabhängiges Research für fundiertere Anlageentscheidungen.</p><div class="actions"><a class="action" href="/dashboard/research/"><b>Research</b><span>Fundamentale Analyse und Score</span></a><a class="action" href="/dashboard/charting/"><b>Charting</b><span>Kurs, Trend und Szenarien</span></a><a class="action" href="/dashboard/discover/"><b>Entdecken</b><span>Aktien suchen und auswählen</span></a><a class="action" href="/dashboard/watchlist/"><b>Watchlist</b><span>Scores und Kennzahlen vergleichen</span></a></div></section>`;
    return;
  }

  try {
    if (view === 'research') {
      const [u, f, p, m, t] = await Promise.all([get('config/universe.json'), get('data/fundamental_scores.json'), get('data/research_profiles.json'), get('data/fundamental_metrics.json'), get('data/technical_scores.json')]);
      const stocks = u.stocks.filter((s) => s.active), stock = stocks.find((s) => s.symbol === selected) || stocks[0];
      const s = f.symbols[stock.symbol], profile = p.symbols[stock.symbol], metric = m.symbols[stock.symbol], tech = t.symbols[stock.symbol], rationale = profile.score_rationale || {};
      const reasons = {
        Quality: rationale.Quality || `Geschäftsqualität, Margen, Kapitalrendite, Bilanz und Cashflow-Stabilität ergeben ${s.quality}/100.`,
        Growth: rationale.Growth || `Umsatz-, Ergebnis- und Cashflow-Dynamik sowie die verfügbare Guidance ergeben ${s.growth}/100.`,
        Value: rationale.Value || `Bewertungsmultiplikatoren und Free-Cashflow-Rendite ergeben ${s.value}/100.`,
        Risiko: rationale.Risiko || `Volatilität, Bewertung, Bilanz- und unternehmensspezifische Risiken ergeben ${s.risk}/100. Ein höherer Wert bedeutet höheres Risiko.`,
        Momentum: `Relative Kursentwicklung und Trendstärke über 1/3/6/12 Monate ergeben ${Math.round(tech.momentum_score_beta)}/100.`,
        Timing: `${tech.trend_template_tests_passed} von 8 regelbasierten Trendtests (Kurs vs. gleitende Durchschnitte, RSI, 52-Wochen-Abstand) sind erfüllt; daraus ergeben sich ${Math.round(tech.timing_score_beta)}/100.`
      };
      const scoreItems = [['Quality', s.quality], ['Growth', s.growth], ['Value', s.value], ['Risiko', s.risk], ['Momentum', tech.momentum_score_beta], ['Timing', tech.timing_score_beta]];
      app.innerHTML = `<div class="kicker">Fundamentale Analyse</div><h1 class="heading">Research</h1>${picker(stocks, stock.symbol, 'research', 'researchSearch')}<section class="research-grid"><div class="orb-wrap"><span class="orb-label">Vision Universe Score</span><div class="orb ${scoreClass(s.fundamental_score_beta)}"><b>${s.fundamental_score_beta}</b><span>/100</span></div></div><div class="profile"><h2>${esc(profile.name)}</h2><p>${esc(profile.summary)}</p><ul>${(profile.highlights || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section><h2 class="section-title">Score-Analyse</h2><section class="scores score-details">${scoreItems.map(([name, value]) => `<article class="score"><span>${name}</span><b class="${scoreClass(value)}-text">${Math.round(value)}</b><i class="${scoreClass(value)}" style="width:${Math.min(value, 100)}%"></i><p>${esc(reasons[name])}</p></article>`).join('')}</section><h2 class="section-title">Fundamentale Kennzahlen</h2><section class="metrics">${[['Umsatzwachstum', metric.revenue_growth], ['KGV', metric.pe_ratio], ['KUV', metric.ps_ratio], ['FCF-Rendite', metric.fcf_yield], ['Bruttomarge', metric.gross_margin], ['Operative Marge', metric.operating_margin], ['ROIC', metric.roic]].map(([name, value]) => `<div class="metric"><span>${name}</span><b>${norm(value)}</b></div>`).join('')}</section><p class="data-note">Datenstand ${esc(m.data_as_of || s.data_as_of)}. ${esc(m.sources || '')} Nicht verfügbare Werte werden nicht geschätzt.</p>`;
      bindSearch('researchSearch'); return;
    }

    if (view === 'charting') {
      const [u, t, market] = await Promise.all([get('config/universe.json'), get('data/technical_scores.json'), get('data/market_data.json')]);
      const stocks = u.stocks.filter((s) => s.active), stock = stocks.find((s) => s.symbol === selected) || stocks[0], tech = t.symbols[stock.symbol];
      const all = market.symbols[stock.symbol] || [], allCloses = all.map((r) => Number(r.close)), allHighs = all.map((r) => Number(r.high)), allLows = all.map((r) => Number(r.low));
      const totalLen = all.length;
      if (totalLen < 22) throw new Error('Keine Kursdaten');
      const emaSeries = (values, n) => { const k = 2 / (n + 1); const out = new Array(values.length).fill(null); let v = null, count = 0; for (let i = 0; i < values.length; i++) { const val = values[i]; if (val == null) continue; v = v == null ? val : val * k + v * (1 - k); count++; out[i] = count >= n ? v : null; } return out; };
      const smaSeries = (values, n) => values.map((_, i) => { if (i < n - 1) return null; const slice = values.slice(i - n + 1, i + 1); return slice.some((v) => v == null) ? null : slice.reduce((a, b) => a + b, 0) / n; });
      const rsiSeries = (values, period) => { const out = new Array(values.length).fill(null); if (values.length <= period) return out; let gains = 0, losses = 0; for (let i = 1; i <= period; i++) { const d = values[i] - values[i - 1]; if (d >= 0) gains += d; else losses -= d; } let avgGain = gains / period, avgLoss = losses / period; out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss); for (let i = period + 1; i < values.length; i++) { const d = values[i] - values[i - 1]; avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period; avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period; out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss); } return out; };
      const e20all = emaSeries(allCloses, 20), e50all = emaSeries(allCloses, 50), s200all = smaSeries(allCloses, 200), bbAll = smaSeries(allCloses, 20);
      const sdAll = allCloses.map((_, i) => i < 19 ? null : Math.sqrt(allCloses.slice(i - 19, i + 1).reduce((a, v) => a + (v - bbAll[i]) ** 2, 0) / 20));
      const upperAll = bbAll.map((v, i) => v == null ? null : v + 2 * sdAll[i]), lowerAll = bbAll.map((v, i) => v == null ? null : v - 2 * sdAll[i]);
      const rsiAll = rsiSeries(allCloses, 14), e12All = emaSeries(allCloses, 12), e26All = emaSeries(allCloses, 26);
      const macdLineAll = allCloses.map((_, i) => (e12All[i] == null || e26All[i] == null) ? null : e12All[i] - e26All[i]);
      const signalAll = emaSeries(macdLineAll, 9);
      const histAll = allCloses.map((_, i) => (macdLineAll[i] == null || signalAll[i] == null) ? null : macdLineAll[i] - signalAll[i]);
      const stochKAll = allCloses.map((_, i) => { if (i < 13) return null; const hh = Math.max(...allHighs.slice(i - 13, i + 1)), ll = Math.min(...allLows.slice(i - 13, i + 1)); return hh === ll ? 50 : (allCloses[i] - ll) / (hh - ll) * 100; });
      const stochDAll = smaSeries(stochKAll, 3);
      const W = 1000, H = 610, L = 74, R = 96, T = 30, B = 70;
      const minSpan = 19, defaultStart = Math.max(0, totalLen - rangeDays), defaultEnd = totalLen - 1;
      let winStart = defaultStart, winEnd = defaultEnd, curSide = side;
      const visible = { ema20: true, ema50: true, sma200: true, bollinger: false, zones: false, rsi: false, macd: false, stoch: false, volume: false };
      const fmt2 = (v) => fmt(v, 2);
      const dateLabel = (s, e) => { const from = new Date(all[s].date + 'T00:00:00'), to = new Date(all[e].date + 'T00:00:00'); const fmtOpt = (e - s) <= 45 ? { day: '2-digit', month: 'short', year: '2-digit' } : { month: 'short', year: '2-digit' }; return `${from.toLocaleDateString('de-DE', fmtOpt)} – ${to.toLocaleDateString('de-DE', fmtOpt)}`; };

      const buildChart = (s, e) => {
        const rows = all.slice(s, e + 1), closes = allCloses.slice(s, e + 1);
        const atPresent = e === totalLen - 1;
        const futureBars = atPresent ? Math.max(10, Math.round(rows.length * .15)) : 0;
        const domainLen = Math.max(1, rows.length - 1 + futureBars);
        const x = (i) => L + i * (W - L - R) / domainLen;
        const slice = (arr) => arr.slice(s, e + 1);
        const e20 = slice(e20all), e50 = slice(e50all), s200 = slice(s200all), upper = slice(upperAll), lower = slice(lowerAll);
        const rsi = slice(rsiAll), macdLine = slice(macdLineAll), signalLine = slice(signalAll), hist = slice(histAll), stochK = slice(stochKAll), stochD = slice(stochDAll);
        const volumes = rows.map((r) => Number(r.volume || 0));
        const bandVals = visible.bollinger ? upper.concat(lower) : [];
        const trendVals = [closes, visible.ema20 ? e20 : [], visible.ema50 ? e50 : [], visible.sma200 ? s200 : [], bandVals].flat().filter(Number.isFinite);
        const lo = Math.min(...trendVals), hi = Math.max(...trendVals), pad = (hi - lo) * .08 || 1;
        const y = (v) => T + (hi + pad - v) * (H - T - B) / (hi - lo + 2 * pad);
        const path = (vals) => vals.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
        const yTicks = Array.from({ length: 5 }, (_, i) => lo - pad + i * (hi - lo + 2 * pad) / 4), xIdx = [0, .25, .5, .75, 1].map((v) => Math.round(v * (rows.length - 1)));
        const dateFmt = rows.length <= 45 ? { day: '2-digit', month: 'short' } : { month: 'short', year: '2-digit' };
        const grid = yTicks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-label" x="${W - R + 10}" y="${y(v) + 4}">${fmt2(v)} USD</text>`).join('') + xIdx.map((i) => `<line class="grid" x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"/><text class="axis-label x-label" x="${x(i)}" y="${H - 28}">${new Date(rows[i].date + 'T00:00:00').toLocaleDateString('de-DE', dateFmt)}</text>`).join('');
        const pivots = [];
        for (let i = 3; i < closes.length - 3; i++) { const nearby = closes.slice(i - 3, i).concat(closes.slice(i + 1, i + 4)); if (closes[i] > Math.max(...nearby) || closes[i] < Math.min(...nearby)) pivots.push(i); }
        const waves = pivots.slice(-6), wavePoints = waves.map((i) => `${x(i)},${y(closes[i])}`).join(' ');
        let zonesHtml = '', zonesInfo = null;
        if (atPresent) {
          const lookback = Math.min(90, closes.length), recent = closes.slice(-lookback), swingLow = Math.min(...recent), swingHigh = Math.max(...recent), impulse = Math.max(swingHigh - swingLow, closes.at(-1) * .02);
          const longBuy = [swingHigh - impulse * .618, swingHigh - impulse * .5], longTarget = [swingHigh + impulse * .618, swingHigh + impulse * 1], longInvalid = swingLow;
          const shortSell = [swingLow + impulse * .5, swingLow + impulse * .618], shortTarget = [swingLow - impulse * 1, swingLow - impulse * .618], shortInvalid = swingHigh;
          const zoneY = (v) => T + (hi + pad - Math.min(Math.max(v, lo - pad), hi + pad)) * (H - T - B) / (hi - lo + 2 * pad);
          const zoneX0 = x(rows.length - 1), zoneX1 = W - R;
          const zoneRect = (range, cls) => { const y1 = zoneY(range[1]), y2 = zoneY(range[0]); return `<rect class="zone-box ${cls}" x="${zoneX0.toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(0, zoneX1 - zoneX0).toFixed(1)}" height="${Math.max(0, y2 - y1).toFixed(1)}"/>`; };
          const buildZones = (buyRange, targetRange, invalid, buyCls, targetCls, buyLabelCls, targetLabelCls, buyText, targetText) => `<line class="zone-now" x1="${zoneX0.toFixed(1)}" x2="${zoneX0.toFixed(1)}" y1="${T}" y2="${H - B}"/>${zoneRect(buyRange, buyCls)}${zoneRect(targetRange, targetCls)}<text class="zone-label ${buyLabelCls}" x="${(zoneX0 + 6).toFixed(1)}" y="${(zoneY(buyRange[1]) - 6).toFixed(1)}">${buyText}</text><text class="zone-label ${targetLabelCls}" x="${(zoneX0 + 6).toFixed(1)}" y="${(zoneY(targetRange[1]) - 6).toFixed(1)}">${targetText}</text><line class="zone-stop" x1="${L}" x2="${W - R}" y1="${zoneY(invalid).toFixed(1)}" y2="${zoneY(invalid).toFixed(1)}"/><text class="zone-stop-text" x="${L + 8}" y="${(zoneY(invalid) - 7).toFixed(1)}">Invalidierung · ${fmt2(invalid)} USD</text>`;
          const info = curSide === 'short'
            ? { html: buildZones(shortSell, shortTarget, shortInvalid, 'zone-buy-short', 'zone-target-short', 'zone-label-buy-short', 'zone-label-target-short', 'Verkaufszone', 'Zielzone'), buy: shortSell, target: shortTarget, invalid: shortInvalid, buyLabel: 'Verkaufszone (Short)', targetLabel: 'Zielzone (Short)' }
            : { html: buildZones(longBuy, longTarget, longInvalid, 'zone-buy', 'zone-target', 'zone-label-buy', 'zone-label-target', 'Kaufzone', 'Zielzone'), buy: longBuy, target: longTarget, invalid: longInvalid, buyLabel: 'Kaufzone (Long)', targetLabel: 'Zielzone (Long)' };
          if (visible.zones) zonesHtml = info.html;
          zonesInfo = info;
        }
        const barW = Math.max(1, (W - L - R) / domainLen * .6);
        const RH = 150, RT = 14, RB = 26, ry = (v) => RT + (100 - v) * (RH - RT - RB) / 100;
        const rsiPath = rsi.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${ry(v).toFixed(1)}`).join(' ');
        const rsiSvg = `<svg class="rsi-panel" viewBox="0 0 ${W} ${RH}"><rect class="rsi-ob" x="${L}" y="${RT}" width="${W - R - L}" height="${(ry(70) - RT).toFixed(1)}"/><rect class="rsi-os" x="${L}" y="${ry(30).toFixed(1)}" width="${W - R - L}" height="${(RH - RB - ry(30)).toFixed(1)}"/>${[30, 50, 70].map((v) => `<line class="rsi-band" x1="${L}" x2="${W - R}" y1="${ry(v)}" y2="${ry(v)}"/><text x="${W - R + 8}" y="${ry(v) + 3}">${v}</text>`).join('')}<path class="rsi-line" d="${rsiPath}"/></svg>`;
        const stochPath = (vals) => vals.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${ry(v).toFixed(1)}`).join(' ');
        const stochSvg = `<svg class="stoch-panel" viewBox="0 0 ${W} ${RH}"><rect class="rsi-ob" x="${L}" y="${RT}" width="${W - R - L}" height="${(ry(80) - RT).toFixed(1)}"/><rect class="rsi-os" x="${L}" y="${ry(20).toFixed(1)}" width="${W - R - L}" height="${(RH - RB - ry(20)).toFixed(1)}"/>${[20, 50, 80].map((v) => `<line class="rsi-band" x1="${L}" x2="${W - R}" y1="${ry(v)}" y2="${ry(v)}"/><text x="${W - R + 8}" y="${ry(v) + 3}">${v}</text>`).join('')}<path class="stoch-k" d="${stochPath(stochK)}"/><path class="stoch-d" d="${stochPath(stochD)}"/></svg>`;
        const macdVals = macdLine.concat(signalLine, hist).filter(Number.isFinite), mMax = Math.max(...macdVals, .01), mMin = Math.min(...macdVals, -.01), mPad = (mMax - mMin) * .12 || .01;
        const MH = 170, MT = 14, MB = 26, my = (v) => MT + (mMax + mPad - v) * (MH - MT - MB) / (mMax - mMin + 2 * mPad);
        const macdPath = macdLine.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${my(v).toFixed(1)}`).join(' '), signalPath = signalLine.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${my(v).toFixed(1)}`).join(' ');
        const histBars = hist.map((v, i) => v == null ? '' : `<rect class="${v >= 0 ? 'hist-pos' : 'hist-neg'}" x="${(x(i) - barW / 2).toFixed(1)}" y="${(v >= 0 ? my(v) : my(0)).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(my(v) - my(0)).toFixed(1)}"/>`).join('');
        const macdSvg = `<svg class="macd-panel" viewBox="0 0 ${W} ${MH}"><line class="macd-zero" x1="${L}" x2="${W - R}" y1="${my(0)}" y2="${my(0)}"/>${histBars}<path class="macd-line" d="${macdPath}"/><path class="signal-line" d="${signalPath}"/></svg>`;
        const volMax = Math.max(...volumes, 1), VH = 120, VT = 10, VB = 22, vy = (v) => VT + (volMax - v) * (VH - VT - VB) / volMax;
        const volBars = volumes.map((v, i) => `<rect class="${(i === 0 || closes[i] >= closes[i - 1]) ? 'vol-up' : 'vol-down'}" x="${(x(i) - barW / 2).toFixed(1)}" y="${vy(v).toFixed(1)}" width="${barW.toFixed(1)}" height="${(VH - VB - vy(v)).toFixed(1)}"/>`).join('');
        const volAvg = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
        const volFmt = (v) => v >= 1e9 ? (v / 1e9).toFixed(1) + ' Mrd.' : v >= 1e6 ? (v / 1e6).toFixed(1) + ' Mio.' : Math.round(v).toLocaleString('de-DE');
        const volSvg = `<svg class="volume-panel" viewBox="0 0 ${W} ${VH}">${volBars}<line class="vol-avg" x1="${L}" x2="${W - R}" y1="${vy(volAvg).toFixed(1)}" y2="${vy(volAvg).toFixed(1)}"/><text class="vol-axis" x="${W - R + 8}" y="${VT + 4}">${volFmt(volMax)}</text><text class="vol-axis" x="${W - R + 8}" y="${VH - VB + 4}">0</text></svg>`;
        return { grid, path, x, y, closes, e20, e50, s200, upper, lower, waves, wavePoints, zonesHtml, zonesInfo, rsiSvg, stochSvg, macdSvg, volSvg, dateRange: dateLabel(s, e) };
      };

      const macdLatest = macdLineAll.at(-1), signalLatest = signalAll.at(-1);
      const macdState = (macdLatest != null && signalLatest != null) ? (macdLatest >= signalLatest ? 'Bullish' : 'Bearish') : '—';

      app.innerHTML = `<div class="kicker">Technische Analyse β</div><h1 class="heading">Charting</h1>${picker(stocks, stock.symbol, 'charting', 'chartSearch')}<div class="chart-head"><div><h2>${stock.symbol} · ${esc(stock.name)}</h2><b>${fmt2(tech.close)} USD</b></div><nav class="range"><a class="${rangeDays === 22 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=22">1 Monat</a><a class="${rangeDays === 252 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=252">1 Jahr</a><a class="${rangeDays === 756 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=756">3 Jahre</a><a class="${rangeDays === 1260 ? 'on' : ''}" href="?symbol=${stock.symbol}&days=1260">5 Jahre</a></nav></div><p class="zoom-hint">Zum Zoomen mit zwei Fingern auf dem Chart pinchen (oder Mausrad), zum Verschieben ziehen. <button class="zoom-reset" id="zoomReset" hidden>Zoom zurücksetzen</button></p><div id="chartCanvas"></div><div class="legend"><span class="lg-price">Kurs</span><span class="lg-e20">EMA 20</span><span class="lg-e50">EMA 50</span><span class="lg-s200">200-Tage-Linie</span><span class="lg-bb">Bollinger-Bänder</span><span class="lg-wave">Elliott-Wellenzählung β</span></div><div class="indicator-toggle" id="indicatorToggle"><button data-ind="ema20" class="on">EMA 20</button><button data-ind="ema50" class="on">EMA 50</button><button data-ind="sma200" class="on">200-Tage</button><button data-ind="bollinger">Bollinger</button><button data-ind="zones">Elliott-Zonen</button><button data-ind="rsi">RSI</button><button data-ind="macd">MACD</button><button data-ind="stoch">Stochastik</button><button data-ind="volume">Volumen</button></div><div class="side-toggle" id="sideToggle"><button data-side="long" class="${curSide === 'long' ? 'on' : ''}">Long</button><button data-side="short" class="${curSide === 'short' ? 'on' : ''}">Short</button></div><section class="technical-cards">${[['RSI 14', fmt(tech.rsi14)], ['MACD', macdState], ['Momentum', fmt(tech.momentum_score_beta, 0) + '/100'], ['Timing', fmt(tech.timing_score_beta, 0) + '/100'], ['Volatilität', fmt(tech.annualized_volatility_pct) + ' %'], ['Trendtests', tech.trend_template_tests_passed + '/8']].map(([name, value]) => `<div class="metric"><span>${name}</span><b>${value}</b></div>`).join('')}</section><article class="notice" id="chartNotice"></article>`;

      const canvas = document.getElementById('chartCanvas');
      const noticeEl = document.getElementById('chartNotice');
      const zoomResetBtn = document.getElementById('zoomReset');

      const redraw = () => {
        const c = buildChart(winStart, winEnd);
        canvas.innerHTML = `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}">${c.grid}${visible.bollinger ? `<path class="band" d="${c.path(c.upper)}"/><path class="band" d="${c.path(c.lower)}"/>` : ''}${visible.ema20 ? `<path class="indicator ema20" d="${c.path(c.e20)}"/>` : ''}${visible.ema50 ? `<path class="indicator ema50" d="${c.path(c.e50)}"/>` : ''}${visible.sma200 ? `<path class="indicator sma200" d="${c.path(c.s200)}"/>` : ''}${c.zonesHtml}<path class="price" d="${c.path(c.closes)}"/>${c.waves.length > 1 ? `<polyline class="elliott-history" points="${c.wavePoints}"/>${c.waves.map((i, n) => `<circle class="wave-dot" cx="${c.x(i)}" cy="${c.y(c.closes[i])}" r="3.5"/><text class="wave-label" x="${c.x(i) + 6}" y="${c.y(c.closes[i]) - 8}">${n < 5 ? n + 1 : 'A'}</text>`).join('')}` : ''}</svg></div>${visible.rsi ? `<p class="panel-label">RSI (14)</p>${c.rsiSvg}` : ''}${visible.stoch ? `<p class="panel-label">Stochastik (14, 3)</p>${c.stochSvg}` : ''}${visible.macd ? `<p class="panel-label">MACD (12, 26, 9)</p>${c.macdSvg}` : ''}${visible.volume ? `<p class="panel-label">Volumen</p>${c.volSvg}` : ''}<p class="window-range">${c.dateRange}</p>`;
        zoomResetBtn.hidden = winStart === defaultStart && winEnd === defaultEnd;
        const zonesActive = c.zonesInfo && visible.zones;
        noticeEl.innerHTML = zonesActive
          ? `<b>Elliott-Wellenzählung β · ${curSide === 'short' ? 'Short-Szenario' : 'Long-Szenario'}:</b> ${c.zonesInfo.buyLabel} ${fmt2(c.zonesInfo.buy[0])}–${fmt2(c.zonesInfo.buy[1])} USD · ${c.zonesInfo.targetLabel} ${fmt2(c.zonesInfo.target[0])}–${fmt2(c.zonesInfo.target[1])} USD · Invalidierung ${fmt2(c.zonesInfo.invalid)} USD. Die Zählung ist heuristisch, noch nicht backtest-validiert und keine Anlageempfehlung.`
          : `<b>Elliott-Wellenzählung β:</b> Über den Button „Elliott-Zonen“ oben lassen sich Kauf-/Verkaufszone und Zielzone rechts vom aktuellen Kurs einblenden (nur in der aktuellen Ansicht verfügbar, nicht rückwirkend). Die Zählung ist heuristisch, noch nicht backtest-validiert und keine Anlageempfehlung.`;
      };

      document.getElementById('indicatorToggle').onclick = (e) => {
        const btn = e.target.closest('button[data-ind]'); if (!btn) return;
        const key = btn.dataset.ind; visible[key] = !visible[key]; btn.classList.toggle('on', visible[key]); redraw();
      };
      document.getElementById('sideToggle').onclick = (e) => {
        const btn = e.target.closest('button[data-side]'); if (!btn) return;
        curSide = btn.dataset.side; visible.zones = true;
        document.querySelectorAll('#sideToggle button').forEach((b) => b.classList.toggle('on', b.dataset.side === curSide));
        document.querySelector('#indicatorToggle button[data-ind="zones"]').classList.add('on');
        redraw();
      };
      zoomResetBtn.onclick = () => { winStart = defaultStart; winEnd = defaultEnd; redraw(); };

      const applyWindow = (s, e) => {
        let span = Math.max(minSpan, Math.min(totalLen - 1, e - s));
        s = Math.round(s); e = s + span;
        if (e > totalLen - 1) { e = totalLen - 1; s = e - span; }
        if (s < 0) { s = 0; e = s + span; }
        winStart = s; winEnd = Math.min(totalLen - 1, e); redraw();
      };
      let pointers = new Map(), pinchStartDist = null, pinchStartWindow = null, dragStartX = null, dragStartWindow = null;
      canvas.style.touchAction = 'pan-y';
      canvas.onpointerdown = (e) => {
        if (!e.target.closest('.chart-wrap')) return;
        canvas.setPointerCapture?.(e.pointerId); pointers.set(e.pointerId, e.clientX);
        if (pointers.size === 1) { dragStartX = e.clientX; dragStartWindow = [winStart, winEnd]; }
        if (pointers.size === 2) { const pts = [...pointers.values()]; pinchStartDist = Math.abs(pts[0] - pts[1]) || 1; pinchStartWindow = [winStart, winEnd]; }
      };
      canvas.onpointermove = (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, e.clientX);
        const rect = canvas.querySelector('.chart-wrap')?.getBoundingClientRect(); if (!rect) return;
        if (pointers.size === 2 && pinchStartDist) {
          const pts = [...pointers.values()], dist = Math.abs(pts[0] - pts[1]) || 1, ratio = pinchStartDist / dist;
          const span0 = pinchStartWindow[1] - pinchStartWindow[0], center = (pinchStartWindow[0] + pinchStartWindow[1]) / 2;
          const span = Math.max(minSpan, Math.min(totalLen - 1, Math.round(span0 * ratio)));
          applyWindow(Math.round(center - span / 2), Math.round(center + span / 2));
        } else if (pointers.size === 1 && dragStartX != null) {
          const dx = e.clientX - dragStartX, span = dragStartWindow[1] - dragStartWindow[0];
          const barsShift = Math.round(-dx / rect.width * (span + 1));
          applyWindow(dragStartWindow[0] + barsShift, dragStartWindow[1] + barsShift);
        }
      };
      canvas.onpointerup = canvas.onpointercancel = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStartDist = null; if (pointers.size < 1) dragStartX = null; };
      canvas.onwheel = (e) => {
        if (!e.target.closest('.chart-wrap')) return; e.preventDefault();
        const rect = canvas.querySelector('.chart-wrap').getBoundingClientRect(), span = winEnd - winStart;
        const factor = e.deltaY > 0 ? 1.15 : 0.87, newSpan = Math.max(minSpan, Math.min(totalLen - 1, Math.round(span * factor)));
        const relX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), anchor = winStart + relX * span;
        applyWindow(Math.round(anchor - relX * newSpan), Math.round(anchor + (1 - relX) * newSpan));
      };

      redraw();
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

