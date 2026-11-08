# Baut index.html aus body.html und slides.js; Stil und Symbole aus ../klarheit-2027/index.html und assets/product-icons.svg.
import re, pathlib
here = pathlib.Path(__file__).parent
old = (here / '../klarheit-2027/index.html').read_text(encoding='utf-8')
style = re.search(r'<style>(.*?)</style>', old, re.S).group(1)
sprite = re.search(r'(<svg width="0" height="0".*?</svg>)', old, re.S).group(1)
icons = (here / '../../../assets/product-icons.svg').read_text(encoding='utf-8')
icons = re.sub(r'<symbol id="', '<symbol id="p-', ''.join(re.findall(r'<symbol.*?</symbol>', icons, re.S)))
sprite = sprite.replace('</svg>', icons + '</svg>', 1) if False else sprite[:-6] + icons + '</svg>'
pager = re.search(r'(<div class="pager".*?</script>)', old, re.S).group(1)
extra = (here / 'extra.css').read_text(encoding='utf-8')
body = (here / 'body.html').read_text(encoding='utf-8')
js = (here / 'slides.js').read_text(encoding='utf-8')
html = f'''<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Vision Universe – Produkte 2027</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">
<style>{style}{extra}</style>
</head>
<body>
{sprite}
{body}
<script>{js}</script>
{pager}
</body>
</html>
'''
(here / 'index.html').write_text(html, encoding='utf-8')
print('ok', len(html))
