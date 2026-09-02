import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rawDirectory = resolve(repositoryRoot, ".local/dual-kaikki/raw");

const SOURCES = [
  {
    language: "en",
    label: "English",
    url: "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl",
    filename: "english.jsonl",
  },
  {
    language: "es",
    label: "Spanish",
    url: "https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl",
    filename: "spanish.jsonl",
  },
];

function prettyBytes(value) {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = units[0];
  for (const candidate of units) {
    unit = candidate;
    if (size < 1024 || candidate === units.at(-1)) break;
    size /= 1024;
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${unit}`;
}

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function sourceMetadata(source) {
  const response = await fetch(source.url, { method: "HEAD", headers: { "Accept-Encoding": "identity" } });
  if (!response.ok) throw new Error(`Could not inspect ${source.label}: HTTP ${response.status}`);
  const bytes = Number(response.headers.get("content-length"));
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error(`Missing size for ${source.label}`);
  return {
    ...source,
    bytes,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

async function download(source) {
  const destination = resolve(rawDirectory, source.filename);
  const partial = `${destination}.part`;
  const finishedSize = await fileSize(destination);
  if (finishedSize === source.bytes) {
    console.log(`${source.label}: already present (${prettyBytes(source.bytes)})`);
    return destination;
  }

  let offset = await fileSize(partial);
  if (offset > source.bytes) offset = 0;
  const headers = offset > 0
    ? { "Accept-Encoding": "identity", Range: `bytes=${offset}-` }
    : { "Accept-Encoding": "identity" };
  console.log(`${source.label}: ${offset ? `resuming at ${prettyBytes(offset)}` : "starting"} of ${prettyBytes(source.bytes)}`);
  const response = await fetch(source.url, { headers });
  if (!response.ok || !response.body) throw new Error(`Could not download ${source.label}: HTTP ${response.status}`);

  const resuming = offset > 0 && response.status === 206;
  if (offset > 0 && !resuming) {
    offset = 0;
    console.log(`${source.label}: server did not honor resume; restarting the partial file`);
  }

  let received = offset;
  let lastReported = Date.now();
  const stream = Readable.fromWeb(response.body);
  stream.on("data", (chunk) => {
    received += chunk.length;
    if (Date.now() - lastReported >= 5_000) {
      lastReported = Date.now();
      const percent = (received / source.bytes * 100).toFixed(1);
      console.log(`${source.label}: ${percent}% (${prettyBytes(received)} / ${prettyBytes(source.bytes)})`);
    }
  });
  await pipeline(stream, createWriteStream(partial, { flags: resuming ? "a" : "w" }));

  const downloadedSize = await fileSize(partial);
  if (downloadedSize !== source.bytes) {
    throw new Error(`${source.label} ended at ${prettyBytes(downloadedSize)}; expected ${prettyBytes(source.bytes)}. Run the command again to resume.`);
  }
  await rename(partial, destination);
  console.log(`${source.label}: complete (${prettyBytes(downloadedSize)})`);
  return destination;
}

await mkdir(rawDirectory, { recursive: true });
const metadata = [];
for (const source of SOURCES) {
  const inspected = await sourceMetadata(source);
  let completed = false;
  for (let attempt = 1; attempt <= 12 && !completed; attempt += 1) {
    try {
      await download(inspected);
      completed = true;
    } catch (error) {
      if (attempt === 12) throw error;
      console.warn(`${source.label}: connection interrupted; resuming (attempt ${attempt + 1}/12)`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
    }
  }
  metadata.push({
    language: inspected.language,
    label: inspected.label,
    url: inspected.url,
    filename: inspected.filename,
    bytes: inspected.bytes,
    etag: inspected.etag,
    lastModified: inspected.lastModified,
  });
}

await writeFile(resolve(rawDirectory, "sources.json"), `${JSON.stringify({
  downloadedAt: new Date().toISOString(),
  edition: "English Wiktionary",
  sources: metadata,
}, null, 2)}\n`);
console.log(`Source manifest: ${resolve(rawDirectory, "sources.json")}`);
