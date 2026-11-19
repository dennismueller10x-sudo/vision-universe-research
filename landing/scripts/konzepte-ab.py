# Erzeugt landing/konzepte/{a,b,index.html} (Konzeptpräsentation, nur Branch-Vorschau). Aufruf: python3 landing/scripts/konzepte-ab.py
import json, re, os, html as H
L = '/home/user/vision-universe-research/landing'
idx = open(L + '/index.html').read()
sprite = re.search(r'<svg width="0" height="0"[\s\S]*?</svg>', idx).group(0)
art = json.load(open(L + '/../insights/artikel.json'))
news = [a for a in art['artikel'] if os.path.exists(f"{L}/web/img/news/art-{a['slug']}.jpg")][:6]
mag, rep = art['magazin'][0], art['reports'][0]
R = '../../'
RES = 'https://research.visionuniverse.de'
def dmy(s): y, m, d = s.split('-'); return f'{d}.{m}.{y}'
e = H.escape
PROD = [
 ('discover','discover','Discover','Das Netflix der Aktienwelt','Wisch dich durch die Börse, Aktie für Aktie.'),
 ('fundamental','fundamental','Fundamental','Wie steht die Firma da?','Umsatz, Gewinn, Schulden – einfach erklärt.'),
 ('technical','technical','Technical','Wohin läuft der Kurs?','Trend und Muster in einem Satz.'),
 ('supertrader','supertrader','Supertrader','Wie die Profis prüfen','Mit den Methoden der besten Trader.'),
 ('vorsorge','vorsorge','Vorsorge','Was wird aus meiner Rente?','Altersvorsorgedepot einfach erklärt.'),
 ('atlas','ai','Vision Universe AI','Frag in deinen Worten','Antwort mit Quelle zu jeder Zahl.'),
 ('screener','screener','Screener','Aktien nach deinen Regeln','Filter setzen, Treffer sehen.'),
 ('quant','quant','Quant','Das Zeugnis jeder Aktie','Eigenschaften von 0 bis 100.'),
 ('hedgefonds','hedgefonds','Hedgefonds','Was große Fonds melden','Käufe und Verkäufe der Profis.'),
 ('elliott','elliott','Elliott','Wellen im Chart','Die Elliott-Methode, verständlich.'),
 ('portfolios','portfolios','Portfolios','Musterdepots nach Regeln','Wie eine Methode im Depot aussieht.'),
]
FILMS = [('discover','Discover'),('fundamental','Fundamental'),('technical','Technical'),('supertrader','Supertrader'),('vorsorge','Vorsorge'),('atlas','Vision Universe AI'),('screener','Screener'),('quant','Quant'),('hedgefonds','Hedgefonds'),('elliott','Elliott')]
ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h14M12.5 6l6 6-6 6"/></svg>'
STORES = f'<span class="kx-stores"><img src="{R}web/img/badge-apple.svg" alt="Laden im App Store (bald verfügbar)" width="120" height="40"><img src="{R}web/img/badge-google.png" alt="Jetzt bei Google Play (bald verfügbar)" width="646" height="192"></span>'
def head(title, cls):
    return f'''<!doctype html>
<html lang="de" class="kx {cls}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{title}</title>
<link rel="icon" href="{R}assets/icon-192.png" type="image/png">
<link rel="stylesheet" href="{R}web/site.css">
<link rel="stylesheet" href="{R}web/konzepte-ab.css">
<script src="{R}web/konzepte-ab.js" defer></script>
</head>
<body>
{sprite}
'''
def menu_card():
    prods = ''.join(f'<a href="{R}produkte/{p[0]}/"><svg aria-hidden="true"><use href="#{p[0]}"/></svg>{e(p[2])}</a>' for p in PROD)
    return f'''<div class="kx-menu" id="kx-menu" hidden><p class="kx-mg">App</p><a class="kx-big" href="{R}app/">Die App</a><a class="kx-big" href="{R}start/">Zum Start anmelden</a>
<p class="kx-mg">Produkte</p><div class="kx-prods">{prods}</div>
<p class="kx-mg">Lesen</p><a class="kx-big" href="{R}news/">News</a><a class="kx-big" href="{R}magazin/">Aktienmagazin</a><a class="kx-big" href="{R}report/">Aktienreports</a>
<p class="kx-mg">Hilfe</p><a class="kx-big" href="#fragen">Fragen und Antworten</a></div>'''
def pill():
    return f'''<div class="kx-pill"><button type="button" class="kx-mbtn" aria-expanded="false" aria-controls="kx-menu"><i aria-hidden="true"></i><span>Menü</span></button><a class="kx-cta" href="#anmelden">Benachrichtigen</a>{menu_card()}</div>'''
def badge(name, other):
    return f'<a class="kz-badge" href="../">{name} <span>‹ zur Übersicht</span></a>'
def rowhead(title, sub=''):
    return f'<div class="kx-rh"><div><h2>{title}</h2>{f"<p>{sub}</p>" if sub else ""}</div><div class="kx-arrows"><button type="button" data-dir="-1" aria-label="Zurück">‹</button><button type="button" data-dir="1" aria-label="Weiter">›</button></div></div>'
def prod_cards():
    return ''.join(f'''<a class="kx-pc" href="{R}produkte/{p[0]}/"><img src="{R}web/img/app/{p[1]}.jpg" alt="" loading="lazy"><span class="kx-pc-t"><span class="kx-ic"><svg aria-hidden="true"><use href="#{p[0]}"/></svg></span><small>{e(p[2])}</small><b>{e(p[3])}</b><em>{e(p[4])}</em></span></a>''' for p in PROD)
def news_cards():
    out = f'''<a class="kx-nc kx-mag" href="{R}magazin/"><img src="{R}web/img/news/mag-{mag['nr']}-cover.jpg" alt="" loading="lazy"><span><small>Aktienmagazin · KW {mag['kw']}</small><b>{e(mag['titel'])}</b><em>{mag['seiten']} Seiten · bald in der App</em></span></a>'''
    rid = rep['href'].rstrip('/').split('/')[-1]
    out += f'''<a class="kx-nc kx-mag" href="{R}report/"><img src="{R}web/img/news/rep-{rid}-cover.jpg" alt="" loading="lazy"><span><small>Aktienreport · Nr. 01</small><b>{e(rep['titel'])}</b><em>bald in der App</em></span></a>'''
    out += ''.join(f'''<a class="kx-nc" href="{RES}{a['href']}"><img src="{R}web/img/news/art-{a['slug']}.jpg" alt="" loading="lazy"><span><small>{e(a['rubrik'])} · {dmy(a['datum'])}</small><b>{e(a['titel'])}</b></span></a>''' for a in news)
    return out
def film_cards():
    return ''.join(f'''<button type="button" class="kx-fc" data-vid="{R}partner/media/{f}.mp4"><img src="{R}partner/media/{f}.jpg" alt="" loading="lazy"><span>▶ {e(n)}</span></button>''' for f, n in FILMS)
def signup(dark=True):
    return f'''<section class="kx-join {'dark' if dark else ''}" id="anmelden"><div class="w"><div class="kx-join-in"><p class="kx-k">Bald im App Store und bei Google Play</p><h2>Sei beim <mark>Start</mark> dabei.</h2><p class="kx-sub">Eine E-Mail, sobald die App da ist. Kostenlos, jederzeit abbestellbar.</p>
<div class="kx-form" aria-hidden="true"><span>Deine E-Mail-Adresse</span><a href="{R}start/#anmelden">Benachrichtigen {ARROW}</a></div><p class="kx-note">Im Entwurf führt der Knopf zur echten Anmeldung auf der Landingpage.</p>{STORES}</div></div></section>'''
FAQ = [('Was kostet die App?','Zum Start ist sie kostenlos. Später gibt es zusätzlich ein Pro-Abo.'),('Ist das Anlageberatung?','Nein. Vision Universe ist eine Software, die Aktien nach festen, offenen Regeln analysiert und erklärt. Keine Anlageberatung, keine Empfehlung.'),('Wann kommt die App?','Bald im App Store und bei Google Play. Trag dich ein, dann sagen wir dir Bescheid.')]
def faq():
    return '<section class="kx-faq" id="fragen"><div class="w"><h2>Fragen und Antworten</h2>' + ''.join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in FAQ) + '</div></section>'
def foot():
    return f'''<footer class="kx-foot"><div class="w"><img class="logo" src="{R}assets/vision-universe-logo-web.png" alt="Vision Universe" width="1086" height="362"><p>© 2026 Vision Universe® · Keine Anlageberatung, keine Empfehlung.</p><nav><a href="{R}impressum/">Impressum</a><a href="{R}datenschutz/">Datenschutz</a><a href="{R}news/">News</a><a href="{R}app/">Die App</a></nav></div></footer>'''
def phone(img):
    ahdr = re.search(r'<div class="ahdr">[\s\S]*?</span></div>', idx).group(0)
    return f'<div class="aphone"><div class="in">{ahdr}<div class="scr"><img src="{R}web/img/app/{img}.jpg" alt=""></div><img class="adock" src="{R}web/img/app/dock.png" alt=""></div></div>'

# ---------- Konzept A ----------
A = head('Konzept A · Netflix der Aktienwelt · Vision Universe', 'kx-a') + f'''<a class="kz-badge" href="../">Konzept A · Netflix der Aktienwelt <span>‹ Übersicht</span></a>
<header class="kx-head"><div class="w"><a href="{R}" aria-label="Startseite"><img class="logo" src="{R}assets/vision-universe-logo-web.png" alt="Vision Universe" width="1086" height="362"></a>{pill()}</div></header>
<main>
<section class="kx-hero"><div class="w">
<h1>Aktien <span class="kx-chip"><img src="{R}web/img/app/apple.jpg" alt=""></span> und Finanzen <span class="kx-chip kx-chip-lime"><svg aria-hidden="true"><use href="#atlas"/></svg>KI</span> <mark>richtig</mark> <span class="kx-chips"><img src="{R}web/img/app/discover.jpg" alt=""><img src="{R}web/img/app/technical.jpg" alt=""><img src="{R}web/img/app/vorsorge.jpg" alt=""></span> <mark>verstehen.</mark></h1>
<div class="kx-hero-b"><p>Die App, die dir jede Aktie in einfachen Sätzen erklärt. Bald für iPhone und Android, zum Start kostenlos.</p><div class="kx-acts"><a class="btn" href="#anmelden"><span>Zum Start benachrichtigen</span><span class="dot">{ARROW}</span></a>{STORES}</div></div>
<p class="kx-scroll">Scrollen ↓</p>
</div></section>
<section class="kx-reel"><div class="w"><div class="kx-video"><video src="{R}partner/media/start.mp4" poster="{R}partner/media/start.jpg" autoplay muted loop playsinline></video><span class="kx-video-t"><small>Vision Universe in 30 Sekunden</small><b>Eine App. Jede Aktie. Ein Satz.</b></span></div></div></section>
<section class="kx-row kx-dark"><div class="w">{rowhead('Die App', 'Elf Bereiche. Tipp auf eine Karte.')}<div class="kx-track">{prod_cards()}</div></div></section>
<section class="kx-row"><div class="w">{rowhead('Heute neu', f'Stand {dmy(news[0]["datum"])}')}<div class="kx-track kx-track-news">{news_cards()}</div></div></section>
<section class="kx-row kx-dark"><div class="w">{rowhead('In 30 Sekunden erklärt', 'Jeder Bereich als kurzer Film.')}<div class="kx-track">{film_cards()}</div></div></section>
{signup(True)}
{faq()}
</main>
{foot()}
</body></html>'''

# ---------- Konzept B ----------
SLIDES = [
 ('Discover','Das Netflix der Aktienwelt.','Wisch dich durch die Börse: Themen, Listen und jede Aktie auf einer Seite erklärt.','discover','produkte/discover/'),
 ('Vision Universe AI','Frag in deinen Worten.','„Welche Firmen sind günstig und haben kaum Schulden?“ – die Antwort kommt mit Quelle.','ai','produkte/atlas/'),
 ('Aktienmagazin',f'{mag["titel"]}.',f'Das Wochenheft, KW {mag["kw"]}: {mag["seiten"]} Seiten Börse, einfach erklärt. Bald in der App.','MAG','magazin/'),
 ('Vorsorge','Was wird aus meiner Rente?','Altersvorsorgedepot, Zulagen und Kosten – mit amtlichen Regeln einfach durchgerechnet.','vorsorge','produkte/vorsorge/'),
]
def slide(i, s):
    vis = f'<img class="kx-cover" src="{R}web/img/news/mag-{mag["nr"]}-cover.jpg" alt="">' if s[3] == 'MAG' else phone(s[3])
    return f'''<div class="kx-slide{' on' if i == 0 else ''}" data-i="{i}"><div class="w kx-slide-in"><div class="kx-slide-t"><p class="kx-k">{e(s[0])}</p><h1>{e(s[1])}</h1><p>{e(s[2])}</p><div class="kx-acts"><a class="btn kx-light" href="{R}{s[4]}"><span>Mehr erfahren</span><span class="dot">{ARROW}</span></a><a class="kx-ghost" href="#anmelden">Benachrichtigen</a></div></div><div class="kx-slide-v">{vis}</div></div></div>'''
lead = news[0]
B = head('Konzept B · Showcase · Vision Universe', 'kx-b') + f'''<a class="kz-badge" href="../">Konzept B · Showcase <span>‹ Übersicht</span></a>
<header class="kx-bar"><div class="w"><a href="{R}" aria-label="Startseite"><img class="logo inv" src="{R}assets/vision-universe-logo-web.png" alt="Vision Universe" width="1086" height="362"></a><nav class="kx-links"><a href="{R}app/">Die App</a><a href="{R}produkte/discover/">Produkte</a><a href="{R}news/">News</a><a href="{R}magazin/">Magazin</a><a href="{R}report/">Aktienreports</a></nav>{pill()}</div></header>
<main>
<section class="kx-show" aria-roledescription="Karussell" aria-label="Vision Universe">
{''.join(slide(i, s) for i, s in enumerate(SLIDES))}
<div class="w kx-dots">{''.join(f'<button type="button" data-go="{i}" aria-label="{e(s[0])}"><i></i><span>{e(s[0])}</span></button>' for i, s in enumerate(SLIDES))}<span class="kx-stores-w">{STORES}</span></div>
</section>
<section class="kx-feat"><div class="w"><div class="kx-rh"><div><h2>Neu bei Vision Universe</h2><p>Stand {dmy(lead['datum'])}</p></div><a class="kx-all" href="{R}news/">Alle News ›</a></div>
<div class="kx-feat-g"><a class="kx-feat-big" href="{RES}{lead['href']}"><img src="{R}web/img/news/art-{lead['slug']}.jpg" alt=""><span><small>{e(lead['rubrik'])} · {dmy(lead['datum'])}</small><b>{e(lead['titel'])}</b></span></a>
<div class="kx-feat-l">{''.join(f'<a href="{RES}{a["href"]}"><img src="{R}web/img/news/art-{a["slug"]}.jpg" alt="" loading="lazy"><span><small>{e(a["rubrik"])} · {dmy(a["datum"])}</small><b>{e(a["titel"])}</b></span></a>' for a in news[1:5])}</div></div></div></section>
<section class="kx-row"><div class="w">{rowhead('Alle Bereiche der App', 'Tipp auf eine Karte.')}<div class="kx-track kx-sq">{prod_cards()}</div></div></section>
<section class="kx-row kx-lesen"><div class="w">{rowhead('Lesen', 'Jede Woche neu.')}<div class="kx-track kx-track-news">{news_cards()}</div></div></section>
{signup(True)}
{faq()}
</main>
{foot()}
</body></html>'''

# ---------- Übersicht / Präsentation ----------
def card(id, name, lines, tag):
    return f'''<a class="kp-card" href="./{id}/"><span class="kp-shot"><img src="./{id}-desktop.jpg" alt="Vorschau {name} am Desktop"><img class="kp-m" src="./{id}-iphone.jpg" alt="Vorschau {name} am iPhone"></span><span class="kp-t"><small>{tag}</small><b>{name}</b>{''.join(f'<em>{l}</em>' for l in lines)}<span class="btn"><span>Konzept ansehen</span><span class="dot">{ARROW}</span></span></span></a>'''
P = f'''<!doctype html>
<html lang="de" class="kx kx-p"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Website-Konzepte · Vision Universe</title><link rel="stylesheet" href="../web/site.css"><link rel="stylesheet" href="../web/konzepte-ab.css"></head>
<body><main class="w kp">
<img class="logo" src="../assets/vision-universe-logo-web.png" alt="Vision Universe" width="1086" height="362">
<p class="kx-k">Konzeptpräsentation · 19.11.2026 · nur Vorschau, nicht live</p>
<h1>Weniger scrollen. <mark>Mehr Wow.</mark></h1>
<p class="kp-lead">Heute: zwei Menüleisten und zwölf lange Kapitel, rund 20 Bildschirmhöhen. Beide Konzepte bringen die Seite auf vier bis fünf Bildschirmhöhen – mit Reihen zum Wischen statt Kapiteln und einem Menü wie bei DLS: eine kleine Pille „Menü | Benachrichtigen“, die eine schwarze Karte aufklappt.</p>
<div class="kp-grid">
{card('a','Konzept A · Netflix der Aktienwelt',['Hell, ruhig, nah an DLS.','Riesen-Überschrift mit eingebetteten App-Bildern, darunter ein Film.','Vier Reihen zum Wischen: Die App · Heute neu · In 30 Sekunden erklärt · Anmeldung.'],'Empfehlung')}
{card('b','Konzept B · Showcase',['Filmisch, nah an Rockstar.','Großes Karussell oben: Discover, Vision Universe AI, Aktienmagazin, Vorsorge – schaltet von selbst weiter.','Darunter Aufmacher mit Liste, eine Reihe mit allen Bereichen und die Anmeldung.'],'Alternative')}
</div>
<h2>So vergleichst du</h2>
<ul class="kp-how"><li>Beide Konzepte am iPhone und am Laptop öffnen.</li><li>Menü oben rechts antippen.</li><li>In den Reihen zur Seite wischen (Desktop: Pfeile).</li><li>Bei B das Karussell ein paar Sekunden laufen lassen.</li></ul>
<h2>Frühere Varianten</h2>
<p class="kp-old"><a href="./s2/">S2 Startseite zweispaltig</a> · <a href="./l2/">L2 Landingpage zweispaltig</a> · <a href="./s1/">S1</a> · <a href="./s3/">S3</a> · <a href="./s4/">S4</a> · <a href="./s5/">S5</a> · <a href="./l1/">L1</a> · <a href="./l3/">L3</a> · <a href="./l4/">L4</a> · <a href="./l5/">L5</a></p>
<p class="kp-old">Aktuell live: <a href="../">Startseite</a> · <a href="../start/">Landingpage</a></p>
</main></body></html>'''

os.makedirs(L + '/konzepte/a', exist_ok=True); os.makedirs(L + '/konzepte/b', exist_ok=True)
open(L + '/konzepte/a/index.html', 'w').write(A)
open(L + '/konzepte/b/index.html', 'w').write(B)
open(L + '/konzepte/index.html', 'w').write(P)
print('ok', len(A), len(B))
