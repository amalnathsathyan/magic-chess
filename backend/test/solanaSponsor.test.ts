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
  analyzeSponsoredTransaction,
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

test("rejects a standalone ATA creation (sponsor rent drain)", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    ataInstruction(sponsor.publicKey, player.publicKey, mint),
    memo(player.publicKey)
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /no Magic Chess operation|must be used by a Magic Chess instruction/
  );
});

function initializeInstruction(
  sponsor: PublicKey,
  player: PublicKey,
  mint: PublicKey,
  playerTokenAccount = Keypair.generate().publicKey
): TransactionInstruction {
  return new TransactionInstruction({
    programId: MAGIC_CHESS_PROGRAM,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: player, isSigner: true, isWritable: true },
      { pubkey: sponsor, isSigner: true, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: playerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: INITIALIZE_MATCH_DISCRIMINATOR,
  });
}

function ataAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM
  )[0];
}

test("accepts ATA creation consumed by initialize_match and reports it as costly", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    ataInstruction(sponsor.publicKey, player.publicKey, mint),
    initializeInstruction(
      sponsor.publicKey,
      player.publicKey,
      mint,
      ataAddress(player.publicKey, mint)
    )
  );

  const result = analyzeSponsoredTransaction(
    serializePartiallySigned(transaction, player),
    policy(sponsor.publicKey, player.publicKey, mint)
  );
  assert.equal(result.costly, true);
  assert.ok(result.estimatedCostLamports > 20_000_000n);
});

test("rejects Magic Chess instructions that are not on the allowlist", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const unknown = new TransactionInstruction({
    programId: MAGIC_CHESS_PROGRAM,
    keys: [{ pubkey: player.publicKey, isSigner: true, isWritable: true }],
    // initialize_prediction_pool: rent-creating, not sponsored.
    data: Buffer.from([143, 97, 75, 159, 98, 119, 94, 131]),
  });
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(unknown);

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /not sponsored/
  );
});

function settleInstruction(rentDestination: PublicKey, atas: PublicKey[]): TransactionInstruction {
  return new TransactionInstruction({
    programId: MAGIC_CHESS_PROGRAM,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      ...atas.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
      { pubkey: rentDestination, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([236, 106, 133, 178, 45, 221, 98, 116]),
  });
}

test("accepts settlement that refunds escrow rent to the sponsor, with opponent ATAs", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const opponent = Keypair.generate().publicKey;
  const platform = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const atas = [player.publicKey, opponent, platform].map((owner) => ataAddress(owner, mint));
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    ataInstruction(sponsor.publicKey, opponent, mint),
    settleInstruction(sponsor.publicKey, atas),
    memo(player.publicKey)
  );

  assert.doesNotThrow(() =>
    validateSponsoredTransaction(
      serializePartiallySigned(transaction, player),
      policy(sponsor.publicKey, player.publicKey, mint)
    )
  );
});

test("rejects settlement that redirects sponsor-funded escrow rent", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const atas = [0, 1, 2].map(() => Keypair.generate().publicKey);
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    settleInstruction(player.publicKey, atas),
    memo(player.publicKey)
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /refund rent to the sponsor/
  );
});

test("rejects join_match signed by a different wallet", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const other = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const join = new TransactionInstruction({
    programId: MAGIC_CHESS_PROGRAM,
    keys: [
      { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: true },
      { pubkey: other.publicKey, isSigner: true, isWritable: true },
    ],
    data: Buffer.from([244, 8, 47, 130, 192, 59, 179, 44]),
  });
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    join,
    memo(player.publicKey)
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player, [other]),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /signed by the authenticated wallet/
  );
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
    SystemProgram.transfer({
      fromPubkey: sponsor.publicKey,
      toPubkey: player.publicKey,
      lamports: 1,
    }),
    ataInstruction(sponsor.publicKey, player.publicKey, mint),
    initializeInstruction(
      sponsor.publicKey,
      player.publicKey,
      mint,
      ataAddress(player.publicKey, mint)
    )
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

test("accepts a session token bundled with initialize_match", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    initializeInstruction(sponsor.publicKey, player.publicKey, mint),
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
      validUntil: BigInt(Math.floor(Date.now() / 1000) + 23 * 60 * 60),
    })
  );

  const analyzed = analyzeSponsoredTransaction(
    serializePartiallySigned(transaction, player, [sessionSigner]),
    policy(sponsor.publicKey, player.publicKey, mint)
  );
  assert.equal(analyzed.costly, true);
});

test("rejects a session token bundled with a non-opening operation", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    delegateInstruction(sponsor.publicKey, player.publicKey),
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
    })
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player, [sessionSigner]),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /cannot be combined/
  );
});

test("rejects two session tokens in one match transaction", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const first = Keypair.generate();
  const second = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    initializeInstruction(sponsor.publicKey, player.publicKey, mint),
    createSessionInstruction({ sponsor: sponsor.publicKey, player: player.publicKey, sessionSigner: first.publicKey }),
    createSessionInstruction({ sponsor: sponsor.publicKey, player: player.publicKey, sessionSigner: second.publicKey })
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player, [first, second]),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /cannot be combined/
  );
});

test("rejects session tokens valid for more than a day", () => {
  const sponsor = Keypair.generate();
  const player = Keypair.generate();
  const sessionSigner = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const transaction = new Transaction({ feePayer: sponsor.publicKey }).add(
    createSessionInstruction({
      sponsor: sponsor.publicKey,
      player: player.publicKey,
      sessionSigner: sessionSigner.publicKey,
      validUntil: BigInt(Math.floor(Date.now() / 1000) + 25 * 60 * 60),
    })
  );

  assert.throws(
    () =>
      validateSponsoredTransaction(
        serializePartiallySigned(transaction, player, [sessionSigner]),
        policy(sponsor.publicKey, player.publicKey, mint)
      ),
    /expiry violates sponsor policy/
  );
});
