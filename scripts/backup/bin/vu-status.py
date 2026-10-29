"""Statusbericht eines Laufs aus den JSON-Dateien je Quelle.

  vu-status.py <status-dir> [--title T] [--duration S]

Schreibt <status-dir>/report.md (fuer die Laufuebersicht), summary.txt (eine Zeile
je Quelle, fuer Benachrichtigungen) und report.json. Ist GITHUB_STEP_SUMMARY gesetzt,
wird report.md dort angehaengt. Enthaelt nur Zaehler, Groessen, Zeitpunkte, keine Werte.

Alterspruefung: fuer jede Quelle das Alter des letzten Snapshots im Repository.
VU_STALE_WARN_DAYS (Standard 4) -> Warnung, VU_STALE_FAIL_DAYS (Standard 7) -> rot.
"""
import argparse
import datetime as dt
import glob
import json
import os
import re

ICON = {"ok": "OK", "warn": "WARNUNG", "failed": "FEHLER", "skipped": "uebersprungen"}


def parse_time(ts):
    """restic-Zeit (Nanosekunden, Z oder +hh:mm) -> aware datetime."""
    m = re.match(r"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:\d\d)?", ts)
    base = dt.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S")
    off = m.group(2) or "Z"
    if off == "Z":
        tz = dt.timezone.utc
    else:
        sign = 1 if off[0] == "+" else -1
        tz = dt.timezone(sign * dt.timedelta(hours=int(off[1:3]), minutes=int(off[4:6])))
    return base.replace(tzinfo=tz)


def human(n):
    n = float(n or 0)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dir")
    ap.add_argument("--title", default="Sicherung")
    ap.add_argument("--duration", type=int, default=0)
    a = ap.parse_args()

    results = []
    for path in sorted(glob.glob(os.path.join(a.dir, "*.json"))):
        if os.path.basename(path).startswith(".") or os.path.basename(path) == "report.json":
            continue
        results.append(json.load(open(path)))

    ages = {}
    snap_path = os.path.join(a.dir, ".snapshots.json")
    if os.path.exists(snap_path):
        try:
            snaps = json.load(open(snap_path)) or []
        except ValueError:
            snaps = []
        now = dt.datetime.now(dt.timezone.utc)
        for s in snaps:
            src = next((t[4:] for t in s.get("tags", []) if t.startswith("src:")), None)
            if not src:
                continue
            age = (now - parse_time(s["time"])).total_seconds() / 86400
            ages[src] = min(ages.get(src, age), age)

    warn_days = float(os.environ.get("VU_STALE_WARN_DAYS", 4))
    fail_days = float(os.environ.get("VU_STALE_FAIL_DAYS", 7))
    stale = []
    for src, age in sorted(ages.items()):
        if age > fail_days:
            stale.append(f"{src}: letzter Stand {age:.1f} Tage alt (rot)")
        elif age > warn_days:
            stale.append(f"{src}: letzter Stand {age:.1f} Tage alt")

    worst = "ok"
    for r in results:
        if r["status"] == "failed":
            worst = "failed"
        elif r["status"] == "warn" and worst == "ok":
            worst = "warn"
    if any("(rot)" in s for s in stale):
        worst = "failed"
    elif stale and worst == "ok":
        worst = "warn"

    lines = [f"## {a.title}: {ICON[worst]}", ""]
    if a.duration:
        lines.append(f"Dauer: {a.duration // 60} min {a.duration % 60} s")
        lines.append("")
    lines += ["| Quelle | Ergebnis | Neu hochgeladen | Umfang | Hinweis |", "|---|---|---|---|---|"]
    summary = []
    for r in results:
        s = r.get("summary") or {}
        m = r.get("manifest") or {}
        size = m.get("bytes") or s.get("total_bytes_processed")
        volume = human(size) if size else (f"{m.get('records')} Datensaetze" if m.get("records") is not None else "")
        added = human(s.get("data_added")) if s.get("data_added") is not None else ""
        lines.append(f"| {r['source']} | {ICON.get(r['status'], r['status'])} | {added} | {volume} | {r['message']} |")
        summary.append(f"{r['source']}: {ICON.get(r['status'], r['status'])}")
    if stale:
        lines += ["", "**Veraltete Sicherungsstaende:**", ""] + [f"- {s}" for s in stale]
    lines += ["", "Gesichert wird nur, was in dieser Tabelle mit OK oder WARNUNG steht. "
              "Ein FEHLER laesst alle frueheren Sicherungsstaende unveraendert."]
    report = "\n".join(lines) + "\n"

    open(os.path.join(a.dir, "report.md"), "w").write(report)
    open(os.path.join(a.dir, "summary.txt"), "w").write(f"{a.title}: {ICON[worst]}\n" + "\n".join(summary) + "\n")
    json.dump({"title": a.title, "overall": worst, "results": results, "stale": stale},
              open(os.path.join(a.dir, "report.json"), "w"), indent=2)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(report)
    print(report)


if __name__ == "__main__":
    main()
