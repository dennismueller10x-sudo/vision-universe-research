"""Packt die Praesentation in eine einzige HTML-Datei (Skripte und Bilder eingebettet).
Aufruf: python3 docs/design/discover-netflix-2026-11/bundle.py <ziel.html>"""
import base64, glob, os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(D, 'index.html')).read()
imgs = {}
used = set()
files = glob.glob(D + '/img/logos/*.png') + [D + '/img/themen/%s.webp' % k for k in used] + [D + '/img/vision-universe-logo-web.png', D + '/img/vu-logo.png'] + glob.glob(D + '/now/*.jpg')
mime = {'.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg'}
for f in files:
    rel = os.path.relpath(f, D)
    imgs[rel] = 'data:%s;base64,%s' % (mime[os.path.splitext(f)[1]], base64.b64encode(open(f, 'rb').read()).decode())
def inline(m):
    return '<script>\n' + open(os.path.join(D, m.group(1))).read().replace('</script', '<\\/script') + '\n</script>'
html = re.sub(r'<script src="([^"]+)" charset="utf-8"></script>', inline, html)
import json
html = html.replace('<main id="deck"></main>', '<main id="deck"></main>\n<script>window.__IMG=' + json.dumps(imgs) + ';</script>', 1)
open(sys.argv[1], 'w').write(html)
print(len(html), 'Bytes,', len(imgs), 'Bilder')
