"""Soll der Consumer nach dem SEC-Tageslauf sofort neu gebaut werden?

Der Consumer (sec-consumer-fundamentals.yml) liefert Discover und den
Quant-Faktoren die Quartals- und Jahreszahlen. Er lief bisher nur montags;
ein 10-Q, der Dienstag einging, erschien dort erst am naechsten Montag
(Befund 18.11.2026, NVIDIA Q3 FY27). Der Tageslauf kennt die neuen
Einreichungen der Emittenten im Produktuniversum (latest-run.json,
`updated[].filings[]`). Enthalten sie einen Jahres- oder Quartalsbericht,
stoesst der Tageslauf den Consumer an. 8-K, Form 4 und andere Formulare
aendern die Zahlen nicht und loesen nichts aus.

Aufruf: consumer_trigger.py --run <latest-run.json>
Ausgabe (JSON auf stdout): {"trigger": bool, "ciks": [...], "forms": {...}}
"""
import argparse
import json
import sys

# Berichte, aus denen der Consumer Zahlen liest (Jahr, Quartal, auslaendische Emittenten).
REPORT_PREFIXES = ("10-K", "10-Q", "20-F", "40-F")


def is_report(form):
    return str(form or "").upper().startswith(REPORT_PREFIXES)


def decide(run):
    """Entscheidung aus dem Laufbericht. Trockenlauf und fehlgeschlagene Laeufe loesen nichts aus."""
    if run.get("DRY_RUN") or run.get("STATUS") == "FAILURE":
        return {"trigger": False, "ciks": [], "forms": {}, "reason": "dry-run oder fehlgeschlagen"}
    ciks, forms = [], {}
    for issuer in run.get("updated") or []:
        hit = [f.get("form") for f in issuer.get("filings") or [] if is_report(f.get("form"))]
        if hit:
            ciks.append(issuer.get("cik"))
            for form in hit:
                forms[form] = forms.get(form, 0) + 1
    return {"trigger": bool(ciks), "ciks": ciks, "forms": forms,
            "reason": "neue Berichte" if ciks else "keine neuen 10-K/10-Q/20-F/40-F"}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    args = ap.parse_args(argv)
    with open(args.run, encoding="utf-8") as fh:
        print(json.dumps(decide(json.load(fh)), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
