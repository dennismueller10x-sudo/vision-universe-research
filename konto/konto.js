/* =========================================================================
   VISION UNIVERSE — konto/konto.js
   Seitensteuerung fuer /konto/ (Anmelden, Registrieren, Passwort, Konto,
   Abo, Tarife, Einstellungen, Kuendigen). Daten werden nur per textContent
   in die Seite geschrieben (kein innerHTML mit Serverdaten).
   ========================================================================= */
(function () {
  'use strict';
  var A = window.VUAccount;
  var view = document.body.getAttribute('data-view');

  // ------------------------------------------------------------ Bausteine
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'className') n.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function notice(text, kind) {
    var box = $('ka-status');
    if (!box) return;
    box.textContent = text || '';
    box.setAttribute('data-kind', kind || 'info');
  }
  function busy(button, on) {
    if (!button) return;
    button.disabled = on;
    button.setAttribute('aria-busy', on ? 'true' : 'false');
  }
  function go(path) { window.location.assign(path); }
  // Lesezeichen-Status der Aktienseiten (assets/watchlist-button.js) gehoert zur Sitzung.
  function forgetWatchlist() { try { sessionStorage.removeItem('vu-watchlist-ids-v1'); } catch (e) { /* leer */ } }
  function param(name) { return new URLSearchParams(window.location.search).get(name); }
  // Nach Anmeldung/Bestaetigung: offene Pro-Bestellung vor der Willkommensseite, Deep Links bleiben
  // (A.nextAfterSignIn, nur eigene Pfade). /v1/me liefert die im Konto gemerkte Tarifwahl (planIntent).
  function continueSignedIn(opts) {
    return A.get('/v1/me').then(function (r) {
      go(A.nextAfterSignIn({next: opts.next, me: r.ok ? r.data : null, localChoice: pendingChoice(), verified: opts.verified}));
    });
  }
  // Tarifwahl im Konto merken bzw. verwerfen (geraeteuebergreifend). Faellt die Anfrage aus, bleibt nur die lokale Wahl.
  function savePlanIntent(plan) { return A.post('/v1/me/plan-intent', {plan: plan}).catch(function () { return null; }); }
  function showStatusParam() {
    var s = A.statusMessage(param('status'));
    if (s) notice(s.text, s.kind);
  }
  function disableForms() {
    Array.prototype.forEach.call(document.querySelectorAll('form button, form input, form select'), function (n) { n.disabled = true; });
  }
  function unavailable() {
    notice(A.message('ACCOUNTS_NOT_CONFIGURED') + ' Die Seiten sind vorbereitet und werden mit der Freigabe aktiviert.', 'info');
    disableForms();
  }
  function fail(result) { notice(A.message(result.state), 'error'); }

  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-password]'), function (btn) {
    btn.addEventListener('click', function () {
      var input = $(btn.getAttribute('data-toggle-password'));
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Verbergen' : 'Anzeigen';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });

  function passwordHints(input, list) {
    if (!input || !list) return;
    function update() {
      var problems = A.passwordProblems(input.value);
      list.textContent = '';
      [['PASSWORD_LENGTH', '10 bis 72 Zeichen'], ['PASSWORD_WEAK', 'drei von vier: klein, GROSS, Ziffer, Sonderzeichen']].forEach(function (r) {
        list.appendChild(el('li', {'data-ok': problems.indexOf(r[0]) === -1 ? 'true' : 'false',
          text: (problems.indexOf(r[0]) === -1 ? '✓ ' : '· ') + r[1]}));
      });
    }
    input.addEventListener('input', update);
    update();
  }

  function requireSession() {
    return A.get('/v1/session').then(function (r) {
      if (r.ok && r.data && r.data.authenticated) return r.data.user;
      if (r.state === 'ACCOUNTS_NOT_CONFIGURED') { unavailable(); return null; }
      go('/konto/anmelden/?next=' + encodeURIComponent(window.location.pathname));
      return null;
    });
  }

  // Tarifwahl "Pro" ueberdauert Registrierung und E-Mail-Bestaetigung (gleiches Geraet, 7 Tage).
  // Kein Geheimnis: entscheidet nur, ob nach der Anmeldung die Pro-Bestaetigung erscheint.
  var CHOICE = 'vu-plan-choice-v1';
  function rememberChoice(plan) { try { localStorage.setItem(CHOICE, JSON.stringify({plan: plan, at: Date.now()})); } catch (e) { /* leer */ } }
  function forgetChoice() { try { localStorage.removeItem(CHOICE); } catch (e) { /* leer */ } }
  function pendingChoice() {
    try {
      var c = JSON.parse(localStorage.getItem(CHOICE) || 'null');
      if (c && c.plan === 'pro' && Date.now() - c.at < 7 * 864e5) return 'pro';
      if (c) localStorage.removeItem(CHOICE);
    } catch (e) { /* leer */ }
    return null;
  }

  function planBadge(ent) {
    var plan = (ent && ent.plan_id) || 'free';
    var names = {free: 'Free', plus: 'Plus', pro: 'Pro'};
    return el('span', {className: 'ka-badge', 'data-tone': plan === 'free' ? 'muted' : null, text: names[plan] || plan});
  }

  // ------------------------------------------------------------ Seiten
  var views = {};

  views.login = function () {
    showStatusParam();
    if (!A.available()) return unavailable();
    // Bestaetigungslink auf einem anderen Geraet: die Tarifwahl kommt ueber den Link mit.
    if (param('plan') === 'pro') rememberChoice('pro');
    $('ka-login').addEventListener('submit', function (e) {
      e.preventDefault();
      var email = $('email').value.trim(), pw = $('password').value, btn = e.submitter || this.querySelector('button[type=submit]');
      if (!A.emailValid(email)) { $('email').setAttribute('aria-invalid', 'true'); return notice(A.message('EMAIL_INVALID'), 'error'); }
      busy(btn, true);
      A.post('/v1/auth/login', {email: email, password: pw}).then(function (r) {
        if (r.ok) return continueSignedIn({next: param('next')});
        busy(btn, false);
        $('password').value = '';
        fail(r);
      });
    });
  };

  views.register = function () {
    if (!A.available()) return unavailable();
    if (param('plan') === 'pro') rememberChoice('pro');
    if (param('plan') === 'free') forgetChoice();
    if (pendingChoice() === 'pro') $('ka-plan-hint').hidden = false;
    passwordHints($('password'), $('pw-rules'));
    $('ka-register').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]');
      var email = $('email').value.trim(), pw = $('password').value;
      if (!A.emailValid(email)) return notice(A.message('EMAIL_INVALID'), 'error');
      var problems = A.passwordProblems(pw);
      if (problems.length) return notice(A.message(problems[0]), 'error');
      if (!$('terms').checked) return notice(A.message('TERMS_REQUIRED'), 'error');
      busy(btn, true);
      A.post('/v1/auth/signup', {email: email, password: pw, displayName: $('display-name').value.trim() || null,
        acceptTerms: true, termsVersion: 'entwurf-2026-10', plan: pendingChoice() === 'pro' ? 'pro' : null}).then(function (r) {
        busy(btn, false);
        if (!r.ok) return fail(r);
        $('ka-register').hidden = true;
        $('ka-register-done').hidden = false;
        $('ka-register-done').querySelector('[data-email]').textContent = email;
        notice('');
      });
    });
  };

  views.forgot = function () {
    showStatusParam();
    if (!A.available()) return unavailable();
    $('ka-forgot').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]'), email = $('email').value.trim();
      if (!A.emailValid(email)) return notice(A.message('EMAIL_INVALID'), 'error');
      busy(btn, true);
      A.post('/v1/auth/recover', {email: email}).then(function (r) {
        busy(btn, false);
        if (!r.ok && r.state !== 'CHECK_EMAIL') return fail(r);
        notice('Wenn es zu ' + email + ' ein Konto gibt, ist ein Link zum Zurücksetzen unterwegs. Er gilt eine Stunde und funktioniert auf diesem Gerät.', 'ok');
        this.reset();
      }.bind(this));
    });
  };

  views['new-password'] = function () {
    if (!A.available()) return unavailable();
    passwordHints($('password'), $('pw-rules'));
    A.get('/v1/session').then(function (r) {
      if (!(r.ok && r.data.authenticated)) {
        notice(A.statusMessage('link_expired').text, 'error');
        disableForms();
      }
    });
    $('ka-new-password').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]'), pw = $('password').value;
      var problems = A.passwordProblems(pw);
      if (problems.length) return notice(A.message(problems[0]), 'error');
      if (pw !== $('password-repeat').value) return notice('Die beiden Passwörter stimmen nicht überein.', 'error');
      busy(btn, true);
      A.post('/v1/auth/password', {password: pw}).then(function (r) {
        busy(btn, false);
        if (r.ok) return go('/konto/?status=password_changed');
        fail(r);
      });
    });
  };

  // Persoenliche Watchlist: Darstellung in konto/watchlist.js (eigene Datei, nur auf dieser Seite geladen).
  views.watchlist = function () {
    showStatusParam();
    if (!A.available()) return unavailable();
    requireSession().then(function (user) {
      if (!user) return;
      if (window.VUWatchlistPage) window.VUWatchlistPage.start(A, notice);
    });
  };

  views.account = function () {
    showStatusParam();
    if (!A.available()) return unavailable();
    requireSession().then(function (user) {
      if (!user) return;
      // Pro gewaehlt (vor der Registrierung): Die Wahl steht lokal, im Konto und, ueber den Bestaetigungslink, als ?plan=pro.
      if (param('plan') === 'pro') rememberChoice('pro');
      return A.get('/v1/me').then(function (r) {
        if (!r.ok) return fail(r);
        var d = r.data;
        // Direkt nach der E-Mail-Bestaetigung: Pro-Bestaetigung bzw. Willkommensseite statt Kontoverwaltung.
        if (param('status') === 'verified') return go(A.nextAfterSignIn({me: d, localChoice: pendingChoice(), verified: true}));
        var name = d.profile && d.profile.displayName;
        $('ka-hello').textContent = name ? 'Hallo, ' + name : 'Mein Konto';
        var dl = $('ka-account-facts');
        dl.textContent = '';
        [['E-Mail', d.user.email], ['Tarif', null], ['Mitglied seit', A.date(d.profile && d.profile.createdAt)]].forEach(function (row) {
          dl.appendChild(el('dt', {text: row[0]}));
          dl.appendChild(el('dd', {}, row[1] === null ? [planBadge(d.entitlements), (d.entitlements || {}).plan_id === 'pro' ? null
            : el('a', {className: 'ka-link', href: '/konto/tarife/', text: ' Tarife ansehen'})] : [row[1] || '–']));
        });
        // Offene Pro-Wahl: eindeutig fortsetzen oder verwerfen, keine automatische Umleitung bei jedem Besuch.
        var pending = A.proPending(d, pendingChoice());
        $('ka-pro-pending').hidden = !pending;
        if (pending) {
          $('ka-pro-dismiss').addEventListener('click', function () {
            busy(this, true);
            forgetChoice();
            savePlanIntent(null).then(function () { $('ka-pro-pending').hidden = true; notice('Du nutzt Vision Universe mit Free.', 'ok'); });
          });
        }
        $('ka-account').hidden = false;
        $('ka-loading').hidden = true;
      });
    });
    $('ka-logout').addEventListener('click', function () {
      busy(this, true);
      forgetWatchlist();
      forgetChoice();
      A.post('/v1/auth/logout').then(function () { go('/konto/anmelden/'); });
    });
  };

  views.subscription = function () {
    if (!A.available()) return unavailable();
    if (param('checkout') === 'success') notice('Danke! Deine Zahlung wird bestätigt …', 'ok');
    requireSession().then(function (user) {
      if (!user) return;
      var tries = 0;
      (function load() {
        A.get('/v1/me/billing').then(function (r) {
          if (!r.ok) return fail(r);
          var d = r.data;
          // Nach dem Checkout kann die Bestaetigung (Webhook) ein paar Sekunden brauchen. Pro gilt erst,
          // wenn die Datenbank es aus einem verifizierten Stripe-Ereignis kennt - der Ruecksprung allein zaehlt nicht.
          if (param('checkout') === 'success' && d.entitlements.plan_id === 'free' && tries++ < 10) return setTimeout(load, 1500);
          renderSubscription(d);
          if (param('checkout') !== 'success') return;
          if (d.entitlements.plan_id !== 'free') {
            forgetChoice();
            notice('Dein Abonnement ist aktiv. Willkommen bei Vision Universe Pro – es geht weiter zur Startseite …', 'ok');
            return setTimeout(function () { go(A.HOME + '?konto=pro'); }, 1600);
          }
          var waiting = (d.subscriptions || []).some(function (s) { return s.status === 'incomplete'; });
          notice(waiting ? 'Deine Zahlung wird noch bestätigt. Bei SEPA-Lastschrift kann das einige Werktage dauern. Bis dahin nutzt du Vision Universe mit Free; Pro gilt automatisch, sobald Stripe die Zahlung bestätigt.'
            : 'Die Zahlung ist noch nicht bestätigt. Das kann einige Minuten dauern – du bekommst eine E-Mail von Stripe. Bis dahin gilt Free.', 'info');
          $('ka-sub').appendChild(el('div', {className: 'ka-actions'}, [el('a', {className: 'ka-btn ka-btn--secondary', href: A.HOME, text: 'Zur Willkommensseite'})]));
        });
      })();
    });
  };

  function renderSubscription(d) {
    var current = (d.subscriptions || []).filter(function (s) { return ['active', 'trialing', 'past_due', 'in_grace_period', 'incomplete'].indexOf(s.status) !== -1; })[0];
    var box = $('ka-sub');
    box.textContent = '';
    box.appendChild(el('h2', {text: 'Aktueller Tarif'}));
    var dl = el('dl', {className: 'ka-kv'});
    function row(k, v) { dl.appendChild(el('dt', {text: k})); dl.appendChild(el('dd', {}, [v])); }
    row('Tarif', planBadge(d.entitlements));
    if (current) {
      row('Status', el('span', {className: 'ka-badge', 'data-tone': current.status === 'active' || current.status === 'trialing' ? null : 'warn',
        text: A.subscriptionStatus(current.status)}));
      row('Laufzeit', current.interval === 'year' ? 'jährlich' : 'monatlich');
      row(current.cancelAtPeriodEnd ? 'Endet am' : 'Nächste Verlängerung', A.date(current.currentPeriodEnd));
      row('Bezahlt über', {stripe: 'Vision Universe (Stripe)', apple: 'App Store', google: 'Google Play'}[current.provider] || current.provider);
    } else {
      row('Status', 'Kein laufendes Abonnement');
    }
    box.appendChild(dl);
    if (current && current.cancelAtPeriodEnd) {
      box.appendChild(el('p', {className: 'ka-hint', text: 'Gekündigt: Bis zum Ende der bezahlten Zeit bleibt alles wie bisher, danach gilt automatisch Free. Es wird nichts mehr abgebucht.'}));
    }
    if (current && (current.status === 'past_due' || current.status === 'in_grace_period')) {
      box.appendChild(el('p', {className: 'ka-notice', 'data-kind': 'error',
        text: 'Die letzte Zahlung ist fehlgeschlagen. Bitte aktualisiere deine Zahlungsmethode, damit dein Zugang erhalten bleibt.'}));
    }
    var actions = el('div', {className: 'ka-actions'});
    if (current && current.provider === 'stripe') {
      var portal = el('button', {className: 'ka-btn', type: 'button', text: 'Zahlung, Rechnungen und Kündigung verwalten'});
      portal.addEventListener('click', function () {
        busy(portal, true);
        A.post('/v1/billing/portal').then(function (r) {
          busy(portal, false);
          var url = r.ok && A.safePaymentUrl(r.data.url);
          if (url) return window.location.assign(url);
          fail(r);
        });
      });
      actions.appendChild(portal);
    } else if (!current) {
      actions.appendChild(el('a', {className: 'ka-btn', href: '/konto/tarife/', text: 'Tarif wählen'}));
    }
    if (!d.billingAvailable) actions.appendChild(el('p', {className: 'ka-muted', text: A.message('BILLING_NOT_CONFIGURED')}));
    box.appendChild(actions);

    var inv = $('ka-invoices');
    inv.textContent = '';
    inv.appendChild(el('h2', {text: 'Rechnungen und Zahlungen'}));
    if (!(d.invoices || []).length) { inv.appendChild(el('p', {className: 'ka-muted', text: 'Noch keine Rechnungen.'})); }
    else {
      var tbody = el('tbody');
      d.invoices.forEach(function (i) {
        var url = i.url && /^https:\/\//.test(i.url) ? i.url : null;
        tbody.appendChild(el('tr', {}, [el('td', {text: A.date(i.issuedAt)}), el('td', {text: i.number || '–'}),
          el('td', {text: {paid: 'bezahlt', open: 'offen', void: 'storniert', uncollectible: 'uneinbringlich', draft: 'Entwurf'}[i.status] || i.status}),
          el('td', {className: 'num', text: A.money(i.status === 'paid' ? i.amountPaid : i.amountDue, i.currency)}),
          el('td', {}, [url ? el('a', {className: 'ka-link', href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Ansehen'}) : '–'])]));
      });
      inv.appendChild(el('div', {className: 'ka-table-wrap'}, [el('table', {className: 'ka-table'}, [
        el('thead', {}, [el('tr', {}, ['Datum', 'Nummer', 'Status', 'Betrag', 'Beleg'].map(function (h) { return el('th', {scope: 'col', text: h}); }))]), tbody])]));
    }
  }

  // Tarife und Pro-Bestellbestaetigung. Ablauf der Bestaetigung (A.checkoutState):
  //   loading     Buchbarkeit wird geprueft (nichts bedienbar, Hinweis sichtbar)
  //   ready       Pflicht-Checkbox bedienbar; "Weiter zur Zahlung" erst nach dem Haken
  //   not-open    Konto ohne Tester-Freigabe: eigene Erklaerung statt Checkbox, "Mit Free weiter"
  //   unavailable/no-price  Abrechnung bzw. Preis nicht verfuegbar: Erklaerung statt Checkbox
  // Die Checkbox wird nie wegen der Berechtigung gesperrt (frueherer Fehler: gesperrte Checkbox ohne
  // sichtbaren Grund, die Meldung stand ausserhalb des Bildschirms ueber der Bestaetigung).
  views.plans = function () {
    showStatusParam();
    if (!A.available()) return unavailable();
    var canceled = param('checkout') === 'canceled';
    if (canceled) {
      forgetChoice();
      notice('Der Bezahlvorgang wurde abgebrochen. Es wurde nichts berechnet, dein Konto bleibt Free. Möchtest du Pro doch abschließen, wähle unten „Pro auswählen“.', 'info');
    }
    var proPrice = null, me = null, signedIn = false, loaded = false, open = false;
    var confirmBox = $('ka-confirm'), terms = $('ka-confirm-terms'), pay = $('ka-checkout');

    $('ka-choose-free').addEventListener('click', forgetChoice);
    $('ka-choose-pro').addEventListener('click', function () {
      if (loaded && !signedIn) { rememberChoice('pro'); return go('/konto/registrieren/?plan=pro'); }
      // Ausdrueckliche Wahl (auch "Pro fortsetzen" nach einem Abbruch): im Konto merken, dann bestaetigen.
      if (signedIn) savePlanIntent('pro');
      openConfirm();
    });
    function syncPay() {
      pay.disabled = !terms.checked;
      $('ka-checkout-why').hidden = terms.checked;
    }
    terms.addEventListener('change', syncPay);
    terms.addEventListener('input', syncPay);
    pay.addEventListener('click', function () {
      if (!terms.checked) return notice(A.message('CHECKOUT_CONFIRMATION_REQUIRED'), 'error');
      busy(pay, true);
      A.post('/v1/billing/checkout', {price: proPrice.key, confirm: true}).then(function (r) {
        var url = r.ok && A.safePaymentUrl(r.data.url);
        if (url) return window.location.assign(url);
        busy(pay, false);
        syncPay();
        if (r.state === 'ALREADY_SUBSCRIBED') { confirmBox.hidden = true; return notice(A.message('ALREADY_SUBSCRIBED'), 'info'); }
        if (r.state === 'CHECKOUT_NOT_OPEN') { me = Object.assign({}, me, {checkoutAllowed: false}); return renderConfirm(); }
        fail(r);
      });
    });
    $('ka-continue-free').addEventListener('click', function () {
      busy(this, true);
      forgetChoice();
      (signedIn ? savePlanIntent(null) : Promise.resolve()).then(function () { go(A.HOME); });
    });

    Promise.all([A.get('/v1/plans'), A.get('/v1/session')]).then(function (rs) {
      var pro = rs[0].ok ? (rs[0].data.plans || []).filter(function (p) { return p.id === 'pro'; })[0] : null;
      proPrice = pro ? pro.prices.filter(function (x) { return x.interval === 'month'; })[0] || null : null;
      if (proPrice) {
        Array.prototype.forEach.call(document.querySelectorAll('[data-pro-price]'), function (n) { n.textContent = A.money(proPrice.unitAmount, proPrice.currency); });
      }
      signedIn = Boolean(rs[1].ok && rs[1].data && rs[1].data.authenticated);
      if (!signedIn) { loaded = true; return renderConfirm(); }
      // Abbruch bei Stripe: die Wahl auch im Konto verwerfen; "Pro fortsetzen" ist danach ein eigener Klick.
      return Promise.all([A.get('/v1/me'), canceled ? savePlanIntent(null) : null]).then(function (r2) {
        var r = r2[0];
        if (!r.ok) fail(r);
        me = r.ok ? r.data : null; loaded = true; render();
      });
    });

    function render() {
      var plan = me && me.entitlements ? me.entitlements.plan_id : 'free';
      Array.prototype.forEach.call(document.querySelectorAll('[data-plan]'), function (card) {
        card.setAttribute('data-current', String(card.getAttribute('data-plan') === plan));
      });
      var freeAction = $('ka-action-free');
      freeAction.textContent = '';
      freeAction.appendChild(el('span', {className: 'ka-badge', 'data-tone': plan === 'free' ? null : 'muted',
        text: plan === 'free' ? 'Dein Tarif' : 'Gilt nach Ende von Pro automatisch'}));
      if (plan !== 'free') {
        forgetChoice();
        var proAction = $('ka-action-pro');
        proAction.textContent = '';
        proAction.appendChild(el('span', {className: 'ka-badge', text: 'Dein Tarif'}));
        proAction.appendChild(el('a', {className: 'ka-btn ka-btn--block', href: '/konto/abo/', text: 'Abonnement verwalten'}));
        confirmBox.hidden = true;
        return;
      }
      // Pro vor der Registrierung gewaehlt (Adresse, dieses Geraet oder im Konto): direkt zur Bestaetigung,
      // keine zweite Tarifwahl. Nach einem Abbruch nur auf ausdruecklichen Klick.
      var wantsPro = !canceled && (param('plan') === 'pro' || A.proPending(me, pendingChoice()));
      if (wantsPro || open) openConfirm(); else renderConfirm();
    }
    function renderConfirm() {
      var state = A.checkoutState({loaded: loaded, signedIn: signedIn, me: me, price: proPrice});
      confirmBox.setAttribute('data-state', state);
      $('ka-confirm-loading').hidden = state !== 'loading';
      $('ka-confirm-ready').hidden = state !== 'ready';
      $('ka-confirm-blocked').hidden = ['not-open', 'unavailable', 'no-price'].indexOf(state) === -1;
      if (state === 'ready') { terms.disabled = false; syncPay(); }
      if (state === 'not-open') {
        $('ka-blocked-title').textContent = 'Pro ist für dein Konto noch nicht buchbar';
        $('ka-blocked-text').textContent = 'Pro befindet sich in einer internen Testphase und kann nur von freigeschalteten Testkonten abgeschlossen werden. Dein kostenloses Konto ist aktiv – mit allen freigegebenen Funktionen. Es wurde nichts bestellt und nichts berechnet.';
      } else if (state === 'unavailable' || state === 'no-price') {
        $('ka-blocked-title').textContent = 'Pro ist gerade nicht buchbar';
        $('ka-blocked-text').textContent = (state === 'unavailable' ? A.message('BILLING_NOT_CONFIGURED') : A.message('PRICE_NOT_AVAILABLE'))
          + ' Dein kostenloses Konto mit Free ist aktiv. Es wurde nichts berechnet.';
      }
      if (state === 'signed-out' && open) { rememberChoice('pro'); go('/konto/registrieren/?plan=pro'); }
      if (state === 'subscribed') confirmBox.hidden = true;
      return state;
    }
    function openConfirm() {
      open = true;
      confirmBox.hidden = false;
      var state = renderConfirm();
      if (state === 'signed-out' || state === 'subscribed') return;
      var title = $('ka-confirm-title');
      if (title.scrollIntoView) title.scrollIntoView({block: 'start'});
      title.focus({preventScroll: true});
    }
  };

  views.settings = function () {
    if (!A.available()) return unavailable();
    passwordHints($('new-password'), $('pw-rules'));
    requireSession().then(function (user) {
      if (!user) return;
      A.get('/v1/me').then(function (r) {
        if (!r.ok) return fail(r);
        var p = r.data.profile || {}, s = r.data.settings || {};
        $('display-name').value = p.displayName || '';
        $('appearance').value = s.appearance || 'system';
        $('currency').value = s.displayCurrency || 'EUR';
        $('experience').value = s.experienceLevel || 'beginner';
        $('marketing').checked = Boolean(s.marketingEmails);
        Array.prototype.forEach.call(document.querySelectorAll('[data-notification]'), function (c) {
          c.checked = Boolean((s.notifications || {})[c.getAttribute('data-notification')]);
        });
        $('ka-settings-wrap').hidden = false;
        $('ka-loading').hidden = true;
      });
    });

    $('ka-settings').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]'), notifications = {};
      Array.prototype.forEach.call(document.querySelectorAll('[data-notification]'), function (c) {
        if (c.checked) notifications[c.getAttribute('data-notification')] = true;
      });
      busy(btn, true);
      A.patch('/v1/me', {profile: {displayName: $('display-name').value.trim() || null}, settings: {appearance: $('appearance').value,
        displayCurrency: $('currency').value, experienceLevel: $('experience').value, notifications: notifications,
        marketingEmails: $('marketing').checked}}).then(function (r) {
        busy(btn, false);
        if (!r.ok) return fail(r);
        var mode = $('appearance').value;
        if ((mode === 'dark' || mode === 'light') && window.VUTheme && window.VUTheme.set) window.VUTheme.set(mode);
        notice('Gespeichert.', 'ok');
      });
    });

    $('ka-password').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]'), pw = $('new-password').value;
      var problems = A.passwordProblems(pw);
      if (problems.length) return notice(A.message(problems[0]), 'error');
      busy(btn, true);
      A.post('/v1/auth/password', {password: pw, currentPassword: $('current-password').value}).then(function (r) {
        busy(btn, false);
        if (!r.ok) return fail(r);
        this.reset();
        notice(A.statusMessage('password_changed').text, 'ok');
      }.bind(this));
    });

    $('ka-export').addEventListener('click', function () {
      var btn = this;
      busy(btn, true);
      A.get('/v1/me/export').then(function (r) {
        busy(btn, false);
        if (!r.ok) return fail(r);
        var blob = new Blob([JSON.stringify(r.data, null, 2)], {type: 'application/json'});
        var a = el('a', {href: URL.createObjectURL(blob), download: 'vision-universe-konto.json'});
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      });
    });

    $('ka-delete').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]');
      var typed = $('delete-confirm').value.trim().toUpperCase();
      if (typed !== 'LÖSCHEN' && typed !== 'LOESCHEN') return notice('Bitte tippe LÖSCHEN zur Bestätigung.', 'error');
      busy(btn, true);
      forgetWatchlist();
      A.post('/v1/me/delete', {confirm: 'LOESCHEN', currentPassword: $('delete-password').value}).then(function (r) {
        busy(btn, false);
        if (r.ok) return go('/konto/anmelden/?status=deleted');
        fail(r);
      });
    });
  };

  views.cancel = function () {
    var signedIn = false;
    if (!A.available()) { unavailable(); return; }
    A.get('/v1/session').then(function (r) {
      signedIn = Boolean(r.ok && r.data.authenticated);
      if (!signedIn) return;
      return A.get('/v1/me/billing').then(function (b) {
        var sub = b.ok && (b.data.subscriptions || []).filter(function (s) { return ['active', 'trialing', 'past_due', 'in_grace_period'].indexOf(s.status) !== -1 && !s.cancelAtPeriodEnd; })[0];
        if (sub && sub.provider === 'stripe') {
          $('ka-cancel-signed-in').hidden = false;
          $('ka-cancel-sub').textContent = ({plus: 'Plus', pro: 'Pro'}[sub.plan] || sub.plan) + ' · ' + (sub.interval === 'year' ? 'jährlich' : 'monatlich') + ' · läuft bis ' + A.date(sub.currentPeriodEnd);
        }
      });
    });
    $('ka-cancel-now').addEventListener('click', function () {
      var btn = this;
      busy(btn, true);
      A.post('/v1/billing/cancel').then(function (r) {
        busy(btn, false);
        if (!r.ok) return fail(r);
        confirmation((r.data.state === 'CANCELED_AT_PERIOD_END'
          ? 'Dein Abonnement ist gekündigt und endet am ' + A.date(r.data.endsAt) + '. Bis dahin bleibt dein Zugang erhalten.'
          : 'Deine Kündigung ist eingegangen. Den Zeitpunkt der Vertragsbeendigung teilen wir dir unverzüglich mit.')
          + (r.data.emailSent ? ' Die Bestätigung ist per E-Mail unterwegs.' : ''), r.data);
      });
    });
    $('ka-cancel-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]'), email = $('cancel-email').value.trim();
      if (!A.emailValid(email)) return notice(A.message('EMAIL_INVALID'), 'error');
      if (!$('cancel-name').value.trim()) return notice(A.message('NAME_REQUIRED'), 'error');
      busy(btn, true);
      A.post('/v1/billing/cancellation-request', {email: email, fullName: $('cancel-name').value.trim(), reference: $('cancel-reference').value.trim(),
        kind: $('cancel-kind').value, reason: $('cancel-kind').value === 'extraordinary' ? $('cancel-reason').value.trim() : null}).then(function (r) {
        busy(btn, false);
        if (!r.ok) return fail(r);
        confirmation('Deine Kündigung ist eingegangen. ' + (r.data.emailSent
          ? 'Die Eingangsbestätigung mit dem Zeitpunkt der Vertragsbeendigung haben wir an ' + email + ' geschickt.'
          : 'Die Bestätigung per E-Mail an ' + email + ' reichen wir nach. Bitte speichere diese Seite als Nachweis.'), r.data);
      });
    });
    function confirmation(text, data) {
      $('ka-cancel-signed-in').hidden = true;
      $('ka-cancel-form').hidden = true;
      var box = $('ka-cancel-done');
      box.hidden = false;
      box.querySelector('[data-text]').textContent = text;
      box.querySelector('[data-received]').textContent = new Date(data.receivedAt).toLocaleString('de-DE');
      box.querySelector('[data-id]').textContent = data.confirmationId;
      box.querySelector('[data-mail]').textContent = data.emailSent ? 'versendet' : 'folgt (wird nachgereicht)';
      notice('');
    }
    $('cancel-kind').addEventListener('change', function () { $('cancel-reason-field').hidden = this.value !== 'extraordinary'; });
    $('ka-cancel-print').addEventListener('click', function () { window.print(); });
  };

  // Navigation innerhalb des Kontos: aktuelle Seite markieren.
  Array.prototype.forEach.call(document.querySelectorAll('.ka-nav a'), function (a) {
    if (a.getAttribute('href') === window.location.pathname) a.setAttribute('aria-current', 'page');
  });

  if (A && views[view]) views[view]();
})();
