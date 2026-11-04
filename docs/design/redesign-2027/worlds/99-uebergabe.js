/* 99 · Übergabe an Claude Code: Reihenfolge, Routen, Abnahme. */
(function () {
const { slide, chapter } = VU;
const esc = s => String(s == null ? '' : s).replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/</g, '&lt;');

chapter({ n: 'Ü', title: 'Übergabe an Claude Code', icon: 'layers', anchor: 'uebergabe', was: 'Reihenfolge, Routen, Abnahme. <b>So wird aus der Präsentation die App.</b>' });

slide({ t: 'html', id: 'Ü1', title: 'Reihenfolge der Umsetzung', sub: 'Jeder Schritt ist ein eigener Pull Request. Die Isolations-Gates im Repository bleiben unverändert; Querschnittsänderungen werden nach Produkten aufgeteilt.', html: () => `<div class="xscroll"><table class="tbl"><thead><tr><th>Schritt</th><th>Inhalt</th><th>Folien</th><th>Pfade und Gates</th></tr></thead><tbody>${[
  ['1 · Fundament', 'Farben, Schrift, Abstände als Tokens; Bausteine C01–C20 als gemeinsame Komponenten; der eine Chart (C06) als einzige Chart-Komponente für alle Welten.', 'A3, C', '<code>assets/site-navigation.css</code>, neue gemeinsame Bausteine unter <code>assets/</code>; kein Produktpfad'],
  ['2 · Navigation', 'Kopfzeile (Welt links, Suche/Atlas/Profil rechts), Produkt-Leiste mit 5 Plätzen je Welt, Menü als Vollbild.', 'N1–N3', '<code>assets/site-navigation.js</code> (groups, products, dock)'],
  ['3 · Aktienseite', 'Gemeinsamer Aktienkopf (C04) und Perspektiven-Leiste (C05); ein Preis für alle Welten (ADR-002). Herkunftswelt bestimmt Perspektive und Leiste.', 'N4–N5, D09, Q07, T06, F06, W05, ST08, H07', 'je Welt ein PR; Supertrader nur mit Supertrader-Pfaden (Gate A)'],
  ['4 · Welten', 'Je Welt alle Folien ihres Kapitels: Startseite, Unterseiten, Zustände.', '02–10', 'Discover: View-Budget ≤ 180.000 Byte, ≤ 12 Requests; Company Intelligence und Supertrader getrennt'],
  ['5 · Einstieg und Konto', 'Startseite, Willkommen, Preise, Registrierung, Pro-Bestellung, Mein Bereich, erster Start mit Einsteiger/Profi.', '01', '<code>/</code>, <code>willkommen/</code>, <code>preise/</code>, <code>konto/</code>, <code>mein-dashboard/</code>; Konten bleiben ausgeschaltet bis zur Freigabe'],
  ['6 · Dunkel und Feinschliff', 'Dunkler Modus für alle Bausteine, Leerzustände, Ladezustände, Barrierefreiheit (44 px Tippfläche, Kontrast).', 'alle', 'Browser-QA je Welt (Chromium und WebKit, 390 × 844)']
].map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<b>${c}</b>` : c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` });

slide({ t: 'html', id: 'Ü2', title: 'Alle Seiten mit Adresse', sub: 'Generiert aus den Folien dieser Präsentation. Kennung, heutige Adresse, neue Adresse, Bausteine.', html: () => { const rows = VU.slides.filter(s => s.t !== 'chapter' && s.t !== 'html' && s.id); return `<div class="xscroll"><table class="tbl"><thead><tr><th>ID</th><th>Seite</th><th>Heute</th><th>Neu</th><th>Bausteine</th></tr></thead><tbody>${rows.map(s => `<tr><td><a href="#${esc(s.id)}" class="pid" style="text-decoration:none">${esc(s.id)}</a></td><td>${esc(s.title)}</td><td><code class="route">${esc(s.route || '–')}</code></td><td>${s.newRoute && s.newRoute !== s.route ? `<code class="route">${esc(s.newRoute)}</code>` : 'gleich'}</td><td style="font-size:12.5px">${esc(((s.spec && s.spec.komponenten) || []).join(', '))}</td></tr>`).join('')}</tbody></table></div><p class="sub" style="margin-top:14px;color:var(--g4)">${rows.length} Seiten-Folien.</p>`; } });

slide({ t: 'html', id: 'Ü3', title: 'Abnahmekriterien', sub: 'Eine Seite gilt als fertig, wenn alle Punkte erfüllt sind.', html: () => `<ol class="rules7">${[
  'Auf 390 × 844 entspricht die Seite dem Mockup: Reihenfolge, Abstände, Schriftgrößen, Bausteine.',
  'Nur Weiß, Schwarz, Neongrün #c8f531 und die drei Graustufen. Kein Rot, kein Grün für Kurse.',
  'Jeder Kursverlauf nutzt die eine Chart-Komponente. Gleiche Zeitleiste 1T · 1W · 1M · 1J · 5J · Max.',
  'Der Preis einer Aktie ist in jeder Welt derselbe (veröffentlichter Schluss, Börsenwährung, Euro als Zusatz).',
  'Kopfzeile, Produkt-Leiste und Menü sind in jeder Welt gleich aufgebaut; die aktive Stelle ist neongrün.',
  'Jede Fachkennzahl hat eine Erklärung („?“) in einem Satz.',
  'Keine Funktion von heute fällt ersatzlos weg; Verschiebungen stehen im Bauplan der Folie.',
  'Bestehende Tests, Gates und Budgets bleiben grün; keine Daten-Artefakte werden geändert.'
].map(t => `<li>${t}</li>`).join('')}</ol>` });

slide({ t: 'html', id: 'Ü4', title: 'Auftrag an Claude Code', sub: 'Diesen Text zusammen mit dem Link zur Präsentation übergeben.', html: () => `<pre class="prompt">${esc(`Baue das Frontend von research.visionuniverse.de nach der Präsentation „Vision Universe Redesign“ neu.

Quelle: Die Präsentation (Folien mit Kennungen wie Q07). Jede Folie zeigt HEUTE (Aufnahme der heutigen Seite), NEU (Mockup auf 390 × 844) und einen Bauplan (Aufbau, Bausteine C01–C20, Daten, was entfällt).

Vorgehen:
1. Lies CLAUDE.md und docs/VISION_UNIVERSE_ARCHITECTURE.md. Gates und Budgets gelten unverändert.
2. Setze die Schritte aus Folie Ü1 der Reihe nach um, jeden Schritt als eigenen Pull Request, Produktwelten getrennt.
3. Baue zuerst die Bausteine C01–C20 und den einen Chart als gemeinsame Komponenten, dann Navigation (N1–N3), dann die gemeinsame Aktienseite (N4–N5), dann die Welten Kapitel für Kapitel.
4. Ändere keine Fachmodelle, Scores, Rankings und keine generierten Daten. Nur Darstellung und Navigation.
5. Prüfe jede Seite im Browser auf 390 × 844 (Chromium und WebKit) gegen das Mockup und die Abnahmekriterien aus Folie Ü3.
6. Halte die alten Adressen erreichbar (Weiterleitung, wo sich eine Adresse ändert).`)}</pre>` });
})();
