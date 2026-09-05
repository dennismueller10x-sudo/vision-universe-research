(async function () {
  const app = document.querySelector('#app');
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = (value) => new Date(value).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fallback = (item) => item.market && /DAX/.test(item.market) ? '/dashboard/assets/news-dax.jpg' : item.market && /Russell|SDAX|MDAX/.test(item.market) ? '/dashboard/assets/news-small-caps.jpg' : '/dashboard/assets/news-us-tech.jpg';
  try {
    const response = await fetch('/dashboard/data/news_feed.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Feed nicht erreichbar');
    const feed = await response.json();
    const items = Array.isArray(feed.items) ? feed.items : [];
    const markets = ['Alle', ...new Set(items.map((item) => item.market).filter(Boolean))];
    app.innerHTML = `<section class="news-header"><div class="kicker">VISION UNIVERSE NEWS</div><h1 class="heading">Was die Märkte heute bewegt.</h1><p class="intro">Von Vision Universe eigenständig formulierte Kurzartikel zu wirklich relevanten, aktuellen Marktthemen.</p><div class="news-meta"><span>Aktualisiert: ${esc(date(feed.updated_at))} Uhr</span><span>Recherchequellen: ${esc((feed.sources || []).join(' · ') || 'derzeit keine')}</span><span>Maximal ${esc(feed.freshness_hours || 24)} Stunden alt</span></div></section><div class="news-filters">${markets.map((market, index) => `<button class="news-filter ${index === 0 ? 'on' : ''}" data-market="${esc(market)}">${esc(market)}</button>`).join('')}</div><section id="newsList"></section><p class="news-disclaimer">Vision-Universe-Redaktion auf Basis der jeweils verlinkten Recherchequelle. Fakten werden automatisiert ausgewählt und redaktionell neu formuliert. Keine Anlageberatung.</p>`;
    const list = document.querySelector('#newsList');
    const render = (market = 'Alle') => {
      const visible = items.filter((item) => market === 'Alle' || item.market === market);
      if (!visible.length) { list.innerHTML = '<div class="news-empty">Für diesen Markt liegen derzeit keine ausreichend relevanten aktuellen Meldungen vor.</div>'; return; }
      const card = (item, feature) => `<article class="${feature ? 'news-feature' : 'news-card'}"><img src="${esc(item.image_url || fallback(item))}" alt="" loading="${feature ? 'eager' : 'lazy'}" onerror="this.onerror=null;this.src='${fallback(item)}'"><div class="${feature ? 'news-copy' : 'news-card-copy'}"><span class="news-eyebrow">${esc(item.market)} · ${esc(item.symbol || item.category)}</span><${feature ? 'h2' : 'h3'}>${esc(item.title)}</${feature ? 'h2' : 'h3'}><p>${esc(item.summary)}</p>${item.why_it_matters ? `<p><strong>Warum das wichtig ist:</strong> ${esc(item.why_it_matters)}</p>` : ''}<span class="news-source">${esc(item.editorial || 'Vision Universe Redaktion')} · ${esc(date(item.published_at))} Uhr<br>Recherche: <a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">${esc(item.source)} ↗</a></span></div></article>`;
      list.innerHTML = card(visible[0], true) + (visible.length > 1 ? `<div class="news-grid">${visible.slice(1).map((item) => card(item, false)).join('')}</div>` : '');
    };
    document.querySelector('.news-filters').onclick = (event) => { const button = event.target.closest('button'); if (!button) return; document.querySelectorAll('.news-filter').forEach((item) => item.classList.toggle('on', item === button)); render(button.dataset.market); };
    render();
  } catch (error) {
    app.innerHTML = '<section class="news-header"><div class="kicker">VISION UNIVERSE NEWS</div><h1 class="heading">News werden aktualisiert.</h1><p class="intro">Der Datenbestand wird gerade neu aufgebaut. Bitte in wenigen Minuten erneut öffnen.</p></section>';
  }
})();
