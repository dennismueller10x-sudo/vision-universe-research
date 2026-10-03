/* =========================================================================
   VISION UNIVERSE — /konto/
   Anmelden, Registrieren, Passwort, Watchlists, Berichte, Einstellungen,
   Abo-Status und Konto loeschen. Alle Texte aus Nutzerdaten gehen ueber
   textContent (h()), nie ueber innerHTML.
   ========================================================================= */
(function () {
  "use strict";

  const config = window.VU_ACCOUNT_CONFIG || {};
  const { createAccountClient } = window.VUAccountClient;
  let storage = null;
  try { storage = window.localStorage; } catch { storage = null; }
  const client = createAccountClient({ ...config, storage });
  const main = document.getElementById("k-main");
  const here = location.origin + location.pathname;

  const MESSAGES = {
    INVALID_CREDENTIALS: "E-Mail oder Passwort ist falsch.",
    EMAIL_NOT_CONFIRMED: "Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungsmail.",
    EMAIL_TAKEN: "Für diese E-Mail-Adresse gibt es bereits ein Konto.",
    WEAK_PASSWORD: "Das Passwort ist zu schwach. Bitte mindestens 10 Zeichen verwenden.",
    SAME_PASSWORD: "Das neue Passwort muss sich vom alten unterscheiden.",
    RATE_LIMITED: "Zu viele Versuche. Bitte warte einen Moment.",
    NETWORK_ERROR: "Keine Verbindung. Bitte prüfe deine Internetverbindung.",
    UNAUTHENTICATED: "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.",
    INVALID_TICKER: "Bitte ein gültiges Kürzel eingeben, z. B. NVDA oder PLTR.",
    INVALID_NAME: "Bitte einen Namen eingeben.",
    WATCHLIST_LIMIT_REACHED: "Du kannst höchstens 20 Watchlists anlegen.",
    WATCHLIST_ITEM_LIMIT_REACHED: "Eine Watchlist kann höchstens 500 Werte enthalten.",
    ACCOUNT_SERVICE_UNAVAILABLE: "Der Kontodienst ist gerade nicht erreichbar.",
    DELETE_FAILED: "Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.",
    PASSWORD_MISMATCH: "Die beiden Passwörter stimmen nicht überein.",
    CONFIRM_MISMATCH: "Bitte gib zur Bestätigung LÖSCHEN ein."
  };
  const message = (e) => MESSAGES[e && e.code] || "Das hat nicht geklappt. Bitte versuche es erneut.";

  /* ------------------------------------------------------------- DOM */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const field = (label, attrs) => {
    const id = "k-" + attrs.name;
    return [h("label", { for: id }, label), h("input", { id, ...attrs })];
  };
  const note = (text, kind) => h("p", { class: "k-msg " + (kind || ""), role: kind === "k-err" ? "alert" : "status" }, text);
  function render(...nodes) { main.replaceChildren(...nodes.flat(Infinity).filter(Boolean)); }

  /* Formular mit Sperre gegen Doppelklick und Fehlermeldung unter dem Knopf. */
  function form(onSubmit, ...children) {
    const out = h("div", { class: "k-out" });
    const el = h("form", { novalidate: true }, ...children, out);
    el.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!el.reportValidity()) return;
      const button = el.querySelector("button[type=submit]");
      if (button) button.disabled = true;
      out.replaceChildren();
      try {
        const result = await onSubmit(Object.fromEntries(new FormData(el)), out);
        if (typeof result === "string") out.replaceChildren(note(result, "k-ok"));
      } catch (e) {
        out.replaceChildren(note(message(e), "k-err"));
      } finally {
        if (button && button.isConnected) button.disabled = false;
      }
    });
    return el;
  }

  /* ------------------------------------------------------------- nicht aktiv */
  function renderDisabled() {
    render(h("p", { class: "k-eyebrow" }, "VISION UNIVERSE"), h("h1", null, "Mein Konto"),
      h("div", { class: "k-card" }, h("p", null, "Persönliche Konten mit Watchlists und Berichten folgen in Kürze."),
        h("p", { class: "k-muted k-small" }, "Deine bisherige Watchlist bleibt in diesem Browser gespeichert und kann später ins Konto übernommen werden.")));
  }

  /* ------------------------------------------------------------- abgemeldet */
  function renderSignedOut(active = "login", info = null) {
    const tabs = [["login", "Anmelden"], ["register", "Registrieren"], ["reset", "Passwort vergessen"]];
    const panel = {
      login: () => form(async (d) => {
        await client.signIn({ email: d.email, password: d.password });
        await renderAccount();
      }, ...field("E-Mail", { name: "email", type: "email", autocomplete: "email", required: true }),
        ...field("Passwort", { name: "password", type: "password", autocomplete: "current-password", required: true }),
        h("button", { class: "k-btn k-block", type: "submit" }, "Anmelden")),

      register: () => form(async (d) => {
        if (d.password !== d.password2) throw { code: "PASSWORD_MISMATCH" };
        const r = await client.signUp({ email: d.email, password: d.password, displayName: d.name || null, redirectTo: here });
        if (r.confirmationRequired) return "Fast geschafft: Wir haben dir eine E-Mail geschickt. Bitte bestätige deine Adresse über den Link.";
        await renderAccount();
      }, ...field("Name (optional)", { name: "name", type: "text", autocomplete: "name", maxlength: 80 }),
        ...field("E-Mail", { name: "email", type: "email", autocomplete: "email", required: true }),
        ...field("Passwort (mind. 10 Zeichen)", { name: "password", type: "password", autocomplete: "new-password", minlength: 10, required: true }),
        ...field("Passwort wiederholen", { name: "password2", type: "password", autocomplete: "new-password", minlength: 10, required: true }),
        h("p", { class: "k-muted k-small" }, "Mit der Registrierung akzeptierst du die Nutzungsbedingungen und die Datenschutzerklärung. Vision Universe bietet keine Anlageberatung."),
        h("button", { class: "k-btn k-block", type: "submit" }, "Konto erstellen")),

      reset: () => form(async (d) => {
        await client.sendPasswordReset({ email: d.email, redirectTo: here });
        return "Falls ein Konto zu dieser Adresse existiert, ist ein Link zum Zurücksetzen unterwegs.";
      }, ...field("E-Mail", { name: "email", type: "email", autocomplete: "email", required: true }),
        h("button", { class: "k-btn k-block", type: "submit" }, "Link senden"))
    };
    const tabBar = h("div", { class: "k-tabs", role: "tablist" }, tabs.map(([id, label]) =>
      h("button", { type: "button", role: "tab", "aria-selected": String(id === active), onclick: () => renderSignedOut(id) }, label)));
    render(h("p", { class: "k-eyebrow" }, "VISION UNIVERSE"), h("h1", null, "Mein Konto"),
      h("div", { class: "k-card k-narrow" }, tabBar, info, panel[active]()));
  }

  function renderNewPassword() {
    render(h("p", { class: "k-eyebrow" }, "VISION UNIVERSE"), h("h1", null, "Neues Passwort"),
      h("div", { class: "k-card k-narrow" }, form(async (d) => {
        if (d.password !== d.password2) throw { code: "PASSWORD_MISMATCH" };
        await client.updatePassword(d.password);
        await renderAccount(note("Dein Passwort wurde geändert.", "k-ok"));
      }, ...field("Neues Passwort (mind. 10 Zeichen)", { name: "password", type: "password", autocomplete: "new-password", minlength: 10, required: true }),
        ...field("Wiederholen", { name: "password2", type: "password", autocomplete: "new-password", minlength: 10, required: true }),
        h("button", { class: "k-btn k-block", type: "submit" }, "Passwort speichern"))));
  }

  /* ------------------------------------------------------------- angemeldet */
  function accessCard(me) {
    const a = me && me.access;
    const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;
    let badge, text;
    if (!a) { badge = h("span", { class: "k-badge k-off" }, "unbekannt"); text = "Der Abo-Status ist gerade nicht abrufbar."; }
    else if (a.premium && a.trial) { badge = h("span", { class: "k-badge k-on" }, "Testphase"); text = `Kostenlose Testphase bis ${formatDate(a.expiresAt)}.${a.willRenew ? " Danach verlängert sich das Abo automatisch über den App Store." : ""}`; }
    else if (a.premium && a.status === "billing_issue") { badge = h("span", { class: "k-badge k-warn" }, "Zahlungsproblem"); text = "Beim Store gab es ein Problem mit der Zahlung. Bitte prüfe deine Zahlungsart beim App Store bzw. Google Play."; }
    else if (a.premium) { badge = h("span", { class: "k-badge k-on" }, "Premium aktiv"); text = a.expiresAt ? (a.willRenew ? `Verlängert sich am ${formatDate(a.expiresAt)}.` : `Gekündigt – Zugang bis ${formatDate(a.expiresAt)}.`) : "Unbefristeter Zugang."; }
    else { badge = h("span", { class: "k-badge k-off" }, "Kein Abo"); text = "Premium mit 7 Tagen kostenloser Testphase gibt es in der Vision-Universe-App für iPhone und Android. Melde dich dort mit diesem Konto an – der Zugang gilt dann auch hier im Web."; }
    const manage = a && a.store && config.manageSubscription && config.manageSubscription[a.store];
    return h("section", { class: "k-card", id: "abo" }, h("div", { class: "k-spread" }, h("h2", null, "Abo"), badge), h("p", null, text),
      manage ? h("p", { class: "k-small" }, h("a", { href: manage, rel: "noopener", target: "_blank" }, "Abo verwalten oder kündigen"), " (beim Store, in dem du abgeschlossen hast)") : null);
  }

  function watchlistCard(lists, session, refresh) {
    const card = h("section", { class: "k-card", id: "watchlists" }, h("h2", null, "Watchlists"));
    const local = client.localWatchlist();
    if (lists.length && local.length && !client.localImportDone(session.user.id)) {
      card.append(h("div", { class: "k-msg" }, `In diesem Browser liegt noch eine Watchlist mit ${local.length} Werten. `,
        h("button", { class: "k-link", type: "button", onclick: async (e) => {
          e.target.disabled = true;
          try { await client.importLocalWatchlist(lists[0].id); await refresh(); } catch (err) { card.append(note(message(err), "k-err")); }
        } }, `In „${lists[0].name}“ übernehmen`)));
    }
    for (const list of lists) {
      const status = h("div");
      card.append(h("div", { class: "k-report" },
        h("div", { class: "k-spread" }, h("h3", null, list.name, " ", h("span", { class: "k-muted k-small" }, `(${list.tickers.length})`)),
          h("span", { class: "k-row" },
            h("button", { class: "k-link k-small", type: "button", onclick: async () => {
              const name = prompt("Neuer Name der Watchlist", list.name);
              if (name === null) return;
              try { await client.renameWatchlist(list.id, name); await refresh(); } catch (e) { status.replaceChildren(note(message(e), "k-err")); }
            } }, "Umbenennen"),
            lists.length > 1 ? h("button", { class: "k-link k-small", type: "button", onclick: async () => {
              if (!confirm(`Watchlist „${list.name}“ mit ${list.tickers.length} Werten löschen?`)) return;
              try { await client.deleteWatchlist(list.id); await refresh(); } catch (e) { status.replaceChildren(note(message(e), "k-err")); }
            } }, "Löschen") : null)),
        h("ul", { class: "k-chips", "aria-label": "Werte in " + list.name }, list.tickers.map((t) => h("li", null, t,
          h("button", { type: "button", "aria-label": t + " entfernen", onclick: async () => {
            try { await client.removeTicker(list.id, t); await refresh(); } catch (e) { status.replaceChildren(note(message(e), "k-err")); }
          } }, "×")))),
        form(async (d) => {
          const tickers = String(d.tickers || "").split(/[\s,;]+/).filter(Boolean);
          await client.addTickers(list.id, tickers);
          await refresh();
        }, h("label", { class: "k-small", for: "k-add-" + list.id }, "Werte hinzufügen (Kürzel, mehrere mit Komma)"),
          h("div", { class: "k-row" }, h("input", { id: "k-add-" + list.id, name: "tickers", type: "text", placeholder: "z. B. PLTR, NVDA, AAPL", autocapitalize: "characters", autocomplete: "off", required: true }),
            h("button", { class: "k-btn k-ghost", type: "submit" }, "Hinzufügen"))),
        status));
    }
    card.append(form(async (d) => { await client.createWatchlist(d.name); await refresh(); },
      h("label", { class: "k-small", for: "k-new-list" }, "Neue Watchlist"),
      h("div", { class: "k-row" }, h("input", { id: "k-new-list", name: "name", type: "text", maxlength: 60, placeholder: "z. B. KI-Werte", required: true }),
        h("button", { class: "k-btn k-ghost", type: "submit" }, "Anlegen"))));
    return card;
  }

  function reportsCard(reports, me) {
    const card = h("section", { class: "k-card", id: "berichte" }, h("h2", null, "Deine Berichte"));
    if (!me || !me.access || !me.access.premium) {
      card.append(h("p", { class: "k-muted" }, "Mit Premium bekommst du täglich oder wöchentlich einen Bericht zu deinen Watchlist-Werten: neue Nachrichten, Käufe und Verkäufe großer Hedgefonds, Änderungen der Quant-Scores, des Analystenkonsens und der Modellsignale."));
      return card;
    }
    if (!reports.length) { card.append(h("p", { class: "k-muted" }, "Noch kein Bericht. Der erste erscheint nach dem nächsten Tageslauf.")); return card; }
    for (const r of reports) {
      const body = h("div", null, (r.items || []).length ? r.items.map((s) => [h("h3", null, s.ticker), h("ul", null, s.items.map((e) =>
        h("li", null, h("strong", null, e.title), e.detail ? [h("br"), h("span", { class: "k-muted k-small" }, e.detail)] : null,
          e.url && /^https:\/\//.test(e.url) ? [" ", h("a", { href: e.url, rel: "noopener", target: "_blank" }, "Quelle")] : null))),
        s.more ? h("p", { class: "k-muted k-small" }, `… und ${s.more} weitere`) : null]) : h("p", { class: "k-muted" }, "Keine neuen Ereignisse im Berichtszeitraum."));
      const details = h("details", { class: "k-report" }, h("summary", null, `${r.frequency === "weekly" ? "Wochenbericht" : "Tagesbericht"} vom ${new Date(r.report_date + "T00:00:00").toLocaleDateString("de-DE")}`,
        r.read_at ? null : h("span", { class: "k-badge k-on", style: "margin-left:8px" }, "neu")), body);
      details.addEventListener("toggle", () => { if (details.open && !r.read_at) { r.read_at = true; client.markReportRead(r.id).catch(() => {}); } });
      card.append(details);
    }
    card.append(h("p", { class: "k-muted k-small" }, "Keine Anlageberatung. Modellsignale sind regelbasierte Nachbildungen und keine Kauf- oder Verkaufsempfehlung."));
    return card;
  }

  function settingsCard(profile, me) {
    const freq = h("select", { id: "k-report_frequency", name: "report_frequency" },
      [["weekly", "Wöchentlich (montags)"], ["daily", "Täglich"], ["off", "Keine Berichte"]].map(([v, l]) =>
        h("option", { value: v, selected: profile && profile.report_frequency === v }, l)));
    return h("section", { class: "k-card", id: "einstellungen" }, h("h2", null, "Einstellungen"),
      form(async (d) => {
        await client.updateProfile({ display_name: String(d.display_name || "").trim() || null, report_frequency: d.report_frequency, report_email: d.report_email === "on" });
        return "Gespeichert.";
      }, ...field("Name", { name: "display_name", type: "text", maxlength: 80, value: (profile && profile.display_name) || "" }),
        h("label", { for: "k-report_frequency" }, "Watchlist-Bericht"), freq,
        h("label", { class: "k-check" }, h("input", { type: "checkbox", name: "report_email", checked: !profile || profile.report_email }), "Bericht zusätzlich per E-Mail an ", (me && me.user && me.user.email) || "meine Adresse"),
        h("button", { class: "k-btn", type: "submit", style: "margin-top:12px" }, "Speichern")),
      h("details", { class: "k-report" }, h("summary", null, "Passwort ändern"), form(async (d) => {
        if (d.password !== d.password2) throw { code: "PASSWORD_MISMATCH" };
        await client.updatePassword(d.password);
        return "Dein Passwort wurde geändert.";
      }, ...field("Neues Passwort (mind. 10 Zeichen)", { name: "password", type: "password", autocomplete: "new-password", minlength: 10, required: true }),
        ...field("Wiederholen", { name: "password2", type: "password", autocomplete: "new-password", minlength: 10, required: true }),
        h("button", { class: "k-btn k-ghost", type: "submit", style: "margin-top:12px" }, "Passwort speichern"))),
      h("details", { class: "k-report" }, h("summary", null, "Konto löschen"),
        h("p", { class: "k-small" }, "Löscht dein Konto mit allen Watchlists und Berichten endgültig. ",
          h("strong", null, "Ein laufendes Abo im App Store oder bei Google Play wird dadurch nicht gekündigt"), " – das geht nur in den Abo-Einstellungen des Stores."),
        form(async (d) => {
          if (String(d.confirm || "").trim().toUpperCase() !== "LÖSCHEN") throw { code: "CONFIRM_MISMATCH" };
          const r = await client.deleteAccount();
          renderSignedOut("login", note(r.storeSubscriptionStillRenews
            ? "Dein Konto wurde gelöscht. Achtung: Dein Store-Abo läuft weiter – bitte kündige es in den Einstellungen des Stores."
            : "Dein Konto wurde gelöscht.", "k-ok"));
        }, ...field("Zur Bestätigung LÖSCHEN eingeben", { name: "confirm", type: "text", autocomplete: "off", required: true }),
          h("button", { class: "k-btn k-danger", type: "submit", style: "margin-top:12px" }, "Konto endgültig löschen"))));
  }

  async function renderAccount(flash) {
    const session = await client.session();
    if (!session) return renderSignedOut("login", flash || null);
    main.setAttribute("aria-busy", "true");
    const settled = await Promise.allSettled([client.me(), client.profile(), client.watchlists(), client.reports()]);
    main.removeAttribute("aria-busy");
    if (settled.some((r) => r.status === "rejected" && r.reason && r.reason.code === "UNAUTHENTICATED")) {
      return renderSignedOut("login", note(MESSAGES.UNAUTHENTICATED, "k-err"));
    }
    const [me, profile, lists, reports] = settled.map((r) => (r.status === "fulfilled" ? r.value : null));
    const refresh = () => renderAccount();
    render(
      h("p", { class: "k-eyebrow" }, "VISION UNIVERSE"),
      h("div", { class: "k-spread" }, h("h1", null, "Hallo" + (profile && profile.display_name ? " " + profile.display_name : "")),
        h("button", { class: "k-btn k-ghost", type: "button", onclick: async () => { await client.signOut(); renderSignedOut("login"); } }, "Abmelden")),
      h("p", { class: "k-muted" }, session.user.email || ""),
      flash || null,
      settled.some((r) => r.status === "rejected") ? note("Einige Bereiche konnten nicht geladen werden. Bitte lade die Seite neu.", "k-err") : null,
      accessCard(me),
      lists ? watchlistCard(lists, session, refresh) : null,
      reportsCard(reports || [], me),
      settingsCard(profile, me)
    );
  }

  /* ------------------------------------------------------------- Start */
  async function start() {
    if (!client.enabled) return renderDisabled();
    const redirect = client.handleRedirect(location.hash);
    if (redirect) history.replaceState(null, "", location.pathname + location.search);
    if (redirect && redirect.type === "error") {
      return renderSignedOut("login", note(redirect.code === "otp_expired" ? "Der Link ist abgelaufen. Bitte fordere einen neuen an." : "Der Link ist ungültig oder abgelaufen.", "k-err"));
    }
    if (redirect && redirect.type === "recovery") return renderNewPassword();
    return renderAccount(redirect && redirect.type === "signup" ? note("Deine E-Mail-Adresse ist bestätigt. Willkommen!", "k-ok") : null);
  }
  start().catch(() => render(note("Das Konto konnte nicht geladen werden. Bitte lade die Seite neu.", "k-err")));
})();
