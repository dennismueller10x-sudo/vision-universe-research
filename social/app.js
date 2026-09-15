/* =========================================================================
   VISION UNIVERSE SOCIAL — app.js
   SOCIAL COMMAND CENTER (§31, §32, §45, §49)

   Der Owner muss sehen koennen:

     Was will die Engine veroeffentlichen?  Warum?
     Welche Daten liegen zugrunde?          Was wurde veroeffentlicht?
     Wie lief es?                           Was hat die Engine gelernt?

   -------------------------------------------------------------------------
   DIE REGEL DIESER DATEI
   -------------------------------------------------------------------------

   Sie zeigt AUSSCHLIESSLICH, was in den Artefakten steht. Sie rechnet
   nichts, sie ergaenzt nichts, sie schaetzt nichts.

   Wenn ein Artefakt fehlt, zeigt sie das — mit dem Befehl, der es
   erzeugt. Eine Oberflaeche, die bei fehlenden Daten Beispielwerte
   einblendet, simuliert Autonomie, und §45 verbietet genau das.

   Eine leere Warteschlange ist deshalb kein Fehlerzustand und kein
   Ladebalken, sondern eine Aussage: "die Engine hat heute nichts
   vorgeschlagen, und hier steht warum."
   ========================================================================= */
(function (global) {
  "use strict";

  var BASE = "/social/data/";

  var FILES = {
    cycle: "cycle-report.json",
    health: "health.json",
    publications: "publications.json",
    signals: "signals.json"
  };

  var TABS = [
    { id: "today",         label: "Heute" },
    { id: "queue",         label: "Queue" },
    { id: "opportunities", label: "Opportunities" },
    { id: "published",     label: "Published" },
    { id: "health",        label: "Health" }
  ];

  var state = { tab: "today", data: {}, errors: {} };

  /* ------------------------------------------------------------------ */
  /* Laden                                                                */
  /* ------------------------------------------------------------------ */

  function loadJSON(name) {
    return fetch(BASE + FILES[name], { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) { state.data[name] = data; return data; })
      .catch(function (err) {
        /* Der Fehler wird BEHALTEN, nicht verschluckt. Er ist die
           Information, die der leere Zustand braucht. */
        state.errors[name] = String(err && err.message);
        state.data[name] = null;
        return null;
      });
  }

  function loadAll() {
    return Promise.all(Object.keys(FILES).map(loadJSON));
  }

  /* ------------------------------------------------------------------ */
  /* Darstellung                                                          */
  /* ------------------------------------------------------------------ */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function badge(stateName, label) {
    var map = { PASS: "pass", WARNING: "warning", FAIL: "fail", UNAVAILABLE: "unavailable" };
    return el("span", "s-badge s-badge--" + (map[stateName] || "unavailable"),
              label || stateName);
  }

  /**
   * Der leere Zustand. Er nennt IMMER den Grund und den Befehl — sonst
   * sieht ein nicht eingerichtetes System aus wie ein kaputtes.
   */
  function emptyState(title, reason, command) {
    var box = el("div", "s-empty");
    box.appendChild(el("h3", null, title));
    box.appendChild(el("p", null, reason));
    if (command) {
      var p = el("p", null, "Erzeugen mit: ");
      p.appendChild(el("code", null, command));
      box.appendChild(p);
    }
    return box;
  }

  function statusBar() {
    var bar = el("div", "s-status-bar");
    var cycle = state.data.cycle;
    var health = state.data.health || (cycle && cycle.health);

    if (health) {
      bar.appendChild(badge(health.overall, "System " + health.overall));
    } else {
      bar.appendChild(badge("UNAVAILABLE", "System UNAVAILABLE"));
    }

    if (cycle && cycle.autonomy) {
      var autonomy = cycle.autonomy;
      bar.appendChild(badge(autonomy.capped ? "WARNING" : "PASS",
        "Autonomie " + autonomy.effective + " · " + autonomy.info.label));
    } else {
      bar.appendChild(badge("UNAVAILABLE", "Autonomie unbekannt"));
    }

    /* Der Zeitstempel ist keine Zierde: eine Oberflaeche ohne Stand
       laesst nicht erkennen, ob sie einen alten Lauf zeigt. */
    var generatedAt = (cycle && cycle.generatedAt) || (health && health.generatedAt);
    bar.appendChild(el("span", "s-badge s-badge--unavailable",
      generatedAt ? "Stand " + formatTime(generatedAt) : "Kein Lauf"));

    return bar;
  }

  function formatTime(iso) {
    if (!iso) return "unbekannt";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return String(iso);
    return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit",
      hour: "2-digit", minute: "2-digit" });
  }

  /* --------------------------------------------------------- HEUTE */

  function renderToday(main) {
    var cycle = state.data.cycle;
    if (!cycle) {
      main.appendChild(emptyState(
        "Kein Zyklusbericht",
        "Es liegt kein Lauf vor. Das Command Center zeigt ausschliesslich, was ein Lauf " +
        "hinterlassen hat — es erfindet keine Beispieldaten.",
        "node scripts/social/run-social-cycle.mjs --provider mock --out social/data"));
      return;
    }

    main.appendChild(el("p", "s-section-title", "Zusammenfassung"));
    var card = el("div", "s-card");
    card.appendChild(el("p", "s-card__topic",
      cycle.signals + " Signale · " + (cycle.opportunities || []).length + " Gelegenheiten · " +
      (cycle.packages || []).length + " Pakete"));
    card.appendChild(el("p", "s-card__meta",
      "Provider: " + (cycle.provider || "keiner") + " · Auditeintraege: " + (cycle.auditEntries || 0)));

    if (cycle.autonomy && cycle.autonomy.capped) {
      var note = el("div", "s-note", cycle.autonomy.explanation);
      card.appendChild(note);
    }
    main.appendChild(card);

    /* Verworfenes gehoert auf die erste Seite, nicht in ein Archiv: die
       Frage "warum kam heute nichts?" ist die haeufigste. */
    if ((cycle.rejections || []).length) {
      main.appendChild(el("p", "s-section-title", "Verworfen"));
      cycle.rejections.forEach(function (rejection) {
        var row = el("div", "s-card");
        var head = el("div", "s-card__head");
        head.appendChild(el("p", "s-card__topic", rejection.topic));
        head.appendChild(badge("WARNING", rejection.stage));
        row.appendChild(head);
        row.appendChild(el("p", "s-card__caption", rejection.reason));
        main.appendChild(row);
      });
    }
  }

  /* --------------------------------------------------------- QUEUE */

  function renderQueue(main) {
    var publications = (state.data.publications && state.data.publications.publications) || [];
    var pending = publications.filter(function (p) {
      return ["IDEA", "DRAFT", "VALIDATED", "READY", "SCHEDULED", "RETRY", "FAILED"]
        .indexOf(p.state) !== -1;
    });

    if (!state.data.publications) {
      main.appendChild(emptyState(
        "Keine Warteschlange",
        "Es liegt keine Veroeffentlichungsliste vor.",
        "node scripts/social/run-social-cycle.mjs --provider mock --out social/data"));
      return;
    }
    if (!pending.length) {
      main.appendChild(emptyState(
        "Die Warteschlange ist leer",
        "Die Engine hat nichts zur Veroeffentlichung vorgemerkt. Das ist kein Fehler — " +
        "unter 'Heute' steht, was geprueft und warum es verworfen wurde."));
      return;
    }

    var cycle = state.data.cycle || {};
    var packages = {};
    (cycle.packages || []).forEach(function (p) { packages[p.packageId] = p; });

    pending.forEach(function (publication) {
      main.appendChild(publicationCard(publication, packages[publication.packageId]));
    });
  }

  function publicationCard(publication, pkg) {
    var card = el("div", "s-card");
    var head = el("div", "s-card__head");
    var title = el("div");
    title.appendChild(el("p", "s-card__topic", (pkg && pkg.topic) || publication.packageId));
    title.appendChild(el("p", "s-card__meta",
      publication.providerId + " · " +
      (publication.scheduledFor ? "geplant " + formatTime(publication.scheduledFor) : "kein Termin") +
      (publication.attempts && publication.attempts.length
        ? " · " + publication.attempts.length + " Versuch(e)" : "")));
    head.appendChild(title);
    head.appendChild(badge(stateToHealth(publication.state), publication.state));
    card.appendChild(head);

    if (pkg && pkg.hook) card.appendChild(el("p", "s-card__hook", pkg.hook));
    if (pkg && pkg.archetype) {
      card.appendChild(el("p", "s-card__meta",
        pkg.archetype + (pkg.visualType ? " · " + pkg.visualType : "")));
    }

    /* Der letzte Fehlschlag wird gezeigt, nicht weggeklappt. */
    var last = publication.attempts && publication.attempts[publication.attempts.length - 1];
    if (last && last.outcome === "failed") {
      card.appendChild(el("div", "s-note",
        "Letzter Versuch fehlgeschlagen (" + (last.errorCode || "unbekannt") + "): " +
        (last.errorMessage || "keine Meldung") +
        (last.retryable ? " — ein Wiederholungsversuch ist vorgesehen."
                        : " — ein Wiederholungsversuch hilft hier nicht.")));
    }
    return card;
  }

  function stateToHealth(publicationState) {
    if (publicationState === "PUBLISHED") return "PASS";
    if (publicationState === "FAILED") return "FAIL";
    if (publicationState === "RETRY" || publicationState === "PUBLISHING") return "WARNING";
    return "UNAVAILABLE";
  }

  /* ------------------------------------------------- OPPORTUNITIES */

  function renderOpportunities(main) {
    var cycle = state.data.cycle;
    if (!cycle) {
      main.appendChild(emptyState("Keine Gelegenheiten",
        "Es liegt kein Lauf vor.",
        "node scripts/social/run-social-cycle.mjs --provider mock --out social/data"));
      return;
    }
    var opportunities = cycle.opportunities || [];
    if (!opportunities.length) {
      main.appendChild(emptyState("Keine Gelegenheiten",
        "Der Lauf hat keine Gelegenheit gefunden. Unter 'Health' steht, welche Signalquellen " +
        "angebunden sind und welche nicht."));
      return;
    }

    opportunities
      .slice()
      .sort(function (a, b) { return (b.score || 0) - (a.score || 0); })
      .forEach(function (opportunity) {
        var card = el("div", "s-card");
        var head = el("div", "s-card__head");
        head.appendChild(el("p", "s-card__topic", opportunity.topic));
        head.appendChild(badge(
          opportunity.score === null ? "UNAVAILABLE" : (opportunity.proposable ? "PASS" : "WARNING"),
          /* KEINE erfundene Zahl: enthaelt sich die Engine, steht das da. */
          opportunity.score === null ? "kein Score" : String(opportunity.score)));
        card.appendChild(head);

        var why = el("details", "s-why");
        why.appendChild(el("summary", null, "Warum diese Bewertung?"));
        var dl = el("dl", "s-why-item");
        dl.appendChild(el("dt", null, "Begruendung"));
        dl.appendChild(el("dd", null, opportunity.explanation || "Keine Begruendung hinterlegt."));
        why.appendChild(dl);
        card.appendChild(why);
        main.appendChild(card);
      });
  }

  /* ----------------------------------------------------- PUBLISHED */

  function renderPublished(main) {
    var publications = (state.data.publications && state.data.publications.publications) || [];
    var published = publications.filter(function (p) { return p.state === "PUBLISHED"; });

    if (!published.length) {
      main.appendChild(emptyState(
        "Noch nichts veroeffentlicht",
        "Es wurde bislang kein Beitrag ueber dieses System veroeffentlicht. Der globale " +
        "Autopublish-Schalter ist aus; die Freischaltung ist eine Owner-Entscheidung und " +
        "erfolgt als Commit in social/config/kill-switch.json."));
      return;
    }

    published.forEach(function (publication) {
      var card = el("div", "s-card");
      var head = el("div", "s-card__head");
      var title = el("div");
      title.appendChild(el("p", "s-card__topic", publication.packageId));
      title.appendChild(el("p", "s-card__meta",
        publication.providerId + " · " + formatTime(publication.publishedAt)));
      head.appendChild(title);
      head.appendChild(badge("PASS", "PUBLISHED"));
      card.appendChild(head);

      if (publication.permalink) {
        var link = el("a", null, "Beitrag oeffnen");
        link.href = publication.permalink;
        link.rel = "noopener noreferrer";
        link.target = "_blank";
        card.appendChild(link);
      }
      main.appendChild(card);
    });
  }

  /* -------------------------------------------------------- HEALTH */

  function renderHealth(main) {
    var health = state.data.health || (state.data.cycle && state.data.cycle.health);
    if (!health) {
      main.appendChild(emptyState("Kein Zustandsbericht",
        "Es liegt kein Gesundheitsbericht vor.",
        "node scripts/social/run-social-cycle.mjs --provider mock --out social/data"));
      return;
    }

    main.appendChild(el("p", "s-section-title", "Gesamtzustand"));
    var summary = el("div", "s-card");
    summary.appendChild(el("p", "s-card__caption", health.explanation));
    main.appendChild(summary);

    main.appendChild(el("p", "s-section-title", "Komponenten"));
    var matrix = el("div", "s-matrix");
    (health.rows || []).forEach(function (row) {
      var item = el("div", "s-row");
      item.appendChild(el("span", "s-row__label", row.label));
      item.appendChild(badge(row.state));
      if (row.detail || row.failureMode) {
        item.appendChild(el("p", "s-row__detail", row.failureMode || row.detail));
      }
      /* Die naechste Handlung steht dabei. Ein Zustandsbericht ohne sie
         erzeugt Rateversuche statt Behebung. */
      if (row.nextAction) item.appendChild(el("p", "s-row__action", "→ " + row.nextAction));
      matrix.appendChild(item);
    });
    main.appendChild(matrix);

    /* Nicht angebundene Signalquellen ausdruecklich nennen (§45). */
    var signals = state.data.signals;
    if (signals && signals.notConnected && signals.notConnected.length) {
      main.appendChild(el("p", "s-section-title", "Nicht angebundene Quellen"));
      signals.notConnected.forEach(function (source) {
        var item = el("div", "s-row");
        item.appendChild(el("span", "s-row__label", source.id));
        item.appendChild(badge("UNAVAILABLE"));
        item.appendChild(el("p", "s-row__detail", source.reason));
        main.appendChild(item);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Rahmen                                                               */
  /* ------------------------------------------------------------------ */

  function renderTabs(container) {
    container.innerHTML = "";
    TABS.forEach(function (tab) {
      var button = el("button", "s-tab", tab.label);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", state.tab === tab.id ? "true" : "false");
      button.addEventListener("click", function () {
        state.tab = tab.id;
        render();
      });
      container.appendChild(button);
    });
  }

  function render() {
    var statusHost = document.getElementById("s-status");
    statusHost.innerHTML = "";
    statusHost.appendChild(statusBar());

    renderTabs(document.getElementById("s-tabs"));

    var main = document.getElementById("s-main");
    main.innerHTML = "";

    if (state.tab === "today") renderToday(main);
    else if (state.tab === "queue") renderQueue(main);
    else if (state.tab === "opportunities") renderOpportunities(main);
    else if (state.tab === "published") renderPublished(main);
    else if (state.tab === "health") renderHealth(main);
  }

  function start() {
    var main = document.getElementById("s-main");
    main.appendChild(el("p", "s-card__meta", "Laedt …"));
    loadAll().then(render);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  global.VUSocialCommandCenter = { render: render, state: state };
})(window);
