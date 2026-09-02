export const TOKEN_FIXTURE_SCHEMA_VERSION = 1;

export type TokenCandidate = {
  token: string;
  score: number;
};

export type TokenPredictionStop = {
  candidates: readonly TokenCandidate[];
  index: number;
  token: string;
};

export type TokenPuzzle = {
  difficulty: "easy" | "hard";
  id: string;
  prompt: string;
  responseTokens: readonly string[];
  schemaVersion: number;
  stops: readonly TokenPredictionStop[];
  tokenizer: {
    id: string;
    note: string;
  };
};

export type TokenCatalogPuzzle = TokenPuzzle & {
  summary: string;
  title: string;
};

function words(response: string) {
  return response.split(/\s+/u);
}

function rawTokens(response: string) {
  return response.split("|");
}

const easyTokenizer = {
  id: "openai-logprob-word-group-v1",
  note: "Word mode: model tokens are grouped into readable written words.",
} as const;

const hardTokenizer = {
  id: "openai-logprob-raw-token-v1",
  note: "Raw model-token mode: leading spaces and line breaks are visibly marked in the response.",
} as const;

const aboveGround: TokenCatalogPuzzle = {
  difficulty: "easy",
  id: "above-ground-easy-001",
  schemaVersion: TOKEN_FIXTURE_SCHEMA_VERSION,
  title: "Above ground",
  summary: "A first look at sunlight.",
  prompt: "Describe the sun to someone who's lived underground their entire life.",
  responseTokens: words("At dawn, a bright disk climbs above the hills and turns the cold ground gold. You cannot look at it for long because its light stings your eyes. Its warmth reaches your skin from farther away than any lamp could shine. Shadows stretch behind every tree, then shrink beneath them at midday. When it sinks, the world cools and darkness returns."),
  stops: [
    { index: 3, token: "bright", candidates: [{ token: "pale", score: 17 }, { token: "vast", score: 17 }, { token: "golden", score: 12 }] },
    { index: 8, token: "hills", candidates: [{ token: "far", score: 31 }, { token: "distant", score: 12 }, { token: "land", score: 12 }, { token: "ground", score: 4 }, { token: "horizon", score: 3 }] },
    { index: 17, token: "look", candidates: [{ token: "stare", score: 30 }, { token: "touch", score: 18 }] },
    { index: 26, token: "your", candidates: [{ token: "harder", score: 25 }] },
    { index: 32, token: "skin", candidates: [{ token: "face", score: 27 }] },
    { index: 38, token: "lamp", candidates: [{ token: "fire", score: 17 }, { token: "torch", score: 2 }, { token: "furnace", score: 1 }] },
    { index: 42, token: "stretch", candidates: [{ token: "shrink", score: 34 }] },
    { index: 45, token: "tree", candidates: [{ token: "stone", score: 25 }] },
    { index: 51, token: "midday", candidates: [{ token: "noon", score: 50 }] },
    { index: 59, token: "darkness", candidates: [{ token: "dark", score: 22 }, { token: "colors", score: 8 }, { token: "waits", score: 3 }] },
  ],
  tokenizer: easyTokenizer,
};

const softNoisyAnimals: TokenCatalogPuzzle = {
  difficulty: "easy",
  id: "soft-noisy-animals-easy-001",
  schemaVersion: TOKEN_FIXTURE_SCHEMA_VERSION,
  title: "Soft, noisy animals",
  summary: "Humanity, explained to a rock.",
  prompt: "Describe humanity as if you were explaining it to a rock.",
  responseTokens: words("Humans are soft, noisy animals that learned to stack stones, name stars, and worry about tomorrow. They dig you from the ground, carve you into walls, throw you at enemies, and sometimes polish you because they think you are beautiful. They live briefly, yet spend much of that briefness arguing about how to live. They are fragile enough to die from cold and clever enough to make fire."),
  stops: [
    { index: 4, token: "animals", candidates: [{ token: "creatures", score: 5 }] },
    { index: 9, token: "stones", candidates: [{ token: "thoughts", score: 16 }, { token: "ideas", score: 6 }, { token: "rocks", score: 2 }] },
    { index: 11, token: "stars", candidates: [{ token: "the", score: 33 }, { token: "storms", score: 12 }] },
    { index: 18, token: "you", candidates: [{ token: "metals", score: 19 }, { token: "minerals", score: 12 }, { token: "into", score: 7 }, { token: "pieces", score: 3 }] },
    { index: 25, token: "walls", candidates: [{ token: "tools", score: 25 }, { token: "homes", score: 3 }, { token: "shapes", score: 2 }, { token: "shelter", score: 1 }] },
    { index: 29, token: "enemies", candidates: [{ token: "each", score: 17 }, { token: "rivals", score: 2 }, { token: "one", score: 2 }] },
    { index: 44, token: "spend", candidates: [{ token: "build", score: 7 }, { token: "behave", score: 3 }, { token: "fill", score: 3 }] },
    { index: 51, token: "how", candidates: [{ token: "who", score: 45 }, { token: "what", score: 17 }, { token: "meaning", score: 4 }] },
    { index: 59, token: "die", candidates: [{ token: "fear", score: 36 }, { token: "be", score: 3 }, { token: "bleed", score: 1 }] },
    { index: 66, token: "make", candidates: [{ token: "build", score: 5 }, { token: "split", score: 2 }] },
  ],
  tokenizer: easyTokenizer,
};

const waterRaw: TokenCatalogPuzzle = {
  difficulty: "hard",
  id: "water-wet-hard-001",
  schemaVersion: TOKEN_FIXTURE_SCHEMA_VERSION,
  title: "Water, raw",
  summary: "A familiar question at token scale.",
  prompt: "Is water wet? Explain like I'm 5.",
  responseTokens: rawTokens("Water|␠makes|␠other|␠things|␠wet|.|␠A|␠single|␠drop|␠is|␠water|,|␠but|␠“|wet|”|␠usually|␠means|␠covered|␠or|␠soaked|␠with|␠water|.|␠So|␠water|␠isn|’t|␠wet|␠by|␠itself|—it|␠makes|␠your|␠hands|,|␠clothes|,|␠and|␠floor|␠wet|."),
  stops: [
    { index: 2, token: "other", candidates: [{ token: "things", score: 50 }] },
    { index: 6, token: "A", candidates: [{ token: "When", score: 5 }] },
    { index: 10, token: "water", candidates: [{ token: "just", score: 27 }] },
    { index: 20, token: "soaked", candidates: [{ token: "touched", score: 2 }] },
    { index: 25, token: "water", candidates: [{ token: "your", score: 11 }, { token: "when", score: 7 }] },
    { index: 36, token: "clothes", candidates: [{ token: "toys", score: 21 }, { token: "socks", score: 13 }, { token: "towels", score: 5 }] },
  ],
  tokenizer: hardTokenizer,
};

const sleepRaw: TokenCatalogPuzzle = {
  difficulty: "hard",
  id: "sleep-skeptic-hard-001",
  schemaVersion: TOKEN_FIXTURE_SCHEMA_VERSION,
  title: "The case against sleep",
  summary: "A slightly skeptical maintenance schedule.",
  prompt: "Explain why humans sleep, but pretend you're not entirely convinced they should.",
  responseTokens: rawTokens("Hum|ans|␠sleep|␠because|␠the|␠brain|␠needs|␠time|␠to|␠repair|␠cells|,|␠sort|␠memories|,|␠regulate|␠hormones|,|␠and|␠reset|␠attention|.|␠Without|␠it|,|␠thinking|␠fr|ays|,|␠emotions|␠sharpen|,|␠immunity|␠weak|ens|,|␠and|␠eventually|␠the|␠body|␠begins|␠making|␠dangerous|␠mistakes|.|␠Yet|␠it|␠remains|␠suspicious|␠that|␠a|␠creature|␠must|␠lie|␠unconscious|␠for|␠roughly|␠a|␠third|␠of|␠its|␠life|␠just|␠to|␠function|␠normally|.|␠Sleep|␠may|␠be|␠essential|,|␠but|␠it|␠feels|␠like|␠evolution|’s|␠least|␠elegant|␠maintenance|␠schedule|."),
  stops: [
    { index: 6, token: "needs", candidates: [{ token: "uses", score: 43 }, { token: "repairs", score: 6 }, { token: "and", score: 6 }] },
    { index: 9, token: "repair", candidates: [{ token: "sort", score: 8 }] },
    { index: 15, token: "regulate", candidates: [{ token: "balance", score: 11 }, { token: "tune", score: 6 }, { token: "reb", score: 2 }, { token: "reset", score: 2 }] },
    { index: 29, token: "emotions", candidates: [{ token: "moods", score: 7 }, { token: "mood", score: 4 }, { token: "immunity", score: 3 }] },
    { index: 40, token: "begins", candidates: [{ token: "starts", score: 73 }] },
    { index: 42, token: "dangerous", candidates: [{ token: "terrible", score: 9 }, { token: "disastrous", score: 6 }, { token: "catastrophic", score: 6 }, { token: "expensive", score: 3 }] },
    { index: 53, token: "lie", candidates: [{ token: "spend", score: 36 }, { token: "become", score: 5 }] },
    { index: 56, token: "roughly", candidates: [{ token: "hours", score: 74 }, { token: "a", score: 16 }] },
    { index: 64, token: "function", candidates: [{ token: "remain", score: 32 }, { token: "keep", score: 32 }, { token: "stay", score: 4 }] },
    { index: 79, token: "elegant", candidates: [{ token: "convenient", score: 5 }, { token: "efficient", score: 5 }] },
  ],
  tokenizer: hardTokenizer,
};

export const tokenPuzzles: readonly TokenCatalogPuzzle[] = [
  aboveGround,
  softNoisyAnimals,
  waterRaw,
  sleepRaw,
];

export const tokenDemoPuzzle = aboveGround;
