import {
  Connection,
  PublicKey,
  type TransactionSignature,
} from "@solana/web3.js";
import { Connection as MagicBlockConnection } from "@magicblock-labs/ephemeral-rollups-kit";

// ── MagicBlock Endpoints ────────────────────────────────────────

/** Base-layer RPC endpoint for MagicBlock devnet. */
export const MAGICBLOCK_DEVNET_RPC = "https://rpc.magicblock.app/devnet";

/** Router endpoint for checking delegation status on devnet. */
export const MAGICBLOCK_DEVNET_ROUTER = "https://devnet-router.magicblock.app/";

// ── MagicBlock Program Addresses ─────────────────────────────────

/** Delegation Program — owns delegated accounts on the base layer. */
export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

/** Magic Program — the Ephemeral Rollups program on Solana. */
export const MAGIC_PROGRAM_ID = new PublicKey(
  "Magic11111111111111111111111111111111111111"
);

/** Magic Context — required for commit/undelegate intent bundles. */
export const MAGIC_CONTEXT_ID = new PublicKey(
  "MagicContext1111111111111111111111111111111"
);

// ── Types ────────────────────────────────────────────────────────

/** The shape returned by the MagicBlock router delegation endpoint. */
export interface DelegationStatus {
  isDelegated: boolean;
  fqdn?: string;
  delegationRecord?: {
    authority: string;
    owner: string;
    delegationSlot: number;
    lamports: number;
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Query the MagicBlock router for an account's delegation status.
 *
 * @param account - The base-layer account (PDA) that may be delegated.
 * @returns The delegation status, including the ER validator FQDN if delegated.
 */
export async function getDelegationStatus(
  account: PublicKey,
  routerEndpoint = MAGICBLOCK_DEVNET_ROUTER
): Promise<DelegationStatus> {
  const response = await fetch(routerEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getDelegationStatus",
      params: [account.toBase58()],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch delegation status: ${response.status} ${response.statusText}`
    );
  }

  const body = (await response.json()) as {
    error?: { message?: string };
    result?: DelegationStatus;
  };
  if (body.error) throw new Error(body.error.message);
  if (!body.result) throw new Error("MagicBlock router returned no delegation status");
  return body.result;
}

/**
 * Create a Connection to an Ephemeral Rollup validator from its FQDN.
 *
 * Use the `fqdn` field from {@link getDelegationStatus} to obtain the
 * correct ER endpoint for operations on a delegated account.
 *
 * @param fqdn - The fully-qualified domain name of the ER validator.
 * @returns A new Connection pointing at the ER.
 */
export function getERConnection(fqdn: string): Connection {
  // Router may return fqdn with or without https:// prefix
  const erUrl = /^https?:\/\//.test(fqdn) ? fqdn : `https://${fqdn}`;
  return new Connection(erUrl, "confirmed");
}

export interface AccountRuntime {
  connection: Connection;
  accountInfo: NonNullable<Awaited<ReturnType<Connection["getAccountInfo"]>>>;
  runtime: "base" | "ephemeral";
  delegation?: DelegationStatus;
}

export interface LifecyclePollOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

const DEFAULT_LIFECYCLE_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lifecycleOptions(options?: LifecyclePollOptions) {
  return {
    timeoutMs: options?.timeoutMs ?? DEFAULT_LIFECYCLE_TIMEOUT_MS,
    pollIntervalMs: options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  };
}

/** Wait until base ownership, router status, and ER ownership agree. */
export async function waitForDelegation(
  baseConnection: Connection,
  account: PublicKey,
  expectedProgramId: PublicKey,
  routerEndpoint = MAGICBLOCK_DEVNET_ROUTER,
  options?: LifecyclePollOptions
): Promise<AccountRuntime> {
  const { timeoutMs, pollIntervalMs } = lifecycleOptions(options);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const runtime = await resolveAccountRuntime(
        baseConnection,
        account,
        expectedProgramId,
        routerEndpoint
      );
      if (runtime?.runtime === "ephemeral") return runtime;
    } catch (error) {
      lastError = error;
    }
    await delay(pollIntervalMs);
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Delegation did not propagate within ${timeoutMs}ms${detail}`);
}

/** Wait until the account is program-owned on base and absent from the ER route. */
export async function waitForUndelegation(
  baseConnection: Connection,
  account: PublicKey,
  expectedProgramId: PublicKey,
  routerEndpoint = MAGICBLOCK_DEVNET_ROUTER,
  options?: LifecyclePollOptions
): Promise<AccountRuntime> {
  const { timeoutMs, pollIntervalMs } = lifecycleOptions(options);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const baseInfo = await baseConnection.getAccountInfo(account, "confirmed");
      if (baseInfo?.owner.equals(expectedProgramId)) {
        const status = await getDelegationStatus(account, routerEndpoint);
        if (!status.isDelegated) {
          return {
            connection: baseConnection,
            accountInfo: baseInfo,
            runtime: "base",
          };
        }
      }
    } catch (error) {
      lastError = error;
    }
    await delay(pollIntervalMs);
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Undelegation did not propagate within ${timeoutMs}ms${detail}`);
}

async function waitForSignature(
  connection: Connection,
  signature: TransactionSignature,
  options?: LifecyclePollOptions
): Promise<void> {
  const { timeoutMs, pollIntervalMs } = lifecycleOptions(options);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = response.value[0];
    if (status?.err) {
      throw new Error(`Transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await delay(pollIntervalMs);
  }
  throw new Error(`Transaction ${signature} was not confirmed within ${timeoutMs}ms`);
}

/**
 * Resolve an ER intent transaction to the base-layer commitment signature and
 * confirm that economic/durable state actually landed on base.
 */
export async function confirmCommitmentOnBase(
  erConnection: Connection,
  baseConnection: Connection,
  erSignature: TransactionSignature,
  options?: LifecyclePollOptions
): Promise<TransactionSignature> {
  const officialConnection = await MagicBlockConnection.create(
    erConnection.rpcEndpoint
  );
  type MagicSignature = Parameters<
    typeof officialConnection.getCommitmentSignature
  >[0];
  const baseSignature = (await officialConnection.getCommitmentSignature(
    erSignature as MagicSignature
  )) as TransactionSignature;

  await waitForSignature(baseConnection, baseSignature, options);
  return baseSignature;
}

/** Resolve the authoritative RPC for an existing program account. */
export async function resolveAccountRuntime(
  baseConnection: Connection,
  account: PublicKey,
  expectedProgramId: PublicKey,
  routerEndpoint = MAGICBLOCK_DEVNET_ROUTER
): Promise<AccountRuntime | null> {
  const baseInfo = await baseConnection.getAccountInfo(account, "confirmed");
  if (!baseInfo) return null;

  if (baseInfo.owner.equals(expectedProgramId)) {
    return { connection: baseConnection, accountInfo: baseInfo, runtime: "base" };
  }

  if (!baseInfo.owner.equals(DELEGATION_PROGRAM_ID)) {
    throw new Error(
      `Unexpected owner ${baseInfo.owner.toBase58()} for ${account.toBase58()}`
    );
  }

  const delegation = await getDelegationStatus(account, routerEndpoint);
  if (!delegation.isDelegated || !delegation.fqdn) {
    throw new Error(
      `Account ${account.toBase58()} is delegation-owned but no active ER endpoint was returned`
    );
  }

  const connection = getERConnection(delegation.fqdn);
  const accountInfo = await connection.getAccountInfo(account, "confirmed");
  if (!accountInfo) {
    throw new Error(`Delegated account ${account.toBase58()} is unavailable on its ER`);
  }
  if (!accountInfo.owner.equals(expectedProgramId)) {
    throw new Error(
      `Unexpected ER owner ${accountInfo.owner.toBase58()} for ${account.toBase58()}`
    );
  }

  return { connection, accountInfo, runtime: "ephemeral", delegation };
}
