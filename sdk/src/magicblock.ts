import { Connection, PublicKey } from "@solana/web3.js";

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
