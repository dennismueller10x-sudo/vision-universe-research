# Abandoned V3 freeze (run 38600061146)

The freeze and capture receipt in this directory were committed by Actions run 38600061146 before any measurement.
The measurement step then stopped at argument validation (`ALL_V3_ARGUMENTS_REQUIRED`: the workflow omitted `--method`),
so **no performance was calculated** and no sealed result exists for this freeze. It is kept as history and is not used.

The capture itself was valid and independently repeated the earlier counts (9,410 input segments, 9,408 usable, 500 parts,
2 × `CORPORATE_ACTION_CONTRADICTED / SPLIT_NOT_IN_RAW_PRICE`). Its manifest hash differs from capture run 38593730906,
confirming that captures are not byte-reproducible across runs; each measurement run therefore builds its own freeze.
