/* Vision Universe Academy — Landingpage.
   Liest die datengetriebenen Registries (worlds.json, experiences.json,
   questions.json, concepts.json) und rendert drei Grids. Eine neue World
   oder Experience spaeter zu ergaenzen heisst: JSON editieren, nicht diese
   Seite umbauen. */
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

  function renderWorlds(worlds, concepts) {
    var mount = Shell.$("#worlds-mount");
    mount.innerHTML = "";
    worlds.forEach(function (w) {
      var conceptCount = 0;
      if (concepts && concepts.concepts) {
        Object.keys(concepts.concepts).forEach(function (id) {
          if ((concepts.concepts[id].worlds || []).indexOf(w.id) !== -1) conceptCount++;
        });
      }

      var card = Shell.el("div", {
        class: "vu-a-world-card",
        style: "--vu-world-accent: var(--vu-accent-" + w.accent + ")",
        role: "button", tabindex: "0"
      });
      var head = Shell.el("div", { class: "vu-a-world-card-head" }, [
        Shell.createIconBadge(w.icon, "var(--vu-accent-" + w.accent + ")"),
        Shell.el("h3", { class: "vu-a-world-title", text: w.title })
      ]);
      card.appendChild(head);
      card.appendChild(Shell.el("p", { class: "vu-a-world-summary", text: w.summary }));

      var nodes = Shell.el("div", { class: "vu-a-world-nodes" });
      w.sampleNodes.forEach(function (n) { nodes.appendChild(Shell.el("span", { class: "vu-a-world-node", text: n })); });
      card.appendChild(nodes);

      var foot = Shell.el("div", { class: "vu-a-world-foot" }, [
        Shell.el("span", {
          class: "vu-a-world-status is-" + w.status,
          text: w.status === "available" ? "Verfügbar" : "In Aufbau"
        }),
        Shell.el("span", { class: "vu-a-world-count", text: conceptCount > 0 ? conceptCount + (conceptCount === 1 ? " Konzept" : " Konzepte") : w.sampleNodes.length + " Themen" })
      ]);
      card.appendChild(foot);

      function toggle() { card.classList.toggle("is-open"); }
      card.addEventListener("click", toggle);
      card.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });

      mount.appendChild(card);
    });
  }

  async function init() {
    var worldsData = await Shell.loadJSON("/academy/data/worlds.json");
    var experiencesData = await Shell.loadJSON("/academy/data/experiences.json");
    var questionsData = await Shell.loadJSON("/academy/data/questions.json");
    var conceptsData = await Shell.loadJSON("/academy/data/concepts.json").catch(function () { return null; });

    renderQuestions(questionsData.questions, experiencesData.experiences);
    renderFeaturedPilot(experiencesData.experiences);
    renderWorlds(worldsData.worlds, conceptsData);
  }

  init();
})();
