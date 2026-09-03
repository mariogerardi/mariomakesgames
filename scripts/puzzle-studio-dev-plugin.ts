import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import type { AnyPublishedPuzzle, AuthorableGameId, PuzzleDraft, PuzzleSchedule } from "../src/authoring/contracts.mjs";
import { createFileDraftRepository } from "../src/authoring/file-draft-repository.ts";
import { createFilePublishedRepository } from "../src/authoring/file-published-repository.ts";
import { createFileScheduleRepository } from "../src/authoring/file-schedule-repository.ts";
import { isLocalStudioHost } from "../src/authoring/studio-access.ts";

const BODY_LIMIT = 64 * 1024 * 1024;

function send(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > BODY_LIMIT) throw new RangeError("Puzzle Studio draft exceeds the 64 MB local limit.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function puzzleStudioDevPlugin(): Plugin {
  const studioDirectory = path.join(process.cwd(), ".local", "puzzle-studio");
  const repository = createFileDraftRepository(studioDirectory);
  const publishedRepository = createFilePublishedRepository(studioDirectory);
  const scheduleRepository = createFileScheduleRepository(studioDirectory);
  return {
    name: "puzzle-studio-local-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (!["/api/studio/drafts", "/api/studio/published", "/api/studio/schedule"].includes(url.pathname)) return next();
        const forwardedHost = request.headers["x-forwarded-host"];
        const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost ?? request.headers.host ?? null;
        if (!isLocalStudioHost(host)) return send(response, 404, { error: "Not found." });

        try {
          if (url.pathname === "/api/studio/published") {
            if (request.method === "GET") {
              const gameId = url.searchParams.get("gameId") as AuthorableGameId | null;
              return send(response, 200, { puzzles: await publishedRepository.list(gameId ?? undefined) });
            }
            if (request.method === "POST") {
              const body = await readJson(request);
              if (body.action !== "publish") return send(response, 400, { error: "Unsupported publication action." });
              return send(response, 201, { puzzle: await publishedRepository.publish(body.puzzle as AnyPublishedPuzzle) });
            }
            response.setHeader("Allow", "GET, POST");
            return send(response, 405, { error: "Method not allowed." });
          }

          if (url.pathname === "/api/studio/schedule") {
            if (request.method === "GET") return send(response, 200, { schedule: await scheduleRepository.get() });
            if (request.method === "POST") {
              const body = await readJson(request);
              return send(response, 200, { schedule: await scheduleRepository.save(body.schedule as PuzzleSchedule) });
            }
            response.setHeader("Allow", "GET, POST");
            return send(response, 405, { error: "Method not allowed." });
          }

          if (request.method === "GET") {
            const gameId = url.searchParams.get("gameId") as AuthorableGameId | null;
            const id = url.searchParams.get("id");
            if (gameId && id) {
              const draft = await repository.get(gameId, id);
              return draft ? send(response, 200, { draft }) : send(response, 404, { error: "Draft not found." });
            }
            return send(response, 200, { drafts: await repository.list(gameId ?? undefined) });
          }

          if (request.method === "POST") {
            const body = await readJson(request);
            if (body.action === "save") {
              return send(response, 200, { draft: await repository.save(body.draft as PuzzleDraft, { overwrite: true }) });
            }
            if (body.action === "import") {
              return send(response, 201, { draft: await repository.importDraft(body.draft as PuzzleDraft) });
            }
            if (body.action === "duplicate") {
              const draft = await repository.duplicate(
                body.gameId as AuthorableGameId,
                String(body.id ?? ""),
                String(body.nextId ?? ""),
              );
              return send(response, 201, { draft });
            }
            return send(response, 400, { error: "Unsupported Puzzle Studio action." });
          }

          if (request.method === "DELETE") {
            const gameId = url.searchParams.get("gameId") as AuthorableGameId;
            const id = url.searchParams.get("id") ?? "";
            return send(response, 200, { removed: await repository.remove(gameId, id) });
          }

          response.setHeader("Allow", "GET, POST, DELETE");
          return send(response, 405, { error: "Method not allowed." });
        } catch (error) {
          return send(response, error instanceof RangeError ? 413 : 400, {
            error: error instanceof Error ? error.message : "Puzzle Studio request failed.",
          });
        }
      });
    },
  };
}
