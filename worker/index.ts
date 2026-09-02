/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  normalizeBuilderSettings,
  TOKEN_BUILDER_DEFAULTS,
  validateAuthoringNotes,
  validateBuilderPrompt,
} from "../src/games/token/authoring.mjs";

interface Env {
  OPENAI_API_KEY?: string;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type TokenGenerationRequest = {
  authoringNotes?: unknown;
  maxOutputTokens?: unknown;
  prompt?: unknown;
  temperature?: unknown;
};

type OpenAILogprob = {
  logprob?: unknown;
  token?: unknown;
  top_logprobs?: unknown;
};

const LOCAL_BUILDER_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractGeneratedText(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content) || content.type !== "output_text" || typeof content.text !== "string") continue;
      const tokenLogprobs = Array.isArray(content.logprobs)
        ? content.logprobs
          .filter(isRecord)
          .map((entry: OpenAILogprob) => ({
            token: typeof entry.token === "string" ? entry.token : "",
            logprob: Number(entry.logprob),
            top_logprobs: Array.isArray(entry.top_logprobs)
              ? entry.top_logprobs
                .filter(isRecord)
                .map((alternative: OpenAILogprob) => ({
                  token: typeof alternative.token === "string" ? alternative.token : "",
                  logprob: Number(alternative.logprob),
                }))
              : [],
          }))
        : [];
      return { responseText: content.text, tokenLogprobs };
    }
  }
  return null;
}

async function generateTokenDraft(request: Request, env: Env) {
  const url = new URL(request.url);
  if (!LOCAL_BUILDER_HOSTS.has(url.hostname)) {
    return json({ error: "The TOKEN Builder is available only from this local machine." }, 403);
  }
  if (request.method !== "POST") return json({ error: "Use POST to generate a TOKEN draft." }, 405);
  if (!env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY is missing from .env.local. Restart the local server after adding it." }, 503);
  }

  let body: TokenGenerationRequest;
  try {
    body = await request.json() as TokenGenerationRequest;
  } catch {
    return json({ error: "The TOKEN Builder needs a valid JSON request." }, 400);
  }

  const prompt = validateBuilderPrompt(body.prompt);
  if (!prompt.valid) return json({ error: prompt.reason }, 400);
  const authoringNotes = validateAuthoringNotes(body.authoringNotes);
  if (!authoringNotes.valid) return json({ error: authoringNotes.reason }, 400);
  const settings = normalizeBuilderSettings(body);

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOKEN_BUILDER_DEFAULTS.model,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: `Write a compact, vivid response to the user's prompt. Use clear natural prose with no title, preamble, bullets, markdown, or quotation marks. Make each sentence useful for a player predicting the next word. Private authoring constraints follow; obey them without mentioning them: ${authoringNotes.notes || "Keep the response concise and self-contained."}`,
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt.prompt }],
        },
      ],
      include: ["message.output_text.logprobs"],
      max_output_tokens: settings.maxOutputTokens,
      reasoning: { effort: "none" },
      store: false,
      temperature: settings.temperature,
      text: { verbosity: "low" },
      top_logprobs: TOKEN_BUILDER_DEFAULTS.topLogprobs,
    }),
  });

  if (!upstream.ok) {
    return json({ error: "OpenAI could not generate that draft. Check your local key and API project access, then try again." }, 502);
  }

  const generated = extractGeneratedText(await upstream.json());
  if (!generated?.responseText.trim() || !generated.tokenLogprobs.length) {
    return json({ error: "OpenAI returned an incomplete draft. Try again." }, 502);
  }

  return json({
    model: TOKEN_BUILDER_DEFAULTS.model,
    responseText: generated.responseText,
    tokenLogprobs: generated.tokenLogprobs,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/token/generate") {
      return generateTokenDraft(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const assetFetch = env?.ASSETS?.fetch
        ? (path: string) => env.ASSETS.fetch(new Request(new URL(path, request.url)))
        : (path: string) => fetch(new URL(path, request.url));

      const transformImage = env?.IMAGES
        ? async (body: ReadableStream, { width, format, quality }: { width: number; format: string; quality: number }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          }
        : async (body: ReadableStream) => new Response(body);

      return handleImageOptimization(request, {
        fetchAsset: assetFetch,
        transformImage,
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
