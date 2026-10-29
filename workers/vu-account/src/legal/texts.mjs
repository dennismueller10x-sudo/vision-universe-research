// Rechtstexte fuer Vision Universe (Konto, Free, Pro). Eine Quelle fuer:
//   * die oeffentlichen Seiten https://konto.visionuniverse.de/rechtliches/... (ohne Research-Passwortmaske)
//   * die Vertragsbestaetigung per E-Mail (dauerhafter Datenträger, § 312f BGB)
//   * die Links in Bestellbestaetigung, Registrierung und Stripe-Kundenportal
//
// STATUS: ENTWURF. Die Texte sind auf den tatsaechlichen Ablauf zugeschnitten, aber
// NICHT rechtlich freigegeben. Offene Punkte stehen als [[OFFEN: …]] / [[PRÜFEN: …]] im
// Text und gesammelt in docs/accounts/RECHTLICHE_ABNAHME.md. Unternehmensangaben stammen
// ausschliesslich aus dem bestaetigten Impressum (landing/impressum/, Stand 16.10.2026).
//
// Freigabe: LEGAL_STATUS auf 'freigegeben' und LEGAL_VERSION hochzaehlen (eigener PR mit
// Owner-/Anwaltsfreigabe). Der oeffentliche Checkout setzt zusaetzlich VU_LEGAL_APPROVED =
// LEGAL_VERSION voraus (config.mjs) – ohne freigegebene Texte bleibt er geschlossen.
//
// Mini-Auszeichnung: Bloecke {h}, {p}, {ul}, {note}; im Text **fett** und [Text](/pfad|https://…).

export const LEGAL_VERSION = 'vu-recht-2026-10-29-entwurf-1';
export const LEGAL_STATUS = 'entwurf'; // 'entwurf' | 'freigegeben'
export const LEGAL_BASE = 'https://konto.visionuniverse.de';

export const COMPANY = Object.freeze({
  name: 'RAM Consulting UG (haftungsbeschränkt)',
  brand: 'Vision Universe',
  street: 'Bahnhofplatz 15',
  city: '74189 Weinsberg',
  country: 'Deutschland',
  representative: 'Ralf Andreas Müller (Geschäftsführer)',
  email: 'info@visionuniverse.de',
  register: 'Amtsgericht Stuttgart, HRB 803400',
  taxNumber: '65204/71409',
  vatId: null,   // [[OFFEN]] USt-IdNr. liegt in keiner vorhandenen Quelle vor
  phone: null,   // [[OFFEN]] Telefonnummer liegt in keiner vorhandenen Quelle vor
});

const C = COMPANY;
const ADDRESS = `${C.name}, ${C.street}, ${C.city}, ${C.country}`;
const OPEN = what => `[[OFFEN: ${what}]]`;
const CHECK = what => `[[PRÜFEN: ${what}]]`;

export const LINKS = Object.freeze({
  index: '/rechtliches/', impressum: '/rechtliches/impressum', datenschutz: '/rechtliches/datenschutz',
  agb: '/rechtliches/agb', widerrufsbelehrung: '/rechtliches/widerrufsbelehrung', widerrufsformular: '/rechtliches/widerrufsformular',
  newsletter: '/rechtliches/newsletter', kuendigen: '/kuendigen', widerrufen: '/widerrufen',
});

// Pro: Preis und Laufzeit (muessen zu plan_prices/Stripe passen; der Checkout gleicht sie vor jeder Sitzung ab).
export const PRO_TERMS = Object.freeze({amount: 100, currency: 'EUR', interval: 'month', label: '1,00 € pro Monat inkl. gesetzlicher Umsatzsteuer'});

export const DOCS = {
  impressum: {
    title: 'Impressum',
    blocks: [
      {p: 'Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG) und § 18 Abs. 2 Medienstaatsvertrag (MStV)'},
      {p: `**${C.name}**\n${C.street}\n${C.city}\n${C.country}`},
      {p: `Vertreten durch: ${C.representative}`},
      {p: `E-Mail: ${C.email}\nTelefon: ${C.phone || OPEN('Telefonnummer oder ein weiterer schneller, unmittelbarer Kontaktweg (§ 5 Abs. 1 Nr. 2 DDG) – keine Angabe in den vorhandenen Quellen')}`},
      {p: `Handelsregister: ${C.register}\nSteuernummer: ${C.taxNumber}\nUmsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ${C.vatId || OPEN('USt-IdNr. – sofern erteilt; keine Angabe in den vorhandenen Quellen')}`},
      {p: `Verantwortlich für journalistisch-redaktionelle Inhalte gemäß § 18 Abs. 2 MStV: Ralf Andreas Müller, ${C.street}, ${C.city}`},
      {h: 'Angebot'},
      {p: 'Vision Universe ist eine Research-Plattform für Aktien als Web-App unter research.visionuniverse.de. Konten, Abonnements und Zahlungen werden über konto.visionuniverse.de abgewickelt. Vertragspartner und Zahlungsempfänger ist die oben genannte RAM Consulting UG (haftungsbeschränkt).'},
      {h: 'Hinweis zu Finanzinformationen'},
      {p: 'Die Inhalte dienen der allgemeinen Information. Sie sind keine Anlage-, Steuer- oder Rechtsberatung und keine Aufforderung zum Kauf oder Verkauf von Wertpapieren. Kapitalanlagen können bis zum Totalverlust führen; vergangene Wertentwicklungen sind kein verlässlicher Indikator für künftige Ergebnisse.'},
      {h: 'Verbraucherstreitbeilegung'},
      {p: `Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. ${CHECK('Erklärung bestätigen (§ 36 VSBG)')}`},
    ],
  },

  agb: {
    title: 'Nutzungs- und Vertragsbedingungen (Free und Pro)',
    blocks: [
      {h: '1. Anbieter, Geltungsbereich'},
      {p: `Anbieter und dein Vertragspartner ist die ${ADDRESS}, vertreten durch ${C.representative}, ${C.register}, E-Mail ${C.email}. Sie handelt unter der Marke Vision Universe.`},
      {p: 'Diese Bedingungen gelten für die Nutzung von Vision Universe mit einem Konto (Tarif „Free“) und für das kostenpflichtige Abonnement „Vision Universe Pro“. Abweichende Bedingungen von Kundinnen und Kunden gelten nicht.'},
      {p: `Das Angebot richtet sich an Verbraucherinnen und Verbraucher sowie an Unternehmer. Ein Konto darf nur anlegen, wer mindestens 18 Jahre alt ist. ${CHECK('Kundenkreis und Mindestalter bestätigen')}`},
      {h: '2. Leistungen'},
      {p: 'Vision Universe stellt über die Web-App research.visionuniverse.de Research-Inhalte zu Aktien, Märkten und Fonds bereit (u. a. die Produktwelten Discover, Quant, Fundamental, Technical, Screener, Supertrader), dazu ein persönliches Dashboard mit Watchlist. Welche Funktionen ein Tarif umfasst, zeigt die Tarifübersicht vor Vertragsschluss.'},
      {p: '**Free und Pro haben derzeit denselben Funktionsumfang.** Pro ist ein freiwilliges, kostenpflichtiges Abonnement, mit dem du Vision Universe unterstützt. Funktionen, die noch nicht freigegeben sind (z. B. ein Quant-Gesamtscore oder unveröffentlichte Supertrader-Signale), sind in keinem Tarif enthalten.'},
      {p: 'Die Inhalte dienen der allgemeinen Information. Sie sind keine Anlageberatung und keine auf deine persönliche Situation abgestimmte Empfehlung. Anlageentscheidungen triffst du selbst und in eigener Verantwortung. Gesetzliche Ansprüche wegen nicht vertragsgemäßer Leistungen bleiben unberührt.'},
      {p: 'Wir bemühen uns um eine hohe Verfügbarkeit; eine bestimmte Verfügbarkeit ist nicht vereinbart. Daten aus öffentlichen und lizenzierten Quellen können verzögert, unvollständig oder vorübergehend nicht verfügbar sein; die Seiten weisen den jeweiligen Datenstand aus.'},
      {h: '3. Konto und Vertragsschluss Free'},
      {p: 'Mit dem Absenden der Registrierung gibst du ein Angebot auf Abschluss eines unentgeltlichen Nutzungsvertrags ab. Der Vertrag kommt zustande, wenn du deine E-Mail-Adresse über den zugesandten Link bestätigst. Halte deine Zugangsdaten geheim; ein Konto ist persönlich und nicht übertragbar.'},
      {p: 'Free ist kostenlos und ohne Zahlungsdaten nutzbar. Ein Free-Konto wird nie ohne deine ausdrückliche Bestellung kostenpflichtig.'},
      {h: '4. Bestellung und Vertragsschluss Pro'},
      {p: 'Pro kann nur mit einem bestätigten, angemeldeten Konto bestellt werden. Der Ablauf: (1) „Pro auswählen“, (2) Prüfung der Bestellübersicht mit Preis, Laufzeit, Kündigung und Widerrufsfolgen und Bestätigung per Haken, (3) „Weiter zur Zahlung bei Stripe“, (4) auf der Zahlungsseite von Stripe Auswahl der Zahlungsart und Klick auf die Bestellschaltfläche. Bis dahin kannst du Eingaben jederzeit über „Zurück“ oder den Abbruch korrigieren.'},
      {p: `Mit dem Klick auf die zahlungspflichtige Bestellschaltfläche auf der Stripe-Zahlungsseite gibst du ein verbindliches Angebot ab. Der Vertrag kommt zustande, wenn die Zahlungsseite den Abschluss bestätigt. Wir senden dir danach eine Vertragsbestätigung mit diesen Bedingungen und der Widerrufsbelehrung per E-Mail. ${CHECK('Beschriftung der letzten Schaltfläche bei Stripe („Abonnieren“) und ergänzender Hinweistext nach § 312j Abs. 3 BGB')}`},
      {p: 'Vertragssprache ist Deutsch. Den Vertragstext speichern wir nicht gesondert für dich abrufbar; du erhältst ihn mit der Vertragsbestätigung per E-Mail. Die jeweils aktuelle Fassung findest du unter [konto.visionuniverse.de/rechtliches/agb](/rechtliches/agb).'},
      {h: '5. Preis, Zahlung, Rechnung'},
      {p: `Pro kostet ${PRO_TERMS.label} (Bruttopreis; der Betrag enthält die Umsatzsteuer und wird nicht zusätzlich erhöht). Weitere Kosten fallen nicht an.`},
      {p: 'Der Betrag ist jeweils zu Beginn eines Abrechnungsmonats im Voraus fällig. Die Zahlung wickelt die Stripe Payments Europe, Ltd. (Irland) ab. Welche Zahlungsarten angeboten werden (z. B. Karte, Apple Pay, Google Pay, PayPal, SEPA-Lastschrift, Klarna, Link), richtet sich nach deinem Gerät, deinem Land und der Eignung der Zahlungsart für wiederkehrende Zahlungen; angezeigt werden nur die jeweils zugelassenen.'},
      {p: 'Bei SEPA-Lastschrift wird die erste Zahlung erst nach einigen Bankarbeitstagen bestätigt; bis dahin gilt Free. Schlägt eine Zahlung fehl, versucht Stripe den Einzug erneut; du erhältst einen Hinweis und kannst die Zahlungsart im Kundenportal ändern. Bleibt die Zahlung aus, endet der Pro-Zugang; dein Konto gilt dann als Free.'},
      {p: `Rechnungen stellt die ${C.name} elektronisch aus; sie stehen im Konto unter „Abonnement“ und im Kundenportal bereit.`},
      {h: '6. Laufzeit, Verlängerung, Kündigung'},
      {p: 'Das Pro-Abonnement beginnt mit dem Vertragsschluss und läuft jeweils einen Monat. Es verlängert sich automatisch um einen weiteren Monat, wenn es nicht bis zum Ende des laufenden Monats gekündigt wird. Du kannst jederzeit zum Ende des bezahlten Monats kündigen; bis dahin bleibt Pro erhalten, danach gilt automatisch Free. Bereits bezahlte Monate werden bei einer ordentlichen Kündigung nicht anteilig erstattet.'},
      {p: 'Kündigen kannst du ohne Anmeldung über [Verträge hier kündigen](/kuendigen), angemeldet im Konto unter „Abonnement“ (Kundenportal) oder per E-Mail. Du erhältst eine Eingangsbestätigung mit Inhalt, Datum und Uhrzeit und den Zeitpunkt der Beendigung. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.'},
      {p: 'Kündigung, Widerruf, Löschung des Kontos und Abmeldung vom Newsletter sind getrennte Vorgänge. Mit der Kündigung von Pro bleibt dein Konto als Free bestehen; dein Konto kannst du jederzeit in den Einstellungen löschen.'},
      {h: '7. Widerrufsrecht'},
      {p: 'Verbraucherinnen und Verbrauchern steht ein Widerrufsrecht nach Maßgabe der [Widerrufsbelehrung](/rechtliches/widerrufsbelehrung) zu. Für den Widerruf gibt es die Funktion [Vertrag widerrufen](/widerrufen).'},
      {h: '8. Nutzungsrechte, Pflichten'},
      {p: 'Während der Vertragslaufzeit darfst du die Inhalte für eigene, nicht gewerbliche Zwecke nutzen. Rechte an Software, Texten, Daten, Grafiken und Marken bleiben bei uns bzw. den jeweiligen Rechteinhabern. Nicht erlaubt sind insbesondere das automatisierte Auslesen, die Weitergabe von Zugangsdaten und die Umgehung technischer Schutzmaßnahmen.'},
      {p: `Bei schwerwiegenden Verstößen können wir das Konto nach vorheriger Abmahnung sperren oder außerordentlich kündigen, soweit gesetzlich zulässig. ${CHECK('Sanktionsregel verhältnismäßig ausgestalten')}`},
      {h: '9. Änderungen der Leistung und dieser Bedingungen'},
      {p: `Wir halten die Leistungen vertragsgemäß und stellen Aktualisierungen bereit, soweit gesetzlich vorgeschrieben. Änderungen über das zur Erhaltung der Vertragsmäßigkeit Erforderliche hinaus nehmen wir nur unter den Voraussetzungen des § 327r BGB vor und teilen sie rechtzeitig auf einem dauerhaften Datenträger mit; dir steht dann gegebenenfalls ein Kündigungsrecht zu. Preisänderungen für laufende Abonnements erfolgen nur mit deiner Zustimmung. ${CHECK('Änderungsklausel')}`},
      {h: '10. Haftung'},
      {p: 'Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz und im Umfang einer übernommenen Garantie. Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht (einer Pflicht, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags erst ermöglicht und auf deren Einhaltung du regelmäßig vertrauen darfst) ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung für leichte Fahrlässigkeit ausgeschlossen. Gesetzliche Rechte bei digitalen Produkten (§§ 327 ff. BGB) bleiben unberührt.'},
      {h: '11. Datenschutz, Newsletter'},
      {p: 'Wie wir personenbezogene Daten verarbeiten, steht in der [Datenschutzerklärung](/rechtliches/datenschutz). Der Newsletter ist freiwillig, setzt eine eigene, per E-Mail bestätigte Einwilligung voraus und ist keine Voraussetzung für Free oder Pro.'},
      {h: '12. Schlussbestimmungen'},
      {p: 'Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Bei Verbraucherinnen und Verbrauchern gilt diese Rechtswahl nur, soweit dadurch der Schutz zwingender Bestimmungen des Staates ihres gewöhnlichen Aufenthalts nicht entzogen wird. Ist die Kundin oder der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand Heilbronn.'},
    ],
  },

  widerrufsbelehrung: {
    title: 'Widerrufsbelehrung für Vision Universe Pro',
    blocks: [
      {note: `Einordnung: Vision Universe Pro wird als Vertrag über eine fortlaufend erbrachte digitale Dienstleistung behandelt (Zugang zu einer laufend aktualisierten Research-Plattform). ${CHECK('Einordnung digitale Dienstleistung vs. digitale Inhalte (§ 356 Abs. 4/5 BGB in der seit 19.06.2026 geltenden Fassung) und Übereinstimmung mit der aktuellen Muster-Widerrufsbelehrung (Anlage 1 zu Art. 246a § 1 Abs. 2 EGBGB)')}`},
      {h: 'Widerrufsrecht'},
      {p: 'Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.'},
      {p: `Um dein Widerrufsrecht auszuüben, musst du uns (${ADDRESS}, E-Mail: ${C.email}${C.phone ? ', Telefon: ' + C.phone : ''}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über deinen Entschluss, diesen Vertrag zu widerrufen, informieren. Du kannst dafür das [Muster-Widerrufsformular](/rechtliches/widerrufsformular) verwenden, das jedoch nicht vorgeschrieben ist.`},
      {p: 'Du kannst den Widerruf auch online über unsere Widerrufsfunktion **[Vertrag widerrufen](/widerrufen)** erklären. Nutzt du diese Möglichkeit, übermitteln wir dir unverzüglich eine Bestätigung über den Eingang des Widerrufs mit seinem Inhalt sowie Datum und Uhrzeit des Eingangs per E-Mail.'},
      {p: 'Zur Wahrung der Widerrufsfrist reicht es aus, dass du die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absendest.'},
      {h: 'Folgen des Widerrufs'},
      {p: 'Wenn du diesen Vertrag widerrufst, haben wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über deinen Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das du bei der ursprünglichen Transaktion eingesetzt hast, es sei denn, mit dir wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden dir wegen dieser Rückzahlung Entgelte berechnet.'},
      {p: 'Hast du verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so hast du uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem du uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichtest, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.'},
      {h: 'Hinweis'},
      {p: 'Den sofortigen Beginn verlangst du in der Bestellübersicht ausdrücklich (Haken vor „Weiter zur Zahlung bei Stripe“). Nach einem Widerruf endet Pro sofort; dein Konto bleibt als Free bestehen. Der Widerruf ist von der Kündigung zum Monatsende zu unterscheiden.'},
      {p: 'Ende der Widerrufsbelehrung'},
    ],
  },

  widerrufsformular: {
    title: 'Muster-Widerrufsformular',
    blocks: [
      {p: '(Wenn du den Vertrag widerrufen willst, dann fülle bitte dieses Formular aus und sende es zurück. Schneller geht es online über [Vertrag widerrufen](/widerrufen).)'},
      {p: `– An ${ADDRESS}, E-Mail: ${C.email}:`},
      {p: '– Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)'},
      {p: '– Bestellt am (*)/erhalten am (*)'},
      {p: '– Name des/der Verbraucher(s)'},
      {p: '– Anschrift des/der Verbraucher(s)'},
      {p: '– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)'},
      {p: '– Datum'},
      {p: '(*) Unzutreffendes streichen.'},
    ],
  },

  datenschutz: {
    title: 'Datenschutzerklärung',
    blocks: [
      {h: '1. Verantwortlicher'},
      {p: `${ADDRESS}, vertreten durch ${C.representative}, E-Mail ${C.email}. ${OPEN('Datenschutzbeauftragter – benannt oder nicht erforderlich (Art. 37 DSGVO, § 38 BDSG)')}`},
      {h: '2. Überblick'},
      {p: 'Vision Universe besteht aus der Web-App research.visionuniverse.de (statische Seiten) und dem Konto-Dienst konto.visionuniverse.de (Anmeldung, Konto, Abonnement). Wir verarbeiten nur, was Konto, Vertrag und Sicherheit erfordern, und – mit Einwilligung – den Newsletter. Wir setzen keine Werbe- oder Analyse-Tracker ein.'},
      {h: '3. Aufruf der Website'},
      {p: `Beim Aufruf verarbeiten die Hosting-Dienstleister technisch notwendige Verbindungsdaten (IP-Adresse, Zeitpunkt, angefragte Adresse, Browserkennung) zur Auslieferung und Absicherung (Art. 6 Abs. 1 lit. f DSGVO; berechtigtes Interesse am sicheren Betrieb). Hosting: GitHub Pages (GitHub, Inc., USA) für research.visionuniverse.de, Cloudflare, Inc. (USA) für DNS, Schutz und den Konto-Dienst. ${CHECK('Auftragsverarbeitungsverträge, Datenschutzrahmen (EU-US Data Privacy Framework/Standardvertragsklauseln) und Protokollfristen der Anbieter bestätigen')}`},
      {p: `Im Browser speichern wir Einstellungen (z. B. Hell/Dunkel, Ansichten, lokal gemerkte Aktien) im lokalen Speicher deines Geräts; sie werden nicht an uns übertragen. Das ist für die von dir gewünschte Funktion erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). ${CHECK('Seite /analysten/ lädt Schriften von Google Fonts (Google Ireland Ltd.) – lokal einbinden oder hier aufführen')}`},
      {h: '4. Konto'},
      {p: 'Für ein Konto verarbeiten wir E-Mail-Adresse, Passwort (nur als Hash), optional einen Anzeigenamen, Einstellungen, Zeitpunkt der Zustimmung zu den Bedingungen, deine Watchlist und deine Tarifwahl. Rechtsgrundlage ist die Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO). Anmeldung und Datenbank betreibt Supabase, Inc. als Auftragsverarbeiter mit Datenspeicherung in Frankfurt am Main (EU). Die Anmeldung hält eine Sitzung in technisch notwendigen Cookies auf konto.visionuniverse.de (§ 25 Abs. 2 Nr. 2 TDDDG). Zum Schutz vor Missbrauch verarbeiten wir die IP-Adresse kurzzeitig für Ratenbegrenzungen (Art. 6 Abs. 1 lit. f DSGVO).'},
      {h: '5. Abonnement und Zahlung'},
      {p: 'Für Pro verarbeiten wir Abonnementstatus, Laufzeit, Rechnungen und die Kundennummer beim Zahlungsdienstleister. Zahlungsdaten (Karte, Konto, PayPal) erhalten wir nicht; sie verarbeitet die Stripe Payments Europe, Ltd. (Irland), bei PayPal zusätzlich die PayPal (Europe) S.à r.l. et Cie, S.C.A. (Luxemburg), bei Klarna die Klarna Bank AB (Schweden), jeweils auch in eigener Verantwortung. Rechtsgrundlagen: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und gesetzliche Aufbewahrungspflichten (Art. 6 Abs. 1 lit. c DSGVO, § 147 AO, § 257 HGB).'},
      {h: '6. E-Mails zum Vertrag'},
      {p: `Bestätigungen (Registrierung, Passwort, Vertrag, Kündigung, Widerruf) versenden wir über Brevo (Sendinblue SAS, Frankreich) als Auftragsverarbeiter (Art. 6 Abs. 1 lit. b, c DSGVO). Zur Kommunikation über dein Konto und deinen Vertrag (z. B. Hinweise zu Änderungen der Bedingungen, Sicherheit, Störungen) führen wir bei Brevo eine Kontaktliste „Vision Universe App – Nutzer“ mit E-Mail-Adresse und Tarif (Free/Pro). Diese Liste dient nicht der Werbung. ${CHECK('Rechtsgrundlage Art. 6 Abs. 1 lit. b bzw. f DSGVO für die Kontaktliste')}`},
      {h: '7. Newsletter (nur mit Einwilligung)'},
      {p: 'Den Newsletter erhältst du nur, wenn du ihn freiwillig bestellst (Haken bei der Registrierung oder in den Einstellungen) und die Anmeldung über den Link in unserer E-Mail bestätigst (Double-Opt-in). Wir speichern Zeitpunkt der Anforderung und Bestätigung sowie die Fassung des Einwilligungstexts; Brevo protokolliert die Bestätigung. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit über den Abmeldelink oder in den Einstellungen widerrufen kannst. Einzelheiten: [Datenschutzhinweise zum Newsletter](/rechtliches/newsletter).'},
      {h: '8. Kündigung und Widerruf'},
      {p: 'Erklärungen über die Kündigungs- und die Widerrufsfunktion speichern wir mit Inhalt, Zeitpunkt und Bearbeitungsstand als Nachweis (Art. 6 Abs. 1 lit. c, f DSGVO).'},
      {h: '9. Speicherdauer'},
      {p: `Kontodaten speichern wir bis zur Löschung des Kontos. Rechnungs- und Buchungsdaten bewahren wir pseudonymisiert für die gesetzlichen Fristen auf (bis zu zehn Jahre, für Buchungsbelege acht Jahre). Nachweise über Kündigungen und Widerrufe bewahren wir bis zum Ablauf der Verjährung auf. Newsletter-Einwilligungen speichern wir bis zum Widerruf und danach als Nachweis, solange Ansprüche geltend gemacht werden können. ${CHECK('Fristen festlegen')}`},
      {h: '10. Empfänger in Drittländern'},
      {p: `Einige Dienstleister (GitHub, Cloudflare, Supabase, Stripe) haben ihren Sitz in den USA oder gehören zu US-Konzernen. Übermittlungen erfolgen auf Grundlage des EU-US Data Privacy Framework bzw. von Standardvertragsklauseln. ${CHECK('Je Anbieter Zertifizierung bzw. Klauseln bestätigen')}`},
      {h: '11. Deine Rechte'},
      {p: 'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie das Recht, eine erteilte Einwilligung jederzeit zu widerrufen. Datenexport und Kontolöschung findest du im Konto unter „Einstellungen“. Du kannst dich bei einer Datenschutzaufsichtsbehörde beschweren, z. B. beim Landesbeauftragten für den Datenschutz und die Informationsfreiheit Baden-Württemberg.'},
      {h: '12. Pflicht zur Bereitstellung'},
      {p: 'Ohne E-Mail-Adresse und Passwort kann kein Konto geführt werden. Der Newsletter ist freiwillig.'},
    ],
  },

  newsletter: {
    title: 'Datenschutzhinweise und Einwilligung: Newsletter',
    blocks: [
      {p: '**Einwilligungstext (Fassung vu-newsletter-v1):** „Ich möchte den Vision-Universe-Newsletter per E-Mail erhalten: Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Ich kann mich jederzeit über den Abmeldelink abmelden.“'},
      {p: 'Die Bestellung ist freiwillig und keine Voraussetzung für Free oder Pro. Erst nach Klick auf den Bestätigungslink in unserer E-Mail (Double-Opt-in) erhältst du den Newsletter. Ohne Bestätigung senden wir keine Werbung; die Anforderung verfällt.'},
      {p: 'Versanddienstleister ist Brevo (Sendinblue SAS, Frankreich). Wir speichern E-Mail-Adresse, Zeitpunkt der Anforderung und Bestätigung und die Fassung des Einwilligungstexts; Brevo protokolliert die Bestätigung des Links. Öffnungs- und Klickmessung ist ohne gesonderte Einwilligung ausgeschaltet.'},
      {p: 'Abmelden kannst du dich jederzeit über den Link in jeder Newsletter-E-Mail oder im Konto unter „Einstellungen“. Die Abmeldung wird automatisch übernommen; dein Konto und dein Tarif bleiben davon unberührt.'},
    ],
  },
};

// Kurzfassung der Vertragsbestaetigung (E-Mail): Bedingungen und Belehrung vollstaendig als Text.
export function plainText(doc) {
  return DOCS[doc].blocks.map(b => {
    const t = (b.h || b.p || b.note || (b.ul || []).map(x => '• ' + x).join('\n'))
      .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\((\/[^)]*)\)/g, `$1 (${LEGAL_BASE}$2)`).replace(/\[([^\]]+)\]\((https:[^)]*)\)/g, '$1 ($2)');
    return b.h ? `\n${t.toUpperCase()}` : t;
  }).join('\n\n');
}
