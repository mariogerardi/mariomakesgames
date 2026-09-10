import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { AnyGameRun, RunQuery } from "../../src/platform/runs.mjs";
import { assertGameRun, CLOUD_GAME_IDS } from "../../src/platform/runs.mjs";
import { prepareRunWrite } from "../../src/platform/run-write.mjs";
import { randomUUID } from "node:crypto";

type Claims = Record<string, unknown>;
class ApiError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
type PlayerRecord = {
  pk: string;
  sk: "PROFILE";
  id: string;
  email: string;
  displayName: string | null;
  handle: null;
  roles: string[];
  createdAt: string;
  updatedAt: string;
};

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const playerTableName = requiredEnvironment("PLAYER_TABLE_NAME");

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const startedAt = Date.now();
  const method = event.requestContext.http.method;
  const path = normalizePath(event.rawPath);
  const requestId = event.requestContext.requestId;

  try {
    log("info", "request_started", { method, path, requestId });
    if (method === "GET" && path === "/health") return json(200, { ok: true });

    const claims = getClaims(event);
    if (method === "GET" && path === "/v1/me") {
      return json(200, await ensurePlayer(claims));
    }

    if (method === "PATCH" && path === "/v1/me") {
      const current = await ensurePlayer(claims);
      const displayName = parseDisplayName(event.body);
      const updatedAt = new Date().toISOString();
      const result = await documentClient.send(new UpdateCommand({
        TableName: playerTableName,
        Key: playerKey(current.id),
        UpdateExpression: "SET displayName = :displayName, updatedAt = :updatedAt",
        ExpressionAttributeValues: { ":displayName": displayName, ":updatedAt": updatedAt },
        ReturnValues: "ALL_NEW",
      }));
      return json(200, publicPlayer(result.Attributes as PlayerRecord));
    }

    if (method === "GET" && path === "/v1/runs") {
      const playerId = requiredClaim(claims, "sub");
      return json(200, await listRuns(playerId, event.queryStringParameters ?? {}));
    }

    const runId = event.pathParameters?.runId;
    if (runId && method === "GET" && /^\/v1\/runs\/[^/]+$/.test(path)) {
      const playerId = requiredClaim(claims, "sub");
      const record = await getRun(playerId, runId);
      return record ? json(200, record) : json(404, { error: "Run not found." });
    }

    if (runId && method === "PUT" && /^\/v1\/runs\/[^/]+$/.test(path)) {
      const playerId = requiredClaim(claims, "sub");
      return json(200, await saveRun(playerId, runId, event.body));
    }

    if (runId && method === "DELETE" && /^\/v1\/runs\/[^/]+$/.test(path)) {
      const playerId = requiredClaim(claims, "sub");
      await documentClient.send(new DeleteCommand({ TableName: playerTableName, Key: runKey(playerId, runId) }));
      return { statusCode: 204 };
    }

    if (method === "GET" && path === "/v1/admin/ping") {
      if (!groupClaims(claims).includes("admin")) return json(403, { error: "Admin access required." });
      return json(200, { ok: true, role: "admin" });
    }

    return json(404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    log("error", "request_failed", { method, path, requestId, error: message });
    return json(error instanceof ApiError ? error.statusCode : 500, {
      error: error instanceof ApiError ? message : "Unexpected server error.",
    });
  } finally {
    log("info", "request_finished", { method, path, requestId, durationMs: Date.now() - startedAt });
  }
}

async function getRun(playerId: string, runId: string): Promise<AnyGameRun | null> {
  const response = await documentClient.send(new GetCommand({
    TableName: playerTableName,
    Key: runKey(playerId, runId),
    ConsistentRead: true,
  }));
  return (response.Item?.run as AnyGameRun | undefined) ?? null;
}

async function listRuns(playerId: string, query: Record<string, string | undefined>) {
  if (query.cursor && (!query.cursor.startsWith("RUN#") || query.cursor.length > 1024)) throw new ApiError(400, "Invalid cursor.");
  const filters: RunQuery = {};
  if (query.gameId && CLOUD_GAME_IDS.includes(query.gameId as never)) filters.gameId = query.gameId as RunQuery["gameId"];
  if (query.mode) filters.mode = query.mode;
  if (query.outcome === "in-progress" || query.outcome === "completed" || query.outcome === "abandoned") filters.outcome = query.outcome;
  if (query.puzzleId) filters.puzzleId = query.puzzleId;
  const response = await documentClient.send(new QueryCommand({
    TableName: playerTableName,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": `PLAYER#${playerId}`, ":prefix": "RUN#" },
    ScanIndexForward: false,
    Limit: 250,
    ConsistentRead: true,
    ExclusiveStartKey: query.cursor ? { pk: `PLAYER#${playerId}`, sk: query.cursor } : undefined,
  }));
  const runs = (response.Items ?? [])
    .map((item) => item.run as AnyGameRun)
    .filter((run) => (
      (!filters.gameId || run.gameId === filters.gameId)
      && (!filters.mode || run.mode === filters.mode)
      && (!filters.outcome || run.outcome === filters.outcome)
      && (!filters.puzzleId || run.puzzle.id === filters.puzzleId)
    ));
  return { runs, cursor: response.LastEvaluatedKey?.sk as string | undefined };
}

async function saveRun(playerId: string, runId: string, body: string | undefined): Promise<AnyGameRun> {
  if (Buffer.byteLength(body ?? "", "utf8") > 300_000) throw new ApiError(413, "Run snapshot is too large.");
  let candidate: AnyGameRun;
  try {
    candidate = JSON.parse(body ?? "null") as AnyGameRun;
  } catch {
    throw new ApiError(400, "Run must be valid JSON.");
  }
  if (!candidate || candidate.runId !== runId) throw new ApiError(400, "Run ID does not match the request path.");
  let run = { ...candidate, playerId } as AnyGameRun;
  try {
    assertGameRun(run);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "Invalid run.");
  }

  const key = runKey(playerId, runId);
  const current = await documentClient.send(new GetCommand({ TableName: playerTableName, Key: key, ConsistentRead: true }));
  const existing = current.Item?.run as AnyGameRun | undefined;
  try { run = prepareRunWrite(existing, run); }
  catch (error) { throw new ApiError(409, error instanceof Error ? error.message : "Progress conflict."); }
  if (run === existing) return run;
  // Unique even when writes occur within the same millisecond.
  const recordUpdatedAt = `${new Date().toISOString()}#${randomUUID()}`;
  try {
    await documentClient.send(new PutCommand({
      TableName: playerTableName,
      Item: {
        ...key,
        recordType: "GAME_RUN",
        run,
        gameId: run.gameId,
        mode: run.mode,
        outcome: run.outcome,
        puzzleId: run.puzzle.id,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        recordUpdatedAt,
        gsi1pk: `PLAYER#${playerId}#GAME#${run.gameId}`,
        gsi1sk: `${run.startedAt}#${runId}`,
      },
      ConditionExpression: existing
        ? "recordUpdatedAt = :expectedUpdatedAt"
        : "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      ExpressionAttributeValues: existing ? { ":expectedUpdatedAt": current.Item?.recordUpdatedAt } : undefined,
    }));
  } catch (error) {
    if (isConditionalFailure(error)) throw new ApiError(409, "Run changed in another request. Reload and try again.");
    throw error;
  }
  return run;
}

async function ensurePlayer(claims: Claims) {
  const id = requiredClaim(claims, "sub");
  const key = playerKey(id);
  const existing = await documentClient.send(new GetCommand({
    TableName: playerTableName,
    Key: key,
    ConsistentRead: true,
  }));
  const roles = normalizedRoles(claims);
  const email = stringClaim(claims, "email") ?? "";

  if (!existing.Item) {
    const now = new Date().toISOString();
    const created: PlayerRecord = {
      ...key,
      id,
      email,
      displayName: null,
      handle: null,
      roles,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await documentClient.send(new PutCommand({
        TableName: playerTableName,
        Item: created,
        ConditionExpression: "attribute_not_exists(pk)",
      }));
      return publicPlayer(created);
    } catch (error) {
      if (!isConditionalFailure(error)) throw error;
      return ensurePlayer(claims);
    }
  }

  const record = existing.Item as PlayerRecord;
  if (record.email !== email || JSON.stringify(record.roles) !== JSON.stringify(roles)) {
    const updatedAt = new Date().toISOString();
    const updated = await documentClient.send(new UpdateCommand({
      TableName: playerTableName,
      Key: key,
      UpdateExpression: "SET email = :email, roles = :roles, updatedAt = :updatedAt",
      ExpressionAttributeValues: { ":email": email, ":roles": roles, ":updatedAt": updatedAt },
      ReturnValues: "ALL_NEW",
    }));
    return publicPlayer(updated.Attributes as PlayerRecord);
  }

  return publicPlayer(record);
}

function playerKey(id: string) {
  return { pk: `PLAYER#${id}`, sk: "PROFILE" as const };
}

function runKey(playerId: string, runId: string) {
  return { pk: `PLAYER#${playerId}`, sk: `RUN#${runId}` };
}

function publicPlayer(record: PlayerRecord) {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    handle: record.handle,
    roles: record.roles,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizedRoles(claims: Claims) {
  return groupClaims(claims).includes("admin") ? ["player", "admin"] : ["player"];
}

function parseDisplayName(body: string | undefined) {
  let payload: unknown;
  try {
    payload = JSON.parse(body ?? "{}");
  } catch {
    throw new ApiError(400, "Profile update must be valid JSON.");
  }
  const value = (payload as { displayName?: unknown } | null)?.displayName;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ApiError(400, "Display name must be text.");
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 50) throw new ApiError(400, "Display name must be between 1 and 50 characters.");
  return normalized;
}

function isConditionalFailure(error: unknown) {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

function getClaims(event: APIGatewayProxyEventV2): Claims {
  const authorizer = (event.requestContext as unknown as { authorizer?: { jwt?: { claims?: Claims } } }).authorizer;
  return authorizer?.jwt?.claims ?? {};
}

function requiredClaim(claims: Claims, name: string) {
  const value = stringClaim(claims, name);
  if (!value) throw new ApiError(401, "Authenticated identity is missing required claims.");
  return value;
}

function stringClaim(claims: Claims, name: string) {
  return typeof claims[name] === "string" ? claims[name] : null;
}

function groupClaims(claims: Claims) {
  const value = claims["cognito:groups"];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  return value.replace(/^\[|\]$/g, "").split(",").map((group) => group.trim()).filter(Boolean);
}

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function normalizePath(path: string) {
  if (!path || path === "/") return "/";
  return `/${path.split("/").filter(Boolean).join("/")}`;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function log(level: "info" | "error", message: string, fields: Record<string, unknown>) {
  const entry = JSON.stringify({ level, message, service: "mariomakesgames-api", ...fields });
  if (level === "error") console.error(entry);
  else console.info(entry);
}
