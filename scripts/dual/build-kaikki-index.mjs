import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calculateDualBuilderMetrics, deduplicateDualBuilderSenses } from "../../src/games/dual/builder.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localRoot = resolve(repositoryRoot, ".local/dual-kaikki");
const rawDirectory = resolve(localRoot, "raw");
const databasePath = resolve(localRoot, "dual-authoring.sqlite");
const outputDirectory = resolve(repositoryRoot, "public/dual-builder-local");
const poolDirectory = resolve(outputDirectory, "pools");
const REVIEW_FAMILIARITY_ZIPF = 2.5;

const SOURCE_FILES = [
  { language: "en", path: resolve(rawDirectory, "english.jsonl") },
  { language: "es", path: resolve(rawDirectory, "spanish.jsonl") },
];

const ALLOWED_POS = new Set([
  "adj", "adv", "article", "conj", "det", "interj", "noun", "num",
  "particle", "prep", "pron", "verb",
]);
const HARD_USAGE_TAGS = new Set([
  "abbreviation", "acronym", "archaic", "initialism", "misspelling", "obsolete",
  "reconstruction", "romanization", "unattested",
]);
const REVIEW_USAGE_TAGS = new Set([
  "dated", "dialectal", "historical", "informal", "nonstandard", "offensive",
  "rare", "slang", "vulgar", "technical", "scientific", "specialized",
]);
const REJECT_FORM_TAGS = new Set([
  "alternative", "archaic", "dated", "dialectal", "misspelling", "obsolete",
  "rare", "romanization", "unattested",
]);
const BORROW_TEMPLATE_NAMES = new Set(["bor", "borrowed", "lbor", "ubor"]);

function normalize(value) {
  return String(value ?? "").trim().toLocaleLowerCase().normalize("NFC");
}

function foldAccents(value) {
  return Array.from(normalize(value), (character) => character === "ñ"
    ? character
    : character.normalize("NFD").replace(/\p{M}/gu, "")).join("");
}

function isPlayableSurface(value) {
  const surface = normalize(value);
  return surface.length >= 3 && surface.length <= 32 && /^\p{L}+$/u.test(surface);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tagsFrom(record, sense = {}) {
  return unique([
    ...(record.tags ?? []),
    ...(sense.tags ?? []),
  ]).map(normalize);
}

function usagePolicy(record, sense) {
  const tags = tagsFrom(record, sense);
  const hard = tags.find((tag) => HARD_USAGE_TAGS.has(tag));
  if (hard) return { policy: "excluded", reason: `usage:${hard}` };
  const review = tags.find((tag) => REVIEW_USAGE_TAGS.has(tag));
  return review
    ? { policy: "review", reason: `usage:${review}` }
    : { policy: "accepted", reason: "clean-usage" };
}

function loanwordPolicy(record, language) {
  const templates = record.etymology_templates ?? [];
  const borrowTemplates = templates.filter((template) => BORROW_TEMPLATE_NAMES.has(normalize(template.name)));
  const sources = unique(borrowTemplates.map((template) => normalize(template.args?.["2"])));
  const text = String(record.etymology_text ?? "");
  const hasBorrowMarker = borrowTemplates.length > 0 || /\b(?:borrowed|borrowing|loanword)\b/i.test(text);
  const crossLanguage = language === "en"
    ? sources.includes("es") || /\bfrom Spanish\b/i.test(text)
    : sources.includes("en") || /\bfrom English\b/i.test(text);
  if (crossLanguage) return { status: "cross-language", policy: "review", reason: `loanword:${language === "en" ? "es" : "en"}` };
  if (hasBorrowMarker) return { status: "other-borrowing", policy: "accepted", reason: null };
  return { status: "unmarked", policy: "accepted", reason: null };
}

function orthographyPolicy(record) {
  const word = String(record.word ?? "");
  return word === word.toLocaleLowerCase()
    ? { policy: "accepted", reason: null }
    : { policy: "review", reason: "orthography:capitalized" };
}

function morphologyPolicy(language, tags) {
  if (language !== "es") return { policy: "accepted", reason: null };
  const normalized = new Set(tags.map(normalize));
  const hasClitic = [...normalized].some((tag) => tag.startsWith("object-"));
  const productiveVerbForm = normalized.has("infinitive") || normalized.has("gerund") || normalized.has("imperative");
  if (normalized.has("combined-form") || (normalized.has("form-of") && hasClitic && productiveVerbForm)) {
    return { policy: "review", reason: "morphology:enclitic-combination" };
  }
  return { policy: "accepted", reason: null };
}

function combinePolicy(...policies) {
  const excluded = policies.find((item) => item.policy === "excluded");
  if (excluded) return { policy: "excluded", reason: excluded.reason };
  const review = policies.find((item) => item.policy === "review");
  if (review) return { policy: "review", reason: review.reason };
  return { policy: "accepted", reason: "accepted-by-default" };
}

function firstGloss(sense) {
  const gloss = (sense.glosses ?? []).find(Boolean);
  return gloss ? String(gloss).replace(/\s+/g, " ").slice(0, 220) : "";
}

function formLemmas(sense, fallback) {
  const formOf = unique((sense.form_of ?? []).map((target) => normalize(target.word)));
  return formOf.length ? formOf : [normalize(fallback)];
}

function windowsFor(surface) {
  const normalized = normalize(surface);
  const windows = new Set();
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    const sequence = normalized.slice(index, index + 3);
    if (/^[a-zñ]{3}$/.test(sequence)) windows.add(sequence);
  }
  return [...windows];
}

await mkdir(localRoot, { recursive: true });
await rm(databasePath, { force: true });
await rm(`${databasePath}-shm`, { force: true });
await rm(`${databasePath}-wal`, { force: true });
const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = OFF;
  PRAGMA temp_store = MEMORY;
  CREATE TABLE forms (
    id INTEGER PRIMARY KEY,
    surface TEXT NOT NULL,
    folded TEXT NOT NULL,
    language TEXT NOT NULL,
    lemma TEXT NOT NULL,
    family_id TEXT NOT NULL,
    pos TEXT NOT NULL,
    analysis_key TEXT NOT NULL,
    form_kind TEXT NOT NULL,
    policy TEXT NOT NULL,
    policy_reason TEXT NOT NULL,
    loanword_status TEXT NOT NULL,
    source_word TEXT NOT NULL,
    gloss TEXT NOT NULL,
    UNIQUE(surface, language, lemma, pos, analysis_key)
  );
  CREATE INDEX forms_surface ON forms(surface);
  CREATE INDEX forms_folded ON forms(folded);
  CREATE INDEX forms_lemma ON forms(language, lemma);
  CREATE INDEX forms_family ON forms(language, family_id);
  CREATE TABLE source_records (
    source_id TEXT PRIMARY KEY,
    surface TEXT NOT NULL,
    language TEXT NOT NULL,
    pos TEXT NOT NULL,
    policy TEXT NOT NULL,
    policy_reason TEXT NOT NULL,
    stored_analyses INTEGER NOT NULL
  );
  CREATE TABLE frequencies (
    surface TEXT NOT NULL,
    language TEXT NOT NULL,
    zipf REAL NOT NULL,
    PRIMARY KEY(surface, language)
  );
  CREATE TABLE windows (
    sequence TEXT NOT NULL,
    form_id INTEGER NOT NULL REFERENCES forms(id),
    UNIQUE(sequence, form_id)
  );
  CREATE INDEX windows_sequence ON windows(sequence);
`);

const insertForm = database.prepare(`
  INSERT INTO forms (
    surface, folded, language, lemma, family_id, pos, analysis_key, form_kind, policy, policy_reason,
    loanword_status, source_word, gloss
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(surface, language, lemma, pos, analysis_key) DO UPDATE SET
    form_kind = CASE WHEN excluded.form_kind = 'lemma' THEN 'lemma' ELSE forms.form_kind END,
    policy = CASE
      WHEN forms.policy = 'accepted' OR excluded.policy = 'accepted' THEN 'accepted'
      WHEN forms.policy = 'review' OR excluded.policy = 'review' THEN 'review'
      ELSE 'excluded'
    END,
    policy_reason = CASE WHEN excluded.policy = 'accepted' THEN excluded.policy_reason ELSE forms.policy_reason END,
    gloss = CASE WHEN length(forms.gloss) = 0 THEN excluded.gloss ELSE forms.gloss END
`);

const insertSourceRecord = database.prepare(`
  INSERT OR REPLACE INTO source_records
    (source_id, surface, language, pos, policy, policy_reason, stored_analyses)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function storeForm({ surface, language, lemma, pos, analysisKey, formKind, policy, reason, loanwordStatus, sourceWord, gloss }) {
  if (!isPlayableSurface(surface) || !isPlayableSurface(lemma)) return false;
  insertForm.run(
    normalize(surface), foldAccents(surface), language, normalize(lemma), normalize(lemma), pos,
    analysisKey, formKind, policy, reason, loanwordStatus, normalize(sourceWord), gloss,
  );
  return true;
}

async function ingestSource(source) {
  const lines = createInterface({ input: createReadStream(source.path), crlfDelay: Infinity });
  let lineCount = 0;
  let retained = 0;
  let transactionOpen = false;
  database.exec("BEGIN");
  transactionOpen = true;
  try {
    for await (const line of lines) {
      lineCount += 1;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.lang_code !== source.language || !ALLOWED_POS.has(record.pos) || !isPlayableSurface(record.word)) continue;
      const loanword = loanwordPolicy(record, source.language);
      const orthography = orthographyPolicy(record);
      const senses = record.senses?.length ? record.senses : [{}];
      const sensePolicies = [];
      let storedAnalyses = 0;
      let recordIsHeadword = true;

      for (const [senseIndex, sense] of senses.entries()) {
        const usage = usagePolicy(record, sense);
        const combined = combinePolicy(usage, loanword, orthography, morphologyPolicy(source.language, tagsFrom(record, sense)));
        sensePolicies.push(combined);
        const lemmas = formLemmas(sense, record.word);
        const headwordIsForm = lemmas.some((lemma) => lemma !== normalize(record.word));
        if (headwordIsForm) recordIsHeadword = false;
        for (const lemma of lemmas) {
          if (storeForm({
            surface: record.word,
            language: source.language,
            lemma,
            pos: record.pos,
            analysisKey: `${record.id ?? `${source.language}:${record.word}:${record.pos}`}:${senseIndex}`,
            formKind: headwordIsForm ? "inflection" : "lemma",
            policy: combined.policy,
            reason: combined.reason,
            loanwordStatus: loanword.status,
            sourceWord: record.word,
            gloss: firstGloss(sense),
          })) {
            retained += 1;
            storedAnalyses += 1;
          }
        }
      }

      const recordPolicy = sensePolicies.some((item) => item.policy === "accepted")
        ? { policy: "accepted", reason: "accepted-sense" }
        : sensePolicies.some((item) => item.policy === "review")
          ? sensePolicies.find((item) => item.policy === "review")
          : sensePolicies[0] ?? { policy: "excluded", reason: "no-lexical-sense" };

      if (recordIsHeadword) {
        for (const form of record.forms ?? []) {
          const formTags = (form.tags ?? []).map(normalize);
          if (formTags.some((tag) => REJECT_FORM_TAGS.has(tag)) || !isPlayableSurface(form.form)) continue;
          const formPolicy = combinePolicy(recordPolicy, morphologyPolicy(source.language, formTags));
          if (storeForm({
            surface: form.form,
            language: source.language,
            lemma: record.word,
            pos: record.pos,
            analysisKey: `generated:${record.id ?? `${source.language}:${record.word}:${record.pos}`}:${normalize(form.form)}`,
            formKind: "inflection",
            policy: formPolicy.policy,
            reason: formPolicy.reason,
            loanwordStatus: loanword.status,
            sourceWord: record.word,
            gloss: firstGloss(senses.find((sense) => usagePolicy(record, sense).policy === "accepted") ?? senses[0]),
          })) {
            retained += 1;
            storedAnalyses += 1;
          }
        }
      }

      const sourceId = record.id ?? `${source.language}:${record.word}:${record.pos}:${lineCount}`;
      insertSourceRecord.run(
        sourceId, normalize(record.word), source.language, record.pos,
        storedAnalyses > 0 ? recordPolicy.policy : "excluded",
        storedAnalyses > 0 ? recordPolicy.reason : "lemma:not-playable",
        storedAnalyses,
      );

      if (lineCount % 5_000 === 0) {
        database.exec("COMMIT; BEGIN");
        console.log(`${source.language}: ${lineCount.toLocaleString()} records · ${retained.toLocaleString()} candidate forms`);
      }
    }
  } finally {
    if (transactionOpen) database.exec("COMMIT");
  }
  console.log(`${source.language}: complete — ${lineCount.toLocaleString()} records, ${retained.toLocaleString()} candidate forms considered`);
}

for (const source of SOURCE_FILES) await ingestSource(source);

console.log("Reconciling inflections with their headword policies…");
database.exec(`
  CREATE TEMP TABLE lemma_policy AS
  SELECT language, surface AS lemma,
    CASE
      WHEN MAX(CASE WHEN policy = 'accepted' THEN 2 WHEN policy = 'review' THEN 1 ELSE 0 END) = 2 THEN 'accepted'
      WHEN MAX(CASE WHEN policy = 'accepted' THEN 2 WHEN policy = 'review' THEN 1 ELSE 0 END) = 1 THEN 'review'
      ELSE 'excluded'
    END AS policy,
    MIN(policy_reason) AS policy_reason
  FROM forms
  WHERE form_kind = 'lemma'
  GROUP BY language, surface;

  CREATE UNIQUE INDEX lemma_policy_key ON lemma_policy(language, lemma);

  UPDATE forms AS inflection
  SET policy = CASE
        WHEN inflection.policy IN ('review', 'excluded') THEN inflection.policy
        ELSE (
          SELECT headword.policy FROM lemma_policy AS headword
          WHERE headword.language = inflection.language AND headword.lemma = inflection.lemma
        )
      END,
      policy_reason = CASE
        WHEN inflection.policy IN ('review', 'excluded') THEN inflection.policy_reason
        ELSE 'headword:' || (
          SELECT headword.policy_reason FROM lemma_policy AS headword
          WHERE headword.language = inflection.language AND headword.lemma = inflection.lemma
        )
      END
  WHERE inflection.form_kind = 'inflection'
    AND EXISTS (
      SELECT 1 FROM lemma_policy AS headword
      WHERE headword.language = inflection.language AND headword.lemma = inflection.lemma
    );
`);

console.log("Enforcing lemma/headword closure…");
const missingHeadwords = database.prepare(`
  SELECT f.language, f.lemma,
    CASE
      WHEN MAX(CASE WHEN f.policy = 'accepted' THEN 2 WHEN f.policy = 'review' THEN 1 ELSE 0 END) = 2 THEN 'accepted'
      WHEN MAX(CASE WHEN f.policy = 'accepted' THEN 2 WHEN f.policy = 'review' THEN 1 ELSE 0 END) = 1 THEN 'review'
      ELSE 'excluded'
    END AS policy,
    MIN(f.policy_reason) AS policy_reason,
    MIN(f.loanword_status) AS loanword_status,
    MIN(f.gloss) AS gloss
  FROM forms f
  WHERE f.form_kind = 'inflection'
    AND NOT EXISTS (
      SELECT 1 FROM forms headword
      WHERE headword.language = f.language
        AND headword.surface = f.lemma
        AND headword.form_kind = 'lemma'
    )
  GROUP BY f.language, f.lemma
`).all();
database.exec("BEGIN");
for (const row of missingHeadwords) {
  storeForm({
    surface: row.lemma,
    language: row.language,
    lemma: row.lemma,
    pos: "unknown",
    analysisKey: `closure:${row.language}:${row.lemma}`,
    formKind: "lemma",
    policy: row.policy,
    reason: `lemma-closure:${row.policy_reason}`,
    loanwordStatus: row.loanword_status,
    sourceWord: row.lemma,
    gloss: row.gloss,
  });
}
database.exec("COMMIT");
console.log(`lemma closure: ${missingHeadwords.length.toLocaleString()} synthesized headwords`);

function englishMorphologyCandidates(word) {
  const candidates = new Set();
  if (word.endsWith("ies") && word.length > 4) candidates.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ied") && word.length > 4) candidates.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es") && word.length > 4) {
    candidates.add(word.slice(0, -2));
    candidates.add(word.slice(0, -1));
  }
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) candidates.add(word.slice(0, -1));
  if (word.endsWith("ed") && word.length > 4) {
    const stem = word.slice(0, -2);
    candidates.add(stem);
    candidates.add(`${stem}e`);
    if (stem.at(-1) === stem.at(-2)) candidates.add(stem.slice(0, -1));
  }
  if (word.endsWith("ing") && word.length > 5) {
    const stem = word.slice(0, -3);
    candidates.add(stem);
    candidates.add(`${stem}e`);
    if (stem.at(-1) === stem.at(-2)) candidates.add(stem.slice(0, -1));
  }
  if (word.endsWith("ly") && word.length > 4) {
    const stem = word.slice(0, -2);
    candidates.add(stem);
    if (stem.endsWith("i")) candidates.add(`${stem.slice(0, -1)}y`);
  }
  return [...candidates];
}

console.log("Building game-specific morphology families…");
const parent = new Map();
function familyNode(language, lemma) {
  return `${language}\u0000${lemma}`;
}
function findFamily(key) {
  let root = parent.get(key) ?? key;
  while (root !== (parent.get(root) ?? root)) root = parent.get(root);
  let current = key;
  while (current !== root) {
    const next = parent.get(current) ?? current;
    parent.set(current, root);
    current = next;
  }
  return root;
}
function unionFamilies(left, right) {
  const leftRoot = findFamily(left);
  const rightRoot = findFamily(right);
  if (leftRoot === rightRoot) return;
  const [root, child] = leftRoot.localeCompare(rightRoot) <= 0
    ? [leftRoot, rightRoot]
    : [rightRoot, leftRoot];
  parent.set(child, root);
}

for (const row of database.prepare(`
  SELECT DISTINCT language, lemma
  FROM forms
  WHERE policy != 'excluded'
  ORDER BY language, lemma
`).iterate()) {
  const key = familyNode(row.language, row.lemma);
  if (!parent.has(key)) parent.set(key, key);
}

const englishLemmas = new Set([...parent.keys()]
  .filter((key) => key.startsWith("en\u0000"))
  .map((key) => key.slice(3)));
for (const lemma of englishLemmas) {
  for (const candidate of englishMorphologyCandidates(lemma)) {
    if (englishLemmas.has(candidate)) unionFamilies(familyNode("en", lemma), familyNode("en", candidate));
  }
}

database.exec(`
  CREATE TABLE family_map (
    language TEXT NOT NULL,
    lemma TEXT NOT NULL,
    family_id TEXT NOT NULL,
    PRIMARY KEY(language, lemma)
  );
`);
parent.clear();
englishLemmas.clear();
global.gc?.();
const insertFamily = database.prepare("INSERT INTO family_map(language, lemma, family_id) VALUES (?, ?, ?)");
database.exec("BEGIN");
for (const key of parent.keys()) {
  const separator = key.indexOf("\u0000");
  const language = key.slice(0, separator);
  const lemma = key.slice(separator + 1);
  const root = findFamily(key);
  insertFamily.run(language, lemma, root.slice(root.indexOf("\u0000") + 1));
}
database.exec("COMMIT");
database.exec(`
  UPDATE forms
  SET family_id = COALESCE((
    SELECT family_map.family_id FROM family_map
    WHERE family_map.language = forms.language AND family_map.lemma = forms.lemma
  ), lemma);
`);

console.log("Loading English and Spanish familiarity frequencies…");
const insertFrequency = database.prepare("INSERT OR REPLACE INTO frequencies(surface, language, zipf) VALUES (?, ?, ?)");
for (const language of ["en", "es"]) {
  const frequencyPath = resolve(localRoot, `wordfreq-${language}.tsv`);
  const lines = createInterface({ input: createReadStream(frequencyPath), crlfDelay: Infinity });
  let count = 0;
  database.exec("BEGIN");
  for await (const line of lines) {
    const split = line.lastIndexOf("\t");
    if (split <= 0) continue;
    insertFrequency.run(line.slice(0, split), language, Number(line.slice(split + 1)));
    count += 1;
    if (count % 25_000 === 0) database.exec("COMMIT; BEGIN");
  }
  database.exec("COMMIT");
  console.log(`wordfreq ${language}: ${count.toLocaleString()} frequencies loaded`);
}

console.log("Indexing three-letter windows…");
const insertWindow = database.prepare("INSERT OR IGNORE INTO windows(sequence, form_id) VALUES (?, ?)");
const formRows = database.prepare("SELECT id, surface FROM forms").iterate();
let indexedForms = 0;
database.exec("BEGIN");
for (const row of formRows) {
  for (const sequence of windowsFor(row.surface)) insertWindow.run(sequence, row.id);
  indexedForms += 1;
  if (indexedForms % 20_000 === 0) {
    database.exec("COMMIT; BEGIN");
    console.log(`windows: ${indexedForms.toLocaleString()} forms`);
  }
}
database.exec("COMMIT");

const metrics = new Map();
function metric(sequence) {
  if (!metrics.has(sequence)) metrics.set(sequence, {
    sequence: sequence.toLocaleUpperCase(),
    key: sequence,
    enSurfaces: 0,
    esSurfaces: 0,
    enFamilies: 0,
    esFamilies: 0,
    enCapacity: 0,
    esCapacity: 0,
    duals: 0,
    reviewSurfaces: 0,
    homographs: 0,
    accentCollisions: 0,
    enLargestFamily: 0,
    esLargestFamily: 0,
    averageZipf: 0,
    unfamiliarSurfaces: 0,
  });
  return metrics.get(sequence);
}

for (const row of database.prepare("SELECT DISTINCT sequence FROM windows").iterate()) metric(row.sequence);

for (const row of database.prepare(`
  SELECT w.sequence, f.language, COUNT(DISTINCT f.surface) AS surfaces,
         COUNT(DISTINCT f.family_id) AS families
  FROM windows w JOIN forms f ON f.id = w.form_id
  WHERE f.policy = 'accepted'
  GROUP BY w.sequence, f.language
`).iterate()) {
  const item = metric(row.sequence);
  item[`${row.language}Surfaces`] = Number(row.surfaces);
  item[`${row.language}Families`] = Number(row.families);
}

for (const row of database.prepare(`
  SELECT sequence, language, SUM(1 + 0.1 * (surface_count - 1)) AS capacity,
         MAX(surface_count) AS largest_family
  FROM (
    SELECT w.sequence, f.language, f.family_id, COUNT(DISTINCT f.surface) AS surface_count
    FROM windows w JOIN forms f ON f.id = w.form_id
    WHERE f.policy = 'accepted'
    GROUP BY w.sequence, f.language, f.family_id
  ) GROUP BY sequence, language
`).iterate()) {
  const item = metric(row.sequence);
  item[`${row.language}Capacity`] = Number(row.capacity);
  item[`${row.language}LargestFamily`] = Number(row.largest_family);
}

for (const row of database.prepare(`
  SELECT sequence, COUNT(*) AS count FROM (
    SELECT w.sequence, f.surface
    FROM windows w JOIN forms f ON f.id = w.form_id
    WHERE f.policy = 'accepted'
    GROUP BY w.sequence, f.surface
    HAVING COUNT(DISTINCT f.language) = 2
  ) GROUP BY sequence
`).iterate()) metric(row.sequence).duals = Number(row.count);

for (const row of database.prepare(`
  SELECT w.sequence, COUNT(DISTINCT f.surface || ':' || f.language) AS count
  FROM windows w JOIN forms f ON f.id = w.form_id
  WHERE f.policy = 'review'
  GROUP BY w.sequence
`).iterate()) metric(row.sequence).reviewSurfaces = Number(row.count);

for (const row of database.prepare(`
  SELECT sequence, COUNT(*) AS count FROM (
    SELECT w.sequence, f.surface, f.language
    FROM windows w JOIN forms f ON f.id = w.form_id
    WHERE f.policy != 'excluded'
    GROUP BY w.sequence, f.surface, f.language
    HAVING COUNT(DISTINCT f.lemma || ':' || f.pos || ':' || f.analysis_key) > 1
  ) GROUP BY sequence
`).iterate()) metric(row.sequence).homographs = Number(row.count);

for (const row of database.prepare(`
  SELECT sequence, COUNT(*) AS count FROM (
    SELECT w.sequence, f.folded, f.language
    FROM windows w JOIN forms f ON f.id = w.form_id
    WHERE f.policy = 'accepted'
    GROUP BY w.sequence, f.folded, f.language
    HAVING COUNT(DISTINCT f.surface) > 1
  ) GROUP BY sequence
`).iterate()) metric(row.sequence).accentCollisions = Number(row.count);

for (const row of database.prepare(`
  SELECT w.sequence, AVG(q.zipf) AS average_zipf
  FROM windows w JOIN forms f ON f.id = w.form_id
  JOIN frequencies q ON q.surface = f.surface AND q.language = f.language
  WHERE f.policy = 'accepted'
  GROUP BY w.sequence
`).iterate()) metric(row.sequence).averageZipf = Number(row.average_zipf);

for (const row of database.prepare(`
  SELECT sequence, COUNT(*) AS count FROM (
    SELECT DISTINCT w.sequence, f.surface, f.language
    FROM windows w JOIN forms f ON f.id = w.form_id
    LEFT JOIN frequencies q ON q.surface = f.surface AND q.language = f.language
    WHERE f.policy = 'accepted' AND (q.zipf IS NULL OR q.zipf < ${REVIEW_FAMILIARITY_ZIPF})
  ) AS unfamiliar
  GROUP BY sequence
`).iterate()) metric(row.sequence).unfamiliarSurfaces = Number(row.count);

function clamp(minimum, value, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finishMetric(item) {
  const totalSurfaces = item.enSurfaces + item.esSurfaces;
  const smaller = Math.min(item.enFamilies, item.esFamilies);
  const larger = Math.max(item.enFamilies, item.esFamilies, 1);
  const balance = smaller / larger;
  const sizeFitness = Math.max(0, 1 - Math.abs(totalSurfaces - 85) / 240);
  const dualFitness = Math.min(1, item.duals / 4);
  const enFamilyShare = item.enSurfaces ? item.enLargestFamily / item.enSurfaces : 1;
  const esFamilyShare = item.esSurfaces ? item.esLargestFamily / item.esSurfaces : 1;
  const familyPenalty = Math.max(enFamilyShare, esFamilyShare);
  const reviewRate = item.reviewSurfaces / Math.max(1, totalSurfaces + item.reviewSurfaces);
  const familiarity = clamp(0, (item.averageZipf - REVIEW_FAMILIARITY_ZIPF) / 2.2, 1);
  const quality = 38 * balance + 20 * sizeFitness + 16 * dualFitness + 14 * familiarity
    + Math.min(16, smaller * 1.2) - 13 * familyPenalty - 8 * reviewRate
    - Math.min(8, item.homographs * 0.3) - Math.min(6, item.accentCollisions * 0.7);
  const minimumEnglish = item.enFamilies ? clamp(1, Math.round(item.enFamilies * 0.34), 8) : 0;
  const minimumSpanish = item.esFamilies ? clamp(1, Math.round(item.esFamilies * 0.34), 8) : 0;
  const totalCapacity = item.enCapacity + item.esCapacity;
  const targetScore = clamp(
    minimumEnglish + minimumSpanish,
    Math.round(totalCapacity * 0.46),
    Math.min(22, Math.floor(totalCapacity)),
  );
  return {
    ...item,
    totalSurfaces,
    totalCapacity: Number(totalCapacity.toFixed(1)),
    enCapacity: Number(item.enCapacity.toFixed(1)),
    esCapacity: Number(item.esCapacity.toFixed(1)),
    balance: Number(balance.toFixed(3)),
    familyConcentration: Number(familyPenalty.toFixed(3)),
    reviewRate: Number(reviewRate.toFixed(3)),
    averageZipf: Number(item.averageZipf.toFixed(2)),
    quality: Number(quality.toFixed(2)),
    suggested: { targetScore, minimumEnglish, minimumSpanish, dualCount: item.duals },
  };
}

const exported = [...metrics.values()].map(finishMetric)
  .sort((left, right) => left.key.localeCompare(right.key));

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(poolDirectory, { recursive: true });

const poolQuery = database.prepare(`
  SELECT DISTINCT f.surface, f.folded, f.language, f.lemma, f.family_id, f.pos,
         f.analysis_key, f.form_kind, f.policy, f.policy_reason, f.loanword_status,
         f.gloss, q.zipf
  FROM windows w JOIN forms f ON f.id = w.form_id
  LEFT JOIN frequencies q ON q.surface = f.surface AND q.language = f.language
  WHERE w.sequence = ?
  ORDER BY f.surface, f.language, f.form_kind, f.lemma, f.analysis_key
`);

const recalculatedExported = [];
for (const [index, candidate] of exported.entries()) {
  const bySurface = new Map();
  for (const row of poolQuery.all(candidate.key)) {
    if (!bySurface.has(row.surface)) {
      bySurface.set(row.surface, {
        surface: row.surface,
        folded: row.folded,
        senses: [],
        policy: { accepted: false, reviewReasons: [], exclusionReasons: [], loanwordStatuses: [] },
        flags: { homograph: false, accentCollision: false, unfamiliar: false },
      });
    }
    const entry = bySurface.get(row.surface);
    const sense = {
      language: row.language,
      lemma: row.lemma,
      familyId: row.family_id,
      partOfSpeech: row.pos,
      formKind: row.form_kind,
      status: row.policy,
      reason: row.policy_reason,
      gloss: row.gloss,
      zipf: row.zipf == null ? null : Number(row.zipf),
    };
    const signature = [sense.language, sense.lemma, sense.familyId, sense.partOfSpeech, sense.formKind,
      sense.status, sense.reason, sense.gloss, sense.zipf].join("\u0000");
    entry._senseKeys ??= new Set();
    if (!entry._senseKeys.has(signature)) entry.senses.push(sense);
    entry._senseKeys.add(signature);
    if (row.policy === "accepted") entry.policy.accepted = true;
    if (row.policy === "review") entry.policy.reviewReasons.push(row.policy_reason);
    if (row.policy === "excluded") entry.policy.exclusionReasons.push(row.policy_reason);
    entry.policy.loanwordStatuses.push(row.loanword_status);
  }

  const entries = [...bySurface.values()];
  const foldedGroups = new Map();
  for (const entry of entries) {
    delete entry._senseKeys;
    entry.senses = deduplicateDualBuilderSenses(entry.senses);
    if (!foldedGroups.has(entry.folded)) foldedGroups.set(entry.folded, new Set());
    foldedGroups.get(entry.folded).add(entry.surface);
    entry.policy.reviewReasons = unique(entry.policy.reviewReasons);
    entry.policy.exclusionReasons = unique(entry.policy.exclusionReasons);
    entry.policy.loanwordStatuses = unique(entry.policy.loanwordStatuses);
    entry.flags.homograph = ["en", "es"].some((language) => unique(entry.senses
      .filter((sense) => sense.language === language)
      .map((sense) => `${sense.lemma}:${sense.familyId}:${sense.partOfSpeech}`)).length > 1);
    const frequencies = entry.senses.map((sense) => sense.zipf).filter(Number.isFinite);
    entry.flags.unfamiliar = frequencies.length === 0 || Math.max(...frequencies) < REVIEW_FAMILIARITY_ZIPF;
  }
  for (const entry of entries) entry.flags.accentCollision = foldedGroups.get(entry.folded).size > 1;

  const authored = calculateDualBuilderMetrics(entries, {});
  const playableSenses = entries.flatMap((entry) => entry.senses.filter((sense) => sense.status === "accepted"));
  const frequencies = playableSenses.map((sense) => sense.zipf).filter(Number.isFinite);
  const reviewSurfaces = entries.filter((entry) => entry.senses.some((sense) => sense.status === "review")).length;
  const enLargestFamily = authored.en.largestFamily;
  const esLargestFamily = authored.es.largestFamily;
  const totalSurfaces = authored.en.surfaces + authored.es.surfaces;
  const familyConcentration = Math.max(
    authored.en.surfaces ? enLargestFamily / authored.en.surfaces : 0,
    authored.es.surfaces ? esLargestFamily / authored.es.surfaces : 0,
  );
  const currentCandidate = finishMetric({
    ...candidate,
    enSurfaces: authored.en.surfaces,
    esSurfaces: authored.es.surfaces,
    enFamilies: authored.en.families,
    esFamilies: authored.es.families,
    enCapacity: authored.en.capacity,
    esCapacity: authored.es.capacity,
    duals: authored.duals,
    reviewSurfaces,
    homographs: entries.filter((entry) => entry.flags.homograph).length,
    accentCollisions: entries.filter((entry) => entry.flags.accentCollision).length,
    unfamiliarSurfaces: entries.filter((entry) => entry.flags.unfamiliar).length,
    enLargestFamily,
    esLargestFamily,
    averageZipf: frequencies.length ? Number((frequencies.reduce((sum, value) => sum + value, 0) / frequencies.length).toFixed(2)) : 0,
  });
  currentCandidate.balance = Number(authored.balance.toFixed(3));
  currentCandidate.familyConcentration = Number(familyConcentration.toFixed(3));
  currentCandidate.totalSurfaces = totalSurfaces;
  currentCandidate.suggested = authored.suggested;
  recalculatedExported.push(currentCandidate);
  await writeFile(resolve(poolDirectory, `${candidate.key}.json`), `${JSON.stringify({
    sequence: candidate.sequence,
    metrics: currentCandidate,
    entries,
  })}\n`);
  if ((index + 1) % 25 === 0) console.log(`pools: ${index + 1} / ${exported.length}`);
}

let sources = { sources: [] };
try {
  sources = JSON.parse(await readFile(resolve(rawDirectory, "sources.json"), "utf8"));
} catch {
  // The index can still be inspected locally if the source manifest is absent.
}

const uncoveredSourceRecords = Number(database.prepare(`
  SELECT COUNT(*) AS count FROM source_records
  WHERE stored_analyses = 0 AND length(policy_reason) = 0
`).get().count);
if (uncoveredSourceRecords > 0) {
  throw new Error(`${uncoveredSourceRecords} eligible source records disappeared without an exclusion reason`);
}

const missingHeadwordClosures = Number(database.prepare(`
  SELECT COUNT(*) AS count FROM (
    SELECT DISTINCT language, lemma FROM forms WHERE form_kind = 'inflection'
  ) inflection
  WHERE NOT EXISTS (
    SELECT 1 FROM forms headword
    WHERE headword.language = inflection.language
      AND headword.surface = inflection.lemma
      AND headword.form_kind = 'lemma'
  )
`).get().count);
if (missingHeadwordClosures > 0) {
  throw new Error(`${missingHeadwordClosures} inflection families are missing headword closure`);
}

const regressionWords = [
  "potato", "potatoes", "deploy", "deployed", "evaporate", "evaporated",
  "antique", "antiques", "banquet", "banquets", "unique", "uniquely",
];
const regressionCoverage = regressionWords.map((surface) => {
  const rows = database.prepare(`
    SELECT language, policy, lemma, family_id, form_kind
    FROM forms WHERE surface = ? ORDER BY language, policy, lemma
  `).all(surface);
  return { surface, present: rows.length > 0, analyses: rows };
});
const absentRegressionWords = regressionCoverage.filter((item) => !item.present);
if (absentRegressionWords.length) {
  throw new Error(`Coverage regressions: ${absentRegressionWords.map((item) => item.surface).join(", ")}`);
}

const highFrequencyRestrictions = database.prepare(`
  SELECT q.surface, q.language, q.zipf,
         GROUP_CONCAT(DISTINCT f.policy) AS policies,
         GROUP_CONCAT(DISTINCT f.policy_reason) AS reasons
  FROM frequencies q
  JOIN forms f ON f.surface = q.surface AND f.language = q.language
  WHERE q.zipf >= 4
  GROUP BY q.surface, q.language, q.zipf
  HAVING SUM(CASE WHEN f.policy = 'accepted' THEN 1 ELSE 0 END) = 0
  ORDER BY q.zipf DESC, q.language, q.surface
  LIMIT 1000
`).all();

const coverageAudit = {
  version: 1,
  builtAt: new Date().toISOString(),
  invariants: {
    uncoveredSourceRecords,
    missingHeadwordClosures,
    namedRegressionWordsPresent: absentRegressionWords.length === 0,
  },
  regressionCoverage,
  highFrequencyRestrictions,
  note: "High-frequency restrictions are review flags, not validity exclusions.",
};
await writeFile(resolve(outputDirectory, "coverage-audit.json"), `${JSON.stringify(coverageAudit)}\n`);
await writeFile(resolve(localRoot, "coverage-audit.json"), `${JSON.stringify(coverageAudit, null, 2)}\n`);

const manifest = {
  version: 2,
  builtAt: new Date().toISOString(),
  source: sources,
  policy: {
    homographs: "every distinct analysis is retained; unrelated families are never merged merely because they share a spelling",
    loanwords: "explicit English-Spanish borrowings require author review; other etymologies remain visible",
    familiarity: `wordfreq is review metadata only; missing or Zipf below ${REVIEW_FAMILIARITY_ZIPF} is flagged but never removed`,
    families: "first surface in a language-specific game-family scores 1; later forms score 0.1",
    morphology: "productive Spanish verb-plus-enclitic combinations remain auditable but default to review",
    accents: "exact spelling wins; folded collisions require author review",
    note: "Kaikki is the candidate source, not an automatically accepted game dictionary",
  },
  counts: {
    forms: Number(database.prepare("SELECT COUNT(*) AS count FROM forms").get().count),
    acceptedForms: Number(database.prepare("SELECT COUNT(*) AS count FROM forms WHERE policy = 'accepted'").get().count),
    reviewForms: Number(database.prepare("SELECT COUNT(*) AS count FROM forms WHERE policy = 'review'").get().count),
    excludedForms: Number(database.prepare("SELECT COUNT(*) AS count FROM forms WHERE policy = 'excluded'").get().count),
    familiarForms: Number(database.prepare(`SELECT COUNT(*) AS count FROM forms f JOIN frequencies q ON q.surface = f.surface AND q.language = f.language WHERE f.policy = 'accepted' AND q.zipf >= ${REVIEW_FAMILIARITY_ZIPF}`).get().count),
    sourceRecords: Number(database.prepare("SELECT COUNT(*) AS count FROM source_records").get().count),
    familyCount: Number(database.prepare("SELECT COUNT(*) AS count FROM family_map").get().count),
    viableSequences: recalculatedExported.filter((item) => item.enSurfaces > 0 && item.esSurfaces > 0).length,
    exportedPools: recalculatedExported.length,
  },
  candidates: recalculatedExported,
};
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
await writeFile(resolve(localRoot, "build-summary.json"), `${JSON.stringify(manifest, null, 2)}\n`);
database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
database.close();

console.log(`Builder manifest: ${resolve(outputDirectory, "manifest.json")}`);
console.log(`Local review database: ${databasePath}`);
console.log(`${exported.length.toLocaleString()} author-selected string pools are ready for analysis.`);
