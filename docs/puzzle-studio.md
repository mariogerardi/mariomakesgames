# Puzzle Studio architecture

## Scope

Puzzle Studio is the private authoring system for the six currently in-scope games:

- Syllabl
- Rarity
- Before&After
- DECODE
- TOKEN
- DUAL

EXPL41N and Gridl are intentionally outside this phase. The six included games have equal product priority. Work proceeds in horizontal capabilities across every game rather than completing one favored builder first.

The versioned contracts live in `src/authoring/contracts.mjs` with TypeScript declarations in `src/authoring/contracts.d.mts`.

## Contract decisions

### Drafts and published puzzles are different documents

A draft must remain saveable while incomplete. Draft validation therefore checks that its document and game payload have a stable shape, but it permits empty authoring fields.

A published puzzle must be playable. Publication validation enforces the strict constraints needed by the current game engines, including stage counts, clue/answer lengths, complete token streams, and a bundled accepted DUAL lexicon.

Both are wrapped in a shared envelope containing the game, stable puzzle ID, schema version, title, and tags. Drafts additionally carry private notes, workflow status, timestamps, and the revision from which they were cloned. Published puzzles carry an immutable positive revision and publication timestamp.

Published revisions are immutable. Editing a published puzzle creates a new draft with `baseRevision` set, and publishing that draft creates the next revision. Historical play and statistics can therefore continue to point at the exact content used on that date.

### Scheduling is separate from puzzle content

The schedule maps a `(game, mode, date)` slot to one or more immutable puzzle revisions. Keeping this separate allows a puzzle to be reused without copying it and supports ordered multi-puzzle modes such as DECODE Daily 5.

The initial scheduling timezone is `America/New_York`, matching the Hub's daily-puzzle convention.

### Proof and provenance stay with drafts

Builder-only material does not automatically become player-facing content:

- Syllabl proof words validate each level but are not published as answers.
- Rarity reference words help an author inspect a string.
- TOKEN retains its full generation record and private authoring instructions in the draft, while the published puzzle contains only the playable response and stops.
- DUAL drafts retain corpus revision and author overrides; published puzzles bundle the accepted lexical snapshot required to reproduce play.

## Game-specific creators for all six games

Implemented through the local-only Studio application. `/studio` is the operational dashboard; each game owns a dedicated workspace at `/studio/[gameId]`. Authoring controls are not exposed in player menus.

Each adapter provides:

1. `createEmptyPayload()` using the shared draft contract.
2. A game-native editor for every required field.
3. Structural validation on edit and save.
4. A conversion function from draft payload to published payload.
5. A preview boundary capable of receiving a draft without mutating the live catalog.

The creators remain equally complete across all games, while matching the amount of work each puzzle actually requires:

| Game | Minimum editor |
| --- | --- |
| Syllabl | Three-letter string, difficulty, and six rows of placement, syllable count, and proof word. Preserve the useful workflow from the legacy user-facing creator. |
| Rarity | One three-letter string, plus optional private reference words. |
| Before&After | Answer, two clues, direction, difficulty, and pack. |
| DECODE | Answer, clue word, definition clue, optional theme, and eligible modes. Feedback remains derived by the engine. |
| TOKEN | The complete generation, token-inspection, difficulty, and stop-selection workbench moved from the player shell. |
| DUAL | The complete corpus, language-side, family-review, target, and playtest workbench moved from the player shell. |

All six editors can create and recover a structurally valid draft. TOKEN and DUAL no longer expose authoring navigation from their player-facing game shells.

Before&After creation is now Studio-owned. Its former player-facing Custom destination has been removed from the game shell; the Studio provides phrase-direction preview, production-engine validation, durable draft saving, and isolated playtesting instead. If the browser contains puzzles saved by the former Custom tool, Studio offers a one-time import into file-backed drafts while leaving the original browser data untouched.

## Studio information architecture

The dashboard is the entry point, not an editor modal. It summarizes draft counts, shipped catalog counts, and fourteen-day Daily coverage for every game. Missing coverage links directly to the relevant game and date.

Each game workspace has three clear views: **Create**, **Library**, and **Calendar**. Create is a full-width build/test workspace, Library contains saved drafts and the shipped catalog, and Calendar manages the game's next twenty-one days. A shared Studio bar makes the dashboard and every game workspace directly reachable from every view. Schedules are saved to `.local/puzzle-studio/schedule.json`, with timestamped backups under `.local/puzzle-studio/backups/schedule`.

DECODE has two document types: a themed, ordered five-signal Daily 5 and a single reusable Timed/Zen bank entry. Daily signals may also opt into Timed and Zen. Calendar assignments point at the complete Daily 5 rather than five unrelated documents.

The creator surface is game-first rather than schema-first. The fields required to construct the puzzle stay prominent; private notes and file details live in one collapsed optional section. There is no author-facing puzzle-name field. A saved draft is labeled `Unscheduled 1`, `Unscheduled 2`, and so on until assigned; once scheduled, the date becomes its primary label. Defining content remains visible as a secondary identifier.

Create includes date, mode, and multi-puzzle position controls. **Save & schedule** validates the draft, creates the next immutable local published revision under `.local/puzzle-studio/published`, and assigns that exact revision to the chosen Daily slot. Calendar can assign either shipped catalog revisions or the newest locally published revision for a puzzle.

Before save, publish, or scheduling, Studio compares game-specific content identities across drafts, shipped catalogs, published revisions, and scheduled dates. Exact duplicates are blocked; meaningful overlaps such as a repeated DECODE answer with a different clue word require author confirmation.

Run `npm run studio:promote` to validate every scheduled reference and generate `src/authoring/data/promoted-puzzles.json`. That tracked artifact is the explicit promotion boundary from local authoring into shipped builds. A future authenticated store should implement the same draft, immutable-publication, and schedule contracts; cloud storage and user roles are intentionally not coupled to the current UI.

## Step 3: Save, Import, Export, and Duplicate for all six

Create a single `PuzzleDraftRepository` interface used by every editor:

```ts
interface PuzzleDraftRepository {
  list(gameId?: AuthorableGameId): Promise<PuzzleDraft[]>;
  get(id: string): Promise<PuzzleDraft | null>;
  save(draft: PuzzleDraft): Promise<void>;
  remove(id: string): Promise<void>;
  import(document: unknown): Promise<PuzzleDraft>;
  export(id: string): Promise<string>;
  duplicate(id: string, nextId: string): Promise<PuzzleDraft>;
}
```

The first implementation is a local, file-backed Vite development API. Browser `localStorage` holds crash-recovery autosaves, but it is not the durable source of authored work. Explicit saves live under `.local/puzzle-studio/drafts`; timestamped replacement and deletion backups live under `.local/puzzle-studio/backups`. The entire `.local` directory remains Git-ignored.

Required behavior:

- Save performs structural validation and uses atomic file replacement.
- Autosave is clearly distinguished from an explicit saved draft.
- Import validates schema version and game payload before writing anything.
- Export produces the complete portable draft JSON, including private authoring data.
- Duplicate creates a new ID, clears `baseRevision`, resets workflow status to `draft`, and preserves the source content.
- Existing IDs cannot be silently overwritten during import or duplication.
- A timestamped backup is created before destructive replacement or deletion.
- The Studio shows recovery and write failures visibly; it never reports a save that did not reach disk.

The same repository contract and user-facing actions now work for all six editors. Imports cannot overwrite an existing ID, duplicates receive a fresh identity and workflow state, and disk replacement is atomic.

## Step 4: catalog library and actual-engine playtests

The first Step 4 slice is implemented. The Studio now ingests the shipped catalogs for all six games into one searchable, filterable, read-only library:

- 125 Syllabl puzzles
- 35 classic Rarity fallback strings
- 204 Before&After puzzles with pack membership
- 118 unique DECODE puzzles with mode membership
- 4 TOKEN fixtures split by difficulty
- 2 bundled DUAL fixtures with their matching lexical snapshots

Opening a catalog item shows its provenance, modes or collections, published payload, and an isolated playtest. “Create editable draft” clones it into the shared draft contract while leaving the shipped source unchanged.

Every preview calls the production engine function for its game. Syllabl and Rarity use their production word services; Before&After, DECODE, TOKEN, and DUAL execute their production evaluators locally. Preview progress is React state only: the preview code has no access to `localStorage`, Daily persistence, statistics, schedules, or catalog mutation. Desktop and compact widths can be checked from the same preview frame.

This is intentionally an engine-faithful Studio presentation rather than embedding each entire player page shell. The next visual refinement can extract reusable production play-room presentation components from the game pages without changing the engine adapter or isolated persistence boundary.

### Implemented adapter boundary

Add a shared preview frame whose only responsibilities are selecting a viewport, resetting a run, reporting validation state, and containing game styling. Each game adapter must compile its draft into the exact input consumed by its production engine. Preview code must not update daily progress, statistics, catalogs, or published schedules.

The implementation needs two layers:

1. Pure `compileDraft` adapters convert each structurally valid draft into a preview puzzle and return blocking errors plus non-blocking author warnings.
2. Small production play-room components accept an injected puzzle, mode, and storage policy. The existing player routes use normal persistence; Studio supplies an in-memory no-op persistence adapter.

Per-game work:

- **Syllabl:** compile the six draft rows into `inputsEnabled` and `syllablesRequired`; validate every proof word through the production word service; run the same six-stage engine.
- **Rarity:** inject the authored string into the classic one-entry play room and use the production dictionary/frequency service. Reference words can be launched as test submissions without consuming the preview permanently.
- **Before&After:** compile directly to a `BridgePuzzle` and reuse the phrase layout, timer behavior, and answer evaluator.
- **DECODE:** compile answer and clue data to a `DecodePuzzle`; derive feedback through `deriveDecodeFeedback`; allow Timed, Daily 5, and Zen simulation without writing player records.
- **TOKEN:** compile the retained generation and selected stop IDs with `createPlayablePuzzleFromDraft`, then run the normal character stream and stop interaction.
- **DUAL:** replace the builder's compact test strip with the actual DUAL board using its compiled puzzle and accepted lexicon. The existing compact playtest can remain as a fast lexical check.

All six games can now be played from an unsaved draft, reset deterministically, and previewed at desktop and compact widths without mutating player progress. Source-level integration tests lock the six production-engine calls and the persistence isolation; the catalog coverage test locks the shipped corpus counts.

## Later gates

The next equal-coverage capabilities are deeper game-specific quality validation, clearer mode/collection pool management, a formal approval state, and a cloud-backed implementation of the existing repository contracts. Local publication is intentionally not a production deployment.
