import type { TransactionHash, TransactionStatus } from "genlayer-js/types";
import { MARKET_ADDRESS, REGISTRY_ADDRESS } from "./contracts";
import {
  getActiveAddressLower,
  getActiveClient,
} from "./wallet";
import {
  getAllItems,
  getCapability,
  getCapabilityIdsForMandate,
  getMandate,
  getMandateCount,
  getPurchaseForCapability,
  nowSeconds,
} from "./mandate";
import { invalidateCache } from "./rpc";

type GenClient = ReturnType<typeof getActiveClient>;

export interface WriteResult {
  hash: string;
}

export interface WriteResultWithId extends WriteResult {
  id: string;
}

const SCAN_BACK = 15;
const POLL_INTERVAL_MS = 5000;
const POLL_RETRIES = 200;

type LeaderReceiptLoose = {
  execution_result?: unknown;
  result?: unknown;
  genvm_result?: unknown;
};

type GenLayerTxLoose = {
  consensus_data?: {
    leader_receipt?: LeaderReceiptLoose[] | LeaderReceiptLoose;
  } | null;
};

type ResultObjectLoose = {
  status?: unknown;
  payload?: unknown;
};

type GenvmResultLoose = {
  stderr?: unknown;
};

const EXEC_BY_NUMBER: Record<string, string> = {
  "0": "NOT_VOTED",
  "1": "FINISHED_WITH_RETURN",
  "2": "FINISHED_WITH_ERROR",
};

const SUCCESS_RESULTS = ["SUCCESS", "FINISHED_WITH_RETURN"];
const FAILURE_RESULTS = ["ERROR", "FINISHED_WITH_ERROR"];
const SUCCESS_STATUSES = ["return"];
const FAILURE_STATUSES = ["contract_error", "rollback", "error"];

function isObject(value: unknown): boolean {
  return typeof value === "object" && value !== null;
}

function observedExec(value: unknown): string {
  if (typeof value === "number") {
    return EXEC_BY_NUMBER[String(value)] ?? "";
  }
  if (typeof value === "string") {
    return EXEC_BY_NUMBER[value] ?? value;
  }
  return "";
}

function asResultObject(value: unknown): ResultObjectLoose | null {
  return isObject(value) ? (value as ResultObjectLoose) : null;
}

function asGenvmResult(value: unknown): GenvmResultLoose | null {
  return isObject(value) ? (value as GenvmResultLoose) : null;
}

function firstText(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return "";
}

function extractAssertText(text: string): string | null {
  const match = text.match(/AssertionError:[ \t]*([^\r\n]+)/);
  if (match) return match[1].trim();
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

async function assertLeaderSucceeded(
  client: GenClient,
  hash: TransactionHash
): Promise<void> {
  const tx = (await client.getTransaction({ hash })) as unknown as GenLayerTxLoose;
  const leaderReceipt = tx.consensus_data?.leader_receipt;
  const leader = Array.isArray(leaderReceipt) ? leaderReceipt[0] : leaderReceipt;
  if (!leader) {
    throw new Error(
      `Transaction ${hash} reached FINALIZED but the leader receipt is missing.`
    );
  }
  const exec = observedExec(leader.execution_result);
  const res = asResultObject(leader.result);
  const status = typeof res?.status === "string" ? res.status : "";
  const isSuccess =
    (exec !== "" && SUCCESS_RESULTS.includes(exec)) ||
    (status !== "" && SUCCESS_STATUSES.includes(status));
  const isFailure =
    (exec !== "" && FAILURE_RESULTS.includes(exec)) ||
    (status !== "" && FAILURE_STATUSES.includes(status));
  if (isSuccess && !isFailure) return;
  if (isFailure && !isSuccess) {
    const genvm = asGenvmResult(leader.genvm_result);
    const stderr = typeof genvm?.stderr === "string" ? genvm.stderr : "";
    const candidate = firstText(stderr, res?.payload);
    const text = extractAssertText(candidate);
    if (text !== null) throw new Error(text);
    throw new Error(
      `transaction ${hash} failed (execution result: ${exec || status || "unknown"})`
    );
  }
  throw new Error(
    `Unrecognized transaction result (execution result: ${JSON.stringify(leader.execution_result)})`
  );
}

async function send(
  contract: "registry" | "market",
  functionName: string,
  args: unknown[]
): Promise<string> {
  const client = getActiveClient();
  const address = contract === "registry" ? REGISTRY_ADDRESS : MARKET_ADDRESS;
  const outcome = (await client.writeContract({
    address: address as `0x${string}`,
    functionName,
    args: args as never,
    value: 0n,
  })) as unknown;
  const hash = typeof outcome === "string" ? outcome : String(outcome);
  if (!hash.startsWith("0x")) {
    throw new Error(`writeContract returned an unexpected value: ${hash}`);
  }
  await client.waitForTransactionReceipt({
    hash: hash as TransactionHash,
    status: "FINALIZED" as TransactionStatus,
    interval: POLL_INTERVAL_MS,
    retries: POLL_RETRIES,
  });
  await assertLeaderSucceeded(client, hash as TransactionHash);
  invalidateCache();
  return hash;
}

async function findNewMandate(text: string, now: number): Promise<string> {
  const me = getActiveAddressLower();
  const count = await getMandateCount();
  const floor = Math.max(0, count - SCAN_BACK);
  for (let i = count - 1; i >= floor; i--) {
    const mandate = await getMandate(`m_${i}`);
    if (!mandate) continue;
    if (
      mandate.grantor.toLowerCase() === me &&
      mandate.created_at === String(now) &&
      mandate.text === text
    ) {
      return mandate.id;
    }
  }
  throw new Error(
    "Could not find the new mandate in the latest 15 records after finalization."
  );
}

export async function issueRoot(
  grantee: string,
  text: string,
  cap: number,
  expiry: number,
  categories: string,
  vendors: string
): Promise<WriteResultWithId> {
  const cleanText = text.trim();
  const now = nowSeconds();
  const hash = await send("registry", "issue_root", [
    grantee,
    cleanText,
    cap,
    expiry,
    categories,
    vendors,
    now,
  ]);
  const id = await findNewMandate(cleanText, now);
  return { hash, id };
}

export async function delegate(
  parentId: string,
  grantee: string,
  text: string,
  cap: number,
  expiry: number,
  categories: string,
  vendors: string
): Promise<WriteResultWithId> {
  const cleanText = text.trim();
  const now = nowSeconds();
  const hash = await send("registry", "delegate", [
    parentId,
    grantee,
    cleanText,
    cap,
    expiry,
    categories,
    vendors,
    now,
  ]);
  const id = await findNewMandate(cleanText, now);
  return { hash, id };
}

export async function escalate(mandateId: string): Promise<WriteResult> {
  const hash = await send("registry", "escalate", [mandateId]);
  return { hash };
}

export async function revoke(mandateId: string): Promise<WriteResult> {
  const hash = await send("registry", "revoke", [mandateId]);
  return { hash };
}

export async function registerVendor(name: string): Promise<WriteResult> {
  const hash = await send("registry", "register_vendor", [name]);
  return { hash };
}

export async function listItem(
  category: string,
  title: string,
  description: string,
  price: number
): Promise<WriteResultWithId> {
  const cleanTitle = title.trim();
  const hash = await send("registry", "list_item", [
    category,
    cleanTitle,
    description,
    price,
  ]);
  const me = getActiveAddressLower();
  const items = await getAllItems();
  const start = Math.max(0, items.length - SCAN_BACK);
  for (let i = items.length - 1; i >= start; i--) {
    const item = items[i];
    if (item.vendor.toLowerCase() === me && item.title === cleanTitle) {
      return { hash, id: item.id };
    }
  }
  throw new Error(
    "Could not find the new item in the latest 15 records after finalization."
  );
}

export async function requestCapability(
  mandateId: string,
  itemId: string
): Promise<WriteResultWithId> {
  const now = nowSeconds();
  const hash = await send("registry", "request_capability", [
    mandateId,
    itemId,
    now,
  ]);
  const me = getActiveAddressLower();
  const ids = await getCapabilityIdsForMandate(mandateId);
  for (let i = ids.length - 1; i >= 0; i--) {
    const cap = await getCapability(ids[i]);
    if (!cap) continue;
    if (
      cap.grantee.toLowerCase() === me &&
      cap.item_id === itemId &&
      cap.created_at === String(now)
    ) {
      return { hash, id: cap.id };
    }
  }
  throw new Error(
    "Could not find the new capability under the mandate after finalization."
  );
}

export async function escalateCapability(capId: string): Promise<WriteResult> {
  const hash = await send("registry", "escalate_capability", [capId]);
  return { hash };
}

export async function mint(to: string, amount: number): Promise<WriteResult> {
  const hash = await send("market", "mint", [to, amount]);
  return { hash };
}

export async function fundRoot(rootId: string, amount: number): Promise<WriteResult> {
  const hash = await send("market", "fund_root", [rootId, amount]);
  return { hash };
}

export async function purchase(capId: string): Promise<WriteResultWithId> {
  const now = nowSeconds();
  const hash = await send("market", "purchase", [capId, now]);
  const id = await getPurchaseForCapability(capId);
  if (!id) {
    throw new Error(
      `No purchase record found for capability ${capId} after finalization.`
    );
  }
  return { hash, id };
}

export async function refundRoot(rootId: string): Promise<WriteResult> {
  const now = nowSeconds();
  const hash = await send("market", "refund_root", [rootId, now]);
  return { hash };
}
