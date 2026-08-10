import assert from "node:assert/strict";
import test from "node:test";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  SponsorError,
  validateSponsoredTransaction,
  type SponsorPolicy,
} from "../src/services/solanaSponsor.js";

const MAGIC_CHESS_PROGRAM = new PublicKey(
  "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h"
);
const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ATA_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const MEMO_PROGRAM = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const INITIALIZE_MATCH_DISCRIMINATOR = Buffer.from([
  156, 133, 52, 179, 176, 29, 64, 124,
]);
const DELEGATE_MATCH_DISCRIMINATOR = Buffer.from([
  30, 116, 9, 69, 147, 61, 133, 238,
]);
const DELEGATION_PROGRAM = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);
const SESSION_PROGRAM = new PublicKey(
  "KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5"
);
const CREATE_SESSION_V2_DISCRIMINATOR = Buffer.from([
  223, 233, 108, 7, 65, 194, 235, 38,
]);

function serializePartiallySigned(
  transaction: Transaction,
  player: Keypair,
  additionalSigners: Keypair[] = []
): Buffer {
  transaction.feePayer ??= Keypair.generate().publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  transaction.partialSign(player, ...additionalSigners);
  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
}

function createSessionInstruction(input: {
  sponsor: PublicKey;
  player: PublicKey;
  sessionSigner: PublicKey;
  targetProgram?: PublicKey;
  validUntil?: bigint;
  lamports?: bigint;
}): TransactionInstruction {
  const targetProgram = input.targetProgram ?? MAGIC_CHESS_PROGRAM;
  const [sessionToken] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("session_token_v2"),
      targetProgram.toBuffer(),
      input.sessionSigner.toBuffer(),
      input.player.toBuffer(),
    ],
    SESSION_PROGRAM
  );
  const data = Buffer.alloc(28);
  CREATE_SESSION_V2_DISCRIMINATOR.copy(data, 0);
  data[8] = 1;
  data[9] = 1;
  data[10] = 1;
  data.writeBigInt64LE(
    input.validUntil ?? BigInt(Math.floor(Date.now() / 1000) + 3_000),
    11
  );
  data[19] = 1;
  data.writeBigUInt64LE(input.lamports ?? 2_000_000n, 20);
  return new TransactionInstruction({
    programId: SESSION_PROGRAM,
    keys: [
      { pubkey: sessionToken, isSigner: false, isWritable: true },
      { pubkey: input.sessionSigner, isSigner: true, isWritable: true },
      { pubkey: input.sponsor, isSigner: true, isWritable: true },
      { pubkey: input.player, isSigner: true, isWritable: false },
      { pubkey: targetProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function memo(player: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM,
    keys: [{ pubkey: player, isSigner: true, isWritable: false }],
    data: Buffer.from("magic-chess:sponsor"),
  });
}

function ataInstruction(
  sponsor: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM
  );
  return new TransactionInstruction({
    programId: ATA_PROGRAM,
    keys: [
      { pubkey: sponsor, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function policy(
  sponsor: PublicKey,
  player: PublicKey,
  mint: PublicKey
): SponsorPolicy {
  return {
    feePayer: sponsor,
    player,
    programId: MAGIC_CHESS_PROGRAM,
    wagerMint: mint,
    maxWagerLamports: 1_000_000_000n,
  };
}

function delegateInstruction(
  sponsor: PublicKey,
  player: PublicKey,
  chessMatch = Keypair.generate().publicKey
): TransactionInstruction {
  const [buffer] = PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), chessMatch.toBuffer()],
    MAGIC_CHESS_PROGRAM
  );
  const [record] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), chessMatch.toBuffer()],
    DELEGATION_PROGRAM
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), chessMatch.toBuffer()],
    DELEGATION_PROGRAM
  );
  return new TransactionInstruction({
    programId: MAGIC_CHESS_PROGRAM,
    keys: [
      { pubkey: sponsor, isSigner: true, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: false },
      { pubkey: buffer, isSigner: false, isWritable: true },
      { pubkey: record, isSigner: false, isWritable: true },
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: chessMatch, isSigner: false, isWritable: true },
      { pubkey: MAGIC_CHESS_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: DELEGATION_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: DELEGATE_MATCH_DISCRIMINATOR,
  });
}

test("accepts an authenticated idempotent ATA preparation", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    ataInstruction(sponsor.publicKey, player.publicKey, mint),
    memo(player.publicKey)
  );

  const validated = validateSponsoredTransaction(
    serializePartiallySigned(transaction, player),
    policy(sponsor.publicKey, player.publicKey, mint)
  );
  assert.ok(validated.feePayer?.equals(sponsor.publicKey));
});

test("accepts initialize_match only when the configured sponsor is rent payer", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const initialize = new TransactionInstruction({
    programId: MAGIC_CHESS_PROGRAM,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: sponsor.publicKey, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: INITIALIZE_MATCH_DISCRIMINATOR,
  });
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(initialize);

  assert.doesNotThrow(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("accepts delegate_match with separate sponsor payer and player authority", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    delegateInstruction(sponsor.publicKey, player.publicKey)
  );

  assert.doesNotThrow(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("accepts canonical SessionTokenV2 creation signed by player and session key", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
    })
  );

  assert.doesNotThrow(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player, [sessionSigner]),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("rejects a session token without the temporary signer's signature", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
    })
  );

  assert.throws(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("rejects excessive session signer top-ups", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
      lamports: 20_000_000n,
    })
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player, [sessionSigner]),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /top-up violates sponsor policy/
  );
});

test("rejects sessions targeting another program", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
      targetProgram: Keypair.generate().publicKey,
    })
  );

  assert.throws(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player, [sessionSigner]),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("rejects delegate_match when an unrelated wallet is the authority", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const attacker = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    delegateInstruction(sponsor.publicKey, attacker.publicKey),
    memo(player.publicKey)
  );

  assert.throws(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("rejects any System transfer sourced from sponsor funds", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    ataInstruction(sponsor.publicKey, player.publicKey, mint),
    memo(player.publicKey),
    SystemProgram.transfer({
      fromPubkey: sponsor.publicKey,
      toPubkey: player.publicKey,
      lamports: 1,
    })
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    (error: unknown) =>
      error instanceof SponsorError &&
      error.message === "Transaction attempts to transfer sponsor funds"
  );
});

test("rejects ATA rent for an unrelated owner", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const attacker = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    ataInstruction(sponsor.publicKey, attacker.publicKey, mint),
    memo(player.publicKey)
  );

  assert.throws(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});
