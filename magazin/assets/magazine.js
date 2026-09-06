// Vision Universe Weekly — geteilte Reader-Logik für alle Ausgaben.
// Steuert das horizontale Blättern zwischen Kapiteln. Läuft für jede Ausgabe
// gleich, damit sich Verhalten (Pfeile, Tastatur, Menü) nicht unterscheidet.
(() => {
  const mag = document.getElementById('mag');
  if (!mag) return;
  const chapters = [...mag.querySelectorAll(':scope > .chapter')];

  // Wichtig: ein normaler <a href="#chN">-Klick lässt den Browser das Ziel
  // per Standardverhalten *vertikal* ins Bild scrollen. Weil die Seite oben
  // Platz für die globale Vision-Universe-Navigation reserviert (body
  // padding-top), schiebt dieser native Sprung den ganzen Reader unter die
  // globale Kopfzeile — danach liegen die Pfeile/das Menü der nächsten
  // Kapitel unsichtbar darunter und "Weiterswipen" funktioniert nicht mehr.
  // Fix: den Klick abfangen und ausschließlich horizontal scrollen.
  function goTo(id, behavior) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({behavior: behavior || 'smooth', inline: 'start', block: 'nearest'});
  }

  function currentIndex() {
    return Math.round(mag.scrollLeft / mag.clientWidth);
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#ch"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    const target = mag.querySelector('#' + CSS.escape(id));
    if (!target) return;
    if (link.classList.contains('disabled')) { event.preventDefault(); return; }
    event.preventDefault();
    goTo(id);
    const menu = link.closest('.chapter-menu');
    if (menu) menu.removeAttribute('open');
  });

  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,[contenteditable]')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      const next = chapters[currentIndex() + 1];
      if (next) goTo(next.id);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      const prev = chapters[currentIndex() - 1];
      if (prev) goTo(prev.id);
    } else if (event.key === 'Escape') {
      document.querySelectorAll('.chapter-menu[open]').forEach(m => m.removeAttribute('open'));
    }
  });

  // Direkter Aufruf mit #chN in der URL: ebenfalls ohne den nativen
  // vertikalen Sprung ausführen, sobald das Layout steht.
  if (location.hash && /^#ch\d+$/.test(location.hash)) {
    const id = location.hash.slice(1);
    requestAnimationFrame(() => goTo(id, 'auto'));
  }

  // Nur ein Menü gleichzeitig offen halten.
  document.addEventListener('toggle', event => {
    const el = event.target;
    if (!(el instanceof HTMLDetailsElement) || !el.classList.contains('chapter-menu') || !el.open) return;
    document.querySelectorAll('.chapter-menu[open]').forEach(other => {
      if (other !== el) other.removeAttribute('open');
    });
  }, true);
})();
