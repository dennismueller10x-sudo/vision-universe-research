"""Maskiert Secret-Werte in einem Textstrom (stdin -> stdout).

Maskiert werden:
- die Werte aller Umgebungsvariablen aus VU_SECRET_VARS (ab 6 Zeichen),
- URL-Zugangsdaten der Form scheme://user:pass@host,
- typische Token-Formen (GitHub-PATs, Bearer-Kopfzeilen, api-key-Kopfzeilen).
"""
import os
import re
import sys

values = []
for name in os.environ.get("VU_SECRET_VARS", "").split():
    value = os.environ.get(name, "")
    if len(value) >= 6:
        values.append(value)
values.sort(key=len, reverse=True)

patterns = [
    (re.compile(r"(\w+://)[^/\s:@]+:[^/\s@]+@"), r"\1***:***@"),
    (re.compile(r"\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{10,}"), "***"),
    (re.compile(r"(?i)(authorization:\s*(bearer|basic|token)\s+)\S+"), r"\1***"),
    (re.compile(r"(?i)(api-key:\s*)\S+"), r"\1***"),
    (re.compile(r"\bxkeysib-[A-Za-z0-9-]{10,}"), "***"),
]

for line in sys.stdin:
    for value in values:
        line = line.replace(value, "***")
    for pattern, repl in patterns:
        line = pattern.sub(repl, line)
    sys.stdout.write(line)
    sys.stdout.flush()
