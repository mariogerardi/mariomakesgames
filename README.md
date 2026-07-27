# Games Hub

This repository is the mechanics-preserving home for a unified web hub containing:

1. Syllabl
2. Rarity
3. Gridl
4. Expl41n
5. Before&After

The current phase is H0–H1:

- lock the catalog and canonical source revisions;
- document the behavioral source of truth;
- build executable preservation contracts;
- compare those contracts with the legacy implementations;
- avoid changing any legacy game repository.

The hub application itself begins in H2.

## Checks

```bash
npm test
npm run check:catalog
npm run check
```

The legacy parity suite expects the existing repositories under:

```text
/Users/mg/Developer/games/
```

Set `GAMES_DEVELOPER_ROOT` to a different Developer directory when needed.

## Repository principles

- Existing games are behavioral references, not packages to merge blindly.
- Mechanics receive executable contracts before UI rewrites.
- Rejected actions must not mutate game state.
- Each game keeps its own domain-specific result schema.
- Gemboard is retired and is not part of the launch catalog.
- Plotter is a separate portfolio product.

See [docs/catalog.md](docs/catalog.md) and
[docs/decisions/0001-launch-catalog.md](docs/decisions/0001-launch-catalog.md).
The executable H1 coverage matrix and known legacy defect are recorded in
[docs/h1-preservation-harness.md](docs/h1-preservation-harness.md).
