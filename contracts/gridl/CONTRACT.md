# Gridl mechanics contract

Canonical revision:
`3d74606cfdfb121e277bd352589d9a8e769a3c75`

## Resources

- hand: four fragments;
- reserve: two fragments;
- deck: deterministic order;
- fragment: one board cell regardless of text length.

## Placement

- one or more fragments may be staged;
- multiple fragments must share one row or column;
- multiple fragments must form one continuous carrier run;
- every resulting multi-cell run must be in the level allowlist;
- a standalone real fragment must itself be allowed;
- all occupied nodes must remain connected to a seed;
- blocked and projected cells reject placement.

A one-fragment turn may form valid words in both axes.

## Recall

- only committed non-seed fragments may be recalled;
- placement and recall cannot share one submitted turn;
- a recall consumes a turn;
- the resulting board must remain valid;
- recalled fragments enter the two-slot reserve.

## Portals

A real fragment on one portal projects its text to other empty portals in the
same group. Projections:

- participate in words;
- participate in connectivity;
- prevent placement onto the projected cell;
- are not independent tiles.

## Completion

After a valid placement commit, the puzzle is won when an extracted run covers
the starred goal coordinate.

Turns used equal `state.turn - 1`. Best performance is compared with par.

## Content warning

The locked corpus contains 210 levels:

- 179 self-label as placeholders;
- 31 do not.

Placeholder levels are not launch content merely because they normalize.

## Known defect

Moving or rolling back a staged fragment can replace its former cell without
preserving `special`. A tile moved off a portal therefore leaves `portalAt`
intact while losing the cell’s `special: "portal"` marker.

The preservation harness quarantines this as a regression target. It is not an
intended mechanic.
