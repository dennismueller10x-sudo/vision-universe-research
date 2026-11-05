/* =========================================================================
   VISION UNIVERSE — preise/preise.js   (Mockup E03)
   Oeffentliche Tarifuebersicht. Preise und Funktionsumfang kommen aus
   GET /v1/plans (Worker vu-account); hier wird nichts berechnet oder
   entschieden. Wer kaufen darf, entscheidet allein der Worker beim Checkout.
   Ist Pro nicht buchbar (kein Preis, Abos aus), steht das als eigener Zustand
   oben – nie „nicht verfügbar / Monat“ als Preiszeile.
   Daten nur per textContent (kein innerHTML mit Serverdaten).
   ========================================================================= */
(function () {
  'use strict';
  var A = window.VUAccount;
  function $(id) { return document.getElementById(id); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function notice(text, kind) {
    var n = $('pr-status');
    n.textContent = text || '';
    if (kind) n.setAttribute('data-kind', kind); else n.removeAttribute('data-kind');
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  // Haken (✓ in neongrünem Kreis) oder Strich; Zahlen als Text.
  function mark(v) {
    var td = el('td');
    if (v === true || v === null) { var i = el('span', 'pr-yes'); i.setAttribute('aria-label', 'ja'); td.appendChild(i); }
    else if (typeof v === 'number') td.textContent = v.toLocaleString('de-DE');
    else { var d = el('span', 'pr-no', '–'); d.setAttribute('aria-label', 'nein'); td.appendChild(d); }
    return td;
  }
  function row(label, a, b) { var tr = el('tr'); var th = el('th', '', label); th.scope = 'row'; tr.append(th, mark(a), mark(b)); return tr; }

  /* Zustand „Pro gerade nicht buchbar“ (E03-b): Pro-Karte oben, Knopf gesperrt, Free darunter. */
  function proOff(reason) {
    var price = all('[data-price=pro]')[0];
    price.removeAttribute('aria-busy');
    price.textContent = 'Gerade nicht buchbar';
    price.parentNode.classList.add('is-off');
    $('pr-per').hidden = true; $('pr-pro-terms').hidden = true;
    $('pr-off').textContent = reason + ' Alles andere nutzt du mit Free in vollem Umfang.'; $('pr-off').hidden = false;
    var b = $('pr-choose-pro');
    b.removeAttribute('href'); b.setAttribute('aria-disabled', 'true'); b.classList.add('is-disabled');
    $('pr-plans').classList.add('is-pro-off');
    $('pr-test-note').hidden = true;
    $('pr-choose-free').textContent = 'Mit Free starten';
    $('pr-lead').textContent = 'Free und Pro schalten heute dieselben Funktionen frei.';
  }

  function renderPlans(data) {
    var plans = data.plans || [];
    var byId = {};
    plans.forEach(function (p) { byId[p.id] = p; });
    var free = byId.free, pro = byId.pro;
    var month = pro && (pro.prices || []).filter(function (x) { return x.interval === 'month'; })[0];
    var proPrice = all('[data-price=pro]')[0];
    // Hinweis "interner Testpreis" nur, solange der Worker den Checkout nicht oeffentlich freigibt.
    var internal = data.checkout !== 'public';
    $('pr-test-tag').hidden = !internal;
    $('pr-test-note').hidden = !internal;
    if (data.checkout === 'off') proOff('Abonnements sind gerade nicht freigeschaltet.');
    else if (!month) proOff('Für Pro ist gerade kein Preis hinterlegt.');
    else { proPrice.removeAttribute('aria-busy'); proPrice.textContent = A.money(month.unitAmount, month.currency); }
    if (!free) $('pr-choose-free').hidden = true;
    var items = free && free.features && free.features['watchlist.items'];
    if (typeof items === 'number') $('pr-free-watch').textContent = 'Watchlist mit bis zu ' + items.toLocaleString('de-DE') + ' Aktien';

    // Vergleich: feste Aussagen zum Tarif plus der Funktionsumfang genau wie im Backend.
    var rows = $('pr-rows');
    rows.textContent = '';
    rows.appendChild(row('Ein Konto für alle Welten', true, true));
    rows.appendChild(row('Alle freigegebenen Analysen', true, true));
    var names = {};
    (data.features || []).forEach(function (f) { names[f.key] = f.description || f.key; });
    var keys = [], same = true;
    [free, pro].forEach(function (p) { Object.keys((p && p.features) || {}).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
    keys.forEach(function (k) {
      var a = free && free.features ? free.features[k] : undefined, b = pro && pro.features ? pro.features[k] : undefined;
      if (a !== b) same = false;
      rows.appendChild(row(names[k] || k, a === undefined ? false : a, b === undefined ? false : b));
    });
    rows.appendChild(row('Zahlungsdaten nötig', false, true));
    rows.appendChild(row('Unterstützt die Weiterentwicklung', false, true));
    $('pr-same').hidden = !(keys.length && same);
  }

  function renderSignedIn(billing) {
    var plan = billing && billing.entitlements ? billing.entitlements.plan_id : null;
    var login = $('pr-login');
    login.href = '/willkommen/'; login.textContent = 'Mein Bereich';
    $('pr-have').hidden = true;
    all('.pr-plan').forEach(function (card) {
      var current = card.getAttribute('data-plan') === plan, tag = card.querySelector('[data-current-tag]');
      card.setAttribute('data-current', String(current));
      if (current) { tag.textContent = 'Dein Tarif'; tag.hidden = false; }
    });
    // Angemeldet: verwalten im Konto, nicht erneut registrieren.
    var f = $('pr-choose-free'), p = $('pr-choose-pro');
    f.href = '/konto/tarife/';
    f.textContent = 'Im Konto verwalten';
    if (p.classList.contains('is-disabled')) return;
    p.href = plan === 'pro' ? '/konto/abo/' : '/konto/tarife/?plan=pro';
    p.firstChild.textContent = plan === 'pro' ? 'Abonnement verwalten ' : 'Pro wählen ';
  }

  if (!A || !A.available()) {
    notice('Konten sind auf dieser Umgebung noch nicht freigeschaltet. Preise werden geladen, sobald das Konto-System verbunden ist.', 'info');
    proOff('Das Konto-System ist hier nicht verbunden.');
    $('pr-choose-free').hidden = true;
    return;
  }
  Promise.all([A.get('/v1/plans'), A.get('/v1/session')]).then(function (rs) {
    if (rs[0].ok) renderPlans(rs[0].data);
    else {
      notice('Die Preise konnten gerade nicht geladen werden. Bitte versuche es gleich noch einmal.', 'error');
      proOff('Der Preis konnte gerade nicht geladen werden.');
    }
    if (rs[1].ok && rs[1].data && rs[1].data.authenticated) {
      return A.get('/v1/me/billing').then(function (r) { renderSignedIn(r.ok ? r.data : null); });
    }
  });
})();
