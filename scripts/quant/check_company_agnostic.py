#!/usr/bin/env python3
"""The SEC pipeline must not branch on a specific company.

The five validation companies live in `quant/config/sec-universe.json`. The code
that processes them takes a CIK and nothing else -- that is what makes five
companies and five hundred the same code path, and it is worth a guard.

The guard checks **executable code**, not prose. Comments and docstrings are
stripped first, because naming the company whose real data exposed a defect is
how this repository documents its findings: "NVDA's 10-Ks for the years ending
January 2011 to January 2014 tag `fy` one year low" is the evidence for a fix,
not a hack. A ticker inside `if ticker == "NVDA"` is the hack, and that is what
survives stripping.

    python3 scripts/quant/check_company_agnostic.py [DIR ...]
"""
import ast
import io
import re
import sys
import tokenize
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIRS = ("scripts/quant/sec",)

TICKERS = ("NVDA", "AAPL", "MSFT", "JPM", "XOM")
NAMES = ("NVIDIA", "Apple", "Microsoft", "JPMorgan", "Exxon")
CIKS = ("0001045810", "0000320193", "0000789019", "0000019617", "0000034088")

# `\b` is the wrong boundary here: an underscore is a word character, so
# `\bNVDA\b` does not match `NVDA_FUDGE` -- which is exactly the shape a
# company-specific constant takes. The boundary has to be alphanumeric-only, so
# that a name glued to an identifier by an underscore still counts as a hit.
_EDGE = r"(?<![A-Za-z0-9])(?:{})(?![A-Za-z0-9])"
PATTERNS = (
    (re.compile(_EDGE.format("|".join(TICKERS + NAMES))), "company identifier"),
    (re.compile(_EDGE.format("|".join(CIKS))), "validation-company CIK"),
)


def executable_source(path):
    """The file's source with comments and docstrings removed.

    Uses the tokenizer for comments and the AST for docstrings, so neither can
    be missed by a regex that guesses at quoting.
    """
    source = path.read_text(encoding="utf-8")
    docstrings = set()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source                     # unparsable: check it whole, not less
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef,
                                 ast.AsyncFunctionDef)):
            continue
        body = getattr(node, "body", None)
        if not body:
            continue
        first = body[0]
        if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) \
                and isinstance(first.value.value, str):
            docstrings.add((first.lineno, first.end_lineno))

    dropped = set()
    for start, end in docstrings:
        dropped.update(range(start, end + 1))

    kept = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type == tokenize.COMMENT:
            continue
        if token.start[0] in dropped:
            continue
        kept.append(token.string)
    return "\n".join(kept)


def scan(directories=DEFAULT_DIRS):
    findings = []
    for directory in directories:
        base = ROOT / directory
        for path in sorted(base.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue              # build artifacts are not source
            code = executable_source(path)
            for pattern, label in PATTERNS:
                for match in pattern.finditer(code):
                    findings.append((path.relative_to(ROOT).as_posix(),
                                     label, match.group(0)))
    return findings


def main(argv=None):
    directories = argv[1:] if argv and len(argv) > 1 else DEFAULT_DIRS
    findings = scan(directories)
    for path, label, hit in findings:
        print(f"::error::{path}: {label} {hit!r} in executable code")
    if findings:
        print(f"{len(findings)} company-specific reference(s) in code. The five "
              f"validation companies belong in quant/config/sec-universe.json.")
        return 1
    print(f"pipeline is company-agnostic ({', '.join(directories)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
