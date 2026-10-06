/**
 * Fetch SPL token name and symbol from on-chain metadata.
 *
 * Strategy (in order):
 *   1. Metaplex Token Metadata Program — covers all standard SPL tokens.
 *   2. Token-2022 metadata extension   — covers tokens minted via Token-2022.
 *   3. Known-token lookup table         — WSOL and other hardcoded tokens.
 *
 * Results are cached in a module-level Map so repeated calls are free.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getTokenMetadata } from "@solana/spl-token";
import { solanaConfig, WRAPPED_SOL_MINT } from "@/lib/solana-config";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface TokenMeta {
  symbol: string;
  name: string;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const METAPLEX_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

/** Well-known tokens whose metadata we already know. */
const KNOWN_TOKENS: Record<string, TokenMeta> = {
  [WRAPPED_SOL_MINT.toBase58()]: { symbol: "SOL", name: "Wrapped SOL" },
};

/* ── Cache ─────────────────────────────────────────────────────────── */

const metaCache = new Map<string, TokenMeta>();

/* ── Helpers ───────────────────────────────────────────────────────── */

/**
 * Derive the Metaplex Token Metadata PDA for a given mint.
 *
 * Seeds: ["metadata", metaplex_program_id, mint]
 */
function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METAPLEX_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    METAPLEX_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Read a length-prefixed Borsh string from a buffer.
 * Metaplex metadata v1 stores strings as [u32 max_len][...chars padded with \0].
 * The actual layout is: 4 bytes (u32 LE length), then `length` UTF-8 bytes.
 */
function readBorshString(buf: Buffer, offset: number): { value: string; bytesRead: number } {
  const len = buf.readUInt32LE(offset);
  const value = buf.subarray(offset + 4, offset + 4 + len).toString("utf8").replace(/\0/g, "");
  return { value, bytesRead: 4 + len };
}

/**
 * Parse the Metaplex Metadata v1 account data to extract name and symbol.
 *
 * Layout (simplified — only what we need):
 *   [0]      u8   key (discriminator, = 4 for MetadataV1)
 *   [1..32]  Pubkey  update_authority
 *   [33..64] Pubkey  mint
 *   [65..]   Borsh string  name
 *   [...]    Borsh string  symbol
 */
function parseMetaplexMetadata(data: Buffer): TokenMeta | null {
  try {
    // Skip: key (1) + update_authority (32) + mint (32) = 65
    let offset = 1 + 32 + 32;
    const name = readBorshString(data, offset);
    offset += name.bytesRead;
    const symbol = readBorshString(data, offset);
    return {
      name: name.value.trim(),
      symbol: symbol.value.trim(),
    };
  } catch {
    return null;
  }
}

/* ── Main fetch ────────────────────────────────────────────────────── */

const connection = new Connection(solanaConfig.rpcEndpoint, "confirmed");

/**
 * Resolve the symbol and name for a single mint address.
 * Returns a cached result immediately if available.
 */
export async function fetchTokenMeta(mintAddress: string): Promise<TokenMeta> {
  // 1. Cache hit
  const cached = metaCache.get(mintAddress);
  if (cached) return cached;

  // 2. Known-token table
  const known = KNOWN_TOKENS[mintAddress];
  if (known) {
    metaCache.set(mintAddress, known);
    return known;
  }

  const mint = new PublicKey(mintAddress);

  // 3. Try Metaplex Token Metadata
  try {
    const pda = findMetadataPda(mint);
    const accountInfo = await connection.getAccountInfo(pda, "confirmed");
    if (accountInfo?.data) {
      const parsed = parseMetaplexMetadata(accountInfo.data as Buffer);
      if (parsed && parsed.symbol) {
        metaCache.set(mintAddress, parsed);
        return parsed;
      }
    }
  } catch {
    // Fall through to Token-2022
  }

  // 4. Try Token-2022 metadata extension
  try {
    const t22Meta = await getTokenMetadata(
      connection,
      mint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    if (t22Meta) {
      const meta: TokenMeta = {
        symbol: t22Meta.symbol ?? mintAddress.slice(0, 4),
        name: t22Meta.name ?? "Unknown Token",
      };
      metaCache.set(mintAddress, meta);
      return meta;
    }
  } catch {
    // Not a Token-2022 token or no metadata
  }

  // 5. Fallback — truncated mint address
  const fallback: TokenMeta = {
    symbol: `${mintAddress.slice(0, 4)}…`,
    name: "Unknown Token",
  };
  metaCache.set(mintAddress, fallback);
  return fallback;
}

/**
 * Batch-fetch metadata for multiple mints.
 * Returns a Map keyed by mint address.
 */
export async function fetchTokenMetas(
  mintAddresses: string[]
): Promise<Map<string, TokenMeta>> {
  const unique = [...new Set(mintAddresses.filter(Boolean))];
  const results = await Promise.all(
    unique.map(async (addr) => [addr, await fetchTokenMeta(addr)] as const)
  );
  return new Map(results);
}

/**
 * Synchronous cache lookup — returns the cached metadata or null.
 * Use after an initial `fetchTokenMeta` call to avoid suspense.
 */
export function getCachedTokenMeta(mintAddress: string): TokenMeta | null {
  return metaCache.get(mintAddress) ?? KNOWN_TOKENS[mintAddress] ?? null;
}
