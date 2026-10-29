/* =========================================================================
   VISION UNIVERSE — preise/preise.js
   Oeffentliche Tarifuebersicht. Preise und Funktionsumfang kommen aus
   GET /v1/plans (Worker vu-account); hier wird nichts berechnet oder
   entschieden. Wer kaufen darf, entscheidet allein der Worker beim Checkout.
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
  function cell(tag, text, attrs) {
    var n = document.createElement(tag);
    n.textContent = text;
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function value(v) { return typeof v === 'number' ? v.toLocaleString('de-DE') : v === true ? 'Ja' : v ? String(v) : '–'; }

  function renderPlans(data) {
    var plans = data.plans || [];
    var byId = {};
    plans.forEach(function (p) { byId[p.id] = p; });
    var free = byId.free, pro = byId.pro;
    var month = pro && (pro.prices || []).filter(function (x) { return x.interval === 'month'; })[0];
    var proPrice = all('[data-price=pro]')[0];
    proPrice.removeAttribute('aria-busy');
    if (month) proPrice.textContent = A.money(month.unitAmount, month.currency);
    else {
      proPrice.textContent = 'derzeit nicht verfügbar';
      $('pr-choose-pro').hidden = true;
    }
    if (!free) $('pr-choose-free').hidden = true;

    // Funktionsumfang genau wie im Backend: nur Funktionen, die ein angezeigter Tarif enthaelt.
    var names = {};
    (data.features || []).forEach(function (f) { names[f.key] = f.description || f.key; });
    var keys = [];
    [free, pro].forEach(function (p) { Object.keys((p && p.features) || {}).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
    var rows = $('pr-rows');
    rows.textContent = '';
    var same = true;
    keys.forEach(function (k) {
      var a = free && free.features ? free.features[k] : undefined, b = pro && pro.features ? pro.features[k] : undefined;
      if (a !== b) same = false;
      var tr = document.createElement('tr');
      tr.appendChild(cell('th', names[k] || k, {scope: 'row'}));
      tr.appendChild(cell('td', value(a), {'data-label': 'Free'}));
      tr.appendChild(cell('td', value(b), {'data-label': 'Pro'}));
      rows.appendChild(tr);
    });
    $('pr-table').hidden = !keys.length;
    $('pr-same').hidden = !(keys.length && same);
  }

  function renderSignedIn(billing) {
    var plan = billing && billing.entitlements ? billing.entitlements.plan_id : null;
    var box = $('pr-signed-in');
    box.hidden = false;
    var label = {free: 'Free', plus: 'Plus', pro: 'Pro'}[plan];
    box.querySelector('[data-plan-name]').textContent = label ? ' mit ' + label : '';
    all('.pr-plan').forEach(function (card) {
      var current = card.getAttribute('data-plan') === plan;
      card.setAttribute('data-current', String(current));
      card.querySelector('[data-current-tag]').hidden = !current;
    });
    // Angemeldet: verwalten im Konto, nicht erneut registrieren.
    var f = $('pr-choose-free'), p = $('pr-choose-pro');
    f.href = '/konto/tarife/';
    f.textContent = plan === 'free' ? 'Im Konto ansehen' : 'Im Konto verwalten';
    p.href = plan === 'pro' ? '/konto/abo/' : '/konto/tarife/?plan=pro';
    p.textContent = plan === 'pro' ? 'Abonnement verwalten' : 'Pro im Konto wählen';
  }

  if (!A || !A.available()) {
    notice('Konten sind auf dieser Umgebung noch nicht freigeschaltet. Preise werden geladen, sobald das Konto-System verbunden ist.', 'info');
    all('[data-price=pro]').forEach(function (n) { n.removeAttribute('aria-busy'); n.textContent = 'derzeit nicht verfügbar'; });
    $('pr-choose-free').hidden = true;
    $('pr-choose-pro').hidden = true;
    return;
  }
  Promise.all([A.get('/v1/plans'), A.get('/v1/session')]).then(function (rs) {
    if (rs[0].ok) renderPlans(rs[0].data);
    else {
      notice('Die Preise konnten gerade nicht geladen werden. Bitte versuche es gleich noch einmal.', 'error');
      all('[data-price=pro]').forEach(function (n) { n.removeAttribute('aria-busy'); n.textContent = 'derzeit nicht verfügbar'; });
      $('pr-choose-pro').hidden = true;
    }
    if (rs[1].ok && rs[1].data && rs[1].data.authenticated) {
      return A.get('/v1/me/billing').then(function (r) { renderSignedIn(r.ok ? r.data : null); });
    }
  });
})();
