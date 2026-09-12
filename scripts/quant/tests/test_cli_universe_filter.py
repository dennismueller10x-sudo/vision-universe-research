"""--universe muss die Menge wirklich begrenzen - und aufgerufene Namen muessen existieren.

Zwei Befunde aus dem dritten Produktivlauf (34712221410), beide in
demselben Workflow-Schritt, beide unsichtbar:

1. cmd_coverage deklarierte --universe und las es nie. Der Workflow gab
   den Validierungssatz mit, die Matrix materialisierte trotzdem alle
   5.406 Factbooks - der Runner bekam nach 94 Sekunden ein
   Shutdown-Signal, und das Ergebnis der vorangegangenen Messung wurde
   nie committet.

2. _ciks_from_universe wurde von export und canonical aufgerufen und war
   nirgends definiert. Beide standen im Workflow hinter `|| true`, also
   haette der Schritt auch bei einem NameError Erfolg gemeldet.

Ein Argument, das nichts tut, ist schlimmer als keines: es sieht nach
einer Grenze aus.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant import cli


class FakeStore:
    """Zaehlt mit, welche Emittenten tatsaechlich gelesen werden."""

    def __init__(self, ciks):
        self._ciks = list(ciks)
        self.gelesen = []

    def list_companies(self):
        return list(self._ciks)

    def read_company(self, cik):
        self.gelesen.append(cik)
        return {"cik": cik, "profile": {"name": f"Emittent {cik}", "tickers": []}}


def universumsdatei(ciks, verzeichnis):
    pfad = Path(verzeichnis) / "universe.json"
    pfad.write_text(json.dumps({
        "companies": [{"ticker": f"T{i}", "cik": c} for i, c in enumerate(ciks)]
    }), encoding="utf-8")
    return pfad


class CiksFromUniverseTests(unittest.TestCase):
    def test_der_helfer_existiert_ueberhaupt(self):
        # Der eigentliche Befund: der Name war nie definiert.
        self.assertTrue(callable(getattr(cli, "_ciks_from_universe", None)))

    def test_ohne_pfad_keine_einschraenkung(self):
        self.assertIsNone(cli._ciks_from_universe(None))
        self.assertIsNone(cli._ciks_from_universe(""))

    def test_liefert_normalisierte_ciks(self):
        with tempfile.TemporaryDirectory() as d:
            pfad = universumsdatei(["320193", "0000789019"], d)
            self.assertEqual(cli._ciks_from_universe(pfad),
                             ["0000320193", "0000789019"])

    def test_eine_leere_datei_ist_nicht_alle(self):
        # Der gefaehrliche Fehler waere, hier None zu liefern: dann laege
        # der ganze Bestand offen, obwohl ein Filter gesetzt war.
        with tempfile.TemporaryDirectory() as d:
            pfad = universumsdatei([], d)
            self.assertEqual(cli._ciks_from_universe(pfad), [])


class DocumentFilterTests(unittest.TestCase):
    def test_der_filter_liest_nur_die_gefilterten(self):
        store = FakeStore([f"{i:010d}" for i in range(50)])
        cli._documents(store, ciks=["0000000003", "0000000007"])
        self.assertEqual(store.gelesen, ["0000000003", "0000000007"])

    def test_ohne_filter_wird_alles_gelesen(self):
        store = FakeStore([f"{i:010d}" for i in range(10)])
        self.assertEqual(len(cli._documents(store)), 10)

    def test_ein_vergessener_filter_bricht_ab_statt_den_runner_zu_toeten(self):
        store = FakeStore([f"{i:010d}" for i in range(cli.MAX_DOCUMENTS_IN_MEMORY + 5)])
        with self.assertRaises(SystemExit) as ctx:
            cli._documents(store)
        self.assertIn("--universe", str(ctx.exception))

    def test_der_generator_haelt_immer_nur_eines(self):
        store = FakeStore([f"{i:010d}" for i in range(cli.MAX_DOCUMENTS_IN_MEMORY + 5)])
        gesehen = 0
        for _ in cli._iter_documents(store):
            gesehen += 1
        self.assertEqual(gesehen, cli.MAX_DOCUMENTS_IN_MEMORY + 5)


class ParserContractTests(unittest.TestCase):
    """Wer --universe anbietet, muss es auch lesen."""

    UNTERBEFEHLE = ["export", "coverage", "canonical", "gates"]

    def _parser(self):
        return cli.build_parser() if hasattr(cli, "build_parser") else None

    def test_jeder_unterbefehl_mit_universe_reicht_es_an_den_filter_weiter(self):
        import inspect
        for name in self.UNTERBEFEHLE:
            funktion = getattr(cli, f"cmd_{name}")
            quelle = inspect.getsource(funktion)
            self.assertIn(
                "_ciks_from_universe", quelle,
                f"cmd_{name} deklariert --universe, liest es aber nicht - "
                "genau der Fehler, der Lauf 34712221410 gekostet hat.")


class NoUndefinedNamesTests(unittest.TestCase):
    """Ein aufgerufener Name, den es nicht gibt, faellt erst zur Laufzeit auf.

    `python -m compileall` prueft nur die Syntax. Der NameError lag
    hinter `|| true` und waere nie rot geworden.
    """

    def test_jeder_aufgerufene_modulname_existiert(self):
        import ast
        import builtins

        def lokal_gebunden(funktion):
            """Namen, die INNERHALB der Funktion entstehen.

            Vor allem funktionslokale Importe - cmd_gates holt sich
            `reconstruct` erst im Rumpf.
            """
            namen = set()
            for arg in ast.walk(funktion):
                if isinstance(arg, (ast.Import, ast.ImportFrom)):
                    namen.update(a.asname or a.name.split(".")[0] for a in arg.names)
                elif isinstance(arg, ast.Name) and isinstance(arg.ctx, ast.Store):
                    namen.add(arg.id)
                elif isinstance(arg, ast.arg):
                    namen.add(arg.arg)
            return namen

        baum = ast.parse(Path(cli.__file__).read_text(encoding="utf-8"))
        bekannt = set(dir(builtins)) | set(vars(cli))
        fehlend = set()
        for funktion in ast.walk(baum):
            if not isinstance(funktion, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            erlaubt = bekannt | lokal_gebunden(funktion)
            for knoten in ast.walk(funktion):
                if (isinstance(knoten, ast.Call)
                        and isinstance(knoten.func, ast.Name)
                        and knoten.func.id not in erlaubt):
                    fehlend.add(knoten.func.id)
        self.assertEqual(sorted(fehlend), [],
                         f"aufgerufen, aber nirgends definiert: {sorted(fehlend)}")


if __name__ == "__main__":
    unittest.main()
