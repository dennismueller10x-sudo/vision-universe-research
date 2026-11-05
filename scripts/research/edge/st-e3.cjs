'use strict';
// E3 Supertrader-Forschungsadapter (edge-st-adapter-1.0.0). Forschung, nicht zertifiziert.
// Eingabe je Methode und Fenster: kostenfreier Lauf von Strang B mit unveränderten REF-Regeln, Cash-Start
//   { daily: [{date, equity, cash, exposure}], fills: [{date, securityId, side, units, price, notional, reason, close, volume, adv20}],
//     terminals: [{securityId, date, cause, distress, delistClass, settlePrice}], holdings: [{date, positions: [[securityId, units, close]]}] }
// Ausgabe: tägliche Kurve nach dem Protokoll (Kosten und Endwerte wie quant/engines/portfolio-backtest.cjs), optional mit
// SPY-SMA200-Filter als Positions-Overlay, sowie die Kombination TOP5 aus fünf getrennten Sleeves zu je 20 %.
//
// Rechnung (anteilige Spiegelung, keine Neurechnung der Strategie):
// - Investiert folgt das Overlay der Tagesrendite des kostenfreien Laufs (Positionen + Cash von B), skaliert auf das eigene Kapital.
// - Kosten je Fill: Notional × (1 bp Gebühr + 5 bp Slippage + halber Spread nach ADV20 zum Fill), skaliert mit Kapital/Equity_B,
//   gebucht als anteiliger Abschlag am Fill-Tag (wie der Spread im Baukasten).
// - Endwert: Terminalereignis mit Abrechnung zum letzten Schluss (B) wird auf MERGER 100 %, UNKNOWN 70 %, DISTRESS 0 % gesetzt:
//   Abschlag = Anteil der Position am Kapital × (1 − Quote).
// - Filter (SPY-Schluss > SMA200 inkl. Tag, Gleichstand = Cash): Wechsel zum Schluss d wird zum Schluss der Folgesitzung
//   ausgeführt. Aus: alle Positionen kostenpflichtig schließen, danach Cash (unverzinst). An: die dann gehaltenen Positionen
//   des Laufs anteilig kostenpflichtig wieder aufbauen; danach folgen Ausstiege und Stops wieder den Fills.
const path = require('node:path');
const C = require(path.resolve(__dirname, '../../../quant/engines/portfolio-construction.cjs'));
const VERSION = 'edge-st-adapter-1.0.0';
const FEE_BPS = 1, SLIPPAGE_BPS = 5;
const RECOVERY = Object.freeze({ MERGER: 1, UNKNOWN: 0.7, DISTRESS: 0, SERIES_END: 1 });
function fail(code, d) { const e = new Error(code + (d ? ': ' + d : '')); e.code = code; throw e; }
const sideCostRate = adv => (FEE_BPS + SLIPPAGE_BPS + C.halfSpreadBps({ dollarVolume: Number.isFinite(adv) ? adv : undefined }).bps) / 10000;

function terminalClass(t) {
  if (t.distress === true || t.delistClass === 'DISTRESS' || t.delistClass === 'BANKRUPTCY') return 'DISTRESS';
  if (t.delistClass === 'MERGER' || t.delistClass === 'MERGER_ACQUISITION_COMPLETED' || t.delistClass === 'ACQUISITION') return 'MERGER';
  if (t.cause === 'DATA_GAP' && !t.delistClass) return 'SERIES_END';
  return t.delistClass && RECOVERY[t.delistClass] !== undefined ? t.delistClass : 'UNKNOWN';
}

function validate(run) {
  if (!run || !Array.isArray(run.daily) || run.daily.length < 60) fail('DAILY_REQUIRED');
  for (let i = 1; i < run.daily.length; i++) if (!(run.daily[i].date > run.daily[i - 1].date) || !(run.daily[i].equity > 0)) fail('DAILY_INVALID', run.daily[i].date);
  if (!(run.daily[0].equity > 0)) fail('DAILY_INVALID');
  return run;
}

// filterStateAt(date) -> true/false/null (null = kein SMA200 → Cash, wie blockiert gezählt)
function overlay(runIn, { filterStateAt = null } = {}) {
  const run = validate(runIn), days = run.daily, n = days.length;
  const fillsBy = new Map(), termBy = new Map(), holdBy = new Map(), lastAdv = new Map();
  for (const f of run.fills || []) { if (!fillsBy.has(f.date)) fillsBy.set(f.date, []); fillsBy.get(f.date).push(f); }
  for (const t of run.terminals || []) { if (!termBy.has(t.date)) termBy.set(t.date, []); termBy.get(t.date).push(t); }
  for (const h of run.holdings || []) holdBy.set(h.date, h.positions);
  const E = new Array(n);
  let cap = days[0].equity, invested = !filterStateAt, pending = null, costTotal = 0, terminalHaircut = 0, switches = 0, blocked = 0;
  const kinds = {};
  const positionsValue = (date) => (holdBy.get(date) || []).reduce((s, [, u, c]) => s + u * c, 0);
  const exposureCost = (date, scale) => (holdBy.get(date) || []).reduce((s, [id, u, c]) => s + u * c * scale * sideCostRate(lastAdv.get(id)), 0);
  for (let i = 0; i < n; i++) {
    const d = days[i], prev = days[i - 1];
    // 1. Marktbewegung des Tages (nur investiert): Tagesrendite des kostenfreien Laufs.
    if (i > 0 && invested) cap *= d.equity / prev.equity;
    // ADV der Fills dieses Tages merken (für spätere Filter-Handel derselben Position).
    for (const f of fillsBy.get(d.date) || []) if (Number.isFinite(f.adv20)) lastAdv.set(f.securityId, f.adv20);
    // 2. Ausführung eines am Vortag beschlossenen Filterwechsels zum heutigen Schluss.
    if (pending !== null) {
      const scale = cap / d.equity, cost = exposureCost(d.date, scale);
      cap -= cost; costTotal += cost; invested = pending; pending = null; switches++;
    }
    if (invested) {
      const scale = cap / d.equity;
      // 3. Kosten der eigenen Fills des Laufs (skaliert).
      for (const f of fillsBy.get(d.date) || []) { const c = Math.abs(f.notional) * scale * sideCostRate(f.adv20); cap -= c; costTotal += c; }
      // 4. Endwert delisteter Positionen nach Klasse (B rechnet mit dem letzten Schluss).
      for (const t of termBy.get(d.date) || []) {
        const k = terminalClass(t), rec = RECOVERY[k];
        kinds[k] = (kinds[k] || 0) + 1;
        const fill = (fillsBy.get(d.date) || []).find(f => f.securityId === t.securityId && f.side === 'SELL');
        const value = fill ? Math.abs(fill.notional) : (holdBy.get(prev ? prev.date : d.date) || []).filter(p => p[0] === t.securityId).reduce((s, [, u]) => s + u * t.settlePrice, 0);
        const loss = value * scale * (1 - rec);
        cap -= loss; terminalHaircut += loss;
      }
    }
    // 5. Filter am heutigen Schluss bewerten; Ausführung morgen.
    if (filterStateAt && i < n - 1) {
      let on = filterStateAt(d.date);
      if (on === null) { blocked++; on = false; }
      if (on !== invested) pending = on;
    }
    if (!(cap > 0)) fail('CAPITAL_NON_POSITIVE', d.date);
    E[i] = [d.date, cap];
  }
  return { version: VERSION, equity: E, costs: costTotal, terminalHaircut, terminalByKind: kinds, filterSwitches: switches, filterBlockedDays: blocked, finalInvested: invested };
}

// TOP5: fünf getrennte Sleeves zu je 20 % des Startkapitals, ohne Umschichtung. Gemeinsame Tage = Schnittmenge.
function sleeves(curves, initial = 1e6) {
  if (curves.length !== 5) fail('TOP5_REQUIRES_FIVE');
  const maps = curves.map(c => new Map(c.equity)), starts = curves.map(c => c.equity[0][1]);
  const dates = curves[0].equity.map(e => e[0]).filter(d => maps.every(m => m.has(d)));
  return { version: VERSION, equity: dates.map(d => [d, maps.reduce((s, m, k) => s + 0.2 * initial * m.get(d) / starts[k], 0)]),
    costs: curves.reduce((s, c, k) => s + c.costs * 0.2 * initial / starts[k], 0), terminalByKind: curves.reduce((o, c) => { for (const [k, v] of Object.entries(c.terminalByKind)) o[k] = (o[k] || 0) + v; return o; }, {}) };
}

// Tägliche Kurve -> Werte an den Wochenstichtagen der Benchmark (letzter Tageswert <= Stichtag, innerhalb derselben ISO-Woche).
function weekly(equity, weekDates, isoWeek) {
  const byWeek = new Map();
  for (const [d, v] of equity) byWeek.set(isoWeek(d), [d, v]);
  return weekDates.map(wd => { const x = byWeek.get(isoWeek(wd)); return x && x[0] <= wd ? [wd, x[1]] : [wd, null]; });
}

module.exports = { VERSION, RECOVERY, sideCostRate, terminalClass, overlay, sleeves, weekly };
