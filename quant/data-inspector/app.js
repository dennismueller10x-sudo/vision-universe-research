/* SEC Data Inspector - reads only the static JSON the pipeline generates.
   No API keys, no live SEC calls from the browser: the SEC asks automated
   clients for a declaring User-Agent, which a browser cannot set. */
const DATA = '/quant/data';
const $ = (id) => document.getElementById(id);

const state = { index: null, company: null, view: null };

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

function setStatus(message, isError) {
  const node = $('status');
  node.textContent = message;
  node.classList.toggle('status--error', Boolean(isError));
  node.hidden = !message;
}

function formatValue(row) {
  if (row.value === null || row.value === undefined) return '—';
  const abs = Math.abs(row.value);
  if (row.unit === 'USD' && abs >= 1e6) {
    return `${(row.value / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 3 })} Mrd.`;
  }
  return row.value.toLocaleString('de-DE', { maximumFractionDigits: 4 });
}

function periodLabel(row) {
  if (!row.fiscal_year) return row.fiscal_period || '—';
  return row.fiscal_period === 'FY'
    ? `FY${row.fiscal_year}`
    : `FY${row.fiscal_year} ${row.fiscal_period}`;
}

function renderProfile(view) {
  const profile = view.profile || {};
  const calendar = view.calendar || {};
  const cells = [
    ['Unternehmen', profile.name || '—'],
    ['CIK', view.cik],
    ['Ticker', (profile.tickers || []).join(', ') || '—'],
    ['SIC', `${profile.sic || '—'} ${profile.sic_description || ''}`],
    ['Fiskaljahresende', profile.fiscal_year_end || '—'],
    ['Kalender', calendar.week_based ? '52/53-Wochen' : 'Kalendermonate'],
    ['Label-Offset', calendar.label_offset === undefined ? '—' : String(calendar.label_offset)],
    ['Datenqualität', `${(view.quality_summary || {}).total ?? 0} Befunde`],
    ['Restatement-Policy', view.policy || '—'],
  ];
  $('profile').innerHTML = cells
    .map(([label, value]) => `<div><b>${label}</b>${value}</div>`)
    .join('');
  $('profile').hidden = false;
}

function renderRows() {
  const view = state.view;
  const metric = $('metric').value;
  const period = $('period').value;
  const showMissing = $('show-missing').checked;
  const rows = (view.rows || []).filter((row) => {
    if (row.metric !== metric) return false;
    if (!showMissing && !row.available) return false;
    if (period === 'FY') return row.fiscal_period === 'FY';
    if (period === 'Q') return /^Q[1-4]$/.test(row.fiscal_period || '');
    return true;
  });
  rows.sort((a, b) => (b.fiscal_year - a.fiscal_year)
    || String(a.fiscal_period).localeCompare(String(b.fiscal_period)));

  $('rows').innerHTML = rows.map((row) => {
    if (!row.available) {
      return `<tr class="is-missing"><td>${periodLabel(row)}</td>
        <td class="num">—</td><td colspan="8">${row.reason || 'nicht verfügbar'}</td>
        <td><span class="tag tag--UNKNOWN">UNKNOWN</span></td></tr>`;
    }
    const sourceTag = row.source === 'VISION_UNIVERSE_DERIVED'
      ? '<span class="tag tag--derived">VU DERIVED</span>'
      : '<span class="tag tag--sec">SEC</span>';
    return `<tr>
      <td>${periodLabel(row)}</td>
      <td class="num">${formatValue(row)}</td>
      <td>${row.unit || ''}</td>
      <td>${row.period_end || ''}</td>
      <td>${(row.available_from || '').slice(0, 10)}</td>
      <td>${row.form || ''}</td>
      <td>${row.accession || ''}</td>
      <td>${row.concept || ''}</td>
      <td>${sourceTag}</td>
      <td>${row.transformation || ''}</td>
      <td><span class="tag tag--${row.quality}">${row.quality}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="11">Keine Zeilen für diese Auswahl.</td></tr>';
}

function fillMetrics() {
  const metrics = [...new Set((state.view.rows || []).map((row) => row.metric))].sort();
  const previous = $('metric').value;
  $('metric').innerHTML = metrics
    .map((metric) => `<option value="${metric}">${metric}</option>`).join('');
  if (metrics.includes(previous)) $('metric').value = previous;
  else if (metrics.includes('revenue')) $('metric').value = 'revenue';
}

async function selectCompany(file) {
  setStatus('Lade Unternehmensdaten …');
  state.view = await loadJson(`${DATA}/${file}`);
  renderProfile(state.view);
  fillMetrics();
  renderRows();
  setStatus('');
}

function renderCoverage(matrix) {
  if (!matrix || matrix.status === 'not_generated' || !matrix.grid
      || !Object.keys(matrix.grid).length) {
    $('coverage').textContent = 'Noch nicht generiert. Läuft über den Workflow '
      + '"Update SEC fundamentals".';
    return;
  }
  const years = Object.keys(matrix.grid).sort((a, b) => b - a);
  const tickers = [...new Set(years.flatMap((year) => Object.keys(matrix.grid[year])))];
  const head = `<tr><th>Jahr</th>${tickers.map((t) => `<th>${t}</th>`).join('')}</tr>`;
  const body = years.map((year) => `<tr><td>${year}</td>${tickers.map((ticker) => {
    const status = matrix.grid[year][ticker] || 'MISSING';
    return `<td class="cov--${status}">${status}</td>`;
  }).join('')}</tr>`).join('');
  $('coverage').innerHTML = `<table>${head}${body}</table>`;
}

function renderGates(report) {
  const results = (report && report.provider_level && report.provider_level.results) || [];
  if (!results.length) {
    $('gates').textContent = 'Noch nicht generiert. Läuft über den Workflow '
      + '"Update SEC fundamentals".';
    return;
  }
  $('gates').innerHTML = results.map((gate) => `
    <div class="gate">
      <span class="gate__status gate__status--${gate.status}">${gate.status}</span>
      <span><strong>${gate.gate}</strong><br>
        <span class="gate__reason">${gate.reason}</span></span>
    </div>`).join('');
}

async function init() {
  try {
    state.index = await loadJson(`${DATA}/inspector_index.json`);
  } catch (error) {
    setStatus(`Index konnte nicht geladen werden: ${error.message}`, true);
    return;
  }

  const companies = state.index.companies || [];
  if (!companies.length) {
    setStatus('Noch keine SEC-Daten ingestiert. Der Workflow "Update SEC fundamentals" '
      + 'erzeugt sie; bis dahin ist dieser Inspector absichtlich leer '
      + '(status: not_generated).');
  } else {
    $('controls').hidden = false;
    $('company').innerHTML = companies
      .map((company) => `<option value="${company.file}">${company.ticker} — ${company.name}</option>`)
      .join('');
    $('company').addEventListener('change', (event) => selectCompany(event.target.value));
    $('metric').addEventListener('change', renderRows);
    $('period').addEventListener('change', renderRows);
    $('show-missing').addEventListener('change', renderRows);
    await selectCompany(companies[0].file);
  }

  for (const [file, render] of [['coverage_matrix.json', renderCoverage],
                                ['pit_gates.json', renderGates]]) {
    try {
      render(await loadJson(`${DATA}/${file}`));
    } catch (error) {
      render(null);
    }
  }
}

init();
