"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rarityClassicPuzzles } from "./catalog";
import {
  createRaritySession,
  evaluateRarityAttempt,
  formatRarityScore,
  hydrateRaritySession,
  RARITY_TIER_LABELS,
  rarityDailyStorageKey,
  serializeRaritySubmission,
  validateRarityLocalRules,
  type RaritySession,
  type RaritySubmission,
} from "./engine.mjs";
import {
  selectFallbackRarityPuzzle,
  type RarityPuzzle,
} from "./puzzle-loader.mjs";
import {
  createRarityServices,
  summarizeRarityLeaderboard,
  type RarityServices,
  type RarityWordInfo,
} from "./services.mjs";

const API_ROOT =
  "https://rminygbqxd.execute-api.us-east-1.amazonaws.com";

const tierDescriptions: Record<number, string> = {
  1: "Everyday language",
  2: "A little less expected",
  3: "Outside the usual rotation",
  4: "A genuinely rare find",
  5: "Top-shelf vocabulary",
  6: "Once-in-a-blue-moon territory",
};

type LeaderboardSummary = ReturnType<typeof summarizeRarityLeaderboard>;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredSubmission(dateKey: string) {
  const raw = localStorage.getItem(rarityDailyStorageKey(dateKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAnonymousPlayerId() {
  const key = "rarity_user_id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

function rejectionMessage(
  reason: string | null,
  token: string,
  info?: RarityWordInfo,
) {
  if (reason === "too-short") return "Words must be at least four letters.";
  if (reason === "letters-only") {
    return "Letters only—no punctuation, spaces, or numbers.";
  }
  if (reason === "token-missing") {
    return `Your word must include ${token.toUpperCase()}.`;
  }
  if (reason === "word-invalid") {
    return info?.error === "word-service-unavailable"
      ? "The dictionary is unavailable right now. Your turn is still safe."
      : info?.error || "That word could not be validated. Your turn is still safe.";
  }
  return "That word could not be submitted. Your turn is still safe.";
}

function HighlightedWord({
  word,
  token,
}: {
  word: string;
  token: string;
}) {
  const index = word.toLowerCase().indexOf(token.toLowerCase());
  if (index < 0) return word;
  return (
    <>
      {word.slice(0, index)}
      <mark>{word.slice(index, index + token.length)}</mark>
      {word.slice(index + token.length)}
    </>
  );
}

function buildShareText(
  session: RaritySession,
  submission: RaritySubmission,
) {
  return [
    `Rarity · ${session.puzzleDate}`,
    `${formatRarityScore(submission.exactScore)} / 100`,
    RARITY_TIER_LABELS[submission.tier],
    "●".repeat(Math.max(1, submission.tier)),
    window.location.href,
  ].join("\n");
}

async function loadLeaderboardSummary(
  services: RarityServices,
  dateKey: string,
  score: number,
) {
  try {
    const entries = await services.fetchDailyLeaderboard(dateKey);
    return summarizeRarityLeaderboard(entries, score);
  } catch {
    return { total: 0, percentile: null, bestScore: null };
  }
}

export function RarityGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const services = useMemo(
    () =>
      createRarityServices({
        fetcher: fetch,
        wordInfoApi: `${API_ROOT}/wordinfo`,
        puzzleApi: `${API_ROOT}/puzzle`,
        leaderboardApi: `${API_ROOT}/leaderboard`,
      }),
    [],
  );
  const [session, setSession] = useState<RaritySession | null>(null);
  const [displayDate, setDisplayDate] = useState("");
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(
    "One valid word. Make it as rare as you can.",
  );
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardSummary | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      const dateKey = localDateKey();
      const fallback = selectFallbackRarityPuzzle(
        rarityClassicPuzzles,
        dateKey,
      );
      let puzzle: RarityPuzzle = fallback;
      try {
        puzzle = (await services.fetchDailyPuzzle(dateKey)) ?? fallback;
      } catch {
        puzzle = fallback;
      }
      if (cancelled) return;

      const stored = readStoredSubmission(dateKey);
      const nextSession = stored
        ? hydrateRaritySession({
            payload: stored,
            puzzle,
            puzzleDate: dateKey,
          })
        : createRaritySession({ puzzle, puzzleDate: dateKey });

      setDisplayDate(
        new Intl.DateTimeFormat(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date()),
      );
      setSession(nextSession);
      setFeedback(
        nextSession.hasSubmitted
          ? "Today’s word is locked in."
          : "One valid word. Make it as rare as you can.",
      );

      if (nextSession.submission) {
        const summary = await loadLeaderboardSummary(
          services,
          dateKey,
          nextSession.submission.exactScore,
        );
        if (!cancelled) setLeaderboard(summary);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [services]);

  async function submitResultToLeaderboard(
    activeSession: RaritySession,
    submission: RaritySubmission,
  ) {
    try {
      const payload = {
        action: "submit",
        userId: getAnonymousPlayerId(),
        displayName: "Player",
        userType: "anonymous",
        puzzleDate: activeSession.puzzleDate,
        puzzleString: activeSession.puzzle.puzzleString,
        word: submission.word,
        frequency: submission.frequency,
        exactScore: submission.exactScore,
        tier: submission.tier,
        definition: submission.definition || null,
        partOfSpeech: submission.partOfSpeech || null,
        shortDefinitions: submission.shortDefinitions || [],
        wordLength: submission.word.length,
        timestamp: submission.timestamp,
      };
      await services.submitDailyResult(payload);
      const summary = await loadLeaderboardSummary(
        services,
        activeSession.puzzleDate,
        submission.exactScore,
      );
      setLeaderboard(summary);
    } catch {
      setLeaderboard({ total: 0, percentile: null, bestScore: null });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.hasSubmitted || isChecking) return;

    const candidate = guess.trim().toLowerCase();
    const local = validateRarityLocalRules(
      candidate,
      session.puzzle.puzzleString,
    );
    setShareStatus("");
    if (!local.valid) {
      setFeedback(
        rejectionMessage(local.reason, session.puzzle.puzzleString),
      );
      setFeedbackTone("error");
      return;
    }

    setIsChecking(true);
    setFeedback(`Checking ${candidate}…`);
    setFeedbackTone("neutral");

    let wordInfo: RarityWordInfo;
    try {
      wordInfo = await services.validateWord(candidate);
    } catch {
      wordInfo = {
        isValid: false,
        frequency: Number.NaN,
        definition: null,
        partOfSpeech: null,
        shortDefinitions: [],
        allShortDefinitions: [],
        allPartsOfSpeech: [],
        definitionCount: 0,
        partOfSpeechCount: 0,
        definitionsByPartOfSpeech: {},
        usageLabels: [],
        etymology: [],
        examples: [],
        scoreExplanation: null,
        error: "word-service-unavailable",
      };
    }

    const result = evaluateRarityAttempt({
      state: session,
      puzzleString: session.puzzle.puzzleString,
      word: candidate,
      wordInfo,
      timestamp: new Date().toISOString(),
    });
    setIsChecking(false);

    if (!result.accepted) {
      setFeedback(
        rejectionMessage(
          result.reason,
          session.puzzle.puzzleString,
          wordInfo,
        ),
      );
      setFeedbackTone("error");
      inputRef.current?.focus();
      return;
    }

    setSession(result.state);
    setGuess("");
    setFeedback(
      `${RARITY_TIER_LABELS[result.submission.tier]}. Your word is locked in.`,
    );
    setFeedbackTone("success");
    try {
      localStorage.setItem(
        rarityDailyStorageKey(session.puzzleDate),
        JSON.stringify(
          serializeRaritySubmission(
            session.puzzle.puzzleString,
            result.submission,
          ),
        ),
      );
    } catch {
      // The accepted result remains visible if browser storage is unavailable.
    }
    void submitResultToLeaderboard(result.state, result.submission);
  }

  async function handleShare() {
    if (!session?.submission) return;
    const text = buildShareText(session, session.submission);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShareStatus("Shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus("Result copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("Result copied.");
      } catch {
        setShareStatus("Couldn’t share this time.");
      }
    }
  }

  if (!session) {
    return (
      <div className="rarity-game-card rarity-game-loading" aria-busy="true">
        Preparing today’s string…
      </div>
    );
  }

  const token = session.puzzle.puzzleString.toUpperCase();
  const submission = session.submission;
  const tier = submission?.tier ?? 1;

  return (
    <section
      className={`rarity-game-card rarity-tier-${tier}`}
      aria-label="Daily Rarity"
    >
      <header className="rarity-game-header">
        <div>
          <p>Today’s Rarity</p>
          <time dateTime={session.puzzleDate}>{displayDate}</time>
        </div>
        <span>{session.hasSubmitted ? "Locked in" : "One submission"}</span>
      </header>

      {!submission ? (
        <>
          <div className="rarity-prompt">
            <span>Your daily string</span>
            <strong aria-label={`Daily string ${token}`}>{token}</strong>
            <p>
              Submit one valid word containing these letters. Rarer words score
              higher.
            </p>
          </div>

          <form className="rarity-entry" onSubmit={handleSubmit}>
            <label htmlFor="rarity-guess">Your one word</label>
            <div>
              <input
                ref={inputRef}
                id="rarity-guess"
                value={guess}
                onChange={(event) =>
                  setGuess(event.target.value.replace(/[^a-z]/gi, ""))
                }
                minLength={4}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={`Include ${token}…`}
                disabled={isChecking}
              />
              <button disabled={isChecking || guess.length < 4} type="submit">
                {isChecking ? "Checking…" : "Lock it in"}
              </button>
            </div>
          </form>

          <p className="rarity-turn-note">
            Invalid guesses do not use your turn. The first valid word locks.
          </p>
        </>
      ) : (
        <div className="rarity-result">
          <div
            className="rarity-score-ring"
            style={
              {
                "--rarity-score": `${submission.exactScore * 3.6}deg`,
              } as React.CSSProperties
            }
            role="img"
            aria-label={`Rarity score ${formatRarityScore(
              submission.exactScore,
            )} out of 100`}
          >
            <div>
              <strong>{formatRarityScore(submission.exactScore)}</strong>
              <span>/ 100</span>
            </div>
          </div>

          <div className="rarity-result-copy">
            <p className="rarity-result-label">Your word</p>
            <h2>
              <HighlightedWord
                word={submission.word}
                token={session.puzzle.puzzleString}
              />
            </h2>
            <div className="rarity-tier-name">
              <span>{RARITY_TIER_LABELS[tier]}</span>
              <small>{tierDescriptions[tier]}</small>
            </div>
            {submission.definition ? (
              <p className="rarity-definition">
                {submission.partOfSpeech ? (
                  <em>{submission.partOfSpeech}</em>
                ) : null}
                {submission.definition}
              </p>
            ) : null}
          </div>

          <div className="rarity-tier-track" aria-label="Rarity tier">
            {Array.from({ length: 6 }, (_, index) => index + 1).map(
              (tierNumber) => (
                <span
                  className={tierNumber === tier ? "is-current" : ""}
                  key={tierNumber}
                  title={RARITY_TIER_LABELS[tierNumber]}
                />
              ),
            )}
          </div>

          <div className="rarity-result-actions">
            <button onClick={handleShare}>
              Share result <span aria-hidden="true">↗</span>
            </button>
            <span role="status">{shareStatus}</span>
          </div>

          {leaderboard ? (
            <div className="rarity-crowd-note">
              {leaderboard.total > 0 && leaderboard.percentile !== null ? (
                <>
                  <strong>Higher than {leaderboard.percentile}%</strong>
                  <span>
                    Compared with {leaderboard.total}{" "}
                    {leaderboard.total === 1 ? "result" : "results"} today
                  </span>
                </>
              ) : (
                <>
                  <strong>You’re on the board.</strong>
                  <span>More comparisons will appear as people play.</span>
                </>
              )}
            </div>
          ) : (
            <div className="rarity-crowd-note" aria-busy="true">
              <strong>Checking today’s field…</strong>
            </div>
          )}
        </div>
      )}

      <p
        className={`rarity-feedback is-${feedbackTone}`}
        aria-live="polite"
        role="status"
      >
        {feedback}
      </p>

      <details className="rarity-how-to">
        <summary>How scoring works</summary>
        <p>
          Rarity measures how often a word appears in published language. Lower
          frequency means a higher score on the 0–100 scale.
        </p>
        <p>
          Scores pass through six tiers: very common, common, uncommon, rare,
          ultra rare, and legendary. You may test invalid words freely, but
          your first valid submission is final.
        </p>
      </details>
    </section>
  );
}
