import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { MARKET_ADDRESS, REGISTRY_ADDRESS } from "./contracts";

type GenClient = ReturnType<typeof createClient>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const readClient: GenClient = createClient({ chain: studionet });

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 28;

const sentAt: number[] = [];
let queueTail: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runThroughQueue(fn: () => Promise<void>): Promise<void> {
  const step = queueTail.then(fn, fn);
  queueTail = step.then(
    () => undefined,
    () => undefined
  );
  return step;
}

async function reserveSlot(): Promise<void> {
  return runThroughQueue(async () => {
    const prune = () => {
      const t = Date.now();
      while (sentAt.length > 0 && t - sentAt[0] >= WINDOW_MS) {
        sentAt.shift();
      }
    };
    prune();
    if (sentAt.length >= MAX_PER_WINDOW) {
      await sleep(WINDOW_MS - (Date.now() - sentAt[0]) + 50);
      prune();
    }
    sentAt.push(Date.now());
  });
}

async function paced<T>(fn: () => Promise<T>): Promise<T> {
  await reserveSlot();
  return fn();
}

function isRateLimit(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes("Rate limit");
}

function retryAfterMs(err: unknown, fallbackMs: number): number {
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(/retry_after\D*(\d+(?:\.\d+)?)/i);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds * 1000);
    }
  }
  return fallbackMs;
}

async function rawRead<T>(address: string, fn: string, args: unknown[]): Promise<T> {
  return readClient.readContract({
    address: address as `0x${string}`,
    functionName: fn,
    args: args as never,
  }) as Promise<T>;
}

async function pacedRead<T>(address: string, fn: string, args: unknown[]): Promise<T> {
  return paced<T>(async () => {
    try {
      return await rawRead<T>(address, fn, args);
    } catch (err) {
      if (!isRateLimit(err)) throw err;
      await sleep(retryAfterMs(err, 6000));
      return await rawRead<T>(address, fn, args);
    }
  });
}

const CACHE_TTL_MS = 20_000;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<unknown>>();

function cacheKey(address: string, fn: string, args: unknown[]): string {
  return address + "|" + fn + "|" + JSON.stringify(args);
}

export function invalidateCache(): void {
  cache.clear();
  pending.clear();
}

async function read<T>(
  which: "registry" | "market",
  fn: string,
  args: unknown[]
): Promise<T> {
  const address = which === "registry" ? REGISTRY_ADDRESS : MARKET_ADDRESS;
  const key = cacheKey(address, fn, args);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const inflight = pending.get(key);
  if (inflight) {
    return inflight as Promise<T>;
  }
  const task = pacedRead<T>(address, fn, args)
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      return value;
    })
    .finally(() => {
      pending.delete(key);
    });
  pending.set(key, task);
  return task;
}

export function readRegistry<T = unknown>(fn: string, args: unknown[] = []): Promise<T> {
  return read<T>("registry", fn, args);
}

export function readMarket<T = unknown>(fn: string, args: unknown[] = []): Promise<T> {
  return read<T>("market", fn, args);
}

export function normalize(value: unknown, mode: "record" | "top" = "record"): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") {
    if (mode === "top") {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) {
        throw new Error(
          `integer ${value.toString()} exceeds the safe range for a number`
        );
      }
      return n;
    }
    return value.toString();
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value instanceof Map) {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of value.entries()) {
      out[k] = normalize(v, "record");
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => normalize(v, "record"));
  }
  if (typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalize(v, "record");
    }
    return out;
  }
  return null;
}
