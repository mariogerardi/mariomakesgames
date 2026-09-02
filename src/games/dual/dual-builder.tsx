"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { DUAL_AUTHORED_PUZZLES_KEY, parseAuthoredDualPuzzles, scheduleAuthoredDualPuzzle } from "./authored-puzzles.mjs";
import {
  applyDualBuilderBulk, buildDualBuilderLexicon, calculateDualBuilderMetrics, calculateDualBuilderReviewSummary,
  createDualBuilderPuzzle, dualBuilderEntryState, dualBuilderFamilyAmbiguity, dualBuilderLanguageFamiliarity,
  dualBuilderModernSharedLoanwordLanguages, dualBuilderPlayableLanguages, dualBuilderWarnings,
  effectiveDualBuilderSenses, filterDualBuilderEntries,
  normalizeDualBuilderAssignment, restoreDualBuilderDraft,
  type DualBuilderAssignment, type DualBuilderEntry, type DualBuilderFamilyOverrides, type DualBuilderOverrides,
} from "./builder.mjs";
import { createDualSession, dualProgress, submitDualWord, type DualSession } from "./engine.mjs";
import { createDualLexicon } from "./lexicon.mjs";

const BUILDER_ROOT = "/dual-builder-local";
const OVERRIDES_KEY = "mg-games:v1:dual:builder-overrides";
const DRAFTS_KEY = "mg-games:v1:dual:builder-drafts";
const FAMILY_OVERRIDES_KEY = "mg-games:v1:dual:builder-family-overrides";
const FILTERS = [["en", "English"], ["es", "Spanish"], ["dual", "Dual"], ["flagged", "Flagged"], ["unfamiliar", "Below familiarity threshold"], ["borderline", "Borderline frequency"], ["missing", "Missing frequency"], ["homograph", "Homograph"], ["accent", "Accent collision"]] as const;
const TABS = [["playable", "Playable"], ["review", "Review"], ["excluded", "Excluded"], ["all", "All source"]] as const;

type CandidateMetrics = {
  key: string; sequence: string; enSurfaces: number; esSurfaces: number; enFamilies: number; esFamilies: number;
  enCapacity: number; esCapacity: number; totalCapacity: number; duals: number; reviewSurfaces: number;
  homographs: number; accentCollisions: number; familyConcentration: number; balance: number; quality: number;
  unfamiliarSurfaces: number; suggested: { targetScore: number; minimumEnglish: number; minimumSpanish: number; dualCount: number };
};
type BuilderManifest = { version: number; builtAt: string; policy: Record<string, string>; counts: Record<string, number>; candidates: CandidateMetrics[]; source: Record<string, unknown> };
type BuilderPool = { sequence: string; metrics: CandidateMetrics; entries: DualBuilderEntry[] };
type Settings = { id: string; targetScore: number; minimumEnglish: number; minimumSpanish: number };
type BuilderTab = (typeof TABS)[number][0];

function readStored(key: string): Record<string, unknown> {
  try { const value = JSON.parse(localStorage.getItem(key) ?? "{}"); return value && typeof value === "object" ? value : {}; }
  catch { return {}; }
}
function downloadJson(filename: string, payload: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
function formatScore(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }

function Playtest({ pool, overrides, familyOverrides, settings }: { pool: BuilderPool; overrides: DualBuilderOverrides; familyOverrides: DualBuilderFamilyOverrides; settings: Settings }) {
  const puzzle = useMemo(() => createDualBuilderPuzzle(pool.sequence, settings, pool.entries, overrides, familyOverrides), [familyOverrides, overrides, pool, settings]);
  const lexicon = useMemo(() => createDualLexicon(buildDualBuilderLexicon(pool.entries, overrides, familyOverrides)), [familyOverrides, overrides, pool.entries]);
  const [session, setSession] = useState<DualSession>(() => createDualSession({ puzzle, dateKey: "builder" }));
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("Try any playable word.");
  const progress = dualProgress(session, puzzle);
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = submitDualWord({ session, puzzle, lexicon, input: entry });
    if (!result.accepted || !result.submission) return setFeedback(result.reason === "ambiguous" ? "Ambiguous accent spelling." : `Not accepted: ${result.reason}.`);
    setSession(result.state); setEntry(""); setFeedback(`${result.submission.surface.toLocaleUpperCase()} +${formatScore(result.submission.points)}`);
  }
  return <section className="dual-builder-playtest"><header><span>Live playtest · current authored pool</span><b>{formatScore(progress.score)} / {formatScore(puzzle.targetScore)}</b></header><div><span>EN {progress.enFamilies} / {puzzle.minimumEnglish} families</span><strong>{pool.sequence}</strong><span>ES {progress.esFamilies} / {puzzle.minimumSpanish} families</span></div><form onSubmit={submit}><input aria-label="Playtest word" autoComplete="off" onChange={(event) => setEntry(event.target.value)} placeholder="test a word" value={entry} /><button type="submit">Enter</button></form><p>{feedback}</p></section>;
}

export function DualBuilder() {
  const [manifest, setManifest] = useState<BuilderManifest | null>(null);
  const [pool, setPool] = useState<BuilderPool | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [query, setQuery] = useState("");
  const [wordQuery, setWordQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [manifestError, setManifestError] = useState("");
  const [poolError, setPoolError] = useState("");
  const [overridesByPool, setOverridesByPool] = useState<Record<string, DualBuilderOverrides>>({});
  const [familyOverridesByPool, setFamilyOverridesByPool] = useState<Record<string, DualBuilderFamilyOverrides>>({});
  const [settings, setSettings] = useState<Settings>({ id: "", targetScore: 10, minimumEnglish: 4, minimumSpanish: 4 });
  const [tab, setTab] = useState<BuilderTab>("playable");
  const [filters, setFilters] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setOverridesByPool(readStored(OVERRIDES_KEY) as Record<string, DualBuilderOverrides>);
      setFamilyOverridesByPool(readStored(FAMILY_OVERRIDES_KEY) as Record<string, DualBuilderFamilyOverrides>);
    });
    fetch(`${BUILDER_ROOT}/manifest.json`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("The local DUAL index has not been built yet."); return response.json() as Promise<BuilderManifest>; })
      .then((value) => { setManifest(value); setManifestError(""); })
      .catch((reason: Error) => setManifestError(reason.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!selectedKey) return;
    fetch(`${BUILDER_ROOT}/pools/${selectedKey}.json`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error(`Could not open ${selectedKey.toLocaleUpperCase()}.`); return response.json() as Promise<BuilderPool>; })
      .then((value) => {
        setPool(value); setSettings({ id: `${value.metrics.key}-draft`, targetScore: value.metrics.suggested.targetScore, minimumEnglish: value.metrics.suggested.minimumEnglish, minimumSpanish: value.metrics.suggested.minimumSpanish });
        setSelected(new Set()); setExpanded(new Set()); setTab("playable"); setFilters([]); setWordQuery(""); setPoolError(""); setDraftMessage("");
      }).catch((reason: Error) => setPoolError(reason.message));
  }, [selectedKey]);

  const overrides = useMemo(() => overridesByPool[selectedKey] ?? {}, [overridesByPool, selectedKey]);
  const familyOverrides = useMemo(() => familyOverridesByPool[selectedKey] ?? {}, [familyOverridesByPool, selectedKey]);
  const live = useMemo(() => pool ? calculateDualBuilderMetrics(pool.entries, overrides, familyOverrides) : null, [familyOverrides, overrides, pool]);
  const runtimeBySurface = useMemo(() => new Map((pool ? buildDualBuilderLexicon(pool.entries, overrides, familyOverrides) : []).map((entry) => [entry.surface, entry])), [familyOverrides, overrides, pool]);
  const playableLanguages = useMemo(() => pool ? dualBuilderPlayableLanguages(pool.entries, overrides, familyOverrides) : new Map<string, string[]>(), [familyOverrides, overrides, pool]);
  const reviewSummary = useMemo(() => pool ? calculateDualBuilderReviewSummary(pool.entries, overrides, familyOverrides) : null, [familyOverrides, overrides, pool]);
  const visible = useMemo(() => pool ? filterDualBuilderEntries(pool.entries, overrides, { text: wordQuery, tab, filters }, familyOverrides) : [], [familyOverrides, filters, overrides, pool, tab, wordQuery]);
  const counts = useMemo(() => {
    const value = { playable: 0, review: 0, excluded: 0, all: pool?.entries.length ?? 0 };
    for (const entry of pool?.entries ?? []) {
      const state = dualBuilderEntryState(entry, overrides[entry.surface]);
      const languages = playableLanguages.get(entry.surface) ?? [];
      if (languages.length) value.playable += 1;
      if (!languages.length && state.status === "excluded") value.excluded += 1;
      if ((!languages.length && state.status === "review") || state.reviewLanguages.some((language) => !languages.includes(language))) value.review += 1;
    }
    return value;
  }, [overrides, playableLanguages, pool]);
  const warnings = reviewSummary ? dualBuilderWarnings(reviewSummary) : [];

  function persist(nextPool: DualBuilderOverrides) {
    const next = { ...overridesByPool, [selectedKey]: nextPool }; setOverridesByPool(next); localStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)); setSaved(false);
  }
  function setFamily(surface: string, language: "en" | "es", family: string) {
    const current = { ...familyOverrides };
    if (family) current[surface] = { ...current[surface], [language]: family };
    else {
      const remaining = { ...(current[surface] ?? {}) };
      delete remaining[language];
      if (Object.keys(remaining).length) current[surface] = remaining;
      else delete current[surface];
    }
    const next = { ...familyOverridesByPool, [selectedKey]: current };
    setFamilyOverridesByPool(next); localStorage.setItem(FAMILY_OVERRIDES_KEY, JSON.stringify(next)); setSaved(false);
  }
  function setDecision(surface: string, decision: DualBuilderAssignment) { persist(applyDualBuilderBulk(overrides, [surface], decision)); }
  function analyze(event: FormEvent) {
    event.preventDefault(); if (!manifest) return;
    const key = query.trim().toLocaleLowerCase();
    if (!/^[a-zñ]{3}$/.test(key)) return setPoolError("Enter exactly three letters.");
    if (!manifest.candidates.some((item) => item.key === key)) { setPool(null); return setPoolError(`${key.toLocaleUpperCase()} does not appear in the local dictionary candidate set.`); }
    setPool(null); setSaved(false); setPoolError(""); setSelectedKey(key);
  }
  function toggleFilter(filter: string) { setFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]); }
  function toggleInSet(setter: typeof setSelected, value: string) { setter((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }); }
  function bulk(assignment: DualBuilderAssignment) { persist(applyDualBuilderBulk(overrides, selected, assignment)); setSelected(new Set()); }

  function payload() {
    if (!pool || !manifest || !live) return null;
    return { version: 2, createdAt: new Date().toISOString(), sequence: pool.sequence, puzzle: createDualBuilderPuzzle(pool.sequence, settings, pool.entries, overrides, familyOverrides), lexicon: buildDualBuilderLexicon(pool.entries, overrides, familyOverrides), overrides, familyOverrides, metrics: live, warnings, source: manifest.source, policy: manifest.policy };
  }
  function saveDraft() {
    const draft = payload(); if (!draft) return;
    localStorage.setItem(DRAFTS_KEY, JSON.stringify({ ...readStored(DRAFTS_KEY), [draft.puzzle.id]: draft })); setSaved(true); setDraftMessage("Exact authored state saved locally.");
  }
  function schedulePuzzle() {
    const draft = payload(); if (!draft || !scheduleDate) return setDraftMessage("Choose a date before assigning this puzzle.");
    try {
      const library = scheduleAuthoredDualPuzzle(parseAuthoredDualPuzzles(localStorage.getItem(DUAL_AUTHORED_PUZZLES_KEY)), scheduleDate, draft);
      localStorage.setItem(DUAL_AUTHORED_PUZZLES_KEY, JSON.stringify(library));
      setDraftMessage(`${draft.puzzle.sequence} is assigned locally to ${scheduleDate}.`);
    } catch (reason) {
      setDraftMessage(reason instanceof Error ? reason.message : "Could not assign this puzzle.");
    }
  }
  function restore(candidate: unknown) {
    try {
      const result = restoreDualBuilderDraft(candidate, selectedKey); persist(result.overrides);
      const next = { ...familyOverridesByPool, [selectedKey]: result.familyOverrides as DualBuilderFamilyOverrides };
      setFamilyOverridesByPool(next); localStorage.setItem(FAMILY_OVERRIDES_KEY, JSON.stringify(next));
      setSettings(result.settings); setDraftMessage("Draft overrides, family choices, and targets restored.");
    }
    catch (reason) { setDraftMessage(reason instanceof Error ? reason.message : "Could not restore this draft."); }
  }
  function restoreLatest() {
    const candidates = Object.values(readStored(DRAFTS_KEY)) as Array<Record<string, unknown>>;
    const match = candidates.filter((candidate) => String((candidate.puzzle as Record<string, unknown> | undefined)?.sequence ?? "").toLocaleLowerCase() === selectedKey).sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
    if (match) restore(match); else setDraftMessage("No local draft exists for this string yet.");
  }
  function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    file.text().then((text) => restore(JSON.parse(text))).catch(() => setDraftMessage("That file is not valid draft JSON.")); event.target.value = "";
  }

  if (loading) return <section className="dual-builder dual-builder-state"><p>Preparing the local builder…</p></section>;
  if (!manifest) return <section className="dual-builder dual-builder-state"><p>Local puzzle builder</p><h2>Build the dictionary index first</h2><span>{manifestError || "No generated authoring data was found."}</span><code>npm run dual:data</code><small>The source corpus and review index stay in Git-ignored local storage.</small></section>;

  return <section className="dual-builder"><header className="dual-builder-header"><span>Local authoring tool</span><h2>Build a DUAL puzzle</h2><p>Kaikki supplies the complete source. You decide what belongs in this puzzle.</p><small>{manifest.counts.acceptedForms?.toLocaleString()} playable analyses · {manifest.counts.reviewForms?.toLocaleString()} awaiting review · frequency is metadata, never a validity gate · built {new Date(manifest.builtAt).toLocaleString()}</small></header><div className="dual-builder-layout">
    <aside className="dual-builder-candidates"><form onSubmit={analyze}><label>Choose your string<input maxLength={3} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. rug" value={query} /></label><button type="submit">Analyze string</button></form><div className="dual-builder-choice-note"><b>You choose the puzzle.</b><p>The Builder measures and filters the full English and Spanish source without choosing a string for you.</p><small>{manifest.counts.exportedPools?.toLocaleString()} strings can be inspected; {manifest.counts.viableSequences?.toLocaleString()} currently have playable families in both languages.</small></div></aside>
    {pool && live ? <main className="dual-builder-workbench"><header><div><small>Selected string</small><strong>{pool.sequence}</strong></div><dl><div><dt>EN families</dt><dd>{live.en.families}</dd></div><div><dt>ES families</dt><dd>{live.es.families}</dd></div><div><dt>Duals</dt><dd>{live.duals}</dd></div><div><dt>Balance</dt><dd>{Math.round(live.balance * 100)}%</dd></div><div><dt>Capacity</dt><dd>{formatScore(live.totalCapacity)}</dd></div></dl></header>
      <section className="dual-builder-warnings"><b>Source review signals</b>{warnings.length ? <ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>No automatic flags in this pool.</p>}</section>
      <section className="dual-builder-targets"><label>Puzzle ID<input onChange={(event) => setSettings({ ...settings, id: event.target.value })} value={settings.id} /></label><label>Target<input min="1" onChange={(event) => setSettings({ ...settings, targetScore: Number(event.target.value) })} type="number" value={settings.targetScore} /></label><label>Minimum EN families<input min="0" onChange={(event) => setSettings({ ...settings, minimumEnglish: Number(event.target.value) })} type="number" value={settings.minimumEnglish} /></label><label>Minimum ES families<input min="0" onChange={(event) => setSettings({ ...settings, minimumSpanish: Number(event.target.value) })} type="number" value={settings.minimumSpanish} /></label><button onClick={() => setSettings({ ...settings, targetScore: live.suggested.targetScore, minimumEnglish: live.suggested.minimumEnglish, minimumSpanish: live.suggested.minimumSpanish })} type="button">Apply live suggestions · {live.suggested.targetScore} / {live.suggested.minimumEnglish} EN / {live.suggested.minimumSpanish} ES</button></section>
      <Playtest key={`${selectedKey}:${JSON.stringify(overrides)}:${JSON.stringify(familyOverrides)}:${JSON.stringify(settings)}`} familyOverrides={familyOverrides} overrides={overrides} pool={pool} settings={settings} />
      <section className="dual-builder-pool"><header><div><b>Author the answer pool</b><span>{visible.length} visible · {selected.size} selected · changes recalculate immediately</span></div><input onChange={(event) => setWordQuery(event.target.value)} placeholder="search surface, lemma, family, gloss" value={wordQuery} /></header>
        <nav className="dual-builder-tabs" aria-label="Answer status">{TABS.map(([value, label]) => <button className={tab === value ? "is-active" : ""} key={value} onClick={() => setTab(value)} type="button">{label} <b>{counts[value]}</b></button>)}</nav>
        <div className="dual-builder-filters"><span>Filter</span>{FILTERS.map(([value, label]) => <button className={filters.includes(value) ? "is-active" : ""} key={value} onClick={() => toggleFilter(value)} type="button">{label}</button>)}{filters.length ? <button onClick={() => setFilters([])} type="button">Clear</button> : null}</div>
        <div className="dual-builder-bulk"><button onClick={() => setSelected(new Set(visible.map((entry) => entry.surface)))} type="button">Select all visible ({visible.length})</button><button onClick={() => setSelected(new Set())} type="button">Clear selection</button><span />{(["default", "both", "en", "es", "review", "exclude"] as DualBuilderAssignment[]).map((assignment) => <button disabled={!selected.size} key={assignment} onClick={() => bulk(assignment)} type="button">{{ default: "Reset default", both: "Set both", en: "Keep EN only", es: "Keep ES only", review: "Move to review", exclude: "Exclude both" }[assignment]}</button>)}</div>
        <div className="dual-builder-entry-list">{visible.map((entry) => {
          const override = overrides[entry.surface]; const state = dualBuilderEntryState(entry, override);
          const runtime = runtimeBySurface.get(entry.surface);
          const effective = runtime?.senses ?? effectiveDualBuilderSenses(entry, override);
          const reasons = unique([...entry.policy.reviewReasons, ...entry.policy.exclusionReasons]); const families = unique(effective.map((sense) => `${sense.language.toLocaleUpperCase()} ${sense.familyId}`));
          const familiarity = (["en", "es"] as const).map((language) => dualBuilderLanguageFamiliarity(entry, language)).filter((item) => item.hasAnalysis);
          const actualLanguages = playableLanguages.get(entry.surface) ?? [];
          const pendingLanguages = state.reviewLanguages.filter((language) => !actualLanguages.includes(language));
          const pending = pendingLanguages.length ? `${pendingLanguages.map((language) => language.toLocaleUpperCase()).join(" + ")} review` : "";
          const ambiguities = (["en", "es"] as const).flatMap((language) => dualBuilderFamilyAmbiguity(entry, language).length ? [`${language.toLocaleUpperCase()} family ambiguity`] : []);
          const modernLoanword = dualBuilderModernSharedLoanwordLanguages(entry).length ? ["modern shared loanword"] : [];
          const assignmentLabel = [actualLanguages.length ? actualLanguages.join(" + ").toLocaleUpperCase() : "", pending].filter(Boolean).join(" · ") || state.status.toLocaleUpperCase();
          const familiarityLabel = familiarity.map((item) => `${item.language.toLocaleUpperCase()} ${item.zipf?.toFixed(2) ?? "missing"} ${item.tier}`).join(" · ");
          return <article className={`${!actualLanguages.length && state.status === "excluded" ? "is-excluded" : (!actualLanguages.length && state.status === "review") || pendingLanguages.length ? "needs-review" : ""} ${state.manual ? "is-manual" : ""}`} key={entry.surface}><div className="dual-builder-entry-summary"><input aria-label={`Select ${entry.surface}`} checked={selected.has(entry.surface)} onChange={() => toggleInSet(setSelected, entry.surface)} type="checkbox" /><span className="dual-builder-entry-name"><strong>{entry.surface}</strong><small>{assignmentLabel}</small></span><span className="dual-builder-entry-meta"><b>{families.join(" · ") || "Not in playable pool"}</b><small>{state.manual ? "manual override · " : "generated default · "}{entry.flags.homograph ? "homograph · " : ""}{entry.flags.accentCollision ? "accent collision · " : ""}{pending ? `${pending} · ` : ""}{ambiguities.length ? `${ambiguities.join(", ")} · ` : ""}{modernLoanword.length ? `${modernLoanword.join(", ")} · ` : ""}{reasons.join(", ")}</small></span><small className="dual-builder-frequency">{familiarityLabel}</small><select aria-label={`Assignment for ${entry.surface}`} onChange={(event) => setDecision(entry.surface, event.target.value as DualBuilderAssignment)} value={normalizeDualBuilderAssignment(override)}><option value="default">Default</option><option value="en">EN only</option><option value="es">ES only</option><option value="both">Both / Dual</option><option value="review">Review</option><option value="exclude">Exclude</option></select><button aria-expanded={expanded.has(entry.surface)} className="dual-builder-disclosure" onClick={() => toggleInSet(setExpanded, entry.surface)} type="button">{expanded.has(entry.surface) ? "Hide" : "Inspect"}</button></div>
            {expanded.has(entry.surface) ? <div className="dual-builder-entry-details"><header><b>All normalized source analyses</b><span>{entry.senses.length} retained</span></header>{(["en", "es"] as const).map((language) => {
              const candidates = dualBuilderFamilyAmbiguity(entry, language);
              if (candidates.length < 2) return null;
              return <label className="dual-builder-family-choice" key={language}>{language.toLocaleUpperCase()} scoring family<select aria-label={`${entry.surface} ${language.toLocaleUpperCase()} scoring family`} onChange={(event) => setFamily(entry.surface, language, event.target.value)} value={familyOverrides[entry.surface]?.[language] ?? ""}><option value="">Choose an attested family</option>{candidates.map((family) => <option key={family} value={family}>{family}</option>)}</select><small>Review remains non-playable until you choose a family and explicitly include its language side.</small></label>;
            })}{entry.senses.map((sense, index) => { const senseFamiliarity = dualBuilderLanguageFamiliarity(entry, sense.language); return <div key={`${sense.language}:${sense.lemma}:${sense.familyId}:${index}`}><b>{sense.language.toLocaleUpperCase()} · {sense.lemma}</b><span>family {sense.familyId} · {sense.partOfSpeech} · {sense.formKind} · {sense.status} · {senseFamiliarity.tier}{Number.isFinite(sense.zipf) ? ` · Zipf ${sense.zipf?.toFixed(2)}` : " · no frequency"}</span><p>{sense.gloss || sense.reason || "No gloss supplied by source."}</p></div>; })}</div> : null}</article>;
        })}</div>
      </section>
      <footer className="dual-builder-actions"><label>Assign to date<input aria-label="Assign puzzle to date" onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} /></label><button disabled={!scheduleDate} onClick={schedulePuzzle} type="button">Assign local Daily</button><button onClick={saveDraft} type="button">{saved ? "Saved locally" : "Save local draft"}</button><button onClick={restoreLatest} type="button">Restore latest local draft</button><button onClick={() => fileInput.current?.click()} type="button">Load draft JSON</button><input accept="application/json,.json" hidden onChange={loadFile} ref={fileInput} type="file" /><button onClick={() => { const draft = payload(); if (draft) downloadJson(`dual-${pool.metrics.key}-draft.json`, draft); }} type="button">Download draft JSON</button><small>{draftMessage || "Assignments stay in this browser and replace the built-in Daily only for their chosen date."}</small></footer>
    </main> : <main className="dual-builder-workbench dual-builder-state"><p>{selectedKey ? `Loading ${selectedKey.toLocaleUpperCase()}…` : "Your string comes first"}</p><h2>{selectedKey ? selectedKey.toLocaleUpperCase() : "Choose three letters"}</h2><span>{poolError || "Enter the exact string you want to explore. DUAL will analyze it without choosing for you."}</span></main>}
  </div></section>;
}
