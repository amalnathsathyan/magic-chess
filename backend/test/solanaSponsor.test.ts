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

function serializePartiallySigned(
  transaction: Transaction,
  player: Keypair
): Buffer {
  transaction.feePayer ??= Keypair.generate().publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  transaction.partialSign(player);
  return transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
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
