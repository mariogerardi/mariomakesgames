"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
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
  dualProgress,
  dualWordProgress,
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
  DUAL_INTERFACE_LANGUAGE_EVENT,
  DUAL_INTERFACE_LANGUAGES,
  dualLocalizedText,
  parseDualInterfaceLanguage,
  type DualInterfaceLanguage,
} from "./language.mjs";
import { createDualLexicon, type DualLexicon } from "./lexicon.mjs";
import { loadLocalStudioSlot } from "../../authoring/local-runtime";

const DUAL_DAILY_KEY = gameStorageKey("dual", "daily");
const DUAL_RUNS_KEY = gameStorageKey("dual", "runs");
const DUAL_LANGUAGE_KEY = gameStorageKey("dual", "interface-language");
const DUAL_VIEWS = ["menu", "daily", "archive", "how-to", "stats", "settings"] as const;
type DualView = (typeof DUAL_VIEWS)[number];
type FeedbackTone = "neutral" | "en" | "es" | "dual" | "error";
type DualMilestone = "requirements" | "duals" | "words";
type DualFeedbackPlacement = "en" | "es" | "both" | "center";
type DualFeedback = {
  en: string;
  es: string;
  placement: DualFeedbackPlacement;
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
    placement: "both",
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

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

function DiscoveryFamily({ family, anchor, forms, lastIndex, sequence }: {
  family: string;
  anchor: DualSubmission;
  forms: DualSubmission[];
  lastIndex: number;
  sequence: string;
}) {
  return (
    <section className="dual-discovery-family" data-family={family} key={`${family}:${lastIndex}`}>
      <DiscoveryWord sequence={sequence} submission={anchor} />
      {forms.length ? (
        <div className="dual-discovery-forms">
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

function feedbackForSubmission(submission: DualSubmission): DualFeedback {
  const word = submission.surface.toLocaleUpperCase();
  if (submission.kind === "dual") {
    const message = `${word} · DUAL +${formatPoints(submission.points)}`;
    return { en: message, es: message, placement: "center" };
  }
  const isEnglish = submission.languages[0] === "en";
  if (submission.kind === "inflection") {
    return {
      en: `${word} +0.1 · another form`,
      es: `${word} +0.1 · otra forma`,
      placement: isEnglish ? "en" : "es",
    };
  }
  return {
    en: `${word} +1 · EN`,
    es: `${word} +1 · ES`,
    placement: isEnglish ? "en" : "es",
  };
}

function rejectionFeedback(reason: string | null, canonical?: string, candidates?: string[]): DualFeedback {
  const word = canonical?.toLocaleUpperCase();
  const choices = candidates?.join(" / ");
  if (reason === "empty") return { en: "Type a word first.", es: "Escribe una palabra primero.", placement: "both" };
  if (reason === "duplicate") return {
    en: `${word ?? "That word"} is already on the board.`,
    es: `${word ?? "Esa palabra"} ya está en el tablero.`,
    placement: "both",
  };
  if (reason === "sequence-missing") return {
    en: `${word ?? "That word"} does not contain this puzzle’s exact string.`,
    es: `${word ?? "Esa palabra"} no contiene la secuencia exacta de este reto.`,
    placement: "both",
  };
  if (reason === "ambiguous") return {
    en: `Add the accent to distinguish ${choices ?? "that word"}.`,
    es: `Añade la tilde para distinguir ${choices ?? "esa palabra"}.`,
    placement: "both",
  };
  if (reason === "finished") return {
    en: "Today’s round is finished.",
    es: "El reto de hoy ha terminado.",
    placement: "both",
  };
  return { en: "Not accepted.", es: "No aceptada.", placement: "both" };
}

function DualFeedbackCopy({ feedback, language }: { feedback: DualFeedback; language: DualInterfaceLanguage }) {
  if (language === "en") return <>{feedback.en}</>;
  if (language === "es") return <>{feedback.es}</>;
  if (feedback.placement === "center") return <>{feedback.en}</>;
  if (feedback.placement === "en") return <span className="is-en">{feedback.en}</span>;
  if (feedback.placement === "es") return <span className="is-es" lang="es">{feedback.es}</span>;
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
  const words = dualWordProgress(session, puzzle, lexicon);
  const eyebrow = milestone === "words"
    ? { en: "EVERY WORD FOUND", es: "TODAS LAS PALABRAS ENCONTRADAS" }
    : milestone === "duals"
      ? { en: "ALL DUALS FOUND", es: "TODOS LOS DUALS ENCONTRADOS" }
      : { en: "PUZZLE REQUIREMENTS MET", es: "OBJETIVOS DEL RETO CUMPLIDOS" };
  const detail = milestone === "words"
    ? {
      en: `${words.found} of ${words.total} playable words found`,
      es: `${words.found} de ${words.total} palabras jugables encontradas`,
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
            en={milestone === "words" ? "Back to the board" : "Keep playing"}
            es={milestone === "words" ? "Volver al tablero" : "Seguir jugando"}
            language={language}
          />
        </button>
      </section>
    </div>
  );
}

function DualHowToPlay({ language, onPlay }: { language: DualInterfaceLanguage; onPlay: () => void }) {
  const rules = [
    {
      title: { en: "Find the string.", es: "Encuentra la secuencia." },
      body: { en: "It can appear anywhere, but the letters must stay together.", es: "Puede aparecer en cualquier parte, pero las letras deben permanecer juntas." },
    },
    {
      title: { en: "Switch languages.", es: "Cambia de idioma." },
      body: { en: "The game recognizes English, Spanish, or both—no language picker.", es: "El juego reconoce inglés, español o ambos; no necesitas elegir un idioma." },
    },
    {
      title: { en: "Build new word families.", es: "Crea nuevas familias de palabras." },
      body: { en: "Your first form scores +1. More inflected forms in that family score +0.1.", es: "La primera forma suma +1. Las demás formas flexionadas de esa familia suman +0.1." },
    },
    {
      title: { en: "Spot Duals.", es: "Encuentra Duals." },
      body: { en: "The exact same spelling can score on both language sides. A fresh family on each side scores +2.", es: "La misma grafía puede puntuar en ambos idiomas. Una familia nueva de cada lado suma +2." },
    },
    {
      title: { en: "Balance the board.", es: "Equilibra el tablero." },
      body: { en: "Reach the overall score and distinct EN and ES family goals. Then keep looking for every Dual.", es: "Alcanza la puntuación total y los objetivos de familias EN y ES. Después, sigue buscando todos los Duals." },
    },
  ];
  return (
    <section className="dual-how">
      <header>
        <p><DualLocalizedLine en="How to play" es="Cómo jugar" language={language} /></p>
        <h2 className="dual-center-split">
          <span>{localized(language, "One string", "Una secuencia", "en")}</span>
          <span lang={language === "en" ? undefined : "es"}>{localized(language, "Two languages", "Dos idiomas", "es")}</span>
        </h2>
        <p className="dual-center-split dual-center-split--body">
          <span>{localized(language, "Find words containing the letters", "Encuentra palabras que contengan las letras", "en")}</span>
          <span lang={language === "en" ? undefined : "es"}>{localized(language, "in English and Spanish", "en inglés y español", "es")}</span>
        </p>
      </header>

      <div className="dual-how-example" aria-label={localized(language, "Example words for OTA", "Palabras de ejemplo para OTA")}>
        <div className="is-en"><small>{localized(language, "ENGLISH", "INGLÉS", "en")}</small><strong>p<mark>ota</mark>to</strong><span>+1</span></div>
        <div className="is-dual"><small>{localized(language, "BOTH", "AMBOS")}</small><strong>t<mark>ota</mark>l</strong><span>DUAL +2</span></div>
        <div className="is-es"><small>{localized(language, "SPANISH", "ESPAÑOL", "es")}</small><strong>pel<mark>ota</mark></strong><span>+1</span></div>
      </div>

      <ol className="dual-how-rules">
        {rules.map((rule) => (
          <li key={rule.title.en}>
            <b>{localized(language, rule.title.en, rule.title.es, "en")}</b>
            <span lang={language === "en" ? undefined : "es"}>{localized(language, rule.body.en, rule.body.es, "es")}</span>
          </li>
        ))}
      </ol>

      <div className="dual-how-inflection">
        <span><b>tratar</b> +1</span>
        <i aria-hidden="true">→</i>
        <span><b>tratamos</b> +0.1</span>
        <p><DualLocalizedLine en="Different form, same word family." es="Otra forma, la misma familia de palabras." language={language} /></p>
      </div>
      <button className="dual-primary-action" onClick={onPlay} type="button">
        <DualLocalizedLine en="Play today" es="Jugar hoy" language={language} />
      </button>
    </section>
  );
}

type DualRoundSummary = {
  dateKey: string;
  label: string;
  puzzle: DualPuzzle;
  session: DualSession;
  progress: ReturnType<typeof dualProgress>;
  wordProgress: ReturnType<typeof dualWordProgress>;
};

function localAuthoredPuzzles() {
  return parseAuthoredDualPuzzles(localStorage.getItem(DUAL_AUTHORED_PUZZLES_KEY));
}

async function authoredPuzzlesWithStudio(dateKey: string) {
  const local = localAuthoredPuzzles();
  const [published] = await loadLocalStudioSlot("dual", "daily", dateKey);
  if (!published || published.gameId !== "dual") return local;
  const payload = published.payload;
  return parseAuthoredDualPuzzles({
    ...local,
    [dateKey]: {
      version: 1,
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
    },
  });
}

function resolveDualRound(dateKey: string, fallbackDate: Date, authored: AuthoredDualPuzzleLibrary): { puzzle: DualPuzzle; lexicon: DualLexicon } {
  const scheduled = authored[dateKey];
  if (scheduled) return { puzzle: scheduled.puzzle, lexicon: createDualLexicon(scheduled.lexicon) };
  return { puzzle: selectDailyDualPuzzle(fallbackDate), lexicon: dualLexicon };
}

function DualMenu({ todayRound, language, onOpen }: {
  todayRound: DualRoundSummary;
  language: DualInterfaceLanguage;
  onOpen: (view: DualView) => void;
}) {
  const status = todayRound.wordProgress.allWordsFound
    ? localized(language, "Every word found", "Todas las palabras encontradas", "es")
    : todayRound.progress.allDualsFound
    ? localized(language, "All Duals found", "Todos los Duals encontrados", "es")
    : todayRound.progress.isSolved
      ? localized(language, "Solved · keep looking", "Resuelto · sigue buscando", "es")
      : todayRound.session.submissions.length
        ? `${formatPoints(todayRound.progress.score)} / ${formatPoints(todayRound.puzzle.targetScore)} ${localized(language, "points", "puntos", "es")}`
        : localized(language, "Ready to play", "Listo para jugar", "es");
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
          <span><small>{localized(language, "Today’s string", "Secuencia de hoy", "en")}</small><strong>{todayRound.puzzle.sequence}</strong></span>
          <span lang={language === "en" ? undefined : "es"}><b>{localized(language, "Daily", "Diario", "es")}</b><small>{status}</small></span>
          <i aria-hidden="true">→</i>
        </button>
        <div className="dual-menu-secondary">
          <button onClick={() => onOpen("archive")} type="button"><b>{localized(language, "Archive", "Archivo", "en")}</b><span>{localized(language, "Previous strings", "Secuencias anteriores", "en")}</span></button>
          <button lang={language === "en" ? undefined : "es"} onClick={() => onOpen("how-to")} type="button"><b>{localized(language, "How to play", "Cómo jugar", "es")}</b><span>{localized(language, "Scoring + Duals", "Puntuación + Duals", "es")}</span></button>
          <button onClick={() => onOpen("stats")} type="button"><b>{localized(language, "Stats", "Estadísticas", "en")}</b><span>{localized(language, "Your split so far", "Tu balance hasta ahora", "en")}</span></button>
          <button lang={language === "en" ? undefined : "es"} onClick={() => onOpen("settings")} type="button"><b>{localized(language, "Settings", "Ajustes", "es")}</b><span>{localized(language, "Local progress", "Progreso local", "es")}</span></button>
        </div>
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
        <h2><DualLocalizedLine en="Previous strings" es="Secuencias anteriores" language={language} /></h2>
        <span><DualLocalizedLine en="Every day keeps its own board and progress." es="Cada día conserva su propio tablero y progreso." language={language} /></span>
      </header>
      <div className="dual-archive-list">
        {rounds.map((round) => {
          const state = round.wordProgress.allWordsFound
            ? localized(language, "Every word", "Todas las palabras", "es")
            : round.progress.allDualsFound
            ? localized(language, "All Duals", "Todos los Duals", "es")
            : round.progress.isSolved
              ? localized(language, "Solved", "Resuelto", "es")
              : round.session.submissions.length
                ? `${formatPoints(round.progress.score)} ${localized(language, "pts", "ptos", "es")}`
                : localized(language, "Unplayed", "Sin jugar", "es");
          return (
            <button key={round.dateKey} onClick={() => onOpen(round.dateKey)} type="button">
              <span><small>{round.dateKey === todayKey ? localized(language, "Today", "Hoy", "en") : dualArchiveLabel(round, language)}</small><strong>{round.puzzle.sequence}</strong></span>
              <span lang={language === "en" ? undefined : "es"}><b>{state}</b><small>{round.progress.foundDuals} / {round.puzzle.dualCount} Duals</small></span>
              <i aria-hidden="true">→</i>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DualStats({ rounds, language }: { rounds: DualRoundSummary[]; language: DualInterfaceLanguage }) {
  const played = rounds.filter((round) => round.session.submissions.length > 0);
  const solved = played.filter((round) => round.progress.isSolved);
  const totalWords = played.reduce((sum, round) => sum + round.session.submissions.length, 0);
  const totalDuals = played.reduce((sum, round) => sum + round.progress.foundDuals, 0);
  const enScore = played.reduce((sum, round) => sum + round.progress.enScore, 0);
  const esScore = played.reduce((sum, round) => sum + round.progress.esScore, 0);
  const availableDuals = played.reduce((sum, round) => sum + round.puzzle.dualCount, 0);
  return (
    <section className="dual-library-view dual-stats">
      <header>
        <p><DualLocalizedLine en="Stats" es="Estadísticas" language={language} /></p>
        <h2><DualLocalizedLine en="Your two-sided record" es="Tu historial a dos lados" language={language} /></h2>
        <span><DualLocalizedLine en="Everything here stays on this device." es="Todo se guarda en este dispositivo." language={language} /></span>
      </header>
      <div className="dual-stats-grid">
        <div><small>{localized(language, "Played", "Jugados", "en")}</small><strong>{played.length}</strong></div>
        <div><small>{localized(language, "Solved", "Resueltos", "en")}</small><strong>{solved.length}</strong></div>
        <div lang={language === "en" ? undefined : "es"}><small>{localized(language, "Words found", "Palabras encontradas", "es")}</small><strong>{totalWords}</strong></div>
        <div lang={language === "en" ? undefined : "es"}><small>{localized(language, "Duals found", "Duals encontrados", "es")}</small><strong>{totalDuals}</strong><span>/ {availableDuals}</span></div>
      </div>
      <div className="dual-stats-balance">
        <div><span><b>EN</b>{formatPoints(enScore)}</span><i style={{ "--dual-balance": `${Math.max(4, enScore / Math.max(1, enScore + esScore) * 100)}%` } as CSSProperties} /></div>
        <div><span><b>ES</b>{formatPoints(esScore)}</span><i style={{ "--dual-balance": `${Math.max(4, esScore / Math.max(1, enScore + esScore) * 100)}%` } as CSSProperties} /></div>
      </div>
      {played.length === 0 ? (
        <p className="dual-empty-state"><DualLocalizedLine en="Play a Daily puzzle and your record will appear here." es="Juega el reto diario y tu historial aparecerá aquí." language={language} /></p>
      ) : null}
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
          <small>{localized(language, "Choose how DUAL divides its interface.", "Elige cómo DUAL reparte su interfaz.", "en")}</small>
        </span>
        <span aria-label={localized(language, "Interface language", "Idioma de la interfaz", "es")} className="dual-language-options" role="group">
          {DUAL_INTERFACE_LANGUAGES.map((option) => (
            <button
              aria-pressed={language === option}
              className={language === option ? "is-current" : undefined}
              key={option}
              onClick={() => onLanguageChange(option)}
              type="button"
            >
              {option === "en-es" ? "EN/ES" : option.toLocaleUpperCase()}
            </button>
          ))}
        </span>
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
      <p className="dual-settings-note"><DualLocalizedLine en="No account, cloud sync, or remote dictionary lookup is used by this first version." es="Esta primera versión no usa cuenta, sincronización en la nube ni consultas remotas al diccionario." language={language} /></p>
    </section>
  );
}

export function DualGame() {
  const [today, setToday] = useState(() => dualDateFromKey(DUAL_DAILY_EPOCH) ?? new Date(2026, 7, 30, 12));
  const todayKey = useMemo(() => dualDateKey(today), [today]);
  const archive = useMemo(() => dualArchive(14, today), [today]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<DualView>("menu");
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
  const [language, setLanguage] = useState<DualInterfaceLanguage>(DEFAULT_DUAL_INTERFACE_LANGUAGE);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState<DualFeedback>(neutralFeedback);
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const [milestones, setMilestones] = useState<DualMilestone[]>([]);
  const progress = dualProgress(session, puzzle);
  const wordProgress = dualWordProgress(session, puzzle, lexicon);

  useEffect(() => {
    const browserToday = new Date();
    if (dualDateKey(browserToday) === todayKey) return;
    const update = window.setTimeout(() => setToday(browserToday), 0);
    return () => window.clearTimeout(update);
  }, [todayKey]);

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
      wordProgress: dualWordProgress(roundSession, resolved.puzzle, resolved.lexicon),
    };
  }

  const todayRound = summarizeRound(todayKey, "Today", runLibrary);
  const archiveRounds = archive.map((item) => summarizeRound(item.dateKey, item.label, runLibrary));
  const statsRounds = Object.keys(runLibrary)
    .sort()
    .reverse()
    .map((dateKey) => summarizeRound(dateKey, dateKey, runLibrary));

  function loadRound(dateKey: string, library = runLibrary, authored = authoredPuzzles) {
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
    const syncView = async () => {
      let library = parseDualRunLibrary(localStorage.getItem(DUAL_RUNS_KEY));
      const authored = await authoredPuzzlesWithStudio(todayKey);
      const legacyRaw = localStorage.getItem(DUAL_DAILY_KEY);
      if (legacyRaw) {
        try {
          const legacy = JSON.parse(legacyRaw) as Record<string, unknown>;
          const legacyDate = typeof legacy.dateKey === "string" ? legacy.dateKey : null;
          if (legacyDate && !library[legacyDate]) {
            library = { ...library, [legacyDate]: legacy };
            localStorage.setItem(DUAL_RUNS_KEY, JSON.stringify(library));
          }
        } catch {
          // A corrupt first-pass save is ignored; other dated rounds remain intact.
        }
      }

      const nextView = dualViewFromUrl();
      const requestedDate = new URL(window.location.href).searchParams.get("date");
      setLanguage(parseDualInterfaceLanguage(localStorage.getItem(DUAL_LANGUAGE_KEY)));
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
    };
    queueMicrotask(() => { void syncView(); });
    const handlePopState = () => { void syncView(); };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [todayKey]);

  useEffect(() => {
    if (view === "daily" || (view === "archive" && archivePlaying)) {
      inputRef.current?.focus();
    }
  }, [archivePlaying, view]);

  function persist(next: DualSession) {
    const serialized = serializeDualSession(next);
    const nextLibrary = upsertDualRun(runLibrary, next, serialized);
    setSession(next);
    setRunLibrary(nextLibrary);
    localStorage.setItem(DUAL_RUNS_KEY, JSON.stringify(nextLibrary));
  }

  function changeLanguage(next: DualInterfaceLanguage) {
    setLanguage(next);
    localStorage.setItem(DUAL_LANGUAGE_KEY, next);
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
    writeDualViewUrl("archive", dateKey);
    setView("archive");
    setArchivePlaying(true);
    loadRound(dateKey, runLibrary, authoredPuzzles);
  }

  function closeArchiveRound() {
    writeDualViewUrl("archive");
    setArchivePlaying(false);
    setMilestones([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const previousWordProgress = dualWordProgress(session, puzzle, lexicon);
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
    const nextWordProgress = dualWordProgress(result.state, puzzle, lexicon);
    const reached: DualMilestone[] = [];
    if (result.progress?.isSolved && !progress.isSolved) reached.push("requirements");
    if (result.progress?.allDualsFound && !progress.allDualsFound) reached.push("duals");
    if (nextWordProgress.allWordsFound && !previousWordProgress.allWordsFound) reached.push("words");
    if (reached.length) setMilestones((current) => [...current, ...reached]);
    else requestAnimationFrame(() => inputRef.current?.focus());
  }

  const englishFamilies = useMemo(() => dualFamilyDiscoveries({ session, lexicon, language: "en" }), [lexicon, session]);
  const spanishFamilies = useMemo(() => dualFamilyDiscoveries({ session, lexicon, language: "es" }), [lexicon, session]);
  const duals = [...session.submissions.filter((submission) => submission.kind === "dual")].reverse();

  function clearProgress() {
    localStorage.removeItem(DUAL_RUNS_KEY);
    localStorage.removeItem(DUAL_DAILY_KEY);
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

  return (
    <div className="dual-game" data-interface-language={language}>
      <GameLocalBar
        ariaLabel="Dual"
        brand={<DualWordmark compact />}
        className="game-local-bar--dual"
        homeAriaLabel={localized(language, "Open Dual menu", "Abrir el menú de Dual", "es")}
        items={[
          { label: localized(language, "Menu", "Menú", "es"), current: view === "menu", onSelect: () => openView("menu") },
          { label: localized(language, "Daily", "Diario", "es"), current: view === "daily", onSelect: () => openView("daily") },
          { label: localized(language, "Archive", "Archivo", "es"), current: view === "archive", onSelect: () => openView("archive") },
          { label: localized(language, "How to play", "Cómo jugar", "es"), current: view === "how-to", onSelect: () => openView("how-to") },
          { label: localized(language, "Stats", "Estadísticas", "es"), current: view === "stats", onSelect: () => openView("stats") },
          { label: localized(language, "Settings", "Ajustes", "es"), current: view === "settings", onSelect: () => openView("settings") },
        ]}
        navigationAriaLabel={localized(language, "Dual navigation", "Navegación de Dual", "es")}
        onHome={() => openView("menu")}
      />

      {view === "menu" ? (
        <DualMenu language={language} onOpen={openView} todayRound={todayRound} />
      ) : view === "how-to" ? (
        <DualHowToPlay language={language} onPlay={() => openView("daily")} />
      ) : view === "archive" && !archivePlaying ? (
        <DualArchive language={language} onOpen={openArchiveRound} rounds={archiveRounds} todayKey={todayKey} />
      ) : view === "stats" ? (
        <DualStats language={language} rounds={statsRounds} />
      ) : view === "settings" ? (
        <DualSettings
          hasProgress={Object.keys(runLibrary).length > 0}
          language={language}
          onClear={clearProgress}
          onLanguageChange={changeLanguage}
        />
      ) : isPlayView ? (
        <section className="dual-play" data-dual-state={wordProgress.allWordsFound ? "all-words" : progress.allDualsFound ? "all-duals" : progress.isSolved ? "solved" : "playing"}>
          {view === "archive" ? (
            <button className="dual-archive-back" onClick={closeArchiveRound} type="button">
              ← <DualLocalizedLine en="Archive" es="Archivo" language={language} />
            </button>
          ) : null}
          <div className="dual-language-label is-en"><b>EN</b><span>{localized(language, "English", "Inglés", "en")}</span></div>
          <div className="dual-language-label is-es" lang={language === "en" ? undefined : "es"}><b>ES</b><span>{localized(language, "Spanish", "Español", "es")}</span></div>

          <header className="dual-puzzle-heading">
            <p>
              {roundDateKey === todayKey ? null : <small>{roundDateKey}</small>}
              <DualLocalizedLine en="Find words containing" es="Encuentra palabras que contengan" language={language} />
            </p>
            <h2>{puzzle.sequence}</h2>
            <span><DualLocalizedLine en="in English + Spanish" es="en inglés + español" language={language} /></span>
          </header>

          <div className="dual-scoreboard" aria-label={localized(language, "Puzzle progress", "Progreso del reto")}>
            <div className="is-en"><small>{localized(language, "EN FAMILIES", "FAMILIAS EN", "en")}</small><strong>{progress.enFamilies}</strong><span>/ {puzzle.minimumEnglish}</span></div>
            <div className="is-total"><small><DualLocalizedLine en="SCORE" es="PUNTOS" language={language} /></small><strong>{formatPoints(progress.score)}</strong><span>/ {formatPoints(puzzle.targetScore)}</span></div>
            <div className="is-es" lang={language === "en" ? undefined : "es"}><small>{localized(language, "ES FAMILIES", "FAMILIAS ES", "es")}</small><strong>{progress.esFamilies}</strong><span>/ {puzzle.minimumSpanish}</span></div>
          </div>

          <div className="dual-dual-progress"><span>DUALS</span><b>{progress.foundDuals} / {puzzle.dualCount}</b><DualDiamondProgress found={progress.foundDuals} language={language} total={puzzle.dualCount} /></div>

          <div className="dual-discoveries" aria-live="polite">
            <div className="dual-discovery-column is-en">
              <div className="dual-family-stream">
                {englishFamilies.map((family) => <DiscoveryFamily key={`${family.family}:${family.lastIndex}`} sequence={puzzle.sequence} {...family} />)}
              </div>
            </div>
            <div className="dual-discovery-column is-dual">
              {duals.map((submission) => <DiscoveryWord key={submission.surface} sequence={puzzle.sequence} submission={submission} />)}
            </div>
            <div className="dual-discovery-column is-es">
              <div className="dual-family-stream">
                {spanishFamilies.map((family) => <DiscoveryFamily key={`${family.family}:${family.lastIndex}`} sequence={puzzle.sequence} {...family} />)}
              </div>
            </div>
          </div>

          <div className="dual-entry-zone">
            {wordProgress.allWordsFound ? (
              <p className="dual-completion-callout is-all-duals"><DualLocalizedLine en="EVERY WORD FOUND" es="TODAS LAS PALABRAS ENCONTRADAS" language={language} /></p>
            ) : progress.allDualsFound ? (
              <p className="dual-completion-callout is-all-duals"><DualLocalizedLine en="ALL DUALS FOUND · KEEP PLAYING" es="TODOS LOS DUALS ENCONTRADOS · SIGUE JUGANDO" language={language} /></p>
            ) : progress.isSolved ? (
              <p className="dual-completion-callout"><DualLocalizedLine en="REQUIREMENTS MET · KEEP PLAYING FOR EVERY DUAL" es="OBJETIVOS CUMPLIDOS · SIGUE BUSCANDO TODOS LOS DUALS" language={language} /></p>
            ) : null}
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

      {milestones[0] ? <DualResults language={language} lexicon={lexicon} milestone={milestones[0]} onClose={() => {
        setMilestones((current) => {
          const next = current.slice(1);
          if (!next.length) requestAnimationFrame(() => inputRef.current?.focus());
          return next;
        });
      }} puzzle={puzzle} session={session} /> : null}
    </div>
  );
}
