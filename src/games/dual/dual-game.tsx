"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import "./dual.css";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import { gameStorageKey } from "../../platform/storage";
import { DUAL_AUTHORED_PUZZLES_KEY, parseAuthoredDualPuzzles, type AuthoredDualPuzzleLibrary } from "./authored-puzzles.mjs";
import {
  DUAL_DAILY_EPOCH,
  dualArchive,
  dualDateFromKey,
  dualDateKey,
  dualLexicon,
  selectDailyDualPuzzle,
} from "./catalog.mjs";
import {
  createDualSession,
  dualFamilyDiscoveries,
  dualFamilyProgress,
  dualProgress,
  hydrateDualSession,
  serializeDualSession,
  submitDualWord,
  type DualPuzzle,
  type DualSession,
  type DualSubmission,
} from "./engine.mjs";
import {
  parseDualRunLibrary,
  upsertDualRun,
  type DualRunLibrary,
} from "./library.mjs";
import {
  DEFAULT_DUAL_INTERFACE_LANGUAGE,
  DUAL_INTERFACE_LANGUAGE_COOKIE,
  DUAL_INTERFACE_LANGUAGE_EVENT,
  DUAL_INTERFACE_LANGUAGES,
  dualLocalizedText,
  parseDualInterfaceLanguage,
  type DualInterfaceLanguage,
} from "./language.mjs";
import { createDualLexicon, type DualLexicon } from "./lexicon.mjs";
import { loadLocalStudioSlot } from "../../authoring/local-runtime";
import { dailyRunId, sessionRunId, useGameRunPersistence } from "../../platform/game-run-persistence";
import { useGameRestoration, useProgressStorage } from "../../platform/game-progress-provider";
import { useGameTheme } from "../../platform/game-theme-provider";
import type { GameRun } from "../../platform/runs.mjs";

const DUAL_DAILY_KEY = gameStorageKey("dual", "daily");
const DUAL_RUNS_KEY = gameStorageKey("dual", "runs");
const DUAL_LANGUAGE_KEY = gameStorageKey("dual", "interface-language");
const DUAL_VIEWS = ["menu", "daily", "archive", "themes", "how-to", "settings"] as const;
type DualView = (typeof DUAL_VIEWS)[number];
const DUAL_THEMES = [
  { id: "mint", en: "spring light", es: "luz de primavera", left: "#add1b5", right: "#f2dda1" },
  { id: "rose", en: "morning sky", es: "cielo matinal", left: "#e8b5bd", right: "#b8d6ec" },
  { id: "violet", en: "golden hour", es: "hora dorada", left: "#c8b8e2", right: "#efd28d" },
  { id: "tide", en: "coastline", es: "costa", left: "#9fcbd0", right: "#e5c695" },
  { id: "citrus", en: "citrus grove", es: "huerto cítrico", left: "#bcd59c", right: "#efb58f" },
  { id: "meadow", en: "wild garden", es: "jardín silvestre", left: "#a9c6a2", right: "#e5b8c4" },
  { id: "dusk", en: "sunset haze", es: "bruma del ocaso", left: "#b7b5d8", right: "#efb596" },
  { id: "ice", en: "winter bloom", es: "flor de invierno", left: "#abcbdc", right: "#d9bad7" },
] as const;
type DualTheme = (typeof DUAL_THEMES)[number]["id"];
type FeedbackTone = "neutral" | "en" | "es" | "dual" | "error";
type DualMilestone = "requirements" | "duals" | "families";
type DualFeedback = {
  en: string;
  es: string;
};

function localized(language: DualInterfaceLanguage, en: string, es: string, side: "en" | "es" = "en") {
  return dualLocalizedText(language, { en, es }, side);
}

function DualLocalizedLine({ language, en, es, className = "" }: {
  language: DualInterfaceLanguage;
  en: string;
  es: string;
  className?: string;
}) {
  const copy = language === "es" ? es : en;
  return <span className={`dual-localized-line${className ? ` ${className}` : ""}`} lang={language === "es" ? "es" : undefined}>{copy}</span>;
}

function neutralFeedback(): DualFeedback {
  return {
    en: "Type a word in English or Spanish.",
    es: "Escribe una palabra en inglés o español.",
  };
}

function dualViewFromUrl(): DualView {
  if (typeof window === "undefined") return "menu";
  const candidate = new URL(window.location.href).searchParams.get("view");
  return DUAL_VIEWS.includes(candidate as DualView) ? candidate as DualView : "menu";
}

function writeDualViewUrl(view: DualView, dateKey?: string) {
  const url = new URL(window.location.href);
  if (view === "menu") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view === "archive" && dateKey) url.searchParams.set("date", dateKey);
  else url.searchParams.delete("date");
  window.history.pushState({}, "", url);
}

function DualWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`dual-wordmark${compact ? " is-compact" : ""}`} aria-label="Dual">
      <span>DU</span><b>AL</b>
    </span>
  );
}

function DualRouteRestoring({ view, language, message }: { view: DualView; language: DualInterfaceLanguage; message: string }) {
  if (view === "daily") {
    return (
      <section className="dual-play dual-route-restoring" aria-busy="true" aria-label={localized(language, "Preparing daily puzzle", "Preparando el reto diario", "es")}>
        <span className="dual-route-status" role="status">{message}</span>
      </section>
    );
  }
  return (
    <section className="dual-library-view dual-route-restoring is-library" aria-busy="true" aria-label={localized(language, `Preparing ${view}`, `Preparando ${view}`, "es")}>
      <span className="dual-route-status" role="status">{message}</span>
    </section>
  );
}

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

function HighlightedSequence({ surface, sequence }: { surface: string; sequence: string }) {
  const index = surface.toLocaleLowerCase().indexOf(sequence.toLocaleLowerCase());
  if (index < 0) return surface;
  return (
    <>
      {surface.slice(0, index)}
      <mark>{surface.slice(index, index + sequence.length)}</mark>
      {surface.slice(index + sequence.length)}
    </>
  );
}

function DiscoveryWord({ submission, sequence }: { submission: DualSubmission; sequence: string }) {
  return (
    <span className={`dual-discovery-word is-${submission.kind}`}>
      <span className="dual-discovery-word-text"><HighlightedSequence surface={submission.surface} sequence={sequence} /></span>
      <small>+{formatPoints(submission.points)}</small>
    </span>
  );
}

function DiscoveryFamily({ family, anchor, forms, sequence }: {
  family: string;
  anchor: DualSubmission;
  forms: DualSubmission[];
  lastIndex: number;
  sequence: string;
}) {
  return (
    <section className="dual-discovery-family" data-family={family} key={family}>
      <DiscoveryWord sequence={sequence} submission={anchor} />
      {forms.length ? (
        <div className={`dual-discovery-forms${forms.length >= 4 ? " is-scrollable" : ""}`}>
          {forms.map((submission) => <DiscoveryWord key={submission.surface} sequence={sequence} submission={submission} />)}
        </div>
      ) : null}
    </section>
  );
}

function DualDiamondProgress({ found, total, language, compact = false }: {
  found: number;
  total: number;
  language: DualInterfaceLanguage;
  compact?: boolean;
}) {
  return (
    <div
      aria-label={localized(language, `${found} of ${total} Duals found`, `${found} de ${total} Duals encontrados`)}
      className={`dual-diamonds${compact ? " is-compact" : ""}`}
      role="img"
    >
      {Array.from({ length: total }, (_, index) => (
        <i aria-hidden="true" className={index < found ? "is-found" : ""} key={index} />
      ))}
    </div>
  );
}

function DualAchievementStars({ progress, puzzle, allFamiliesFound, language }: {
  progress: ReturnType<typeof dualProgress>;
  puzzle: DualPuzzle;
  allFamiliesFound: boolean;
  language: DualInterfaceLanguage;
}) {
  const [expanded, setExpanded] = useState(false);
  const primaryStarsFilled = Number(progress.isSolved) + Number(progress.allDualsFound);
  const englishRemaining = Math.max(0, puzzle.minimumEnglish - progress.enFamilies);
  const spanishRemaining = Math.max(0, puzzle.minimumSpanish - progress.esFamilies);
  const pointsRemaining = Math.max(0, puzzle.targetScore - progress.score);
  const remainingGoals = language === "es"
    ? [
      englishRemaining ? `${englishRemaining} ${englishRemaining === 1 ? "familia inglesa" : "familias inglesas"}` : null,
      spanishRemaining ? `${spanishRemaining} ${spanishRemaining === 1 ? "familia española" : "familias españolas"}` : null,
      pointsRemaining ? `${formatPoints(pointsRemaining)} puntos` : null,
    ].filter(Boolean)
    : [
      englishRemaining ? `${englishRemaining} more English ${englishRemaining === 1 ? "family" : "families"}` : null,
      spanishRemaining ? `${spanishRemaining} more Spanish ${spanishRemaining === 1 ? "family" : "families"}` : null,
      pointsRemaining ? `${formatPoints(pointsRemaining)} more points` : null,
    ].filter(Boolean);
  const dualsRemaining = Math.max(0, puzzle.dualCount - progress.foundDuals);
  const goalDetail = progress.isSolved
    ? localized(language, "All three targets complete.", "Los tres objetivos se han completado.")
    : localized(language, `Still needed: ${remainingGoals.join(" · ")}.`, `Aún faltan: ${remainingGoals.join(" · ")}.`);
  const dualDetail = progress.allDualsFound
    ? localized(language, "Every DUAL found.", "Todos los Duals encontrados.")
    : localized(language, `${dualsRemaining} ${dualsRemaining === 1 ? "DUAL is" : "DUALs are"} still waiting to be found.`, `Quedan ${dualsRemaining} ${dualsRemaining === 1 ? "Dual" : "Duals"} por encontrar.`);
  const states = [
    goalDetail,
    dualDetail,
  ];
  if (allFamiliesFound) states.push(localized(language, "every family found", "todas las familias encontradas"));
  return (
    <div className="dual-achievement-control" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
    }}>
      <button aria-controls="dual-achievement-details" aria-expanded={expanded} aria-label={states.join("; ")} className="dual-achievement-stars" onClick={() => setExpanded((current) => !current)} type="button">
        {[0, 1].map((index) => {
          const filled = index < primaryStarsFilled;
          return <span aria-hidden="true" className={filled ? "is-filled" : ""} key={index}>{filled ? "★" : "☆"}</span>;
        })}
        {allFamiliesFound && primaryStarsFilled === 2 ? <span aria-hidden="true" className="is-filled is-secret" title={states[2]}>★</span> : null}
      </button>
      {expanded ? (
        <div className="dual-achievement-popover" id="dual-achievement-details">
          <p><i aria-hidden="true">{progress.isSolved ? "★" : "☆"}</i><b>{localized(language, "Puzzle goal", "Meta del reto")}</b><span>{goalDetail}</span></p>
          <p><i aria-hidden="true">{progress.allDualsFound ? "★" : "☆"}</i><b>{localized(language, "DUALS", "DUALS")}</b><span>{dualDetail}</span></p>
          {allFamiliesFound ? <p className="is-secret"><i aria-hidden="true">★</i><b>{localized(language, "Secret star", "Estrella secreta")}</b><span>{localized(language, "Every family found.", "Todas las familias encontradas.")}</span></p> : null}
        </div>
      ) : null}
    </div>
  );
}

function feedbackForSubmission(submission: DualSubmission): DualFeedback {
  const word = submission.surface.toLocaleUpperCase();
  if (submission.kind === "dual") {
    const message = `${word} · DUAL +${formatPoints(submission.points)}`;
    return { en: message, es: message };
  }
  if (submission.kind === "inflection") {
    return {
      en: `${word} +0.25 · another form`,
      es: `${word} +0.25 · otra forma`,
    };
  }
  return {
    en: `${word} +1 · EN`,
    es: `${word} +1 · ES`,
  };
}

function rejectionFeedback(reason: string | null, canonical?: string, candidates?: string[]): DualFeedback {
  const word = canonical?.toLocaleUpperCase();
  const choices = candidates?.join(" / ");
  if (reason === "empty") return { en: "Type a word first.", es: "Escribe una palabra primero." };
  if (reason === "duplicate") return {
    en: `${word ?? "That word"} is already on the board.`,
    es: `${word ?? "Esa palabra"} ya está en el tablero.`,
  };
  if (reason === "sequence-missing") return {
    en: `${word ?? "That word"} does not contain this puzzle’s exact string.`,
    es: `${word ?? "Esa palabra"} no contiene la secuencia exacta de este reto.`,
  };
  if (reason === "ambiguous") return {
    en: `Add the accent to distinguish ${choices ?? "that word"}.`,
    es: `Añade la tilde para distinguir ${choices ?? "esa palabra"}.`,
  };
  if (reason === "finished") return {
    en: "Today’s round is finished.",
    es: "El reto de hoy ha terminado.",
  };
  return { en: "Not accepted.", es: "No aceptada." };
}

function DualFeedbackCopy({ feedback, language }: { feedback: DualFeedback; language: DualInterfaceLanguage }) {
  if (language === "es") return <>{feedback.es}</>;
  return <>{feedback.en}</>;
}

function DualResults({ session, puzzle, lexicon, milestone, language, onClose }: {
  session: DualSession;
  puzzle: DualPuzzle;
  lexicon: DualLexicon;
  milestone: DualMilestone;
  language: DualInterfaceLanguage;
  onClose: () => void;
}) {
  const progress = dualProgress(session, puzzle);
  const families = dualFamilyProgress(session, puzzle, lexicon);
  const eyebrow = milestone === "families"
    ? { en: "EVERY FAMILY FOUND", es: "TODAS LAS FAMILIAS ENCONTRADAS" }
    : milestone === "duals"
      ? { en: "ALL DUALS FOUND", es: "TODOS LOS DUALS ENCONTRADOS" }
      : { en: "PUZZLE REQUIREMENTS MET", es: "OBJETIVOS DEL RETO CUMPLIDOS" };
  const detail = milestone === "families"
    ? {
      en: `${families.found} of ${families.total} English and Spanish families found`,
      es: `${families.found} de ${families.total} familias inglesas y españolas encontradas`,
    }
    : {
      en: `${session.submissions.length} ${session.submissions.length === 1 ? "word" : "words"} found`,
      es: `${session.submissions.length} ${session.submissions.length === 1 ? "palabra encontrada" : "palabras encontradas"}`,
    };
  return (
    <div className="dual-result-backdrop" role="presentation">
      <section aria-labelledby="dual-result-title" aria-modal="true" className="dual-result" role="dialog">
        <p><DualLocalizedLine en={eyebrow.en} es={eyebrow.es} language={language} /></p>
        <strong>{puzzle.sequence}</strong>
        <h2 id="dual-result-title">
          {formatPoints(progress.score)} <DualLocalizedLine en="points" es="puntos" language={language} />
        </h2>
        <div className="dual-result-scores">
          <span><small>{localized(language, "EN FAMILIES", "FAMILIAS EN", "en")}</small><b>{progress.enFamilies}</b></span>
          <span className="is-duals"><small>DUALS</small><b>{progress.foundDuals} / {puzzle.dualCount}</b><DualDiamondProgress compact found={progress.foundDuals} language={language} total={puzzle.dualCount} /></span>
          <span><small>{localized(language, "ES FAMILIES", "FAMILIAS ES", "es")}</small><b>{progress.esFamilies}</b></span>
        </div>
        <p className="dual-result-detail"><DualLocalizedLine en={detail.en} es={detail.es} language={language} /></p>
        <button onClick={onClose} type="button">
          <DualLocalizedLine
            en={milestone === "families" ? "Back to the board" : "Keep playing"}
            es={milestone === "families" ? "Volver al tablero" : "Seguir jugando"}
            language={language}
          />
        </button>
      </section>
    </div>
  );
}

function DualLanguageOptions({ language, onChange }: { language: DualInterfaceLanguage; onChange: (language: DualInterfaceLanguage) => void }) {
  return (
    <span aria-label={localized(language, "Interface language", "Idioma de la interfaz", "es")} className="dual-language-options" role="group">
      {DUAL_INTERFACE_LANGUAGES.map((option) => (
        <button aria-pressed={language === option} className={language === option ? "is-current" : undefined} key={option} onClick={() => onChange(option)} type="button">
          {option === "en-es" ? "EN/ES" : option.toLocaleUpperCase()}
        </button>
      ))}
    </span>
  );
}

function DualHowToPlay({ language, onLanguageChange, onPlay }: {
  language: DualInterfaceLanguage;
  onLanguageChange: (language: DualInterfaceLanguage) => void;
  onPlay: () => void;
}) {
  return (
    <section className="dual-how">
      <header>
        <div className="dual-how-heading-row">
          <h2 lang={language === "es" ? "es" : undefined}>
            {localized(language, "How to play", "Cómo jugar", "en")}
          </h2>
          <DualLanguageOptions language={language} onChange={onLanguageChange} />
        </div>
        <div className="dual-how-intro">
          <p>{localized(language, "Start with today’s three letters. Find words that contain them—the letters stay together, but they can appear anywhere.", "Empieza con las tres letras de hoy. Encuentra palabras que las contengan; las letras permanecen juntas, pero pueden aparecer en cualquier parte.", "en")}</p>
          <p lang={language === "en" ? undefined : "es"}>{localized(language, "Words can be English, Spanish, or both. You don’t need to choose a language before entering one.", "Las palabras pueden ser inglesas, españolas o ambas. No necesitas elegir un idioma antes de escribir.", "es")}</p>
        </div>
      </header>

      <div className="dual-how-example-shell">
        <div className="dual-how-example" aria-label={localized(language, "Example words for OTA", "Palabras de ejemplo para OTA")}>
          <div className="is-en"><small>{localized(language, "English only", "Solo inglés", "en")}</small><strong>p<mark>ota</mark>to</strong><span>+1</span></div>
          <div className="is-dual"><small>{localized(language, "Both languages", "Ambos idiomas", "en")}</small><strong>t<mark>ota</mark>l</strong><span>DUAL +2</span></div>
          <div className="is-es" lang={language === "en" ? undefined : "es"}><small>{localized(language, "Spanish only", "Solo español", "es")}</small><strong>pel<mark>ota</mark></strong><span>+1</span></div>
        </div>
      </div>

      <div className="dual-how-concepts">
        <article>
          <h3>{localized(language, "Build word families", "Crea familias de palabras", "en")}</h3>
          <p>{localized(language, "A family groups related forms of the same word. The first accepted form earns +1 and counts toward the family goal; each additional form earns +0.25.", "Una familia reúne formas relacionadas de la misma palabra. La primera forma aceptada suma +1 y cuenta para la meta de familias; cada forma adicional suma +0.25.", "en")}</p>
          <div className="dual-how-family-example">
            <small>{localized(language, "Example · same family", "Ejemplo · misma familia", "en")}</small>
            <span><span>{localized(language, "treat", "tratar", "en")}</span><strong>+1</strong></span>
            <span><span>{localized(language, "treated", "tratamos", "en")}</span><strong>+0.25</strong></span>
          </div>
        </article>
        <article lang={language === "en" ? undefined : "es"}>
          <h3>{localized(language, "Find DUALs", "Encuentra Duals", "es")}</h3>
          <p>{localized(language, "A DUAL is an identically spelled word that is valid in both languages. A new family on each side earns +2.", "Un Dual es una palabra con la misma grafía que es válida en ambos idiomas. Una familia nueva en cada lado suma +2.", "es")}</p>
          <aside className="dual-how-concept-tip"><b>{localized(language, "Tip", "Consejo", "es")}</b><span>{localized(language, "Cognates are helpful: they’re often DUALs, but not every DUAL is a cognate.", "Los cognados son útiles: a menudo son Duals, pero no todos los Duals son cognados.", "es")}</span></aside>
        </article>
      </div>

      <div className="dual-how-goals">
        <h3 className="dual-center-split"><span>{localized(language, "What do the stars mean?", "¿Qué significan las estrellas?", "en")}</span><span lang={language === "en" ? undefined : "es"}>{localized(language, "How do I earn them?", "¿Cómo se consiguen?", "es")}</span></h3>
        <div className="dual-how-star-guide">
          <p><span aria-hidden="true">★</span><b>{localized(language, "First star", "Primera estrella", "en")}</b><em>{localized(language, "Complete all three displayed goals: enough English families, enough Spanish families, and the target score. You need all three.", "Completa las tres metas indicadas: suficientes familias inglesas, suficientes familias españolas y la puntuación objetivo. Necesitas las tres.", "en")}</em></p>
          <p lang={language === "en" ? undefined : "es"}><span aria-hidden="true">☆</span><b>{localized(language, "Second star", "Segunda estrella", "es")}</b><em>{localized(language, "Keep playing until you find every DUAL hidden in the puzzle.", "Sigue jugando hasta encontrar todos los Duals ocultos en el reto.", "es")}</em></p>
        </div>
      </div>

      <footer>
        <button className="dual-primary-action" onClick={onPlay} type="button">
          {localized(language, "Play today", "Jugar hoy", "es")} <i aria-hidden="true">→</i>
        </button>
      </footer>
    </section>
  );
}

type DualRoundSummary = {
  dateKey: string;
  label: string;
  puzzle: DualPuzzle;
  session: DualSession;
  progress: ReturnType<typeof dualProgress>;
  familyProgress: ReturnType<typeof dualFamilyProgress>;
};

function localAuthoredPuzzles() {
  return parseAuthoredDualPuzzles(localStorage.getItem(DUAL_AUTHORED_PUZZLES_KEY));
}

async function authoredPuzzlesWithStudio(dateKeys: string[]) {
  const local = localAuthoredPuzzles();
  const slots = await Promise.all([...new Set(dateKeys)].map(async (dateKey) => {
    const [published] = await loadLocalStudioSlot("dual", "daily", dateKey);
    if (!published || published.gameId !== "dual") return null;
    const payload = published.payload;
    return [dateKey, {
      version: 1,
      revision: published.revision,
      dateKey,
      createdAt: published.publishedAt,
      puzzle: {
        id: published.id,
        sequence: payload.sequence,
        targetScore: payload.targetScore,
        minimumEnglish: payload.minimumEnglish,
        minimumSpanish: payload.minimumSpanish,
        dualCount: payload.dualCount,
      },
      lexicon: payload.lexicon,
    }] as const;
  }));
  return parseAuthoredDualPuzzles({
    ...local,
    ...Object.fromEntries(slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null)),
  });
}

function resolveDualRound(dateKey: string, fallbackDate: Date, authored: AuthoredDualPuzzleLibrary): { puzzle: DualPuzzle; lexicon: DualLexicon; revision: number; authored: boolean } {
  const scheduled = authored[dateKey];
  if (scheduled) return { puzzle: scheduled.puzzle, lexicon: createDualLexicon(scheduled.lexicon), revision: scheduled.revision, authored: true };
  return { puzzle: selectDailyDualPuzzle(fallbackDate), lexicon: dualLexicon, revision: 1, authored: false };
}

function DualMenu({ language, onOpen }: {
  language: DualInterfaceLanguage;
  onOpen: (view: DualView) => void;
}) {
  return (
    <section className="dual-menu">
      <header>
        <DualWordmark />
        <h2 className="dual-center-split">
          <span>{localized(language, "One string", "Una secuencia", "en")}</span>
          <span lang={language === "en" ? undefined : "es"}>{localized(language, "Two languages", "Dos idiomas", "es")}</span>
        </h2>
        <p className="dual-center-split dual-center-split--body">
          <span>{localized(language, "Find the words that live on either side", "Encuentra las palabras que viven a cada lado", "en")}</span>
          <span lang={language === "en" ? undefined : "es"}>{localized(language, "and the ones that belong to both", "y las que pertenecen a ambos", "es")}</span>
        </p>
      </header>

      <div className="dual-menu-options">
        <button className="dual-menu-daily" onClick={() => onOpen("daily")} type="button">
          <span lang={language === "es" ? "es" : "en"}><b>{localized(language, "Daily", "Diario", "en")}</b><small>{localized(language, "Today’s puzzle", "El reto de hoy", "en")}</small></span>
          <i aria-hidden="true">→</i>
        </button>
        <div className="dual-menu-secondary">
          <button onClick={() => onOpen("archive")} type="button"><b>{localized(language, "Archive", "Archivo", "en")}</b><span>{localized(language, "Past Games", "Juegos Pasados", "en")}</span></button>
          <button lang={language === "en" ? undefined : "es"} onClick={() => onOpen("themes")} type="button"><b>{localized(language, "Themes", "Temas", "es")}</b><span>{localized(language, "Color pairs", "Pares de colores", "es")}</span></button>
          <button lang={language === "en" ? undefined : "es"} onClick={() => onOpen("how-to")} type="button"><b>{localized(language, "How to play", "Cómo jugar", "es")}</b><span>{localized(language, "Scoring + Duals", "Puntuación + Duals", "es")}</span></button>
          <button lang={language === "en" ? undefined : "es"} onClick={() => onOpen("settings")} type="button"><b>{localized(language, "Settings", "Ajustes", "es")}</b><span>{localized(language, "Local progress", "Progreso local", "es")}</span></button>
        </div>
      </div>
    </section>
  );
}

function DualThemes({ language, theme, onChange }: {
  language: DualInterfaceLanguage;
  theme: DualTheme;
  onChange: (theme: DualTheme) => void;
}) {
  return (
    <section className="dual-library-view dual-themes">
      <header>
        <p><DualLocalizedLine en="Themes" es="Temas" language={language} /></p>
        <h2><DualLocalizedLine en="Pick a pair" es="Elige un par" language={language} /></h2>
      </header>
      <div aria-label={localized(language, "Choose a DUAL theme", "Elige un tema de DUAL", "es")} className={`dual-theme-grid is-${language}`} role="radiogroup">
        {DUAL_THEMES.map((choice) => (
          <button
            aria-checked={theme === choice.id}
            className={theme === choice.id ? "is-current" : undefined}
            key={choice.id}
            onClick={() => onChange(choice.id)}
            role="radio"
            style={{ "--dual-theme-left": choice.left, "--dual-theme-right": choice.right } as CSSProperties}
            type="button"
          >
            <span aria-hidden="true"><i /><i /></span>
            <b className="dual-theme-name"><span className="is-en-copy">{choice.en}</span><span className="is-es-copy" lang="es">{choice.es}</span></b>
            <small className="dual-theme-status"><span className="is-en-copy">{theme === choice.id ? "Current" : "Choose"}</span><span className="is-es-copy" lang="es">{theme === choice.id ? "Actual" : "Elegir"}</span></small>
          </button>
        ))}
      </div>
    </section>
  );
}

function dualArchiveLabel(round: DualRoundSummary, language: DualInterfaceLanguage) {
  const date = dualDateFromKey(round.dateKey);
  if (!date) return round.label;
  return new Intl.DateTimeFormat(language === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" }).format(date);
}

function DualArchive({ rounds, todayKey, language, onOpen }: {
  rounds: DualRoundSummary[];
  todayKey: string;
  language: DualInterfaceLanguage;
  onOpen: (dateKey: string) => void;
}) {
  return (
    <section className="dual-library-view dual-archive">
      <header>
        <p><DualLocalizedLine en="Archive" es="Archivo" language={language} /></p>
        <h2><DualLocalizedLine en="Past Games" es="Juegos Pasados" language={language} /></h2>
      </header>
      <div className="dual-archive-list">
        {rounds.map((round) => {
          const started = round.session.submissions.length > 0;
          const starsEarned = Number(round.progress.isSolved) + Number(round.progress.allDualsFound);
          const state = round.familyProgress.allFamiliesFound
            ? localized(language, "Every family", "Todas las familias", "es")
            : round.progress.allDualsFound
            ? localized(language, "All Duals", "Todos los Duals", "es")
            : round.progress.isSolved
              ? localized(language, "Solved", "Resuelto", "es")
              : round.session.submissions.length
                ? `${formatPoints(round.progress.score)} ${localized(language, "pts", "ptos", "es")}`
                : localized(language, "Unplayed", "Sin jugar", "es");
          const statusClass = round.familyProgress.allFamiliesFound
            ? "is-perfect"
            : round.progress.isSolved && round.progress.allDualsFound
              ? "is-complete"
              : round.progress.isSolved || round.progress.allDualsFound
                ? "is-achieved"
                : started ? "is-started" : "is-unplayed";
          return (
            <button className={`dual-archive-card ${statusClass}`} key={round.dateKey} onClick={() => onOpen(round.dateKey)} type="button">
              <header>
                <span>{round.dateKey === todayKey ? localized(language, "Today", "Hoy", "en") : dualArchiveLabel(round, language)}</span>
                <b lang={language === "en" ? undefined : "es"}>{state}</b>
              </header>
              <div className="dual-archive-body">
                {started ? (
                  <span className="is-en"><small>{localized(language, "EN families", "Familias EN", "en")}</small><b>{round.progress.enFamilies}<em>/ {round.puzzle.minimumEnglish}</em></b><i style={{ "--dual-card-progress": `${Math.min(100, round.puzzle.minimumEnglish ? round.progress.enFamilies / round.puzzle.minimumEnglish * 100 : 100)}%` } as CSSProperties} /></span>
                ) : <span />}
                <div className="dual-archive-identity">
                  <strong>{round.puzzle.sequence}</strong>
                  {started ? <span><small>DUALS</small><b>{round.progress.foundDuals} / {round.puzzle.dualCount}</b></span> : null}
                </div>
                {started ? (
                  <span className="is-es" lang={language === "en" ? undefined : "es"}><small>{localized(language, "ES families", "Familias ES", "es")}</small><b>{round.progress.esFamilies}<em>/ {round.puzzle.minimumSpanish}</em></b><i style={{ "--dual-card-progress": `${Math.min(100, round.puzzle.minimumSpanish ? round.progress.esFamilies / round.puzzle.minimumSpanish * 100 : 100)}%` } as CSSProperties} /></span>
                ) : <span />}
              </div>
              <footer>
                {started ? <span className="dual-archive-score"><small>{localized(language, "Score", "Puntos", "en")}</small><b>{formatPoints(round.progress.score)} <em>/ {formatPoints(round.puzzle.targetScore)}</em></b></span> : <span className="dual-archive-score" />}
                <span
                  aria-label={localized(language, `${starsEarned} of 2 stars earned`, `${starsEarned} de 2 estrellas conseguidas`, "es")}
                  className="dual-archive-stars"
                  role="img"
                >
                  {[0, 1].map((index) => <i aria-hidden="true" className={index < starsEarned ? "is-filled" : undefined} key={index}>{index < starsEarned ? "★" : "☆"}</i>)}
                </span>
                <span className="dual-archive-action" lang={language === "en" ? undefined : "es"}>{started ? `${round.session.submissions.length} ${localized(language, round.session.submissions.length === 1 ? "word" : "words", round.session.submissions.length === 1 ? "palabra" : "palabras", "es")}` : localized(language, "Start puzzle", "Empezar reto", "es")} <i aria-hidden="true">→</i></span>
              </footer>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DualSettings({ hasProgress, language, onClear, onLanguageChange }: {
  hasProgress: boolean;
  language: DualInterfaceLanguage;
  onClear: () => void;
  onLanguageChange: (language: DualInterfaceLanguage) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="dual-library-view dual-settings">
      <header>
        <p><DualLocalizedLine en="Settings" es="Ajustes" language={language} /></p>
        <h2><DualLocalizedLine en="Keep it local" es="Todo queda local" language={language} /></h2>
        <span><DualLocalizedLine en="DUAL currently stores puzzle progress only in this browser." es="DUAL guarda actualmente el progreso solo en este navegador." language={language} /></span>
      </header>
      <div className="dual-settings-row">
        <span>
          <b>{localized(language, "Interface language", "Idioma de la interfaz", "en")}</b>
          <small>{localized(language, "Choose English, Spanish, or the two-sided view.", "Elige inglés, español o la vista bilingüe.", "en")}</small>
        </span>
        <DualLanguageOptions language={language} onChange={onLanguageChange} />
      </div>
      <div className="dual-settings-row">
        <span><b>{localized(language, "Clear progress", "Borrar progreso", "en")}</b><small>{localized(language, "Remove every saved Daily and Archive board.", "Elimina todos los tableros diarios y del archivo.", "en")}</small></span>
        {!confirming ? (
          <button disabled={!hasProgress} lang={language === "en" ? undefined : "es"} onClick={() => setConfirming(true)} type="button">{localized(language, "Clear", "Borrar", "es")}</button>
        ) : (
          <span className="dual-settings-confirm">
            <button onClick={() => setConfirming(false)} type="button">{localized(language, "Cancel", "Cancelar", "es")}</button>
            <button className="is-danger" onClick={() => { onClear(); setConfirming(false); }} type="button">{localized(language, "Clear everything", "Borrar todo", "es")}</button>
          </span>
        )}
      </div>
      <p className="dual-settings-note"><b>{localized(language, "About your data", "Sobre tus datos", "en")}</b><DualLocalizedLine en="Guest progress stays on this device. Sign in to sync your progress. Dictionary checks stay local." es="El progreso como invitado queda en este dispositivo. Inicia sesión para sincronizarlo. Las consultas al diccionario son locales." language={language} /></p>
    </section>
  );
}

export function DualGame({ initialLanguage = DEFAULT_DUAL_INTERFACE_LANGUAGE, initialRoute }: {
  initialLanguage?: DualInterfaceLanguage;
  initialRoute?: { view?: string; date?: string };
}) {
  const progressStorage = useProgressStorage();
  const restoration = useGameRestoration();
  const [hydratedRevision, setHydratedRevision] = useState<typeof restoration.revision | undefined>(undefined);
  const [prepared, setPrepared] = useState<{ dateKey: string; authored: AuthoredDualPuzzleLibrary } | null>(null);
  const [showLoading, setShowLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [today, setToday] = useState(() => dualDateFromKey(DUAL_DAILY_EPOCH) ?? new Date(2026, 7, 30, 12));
  const todayKey = useMemo(() => dualDateKey(today), [today]);
  const hydrated = restoration.ready && hydratedRevision === restoration.revision && prepared?.dateKey === todayKey;
  const archive = useMemo(() => dualArchive(14, today), [today]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<DualView>(() => DUAL_VIEWS.includes(initialRoute?.view as DualView)
    ? initialRoute!.view as DualView
    : "menu");
  const [archivePlaying, setArchivePlaying] = useState(false);
  const [roundDateKey, setRoundDateKey] = useState(todayKey);
  const [authoredPuzzles, setAuthoredPuzzles] = useState<AuthoredDualPuzzleLibrary>({});
  const round = useMemo(() => resolveDualRound(roundDateKey, dualDateFromKey(roundDateKey) ?? today, authoredPuzzles), [authoredPuzzles, roundDateKey, today]);
  const puzzle = round.puzzle;
  const lexicon = round.lexicon;
  const [session, setSession] = useState<DualSession>(() => createDualSession({
    puzzle: selectDailyDualPuzzle(today),
    dateKey: todayKey,
  }));
  const [runLibrary, setRunLibrary] = useState<DualRunLibrary>({});
  const [language, setLanguage] = useState<DualInterfaceLanguage>(() => parseDualInterfaceLanguage(initialLanguage));
  const [theme, setTheme, themeRestored] = useGameTheme<DualTheme>("dual", "mint");
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState<DualFeedback>(neutralFeedback);
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [milestones, setMilestones] = useState<DualMilestone[]>([]);
  const progress = dualProgress(session, puzzle);
  const familyProgress = dualFamilyProgress(session, puzzle, lexicon);
  const platformRun = useMemo<GameRun<"dual"> | null>(() => {
    const playing = view === "daily" || (view === "archive" && archivePlaying);
    if (!playing) return null;
    const mode = view === "daily" ? "daily" : "archive";
    const startedAt = new Date(session.startedAt).toISOString();
    return {
      schemaVersion: 1,
      runId: mode === "daily"
        ? dailyRunId("dual", mode, round.authored ? `${roundDateKey}:${puzzle.id}:r${round.revision}` : roundDateKey)
        : sessionRunId("dual", mode, startedAt),
      playerId: null,
      gameId: "dual",
      mode,
      puzzle: { id: puzzle.id, revision: round.revision, date: roundDateKey },
      startedAt,
      completedAt: familyProgress.allFamiliesFound
        ? new Date(session.submissions.at(-1)?.submittedAt ?? session.startedAt).toISOString()
        : null,
      outcome: familyProgress.allFamiliesFound ? "completed" : "in-progress",
      score: progress.score,
      checkpoint: { version: 1, state: { native: serializeDualSession(session), requirementsMetAt: session.solvedAt, allDualsFoundAt: session.allDualsFoundAt } },
      result: {
        score: progress.score,
        enScore: progress.enScore,
        esScore: progress.esScore,
        enFamilies: progress.enFamilies,
        esFamilies: progress.esFamilies,
        foundDuals: progress.foundDuals,
        totalDuals: puzzle.dualCount,
        submissions: session.submissions.map(({ surface, languages, points, submittedAt }) => ({ surface, languages, points, submittedAt })),
      },
    };
  }, [archivePlaying, familyProgress.allFamiliesFound, progress, puzzle, round, roundDateKey, session, view]);
  useGameRunPersistence(platformRun, hydrated);

  useEffect(() => {
    let cancelled = false;
    const browserToday = new Date();
    const browserTodayKey = dualDateKey(browserToday);
    const visibleDateKeys = dualArchive(14, browserToday).map(({ dateKey }) => dateKey);
    queueMicrotask(() => {
      if (cancelled) return;
      setToday(browserToday);
    });
    void authoredPuzzlesWithStudio(visibleDateKeys).then((authored) => {
      if (!cancelled) setPrepared({ dateKey: browserTodayKey, authored });
    }).catch(() => { if (!cancelled) setLoadError(true); });
    const timer = window.setTimeout(() => setShowLoading(true), 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(DUAL_LANGUAGE_KEY);
      const saved = stored === null ? parseDualInterfaceLanguage(initialLanguage) : parseDualInterfaceLanguage(stored);
      // Legacy localStorage-only preferences must settle before the first paint.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLanguage(saved);
      document.cookie = `${DUAL_INTERFACE_LANGUAGE_COOKIE}=${saved}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    } catch { /* The server-provided language remains stable. */ }
  }, [initialLanguage]);

  function summarizeRound(dateKey: string, label: string, library: DualRunLibrary, authored = authoredPuzzles): DualRoundSummary {
    const date = dualDateFromKey(dateKey) ?? today;
    const resolved = resolveDualRound(dateKey, date, authored);
    const roundSession = hydrateDualSession({
      payload: library[dateKey] ?? null,
      puzzle: resolved.puzzle,
      lexicon: resolved.lexicon,
      dateKey,
    });
    return {
      dateKey,
      label,
      puzzle: resolved.puzzle,
      session: roundSession,
      progress: dualProgress(roundSession, resolved.puzzle),
      familyProgress: dualFamilyProgress(roundSession, resolved.puzzle, resolved.lexicon),
    };
  }

  const archiveRounds = archive.map((item) => summarizeRound(item.dateKey, item.label, runLibrary));
  function loadRound(dateKey: string, library = runLibrary, authored = authoredPuzzles) {
    if (!hydrated) return;
    const date = dualDateFromKey(dateKey);
    if (!date) return;
    const resolved = resolveDualRound(dateKey, date, authored);
    const nextSession = hydrateDualSession({
      payload: library[dateKey] ?? null,
      puzzle: resolved.puzzle,
      lexicon: resolved.lexicon,
      dateKey,
    });
    setRoundDateKey(dateKey);
    setSession(nextSession);
    setEntry("");
    setFeedback(neutralFeedback());
    setFeedbackTone("neutral");
    setMilestones([]);
  }

  useEffect(() => {
    if (!restoration.ready || !prepared || prepared.dateKey !== todayKey) return;
    let cancelled = false;
    const syncView = () => {
      if (cancelled) return;
      try {
        let library = parseDualRunLibrary(progressStorage.getItem(DUAL_RUNS_KEY));
        const authored = prepared.authored;
        const legacyRaw = progressStorage.getItem(DUAL_DAILY_KEY);
        if (legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
            const legacyDate = typeof legacy.dateKey === "string" ? legacy.dateKey : null;
            if (legacyDate && !library[legacyDate]) {
              library = { ...library, [legacyDate]: legacy };
              progressStorage.setItem(DUAL_RUNS_KEY, JSON.stringify(library));
            }
          } catch {
            // A corrupt first-pass save is ignored; other dated rounds remain intact.
          }
        }

        const nextView = dualViewFromUrl();
        const requestedDate = new URL(window.location.href).searchParams.get("date");
        const loadStoredRound = (dateKey: string) => {
          const date = dualDateFromKey(dateKey);
          if (!date) return;
          const resolved = resolveDualRound(dateKey, date, authored);
          const nextSession = hydrateDualSession({
            payload: library[dateKey] ?? null,
            puzzle: resolved.puzzle,
            lexicon: resolved.lexicon,
            dateKey,
          });
          setRoundDateKey(dateKey);
          setSession(nextSession);
          setEntry("");
          setFeedback(neutralFeedback());
          setFeedbackTone("neutral");
          setMilestones([]);
        };
        setRunLibrary(library);
        setAuthoredPuzzles(authored);
        setMilestones([]);
        setEntry("");
        setView(nextView);
        if (nextView === "daily") {
          setArchivePlaying(false);
          loadStoredRound(todayKey);
        } else if (nextView === "archive" && requestedDate && dualDateFromKey(requestedDate)) {
          setArchivePlaying(true);
          loadStoredRound(requestedDate);
        } else {
          setArchivePlaying(false);
        }
        setHydratedRevision(restoration.revision);
        setLoadError(false);
      } catch { setLoadError(true); }
    };
    queueMicrotask(() => { void syncView(); });
    const handlePopState = () => { void syncView(); };
    window.addEventListener("popstate", handlePopState);
    return () => { cancelled = true; window.removeEventListener("popstate", handlePopState); };
  }, [progressStorage, todayKey, prepared, restoration.ready, restoration.revision]);

  useEffect(() => {
    if (hydrated && (view === "daily" || (view === "archive" && archivePlaying))) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [hydrated, archivePlaying, view]);

  function persist(next: DualSession) {
    if (!hydrated) return;
    const serialized = serializeDualSession(next);
    const nextLibrary = upsertDualRun(runLibrary, next, serialized);
    setSession(next);
    setRunLibrary(nextLibrary);
    progressStorage.setItem(DUAL_RUNS_KEY, JSON.stringify(nextLibrary));
  }

  function changeLanguage(next: DualInterfaceLanguage) {
    setLanguage(next);
    localStorage.setItem(DUAL_LANGUAGE_KEY, next);
    document.cookie = `${DUAL_INTERFACE_LANGUAGE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    window.dispatchEvent(new CustomEvent(DUAL_INTERFACE_LANGUAGE_EVENT, { detail: next }));
  }

  function openView(next: DualView) {
    writeDualViewUrl(next);
    setView(next);
    setArchivePlaying(false);
    setMilestones([]);
    if (next === "daily") {
      loadRound(todayKey, runLibrary, authoredPuzzles);
    }
  }

  function openArchiveRound(dateKey: string) {
    if (!hydrated) return;
    writeDualViewUrl("archive", dateKey);
    setView("archive");
    setArchivePlaying(true);
    loadRound(dateKey, runLibrary, authoredPuzzles);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated) return;
    const previousFamilyProgress = dualFamilyProgress(session, puzzle, lexicon);
    const result = submitDualWord({ session, puzzle, lexicon, input: entry });
    if (!result.accepted || !result.submission) {
      setFeedback(rejectionFeedback(result.reason, result.canonical, result.candidates));
      setFeedbackTone("error");
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    persist(result.state);
    setEntry("");
    setFeedback(feedbackForSubmission(result.submission));
    setFeedbackTone(result.submission.kind === "dual" ? "dual" : result.submission.languages[0]);
    const nextFamilyProgress = dualFamilyProgress(result.state, puzzle, lexicon);
    const reached: DualMilestone[] = [];
    if (result.progress?.isSolved && !progress.isSolved) reached.push("requirements");
    if (result.progress?.allDualsFound && !progress.allDualsFound) reached.push("duals");
    if (nextFamilyProgress.allFamiliesFound && !previousFamilyProgress.allFamiliesFound) reached.push("families");
    if (reached.length) setMilestones((current) => [...current, ...reached]);
    else requestAnimationFrame(() => inputRef.current?.focus());
  }

  const englishFamilies = useMemo(() => dualFamilyDiscoveries({ session, lexicon, language: "en" }), [lexicon, session]);
  const spanishFamilies = useMemo(() => dualFamilyDiscoveries({ session, lexicon, language: "es" }), [lexicon, session]);
  const duals = [...session.submissions.filter((submission) => submission.kind === "dual")].reverse();

  function clearProgress() {
    if (!hydrated) return;
    progressStorage.removeItem(DUAL_RUNS_KEY);
    progressStorage.removeItem(DUAL_DAILY_KEY);
    setRunLibrary({});
    const fresh = createDualSession({ puzzle: resolveDualRound(todayKey, today, authoredPuzzles).puzzle, dateKey: todayKey });
    setRoundDateKey(todayKey);
    setSession(fresh);
    setEntry("");
    setFeedback(neutralFeedback());
    setFeedbackTone("neutral");
    setMilestones([]);
  }

  const isPlayView = view === "daily" || (view === "archive" && archivePlaying);
  const loadingMessage = loadError
    ? localized(language, "Couldn’t load this puzzle. Please refresh.", "No se pudo cargar el reto. Recarga la página.", "es")
    : restoration.conflict
      ? localized(language, "Choose which save to continue.", "Elige qué progreso continuar.", "es")
      : showLoading ? localized(language, "Getting your puzzle ready…", "Preparando tu reto…", "es") : "";
  const activeTheme = DUAL_THEMES.find((choice) => choice.id === theme) ?? DUAL_THEMES[0];

  return (
    <div
      className="dual-game"
      data-dual-theme={theme}
      data-dual-view={isPlayView ? "play" : view}
      data-interface-language={language}
      data-theme-restored={themeRestored}
      style={{ "--dual-en-field": activeTheme.left, "--dual-es-field": activeTheme.right } as CSSProperties}
    >
      <GameLocalBar
        ariaLabel="Dual"
        brand={<DualWordmark compact />}
        className="game-local-bar--dual"
        homeAriaLabel={localized(language, "Open Dual menu", "Abrir el menú de Dual", "es")}
        items={[
          { label: localized(language, "Menu", "Menú", "es"), current: view === "menu", onSelect: () => openView("menu") },
          { label: localized(language, "Daily", "Diario", "es"), current: view === "daily", onSelect: () => openView("daily") },
          { label: localized(language, "Archive", "Archivo", "es"), current: view === "archive", onSelect: () => openView("archive") },
          { label: localized(language, "Themes", "Temas", "es"), current: view === "themes", onSelect: () => openView("themes") },
          { label: localized(language, "How to play", "Cómo jugar", "es"), current: view === "how-to", onSelect: () => openView("how-to") },
          { label: localized(language, "Settings", "Ajustes", "es"), current: view === "settings", onSelect: () => openView("settings") },
        ]}
        navigationAriaLabel={localized(language, "Dual navigation", "Navegación de Dual", "es")}
        onHome={() => openView("menu")}
      />

      {view === "menu" ? (
        <DualMenu language={language} onOpen={openView} />
      ) : view === "how-to" ? (
        <DualHowToPlay language={language} onLanguageChange={changeLanguage} onPlay={() => openView("daily")} />
      ) : !hydrated && view !== "settings" ? (
        loadError || restoration.conflict ? (
          <section className="dual-startup-pending"><h2>DUAL</h2><p role={loadError ? "alert" : "status"}>{loadingMessage}</p><button type="button" onClick={() => openView("menu")}><DualLocalizedLine en="Back to menu" es="Volver al menú" language={language} /></button></section>
        ) : <DualRouteRestoring view={view} language={language} message={loadingMessage} />
      ) : view === "archive" && !archivePlaying ? (
        <DualArchive language={language} onOpen={openArchiveRound} rounds={archiveRounds} todayKey={todayKey} />
      ) : view === "themes" ? (
        <DualThemes language={language} onChange={setTheme} theme={theme} />
      ) : view === "settings" ? (
        <DualSettings
          hasProgress={hydrated && Object.keys(runLibrary).length > 0}
          language={language}
          onClear={clearProgress}
          onLanguageChange={changeLanguage}
        />
      ) : isPlayView ? (
        <section className="dual-play dual-route-ready" data-dual-state={familyProgress.allFamiliesFound ? "all-families" : progress.allDualsFound ? "all-duals" : progress.isSolved ? "solved" : "playing"} key={`dual-play:${view}:${roundDateKey}`}>
          <div className="dual-language-label is-en"><b>EN</b><span>{localized(language, "English", "Inglés", "en")}</span></div>
          <div className="dual-language-label is-es" lang={language === "en" ? undefined : "es"}><b>ES</b><span>{localized(language, "Spanish", "Español", "es")}</span></div>

          <DualAchievementStars
            allFamiliesFound={familyProgress.allFamiliesFound}
            language={language}
            progress={progress}
            puzzle={puzzle}
          />

          <header className="dual-puzzle-heading">
            <p className="is-prompt">
              <span>{localized(language, "Find words containing", "Encuentra palabras que contengan", "en")}</span>
            </p>
            <div className="dual-puzzle-identity">
              {roundDateKey === todayKey ? null : <small>{roundDateKey}</small>}
              <h2>{puzzle.sequence}</h2>
            </div>
            <p className="is-context" lang={language === "en" ? undefined : "es"}>{localized(language, "in English and Spanish", "en inglés y español", "es")}</p>
          </header>

          <div className="dual-scoreboard" aria-label={localized(language, "Puzzle progress", "Progreso del reto")}>
            <div className={`is-en${progress.enFamilies >= puzzle.minimumEnglish ? " is-met" : ""}`}>
              <small>{localized(language, "EN FAMILIES", "FAMILIAS EN", "en")}</small><strong>{progress.enFamilies}</strong><span>/ {puzzle.minimumEnglish}</span>
              {progress.enFamilies >= puzzle.minimumEnglish ? <i className="dual-score-check" aria-hidden="true">✓</i> : null}
              <span className="dual-score-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, puzzle.minimumEnglish ? progress.enFamilies / puzzle.minimumEnglish * 100 : 100)}%` }} /></span>
            </div>
            <div className={`is-total${progress.score >= puzzle.targetScore ? " is-met" : ""}`}>
              <small><DualLocalizedLine en="SCORE" es="PUNTOS" language={language} /></small><strong>{formatPoints(progress.score)}</strong><span>/ {formatPoints(puzzle.targetScore)}</span>
              {progress.score >= puzzle.targetScore ? <i className="dual-score-check" aria-hidden="true">✓</i> : null}
              <span className="dual-score-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, puzzle.targetScore ? progress.score / puzzle.targetScore * 100 : 100)}%` }} /></span>
            </div>
            <div className={`is-es${progress.esFamilies >= puzzle.minimumSpanish ? " is-met" : ""}`} lang={language === "en" ? undefined : "es"}>
              <small>{localized(language, "ES FAMILIES", "FAMILIAS ES", "es")}</small><strong>{progress.esFamilies}</strong><span>/ {puzzle.minimumSpanish}</span>
              {progress.esFamilies >= puzzle.minimumSpanish ? <i className="dual-score-check" aria-hidden="true">✓</i> : null}
              <span className="dual-score-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, puzzle.minimumSpanish ? progress.esFamilies / puzzle.minimumSpanish * 100 : 100)}%` }} /></span>
            </div>
          </div>

          <div className="dual-dual-progress"><span>DUALS</span><b>{progress.foundDuals} / {puzzle.dualCount}</b><DualDiamondProgress found={progress.foundDuals} language={language} total={puzzle.dualCount} /></div>

          <div className="dual-discoveries" aria-live="polite">
            <div className="dual-discovery-column is-en">
              <div className="dual-family-stream">
                {englishFamilies.map((family) => <DiscoveryFamily key={family.family} sequence={puzzle.sequence} {...family} />)}
              </div>
            </div>
            <div className="dual-discovery-column is-dual">
              {duals.map((submission) => <DiscoveryWord key={submission.surface} sequence={puzzle.sequence} submission={submission} />)}
            </div>
            <div className="dual-discovery-column is-es">
              <div className="dual-family-stream">
                {spanishFamilies.map((family) => <DiscoveryFamily key={family.family} sequence={puzzle.sequence} {...family} />)}
              </div>
            </div>
          </div>

          <div className="dual-entry-zone">
            <form className="dual-entry" onSubmit={handleSubmit}>
              <input
                aria-label={language === "en-es" ? "English or Spanish word. Palabra en inglés o español." : localized(language, "English or Spanish word", "Palabra en inglés o español")}
                autoComplete="off"
                maxLength={32}
                onChange={(event) => setEntry(event.target.value)}
                placeholder={localized(language, "type a word", "escribe una palabra", "en")}
                ref={inputRef}
                spellCheck={false}
                value={entry}
              />
              <button lang={language === "en" ? undefined : "es"} type="submit">{localized(language, "Enter", "Enviar", "es")}</button>
            </form>
            <p className={`dual-feedback is-${feedbackTone}`} role="status"><DualFeedbackCopy feedback={feedback} language={language} /></p>
          </div>
        </section>
      ) : null}

      {hydrated && milestones[0] ? <DualResults language={language} lexicon={lexicon} milestone={milestones[0]} onClose={() => {
        setMilestones((current) => {
          const next = current.slice(1);
          if (!next.length) requestAnimationFrame(() => inputRef.current?.focus());
          return next;
        });
      }} puzzle={puzzle} session={session} /> : null}
    </div>
  );
}
