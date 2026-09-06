/* Vision Universe Academy — landing page.
   Reads the data-driven registries (worlds.json, experiences.json,
   questions.json) and renders three grids. Adding a new World or
   Experience later means editing JSON here, not rebuilding this page. */
(function () {
  "use strict";
  var Shell = window.AcademyShell;

  function experienceById(experiences, id) {
    return experiences.find(function (e) { return e.id === id; });
  }

  function renderQuestions(questions, experiences) {
    var mount = Shell.$("#questions-mount");
    mount.innerHTML = "";
    questions.forEach(function (q) {
      var exp = q.experienceId ? experienceById(experiences, q.experienceId) : null;
      var available = exp && exp.status === "available";
      var tag = available ? "a" : "div";
      var attrs = { class: "vu-a-question-card " + (available ? "is-available" : "is-planned") };
      if (available) attrs.href = exp.path;
      var card = Shell.el(tag, attrs, [
        Shell.el("p", { class: "vu-a-question-text", text: q.question }),
        Shell.el("span", { class: "vu-a-question-badge", text: available ? "Jetzt erkunden" : "Bald verfügbar" })
      ]);
      mount.appendChild(card);
    });
  }

  function renderFeaturedPilot(experiences) {
    var featured = experiences.find(function (e) { return e.featured && e.status === "available"; });
    if (!featured) return;
    var mount = Shell.$("#pilot-mount");
    mount.innerHTML = "";
    mount.appendChild(Shell.el("div", { class: "vu-a-pilot" }, [
      Shell.el("div", { class: "vu-a-pilot-copy" }, [
        Shell.el("p", { class: "vu-a-eyebrow", text: featured.title }),
        Shell.el("p", { class: "vu-a-body", html: "<strong>" + featured.editorialHook + "</strong>" }),
        Shell.el("p", { class: "vu-a-body", text: featured.shortDescription })
      ]),
      Shell.el("a", { class: "vu-a-pilot-cta", href: featured.path, text: "Experience öffnen →" })
    ]));
  }

  function renderWorlds(worlds) {
    var mount = Shell.$("#worlds-mount");
    mount.innerHTML = "";
    worlds.forEach(function (w) {
      var card = Shell.el("div", {
        class: "vu-a-world-card",
        style: "--vu-world-accent: var(--vu-accent-" + w.accent + ")"
      });
      card.appendChild(Shell.el("h3", { class: "vu-a-world-title", text: w.title }));
      card.appendChild(Shell.el("p", { class: "vu-a-world-summary", text: w.summary }));
      var nodes = Shell.el("div", { class: "vu-a-world-nodes" });
      w.sampleNodes.forEach(function (n) { nodes.appendChild(Shell.el("span", { class: "vu-a-world-node", text: n })); });
      card.appendChild(nodes);
      card.appendChild(Shell.el("span", {
        class: "vu-a-world-status is-" + w.status,
        text: w.status === "available" ? "Verfügbar" : "In Aufbau"
      }));
      mount.appendChild(card);
    });
  }

  async function init() {
    var worldsData = await Shell.loadJSON("/academy/data/worlds.json");
    var experiencesData = await Shell.loadJSON("/academy/data/experiences.json");
    var questionsData = await Shell.loadJSON("/academy/data/questions.json");

    renderQuestions(questionsData.questions, experiencesData.experiences);
    renderFeaturedPilot(experiencesData.experiences);
    renderWorlds(worldsData.worlds);
  }

  init();
})();
