# 0007 — Gridl authored campaign and portal fix

## Status

Accepted for H5–H6.

## Decision

The hub launches the 31 Gridl levels whose legacy metadata does not identify
them as placeholders. The 179 self-identified placeholders remain in the
legacy repository as historical material and are not treated as launch
content.

The legacy engine remains the behavioral oracle for fragment placement,
crossings, allowlist validation, seed connectivity, blockers, recall, reserve
capacity, portal projection, turn counting, par, and completion.

The known legacy defect in `moveStagedPlacement` is intentionally corrected in
the migrated engine: clearing a staged tile preserves the cell's `special`
marker. The same preservation rule applies when rolling back staged
placements. Production regression coverage replaces the quarantined legacy
expectation for the migrated implementation.

Campaign completion and best turn counts are stored locally under the shared
hub storage namespace. No account or server persistence is introduced.
