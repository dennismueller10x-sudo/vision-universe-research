-- Interne Backtest-Vorschau (docs/quant/BACKTEST_PREVIEW.md, Abschnitt 9; docs/accounts/FREIGABEN.md).
--
-- * Rolle backtest_reviewer: darf im Konto-Worker die vorgerechneten Backtests der internen Vorschau lesen
--   (/v1/admin/backtests*). Der Worker prueft sie bei jeder Anfrage aus user_roles mit dem Nutzer-JWT.
-- * Diese Migration fuegt NUR den Rollenwert hinzu. Sie vergibt die Rolle niemandem. Vergeben wird sie nie von
--   einem Konto selbst (user_roles ist fuer Nutzer nur lesbar), sondern nur mit Owner-Zustimmung ueber den
--   Datenbankzugang des Betriebs. Zusaetzlich muss die Vorschau im Worker eingeschaltet sein
--   (VU_BACKTEST_REVIEW_ENABLED, standardmaessig "false").

alter type public.app_role add value if not exists 'backtest_reviewer';
