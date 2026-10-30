/**
 * One-time: create the devnet ZUG play token for the faucet.
 *
 *   cd backend && npm run faucet:create-token -- [options]
 *
 * What it does, on devnet:
 *   1. Creates an SPL mint (classic Token program, 6 decimals like pump.fun).
 *   2. Attaches Metaplex token metadata (name ZUG, symbol ZUG, logo from the
 *      repo on GitHub) so wallets and the app show the name and logo.
 *   3. Mints the whole supply (1,000,000,000 ZUG) to the treasury wallet.
 *   4. Revokes the mint authority, so the supply is fixed (pass
 *      --keep-mint-authority to keep it).
 *   5. Prints the env lines for the backend (FAUCET_MINT) and the frontend
 *      (NEXT_PUBLIC_WAGER_MINT / SYMBOL / DECIMALS).
 *
 * Options
 *   --payer <path>     keypair that pays rent and fees (default: ~/.config/solana/id.json)
 *   --treasury <path>  keypair that receives the supply and later signs faucet
 *                      transfers (default: a new keypair written next to the
 *                      payer as zug-faucet-treasury.json). Its secret goes in
 *                      FAUCET_TREASURY_PRIVATE_KEY; it needs no SOL.
 *   --rpc <url>        default: $RPC_ENDPOINT or https://api.devnet.solana.com
 *   --supply <tokens>  default: 1000000000
 *   --decimals <n>     default: 6
 *   --uri <url>        metadata JSON (default: this repo's
 *                      frontend/public/token/zug-devnet.json on GitHub)
 *   --skip-metadata    create the mint without Metaplex metadata
 *   --keep-mint-authority
 *
 * Devnet only. The payer needs ~0.02 SOL (airdrop: `solana airdrop 1`).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  AuthorityType,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToCheckedInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const METAPLEX_TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);
const REPO_RAW = "https://raw.githubusercontent.com/amalnathsathyan/magic-chess/dev";
const DEFAULT_METADATA_URI = `${REPO_RAW}/frontend/public/token/zug-devnet.json`;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

function loadKeypair(path: string): Keypair {
  const raw = readFileSync(path, "utf8").trim();
  const bytes = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : bs58.decode(raw);
  return Keypair.fromSecretKey(bytes);
}

function borshString(value: string, max: number): Buffer {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length > max) throw new Error(`"${value}" is longer than ${max} bytes`);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

/**
 * Metaplex `CreateMetadataAccountV3`, hand-serialized so this script needs no
 * extra dependency. Layout: u8 discriminator (33), DataV2 { name, symbol,
 * uri, seller_fee_basis_points u16, creators Option<Vec<Creator>> = None,
 * collection Option = None, uses Option = None }, is_mutable bool,
 * collection_details Option = None.
 */
function createMetadataInstruction(input: {
  mint: PublicKey;
  mintAuthority: PublicKey;
  payer: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): TransactionInstruction {
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METAPLEX_TOKEN_METADATA_PROGRAM_ID.toBuffer(), input.mint.toBuffer()],
    METAPLEX_TOKEN_METADATA_PROGRAM_ID
  );
  const data = Buffer.concat([
    Buffer.from([33]),
    borshString(input.name, 32),
    borshString(input.symbol, 10),
    borshString(input.uri, 200),
    Buffer.from([0, 0]), // seller_fee_basis_points: 0
    Buffer.from([0]), // creators: None
    Buffer.from([0]), // collection: None
    Buffer.from([0]), // uses: None
    Buffer.from([1]), // is_mutable: true (so the logo URI can be fixed later)
    Buffer.from([0]), // collection_details: None
  ]);
  return new TransactionInstruction({
    programId: METAPLEX_TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadata, isSigner: false, isWritable: true },
      { pubkey: input.mint, isSigner: false, isWritable: false },
      { pubkey: input.mintAuthority, isSigner: true, isWritable: false },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: false }, // update authority
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function main(): Promise<void> {
  const rpc = arg("rpc") ?? process.env.RPC_ENDPOINT ?? "https://api.devnet.solana.com";
  if (/mainnet/i.test(rpc)) {
    throw new Error("This script creates a devnet play token. Refusing to run against mainnet.");
  }
  const payerPath = resolve(arg("payer") ?? join(homedir(), ".config/solana/id.json"));
  const payer = loadKeypair(payerPath);
  const decimals = Number(arg("decimals") ?? "6");
  const supply = BigInt(arg("supply") ?? "1000000000");
  const uri = arg("uri") ?? DEFAULT_METADATA_URI;

  let treasury: Keypair;
  let treasuryPath = arg("treasury");
  if (treasuryPath) {
    treasury = loadKeypair(resolve(treasuryPath));
  } else {
    treasuryPath = join(dirname(payerPath), "zug-faucet-treasury.json");
    if (existsSync(treasuryPath)) {
      treasury = loadKeypair(treasuryPath);
      console.log(`Using the existing treasury keypair at ${treasuryPath}`);
    } else {
      treasury = Keypair.generate();
      writeFileSync(treasuryPath, JSON.stringify(Array.from(treasury.secretKey)), { mode: 0o600 });
      console.log(`Wrote a new treasury keypair to ${treasuryPath}`);
    }
  }

  const connection = new Connection(rpc, "confirmed");
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`RPC        ${rpc}`);
  console.log(`Payer      ${payer.publicKey.toBase58()} (${balance / 1e9} SOL)`);
  console.log(`Treasury   ${treasury.publicKey.toBase58()}`);
  if (balance < 20_000_000) {
    throw new Error("The payer needs at least 0.02 SOL. On devnet: solana airdrop 1");
  }

  const mint = Keypair.generate();
  const treasuryAta = getAssociatedTokenAddressSync(mint.publicKey, treasury.publicKey);
  const amount = supply * 10n ** BigInt(decimals);
  if (amount > 2n ** 64n - 1n) throw new Error("Supply does not fit in a u64 at these decimals");

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: await getMinimumBalanceForRentExemptMint(connection),
      programId: TOKEN_PROGRAM_ID,
    }),
    // No freeze authority: nobody can lock a player's tokens.
    createInitializeMint2Instruction(mint.publicKey, decimals, payer.publicKey, null)
  );
  if (!flag("skip-metadata")) {
    transaction.add(
      createMetadataInstruction({
        mint: mint.publicKey,
        mintAuthority: payer.publicKey,
        payer: payer.publicKey,
        name: "ZUG",
        symbol: "ZUG",
        uri,
      })
    );
  }
  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      payer.publicKey,
      treasuryAta,
      treasury.publicKey,
      mint.publicKey
    ),
    createMintToCheckedInstruction(mint.publicKey, treasuryAta, payer.publicKey, amount, decimals)
  );
  if (!flag("keep-mint-authority")) {
    transaction.add(
      createSetAuthorityInstruction(mint.publicKey, payer.publicKey, AuthorityType.MintTokens, null)
    );
  }

  console.log("Sending…");
  const signature = await sendAndConfirmTransaction(connection, transaction, [payer, mint], {
    commitment: "confirmed",
  });

  console.log("");
  console.log(`Mint       ${mint.publicKey.toBase58()}`);
  console.log(`Supply     ${supply.toLocaleString("en-US")} ZUG (${decimals} decimals) in ${treasuryAta.toBase58()}`);
  console.log(`Metadata   ${flag("skip-metadata") ? "skipped" : uri}`);
  console.log(`Mint auth  ${flag("keep-mint-authority") ? payer.publicKey.toBase58() : "revoked (fixed supply)"}`);
  console.log(`Tx         https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  console.log("");
  console.log("Backend env (Render):");
  console.log(`  FAUCET_MINT=${mint.publicKey.toBase58()}`);
  console.log(`  FAUCET_TREASURY_PRIVATE_KEY=${bs58.encode(treasury.secretKey)}`);
  console.log("");
  console.log("Frontend env (Cloudflare build variables and frontend/wrangler.toml):");
  console.log(`  NEXT_PUBLIC_WAGER_MINT=${mint.publicKey.toBase58()}`);
  console.log("  NEXT_PUBLIC_WAGER_SYMBOL=ZUG");
  console.log(`  NEXT_PUBLIC_WAGER_DECIMALS=${decimals}`);
  console.log("");
  console.log("Keep the treasury keypair file private; it is the faucet's whole supply.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
