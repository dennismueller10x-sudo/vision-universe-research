(function () {
  const app = document.querySelector("#app");
  const view = document.body.dataset.view || "home";
  const pages = {
    home: "<section class='home'><div class='kicker'>VISION UNIVERSE</div><h1>Was möchtest du heute verstehen?</h1><p class='intro'>Unabhängiges Research für fundiertere Anlageentscheidungen.</p><div class='actions'><a class='action' href='/dashboard/research/'><b>Research</b><span>Fundamentale Analyse und Score</span></a><a class='action' href='/dashboard/charting/'><b>Charting</b><span>Kurs, Trend und Szenarien</span></a><a class='action' href='/dashboard/discover/'><b>Entdecken</b><span>Aktien suchen und auswählen</span></a><a class='action' href='/dashboard/watchlist/'><b>Watchlist</b><span>Scores und Kennzahlen vergleichen</span></a></div></section>",
    research: "<div class='kicker'>Fundamentale Analyse</div><h1 class='heading'>Research</h1><p class='notice'>Research-Ansicht wird mit Fundamentaldaten geladen.</p>",
    charting: "<div class='kicker'>Technische Analyse</div><h1 class='heading'>Charting</h1><p class='notice'>Charting-Ansicht wird mit technischen Daten geladen.</p>",
    discover: "<div class='kicker'>Universum</div><h1 class='heading'>Entdecken</h1><p class='notice'>Aktien-Suche wird geladen.</p>",
    watchlist: "<div class='kicker'>Universum</div><h1 class='heading'>Watchlist</h1><p class='notice'>Watchlist wird geladen.</p>"
  };
  app.innerHTML = pages[view] || pages.home;
}());