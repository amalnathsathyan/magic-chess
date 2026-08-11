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
const MAX_SESSION_DURATION_SECONDS = 60 * 60;

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
  policy: SponsorPolicy
): void {
  if (
    instruction.data.length !== 1 ||
    instruction.data[0] !== CREATE_IDEMPOTENT_ATA_INSTRUCTION ||
    instruction.keys.length < 6
  ) {
    throw new SponsorError("Only idempotent associated-token creation is sponsored");
  }
  const [payer, ata, owner, mint, systemProgram, tokenProgram] = instruction.keys;
  const ownerAllowed =
    owner.pubkey.equals(policy.player) ||
    Boolean(policy.platformFeeWallet?.equals(owner.pubkey));
  if (
    !payer.pubkey.equals(policy.feePayer) ||
    !payer.isSigner ||
    !ownerAllowed ||
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
): void {
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
    return;
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
    authority.isWritable ||
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

  let hasAppInstruction = false;
  let hasSessionInstruction = false;
  let sessionSignerKey: PublicKey | null = null;
  let operationInstructionCount = 0;
  for (const instruction of transaction.instructions) {
    const programId = instruction.programId;
    if (programId.equals(policy.programId)) {
      operationInstructionCount += 1;
      hasAppInstruction = true;
      validateMagicChessInstruction(instruction, policy);
    } else if (programId.equals(SESSION_PROGRAM_ID)) {
      operationInstructionCount += 1;
      hasAppInstruction = true;
      hasSessionInstruction = true;
      sessionSignerKey = validateSessionInstruction(instruction, policy);
    } else if (programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      operationInstructionCount += 1;
      hasAppInstruction = true;
      validateAtaInstruction(instruction, policy);
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
  if (hasSessionInstruction && operationInstructionCount !== 1) {
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
  return transaction;
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

  async relay(input: RelaySponsoredTransactionInput): Promise<string> {
    const transaction = validateSponsoredTransaction(input.serialized, {
      ...this.policy,
      feePayer: this.feePayer.publicKey,
      player: input.player,
    });
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
