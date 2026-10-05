(async function () {
  const app = document.querySelector('#app');
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const date = (value) => new Date(value).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  /* Nur http(s)-Links und eigene Pfade: der Feed kommt aus externen
     Quellen, ein javascript:-Link waere trotz Escaping ausfuehrbar. */
  const safeUrl = (value, allowPath) => {
    const v = String(value == null ? '' : value).trim();
    if (allowPath && /^\/(?!\/)/.test(v)) return v;
    return /^https?:\/\//i.test(v) ? v : '';
  };
  /* Wie alt ist der Stand wirklich? Die Seite behauptete "Maximal 24
     Stunden alt", waehrend der Feed zwoelf Tage stand (Audit 03.10.2026). */
  const ageText = (iso) => {
    const h = (Date.now() - new Date(iso).getTime()) / 3600000;
    if (!Number.isFinite(h)) return null;
    if (h < 1) return 'vor weniger als einer Stunde';
    if (h < 48) return `vor ${Math.round(h)} Stunden`;
    return `vor ${Math.round(h / 24)} Tagen`;
  };
  const fallback = (item) => item.market === 'Deutschland' ? '/dashboard/assets/news-dax.jpg' : item.market === 'Weltmärkte' ? '/dashboard/assets/news-small-caps.jpg' : '/dashboard/assets/news-us-tech.jpg';
  try {
    /* Der Feed kommt ueber den Core-Vertrag (core/client.js#getNews):
       ein Umschlag {state, reason, data} statt eines eigenen fetch. */
    const client = window.VUCore.Client.create({ load: (path) => fetch(path, { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }) });
    const news = await client.getNews();
    if (news.state !== 'AVAILABLE') throw new Error(news.reason || 'Feed nicht erreichbar');
    const feed = { updated_at: news.data.updatedAt, sources: news.data.sources };
    const items = Array.isArray(news.data.items) ? news.data.items : [];
    const maxAge = Number(news.data.maxAgeHours) || 24;
    const ageH = (Date.now() - new Date(feed.updated_at).getTime()) / 3600000;
    const stale = !Number.isFinite(ageH) || ageH > maxAge;
    const TAG_ORDER = ['US-Märkte', 'Deutschland', 'Tech', 'Weltmärkte'];
    const presentTags = new Set(items.flatMap((item) => item.tags || [item.market]).filter(Boolean));
    const tags = ['Alle', ...TAG_ORDER.filter((t) => presentTags.has(t)), ...[...presentTags].filter((t) => !TAG_ORDER.includes(t))];
    app.innerHTML = `<section class="news-header"><div class="kicker">VISION UNIVERSE NEWS</div><h1 class="heading">Was die Märkte heute bewegt.</h1><p class="intro">Von Vision Universe eigenständig formulierte Kurzartikel zu wirklich relevanten, aktuellen Marktthemen.</p><div class="news-meta"><span>Aktualisiert: ${esc(date(feed.updated_at))} Uhr${ageText(feed.updated_at) ? ' (' + esc(ageText(feed.updated_at)) + ')' : ''}</span><span>Recherchequellen: ${esc((feed.sources || []).join(' · ') || 'derzeit keine')}</span></div>${stale ? `<p class="news-stale" role="status">Diese Meldungen sind älter als ${esc(maxAge)} Stunden und werden derzeit nicht aktualisiert. Für aktuelle Kurse und Ereignisse siehe <a href="/discover/">Discover</a>.</p>` : ''}</section><div class="news-filters">${tags.map((t, index) => `<button class="news-filter ${index === 0 ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div><section id="newsList"></section><p class="news-disclaimer">Vision-Universe-Redaktion auf Basis der jeweils verlinkten Recherchequelle. Fakten werden automatisiert ausgewählt und redaktionell neu formuliert. Keine Anlageberatung.</p>`;
    const list = document.querySelector('#newsList');
    const render = (tag = 'Alle') => {
      const visible = items.filter((item) => tag === 'Alle' || (item.tags || [item.market]).includes(tag));
      if (!visible.length) { list.innerHTML = '<div class="news-empty">Für diesen Filter liegen derzeit keine ausreichend relevanten aktuellen Meldungen vor.</div>'; return; }
      const card = (item, feature) => `<article class="${feature ? 'news-feature' : 'news-card'}"><img src="${esc(safeUrl(item.image_url, true) || fallback(item))}" alt="" loading="${feature ? 'eager' : 'lazy'}" onerror="this.onerror=null;this.src='${fallback(item)}'"><div class="${feature ? 'news-copy' : 'news-card-copy'}"><span class="news-eyebrow">${esc(item.market)} · ${esc(item.symbol || item.category)}</span><${feature ? 'h2' : 'h3'}>${esc(item.title)}</${feature ? 'h2' : 'h3'}><p>${esc(item.summary)}</p><span class="news-source">${esc(item.editorial || 'Vision Universe Redaktion')} · ${esc(date(item.published_at))} Uhr<br>${safeUrl(item.source_url) ? `Recherche: <a href="${esc(safeUrl(item.source_url))}" target="_blank" rel="noopener noreferrer">${esc(item.source)} ↗</a>` : `Recherche: ${esc(item.source)}`}</span></div></article>`;
      list.innerHTML = card(visible[0], true) + (visible.length > 1 ? `<div class="news-grid">${visible.slice(1).map((item) => card(item, false)).join('')}</div>` : '');
    };
    document.querySelector('.news-filters').onclick = (event) => { const button = event.target.closest('button'); if (!button) return; document.querySelectorAll('.news-filter').forEach((item) => item.classList.toggle('on', item === button)); render(button.dataset.tag); };
    render();
  } catch (error) {
    app.innerHTML = '<section class="news-header"><div class="kicker">VISION UNIVERSE NEWS</div><h1 class="heading">News werden aktualisiert.</h1><p class="intro">Der Datenbestand wird gerade neu aufgebaut. Bitte in wenigen Minuten erneut öffnen.</p></section>';
  }
})();
