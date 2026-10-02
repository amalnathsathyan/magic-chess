import bs58 from "bs58";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const SESSION_PROGRAM_ID = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);
const SPONSOR_AUTHORIZATION_MEMO = Buffer.from("magic-chess:sponsor");
const SYNC_NATIVE_INSTRUCTION = 17;
const CREATE_IDEMPOTENT_ATA_INSTRUCTION = 1;
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_INSTRUCTIONS = 8;
const SESSION_TOKEN_V2_SEED = Buffer.from("session_token_v2");
const SESSION_TOP_UP_LAMPORTS = 2_000_000n;
// Covers a whole game; the token can only sign this program's moves for
// this wallet, and validity doesn't change what the sponsor pays.
const MAX_SESSION_DURATION_SECONDS = 24 * 60 * 60;

export class SponsorError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "invalid_transaction"
  ) {
    super(message);
    this.name = "SponsorError";
  }
}

export function loadFeePayer(secret: string, expectedAddress: string): Keypair {
  if (!secret || !expectedAddress) {
    throw new SponsorError("Solana fee payer is not configured", 503, "sponsor_unavailable");
  }
  let decoded: Uint8Array;
  try {
    decoded = secret.trim().startsWith("[")
      ? Uint8Array.from(JSON.parse(secret) as number[])
      : bs58.decode(secret.trim());
  } catch (error) {
    if (error instanceof SponsorError) throw error;
    throw new SponsorError("Fee payer private key is invalid", 503, "sponsor_unavailable");
  }
  if (decoded.length !== 64) {
    throw new SponsorError(
      "SOLANA_FEE_PAYER_PRIVATE_KEY must decode to 64 bytes",
      503,
      "sponsor_unavailable"
    );
  }
  const keypair = Keypair.fromSecretKey(decoded);
  if (keypair.publicKey.toBase58() !== expectedAddress) {
    throw new SponsorError(
      "Fee payer private key does not match SOLANA_FEE_PAYER_ADDRESS",
      503,
      "sponsor_unavailable"
    );
  }
  return keypair;
}

// Anchor IDL discriminator for `initialize_match`.
const INITIALIZE_MATCH_DISCRIMINATOR = Buffer.from([
  156, 133, 52, 179, 176, 29, 64, 124,
]);
const DELEGATE_MATCH_DISCRIMINATOR = Buffer.from([
  30, 116, 9, 69, 147, 61, 133, 238,
]);

/**
 * Every Magic Chess instruction the sponsor will pay for, with the account
 * index that must be the authenticated player (or the sponsor) and whether it
 * creates sponsor-funded rent. Anything not listed is rejected: a new program
 * instruction must be reviewed before it can spend sponsor funds.
 */
type MagicChessRule =
  | { name: string; role: "player"; index: number; costly?: boolean }
  | { name: string; role: "sponsor"; index: number }
  | { name: string; role: "custom" };

const MAGIC_CHESS_RULES = new Map<string, MagicChessRule>(
  (
    [
      [[156, 133, 52, 179, 176, 29, 64, 124], { name: "initialize_match", role: "custom" }],
      [[30, 116, 9, 69, 147, 61, 133, 238], { name: "delegate_match", role: "custom" }],
      [[244, 8, 47, 130, 192, 59, 179, 44], { name: "join_match", role: "player", index: 1 }],
      [[165, 210, 81, 124, 173, 175, 87, 201], { name: "abort_match", role: "player", index: 3 }],
      [[43, 29, 143, 188, 152, 151, 136, 19], { name: "resign_game", role: "player", index: 1 }],
      [[175, 234, 101, 151, 53, 30, 177, 137], { name: "claim_timeout_win", role: "player", index: 1 }],
      [[78, 77, 152, 203, 222, 211, 208, 233], { name: "make_move", role: "player", index: 1 }],
      [[13, 147, 179, 38, 67, 1, 69, 132], { name: "set_session_key", role: "player", index: 1 }],
      [[81, 192, 32, 110, 104, 116, 144, 151], { name: "revoke_session_key", role: "player", index: 1 }],
      // Escrow rent from settlement is refunded to `payer` (index 5); it
      // must be the sponsor that originally funded it, never the caller.
      [[236, 106, 133, 178, 45, 221, 98, 116], { name: "process_match_settlement", role: "sponsor", index: 5 }],
      // close_match refunds the match account rent to `payer` (index 1).
      [[79, 174, 36, 80, 233, 185, 176, 239], { name: "close_match", role: "sponsor", index: 1 }],
    ] as Array<[number[], MagicChessRule]>
  ).map(([discriminator, rule]) => [Buffer.from(discriminator).toString("hex"), rule])
);

/** Rough lamports a sponsored operation can lock up in rent. */
export const SPONSOR_COST_ESTIMATES = {
  initializeMatch: 20_000_000n,
  createSession: 2_000_000n,
  associatedTokenAccount: 2_100_000n,
  signature: 10_000n,
} as const;
const CREATE_SESSION_V2_DISCRIMINATOR = Buffer.from([
  223, 233, 108, 7, 65, 194, 235, 38,
]);

export interface SponsorPolicy {
  feePayer: PublicKey;
  player: PublicKey;
  programId: PublicKey;
  wagerMint: PublicKey;
  platformFeeWallet?: PublicKey;
  maxWagerLamports: bigint;
}

export interface ValidatedSponsoredTransaction {
  transaction: Transaction;
  /** Upper bound of sponsor lamports this transaction can consume. */
  estimatedCostLamports: bigint;
  /** True when it creates a match or session (rent-heavy, rate limited). */
  costly: boolean;
}

function rejectSponsorSystemDebit(
  instruction: TransactionInstruction,
  policy: SponsorPolicy
): void {
  let instructionType: ReturnType<typeof SystemInstruction.decodeInstructionType>;
  try {
    instructionType = SystemInstruction.decodeInstructionType(instruction);
  } catch {
    throw new SponsorError("Unsupported System Program instruction");
  }
  if (instructionType !== "Transfer") {
    throw new SponsorError(`System instruction ${instructionType} is not sponsored`);
  }
  const transfer = SystemInstruction.decodeTransfer(instruction);
  if (transfer.fromPubkey.equals(policy.feePayer)) {
    throw new SponsorError("Transaction attempts to transfer sponsor funds", 403);
  }
  if (!transfer.fromPubkey.equals(policy.player)) {
    throw new SponsorError("System transfer must originate from the authenticated wallet", 403);
  }
  if (BigInt(transfer.lamports) > policy.maxWagerLamports) {
    throw new SponsorError("Wager exceeds the sponsor policy limit", 403);
  }
}

function validateAtaInstruction(
  instruction: TransactionInstruction,
  policy: SponsorPolicy,
  magicChessAccounts: Set<string>
): void {
  if (
    instruction.data.length !== 1 ||
    instruction.data[0] !== CREATE_IDEMPOTENT_ATA_INSTRUCTION ||
    instruction.keys.length < 6
  ) {
    throw new SponsorError("Only idempotent associated-token creation is sponsored");
  }
  const [payer, ata, owner, mint, systemProgram, tokenProgram] = instruction.keys;
  // The account must be consumed by a Magic Chess instruction in this same
  // transaction (whose own constraints bind owner and mint, and which must
  // pass simulation). Otherwise the sponsor would pay rent for arbitrary
  // token accounts.
  if (!magicChessAccounts.has(ata.pubkey.toBase58())) {
    throw new SponsorError(
      "Associated-token creation must be used by a Magic Chess instruction",
      403
    );
  }
  if (
    !payer.pubkey.equals(policy.feePayer) ||
    !payer.isSigner ||
    !systemProgram.pubkey.equals(SystemProgram.programId) ||
    !tokenProgram.pubkey.equals(TOKEN_PROGRAM_ID)
  ) {
    throw new SponsorError("Associated-token instruction violates sponsor policy", 403);
  }
  const [expectedAta] = PublicKey.findProgramAddressSync(
    [owner.pubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.pubkey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  if (!ata.pubkey.equals(expectedAta)) {
    throw new SponsorError("Associated-token address is invalid", 403);
  }
}

function validateMagicChessInstruction(
  instruction: TransactionInstruction,
  policy: SponsorPolicy
): MagicChessRule {
  const rule = MAGIC_CHESS_RULES.get(instruction.data.subarray(0, 8).toString("hex"));
  if (!rule) {
    throw new SponsorError("This Magic Chess instruction is not sponsored", 403);
  }
  if (rule.role === "player") {
    const key = instruction.keys[rule.index];
    if (!key?.pubkey.equals(policy.player) || !key.isSigner) {
      throw new SponsorError(`${rule.name} must be signed by the authenticated wallet`, 403);
    }
    return rule;
  }
  if (rule.role === "sponsor") {
    const key = instruction.keys[rule.index];
    if (!key?.pubkey.equals(policy.feePayer) || !key.isWritable) {
      throw new SponsorError(`${rule.name} must refund rent to the sponsor`, 403);
    }
    return rule;
  }
  if (instruction.data.subarray(0, 8).equals(INITIALIZE_MATCH_DISCRIMINATOR)) {
    if (
      instruction.keys.length < 8 ||
      !instruction.keys[1].pubkey.equals(policy.player) ||
      !instruction.keys[1].isSigner ||
      !instruction.keys[2].pubkey.equals(policy.feePayer) ||
      !instruction.keys[2].isSigner
    ) {
      throw new SponsorError("initialize_match accounts violate sponsor policy", 403);
    }
    return rule;
  }

  if (instruction.data.subarray(0, 8).equals(DELEGATE_MATCH_DISCRIMINATOR)) {
    if (instruction.keys.length !== 9) {
      throw new SponsorError("delegate_match account count violates sponsor policy", 403);
    }
    const [
      payer,
      player,
      buffer,
      delegationRecord,
      delegationMetadata,
      chessMatch,
      ownerProgram,
      delegationProgram,
      systemProgram,
    ] = instruction.keys;
    const [expectedBuffer] = PublicKey.findProgramAddressSync(
      [Buffer.from("buffer"), chessMatch.pubkey.toBuffer()],
      policy.programId
    );
    const [expectedRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation"), chessMatch.pubkey.toBuffer()],
      DELEGATION_PROGRAM_ID
    );
    const [expectedMetadata] = PublicKey.findProgramAddressSync(
      [Buffer.from("delegation-metadata"), chessMatch.pubkey.toBuffer()],
      DELEGATION_PROGRAM_ID
    );
    if (
      !payer.pubkey.equals(policy.feePayer) ||
      !payer.isSigner ||
      !payer.isWritable ||
      !player.pubkey.equals(policy.player) ||
      !player.isSigner ||
      !buffer.pubkey.equals(expectedBuffer) ||
      !delegationRecord.pubkey.equals(expectedRecord) ||
      !delegationMetadata.pubkey.equals(expectedMetadata) ||
      !chessMatch.isWritable ||
      !ownerProgram.pubkey.equals(policy.programId) ||
      !delegationProgram.pubkey.equals(DELEGATION_PROGRAM_ID) ||
      !systemProgram.pubkey.equals(SystemProgram.programId)
    ) {
      throw new SponsorError("delegate_match accounts violate sponsor policy", 403);
    }
  }
  return rule;
}

function readRequiredOption(
  data: Buffer,
  offset: number,
  byteLength: number,
  field: string
): Buffer {
  if (data[offset] !== 1 || offset + 1 + byteLength > data.length) {
    throw new SponsorError(`Session ${field} must be explicitly configured`, 403);
  }
  return data.subarray(offset + 1, offset + 1 + byteLength);
}

function validateSessionInstruction(
  instruction: TransactionInstruction,
  policy: SponsorPolicy
): PublicKey {
  if (
    instruction.keys.length !== 6 ||
    instruction.data.length !== 28 ||
    !instruction.data.subarray(0, 8).equals(CREATE_SESSION_V2_DISCRIMINATOR)
  ) {
    throw new SponsorError("Only canonical create_session_v2 is sponsored", 403);
  }

  // The authority may show as writable: in a create/join transaction the
  // player is writable for the wager, which only puts their own funds at stake.
  const [sessionToken, sessionSigner, feePayer, authority, targetProgram, systemProgram] =
    instruction.keys;
  const [expectedToken] = PublicKey.findProgramAddressSync(
    [
      SESSION_TOKEN_V2_SEED,
      policy.programId.toBuffer(),
      sessionSigner.pubkey.toBuffer(),
      policy.player.toBuffer(),
    ],
    SESSION_PROGRAM_ID
  );

  if (
    !sessionToken.pubkey.equals(expectedToken) ||
    sessionToken.isSigner ||
    !sessionToken.isWritable ||
    !sessionSigner.isSigner ||
    !sessionSigner.isWritable ||
    !feePayer.pubkey.equals(policy.feePayer) ||
    !feePayer.isSigner ||
    !feePayer.isWritable ||
    !authority.pubkey.equals(policy.player) ||
    !authority.isSigner ||
    !targetProgram.pubkey.equals(policy.programId) ||
    targetProgram.isSigner ||
    targetProgram.isWritable ||
    !systemProgram.pubkey.equals(SystemProgram.programId) ||
    systemProgram.isSigner ||
    systemProgram.isWritable
  ) {
    throw new SponsorError("create_session_v2 accounts violate sponsor policy", 403);
  }

  const topUp = readRequiredOption(instruction.data, 8, 1, "top-up");
  const validUntil = readRequiredOption(instruction.data, 10, 8, "expiry").readBigInt64LE();
  const lamports = readRequiredOption(instruction.data, 19, 8, "lamports").readBigUInt64LE();
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (topUp[0] !== 1) {
    throw new SponsorError("Session signer top-up is required", 403);
  }
  if (lamports !== SESSION_TOP_UP_LAMPORTS) {
    throw new SponsorError("Session signer top-up violates sponsor policy", 403);
  }
  if (validUntil <= now || validUntil > now + BigInt(MAX_SESSION_DURATION_SECONDS)) {
    throw new SponsorError("Session expiry violates sponsor policy", 403);
  }
  return sessionSigner.pubkey;
}

export function validateSponsoredTransaction(
  serialized: Buffer,
  policy: SponsorPolicy
): Transaction {
  return analyzeSponsoredTransaction(serialized, policy).transaction;
}

export function analyzeSponsoredTransaction(
  serialized: Buffer,
  policy: SponsorPolicy
): ValidatedSponsoredTransaction {
  if (serialized.length === 0 || serialized.length > MAX_TRANSACTION_BYTES) {
    throw new SponsorError("Serialized transaction has an invalid size");
  }

  let transaction: Transaction;
  try {
    transaction = Transaction.from(serialized);
  } catch {
    throw new SponsorError("Only valid legacy Solana transactions are currently sponsored");
  }
  if (!transaction.feePayer?.equals(policy.feePayer)) {
    throw new SponsorError("Transaction has the wrong fee payer", 403);
  }
  if (!transaction.recentBlockhash) {
    throw new SponsorError("Transaction recent blockhash is required");
  }
  if (transaction.instructions.length === 0 || transaction.instructions.length > MAX_INSTRUCTIONS) {
    throw new SponsorError("Transaction instruction count exceeds sponsor policy");
  }

  const playerSignature = transaction.signatures.find(({ publicKey }) =>
    publicKey.equals(policy.player)
  );
  if (!playerSignature?.signature || !transaction.verifySignatures(false)) {
    throw new SponsorError("Authenticated wallet signature is missing or invalid", 403);
  }

  const magicChessAccounts = new Set<string>();
  for (const instruction of transaction.instructions) {
    if (instruction.programId.equals(policy.programId)) {
      instruction.keys.forEach(({ pubkey }) => magicChessAccounts.add(pubkey.toBase58()));
    }
  }

  let hasAppInstruction = false;
  let hasSessionInstruction = false;
  let sessionInstructionCount = 0;
  let opensMatch = false;
  let sessionSignerKey: PublicKey | null = null;
  let operationInstructionCount = 0;
  let costly = false;
  let estimatedCostLamports =
    SPONSOR_COST_ESTIMATES.signature * BigInt(transaction.signatures.length);
  for (const instruction of transaction.instructions) {
    const programId = instruction.programId;
    if (programId.equals(policy.programId)) {
      operationInstructionCount += 1;
      hasAppInstruction = true;
      const rule = validateMagicChessInstruction(instruction, policy);
      if (rule.name === "initialize_match" || rule.name === "join_match") {
        opensMatch = true;
      }
      if (rule.name === "initialize_match") {
        costly = true;
        estimatedCostLamports += SPONSOR_COST_ESTIMATES.initializeMatch;
      }
    } else if (programId.equals(SESSION_PROGRAM_ID)) {
      operationInstructionCount += 1;
      hasAppInstruction = true;
      hasSessionInstruction = true;
      sessionInstructionCount += 1;
      costly = true;
      estimatedCostLamports += SPONSOR_COST_ESTIMATES.createSession;
      sessionSignerKey = validateSessionInstruction(instruction, policy);
    } else if (programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      operationInstructionCount += 1;
      estimatedCostLamports += SPONSOR_COST_ESTIMATES.associatedTokenAccount;
      validateAtaInstruction(instruction, policy, magicChessAccounts);
    } else if (programId.equals(SystemProgram.programId)) {
      operationInstructionCount += 1;
      rejectSponsorSystemDebit(instruction, policy);
    } else if (programId.equals(TOKEN_PROGRAM_ID)) {
      operationInstructionCount += 1;
      if (instruction.data.length !== 1 || instruction.data[0] !== SYNC_NATIVE_INSTRUCTION) {
        throw new SponsorError("Token instruction is not sponsored", 403);
      }
    } else if (programId.equals(MEMO_PROGRAM_ID)) {
      if (
        !instruction.data.equals(SPONSOR_AUTHORIZATION_MEMO) ||
        instruction.keys.length !== 1 ||
        !instruction.keys[0].pubkey.equals(policy.player) ||
        !instruction.keys[0].isSigner
      ) {
        throw new SponsorError("Sponsor authorization memo is invalid", 403);
      }
    } else if (!programId.equals(ComputeBudgetProgram.programId)) {
      throw new SponsorError(`Program ${programId.toBase58()} is not sponsored`, 403);
    }
  }
  if (!hasAppInstruction) {
    throw new SponsorError("Transaction contains no Magic Chess operation", 403);
  }
  // A session token rides alone, or in the create/join transaction so the
  // player approves instant moves together with the match.
  if (
    sessionInstructionCount > 1 ||
    (hasSessionInstruction && operationInstructionCount !== 1 && !opensMatch)
  ) {
    throw new SponsorError("Session creation cannot be combined with other operations", 403);
  }
  if (
    sessionSignerKey &&
    !transaction.signatures.some(
      ({ publicKey, signature }) =>
        publicKey.equals(sessionSignerKey!) && signature !== null
    )
  ) {
    throw new SponsorError("Session signer signature is missing", 403);
  }
  return { transaction, estimatedCostLamports, costly };
}

export interface RelaySponsoredTransactionInput {
  serialized: Buffer;
  player: PublicKey;
  lastValidBlockHeight: number;
}

export class SolanaSponsorService {
  private readonly connection: Connection;
  private readonly feePayer: Keypair;

  constructor(
    rpcEndpoint: string,
    private readonly policy: Omit<SponsorPolicy, "feePayer" | "player">,
    feePayerSecret: string,
    feePayerAddress: string
  ) {
    this.connection = new Connection(rpcEndpoint, "confirmed");
    this.feePayer = loadFeePayer(feePayerSecret, feePayerAddress);
  }

  get feePayerAddress(): PublicKey {
    return this.feePayer.publicKey;
  }

  analyze(input: Pick<RelaySponsoredTransactionInput, "serialized" | "player">) {
    return analyzeSponsoredTransaction(input.serialized, {
      ...this.policy,
      feePayer: this.feePayer.publicKey,
      player: input.player,
    });
  }

  async relay(
    input: RelaySponsoredTransactionInput,
    analyzed = this.analyze(input)
  ): Promise<string> {
    const { transaction } = analyzed;
    const blockhash = transaction.recentBlockhash!;
    const validity = await this.connection.isBlockhashValid(blockhash, {
      commitment: "confirmed",
    });
    if (!validity.value) throw new SponsorError("Transaction blockhash has expired", 409, "expired_blockhash");

    transaction.partialSign(this.feePayer);
    if (!transaction.verifySignatures(true)) {
      throw new SponsorError("Transaction signatures are incomplete or invalid", 403);
    }
    const simulation = await this.connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      const detail = simulation.value.logs?.slice(-4).join(" | ") || JSON.stringify(simulation.value.err);
      throw new SponsorError(`Transaction simulation failed: ${detail}`, 422, "simulation_failed");
    }

    const signature = await this.connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    const confirmation = await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight: input.lastValidBlockHeight },
      "confirmed"
    );
    if (confirmation.value.err) {
      throw new SponsorError(
        `Transaction failed after broadcast: ${JSON.stringify(confirmation.value.err)}`,
        422,
        "transaction_failed"
      );
    }
    return signature;
  }
}
