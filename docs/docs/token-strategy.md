# Magic Speed Chess — Token Strategy & Faucet Campaign

## TL;DR

Two-phase distribution:
1. **Devnet faucet**: Complete a match (create OR join) → claim devnet CHESS from a program vault. Up to N claims/wallet. Runs until vault empty. Doubles as wager token faucet.
2. **Mainnet airdrop**: Snapshot devnet CHESS holders → airdrop real mainnet CHESS. Match participants only.

Part of **MVPv2**.

---

## Part A: Token Creation (Mainnet)

### Manual SPL Token (Not Launchpad)

Launchpads (pump.fun, Bags.fm, Moonshot) use fair-launch models — zero creator allocation. We need full supply control.

**Use `spl-token` CLI or Metaplex Umi to mint manually, then list on Raydium CPMM.**

| Step | Cost |
|------|------|
| Create SPL mint | ~0.001 SOL |
| Create Raydium CPMM pool | ~0.25 SOL |
| Metadata (Metaplex) | ~0.005 SOL |
| Initial LP seed | ~$500-$1000 (SOL + CHESS) |
| **Total** | **~0.26 SOL + LP seed** |

### Token Parameters

```
Name:     Chess Token
Symbol:   CHESS
Decimals: 9
Supply:   1,000,000,000 (1 billion)

Allocation:
  60%  Devnet faucet vault    600M  (program-owned, claims distribute)
  15%  DEX liquidity          150M  (Raydium CPMM)
  15%  Treasury               150M  (future staking, buybacks)
  10%  Marketing/community    100M  (tournaments, early adopters)
```

---

## Part B: Token Dripper — Standalone Program

### Design Decisions

1. **Separate program** (`token_dripper`) — NOT part of the chess engine. Deploy independently. No shared state, no CPI coupling. Reads chess match data as raw bytes.
2. **Both players eligible** — `players[0]` (creator) AND `players[1]` (joiner). Both contributed to the match.
3. **Vault = PDA-owned token account** — fund it by sending CHESS to its ATA. No special initialization. No admin ceremony. Just transfer SPL tokens to it.
4. **MagicBlock ER** — deploy on MagicBlock Ephemeral Rollup for gasless claims. Standard SPL transfers inside ER are zero-fee.
5. **Works on devnet first** — mainnet iteration later. Same program, different deployment.

### Architecture

```
┌──────────────────────────────────────────────────┐
│  token_dripper program (separate from chess)      │
│                                                    │
│  State:                                            │
│    DripperConfig PDA  ─  max_claims, claim_amount  │
│    Vault ATA (PDA)    ─  holds CHESS tokens        │
│    ClaimRecord PDA    ─  per-wallet claim_count     │
│                                                    │
│  Instructions:                                     │
│    initialize_dripper  ─  admin one-time setup     │
│    drip                ─  claim tokens (gasless)   │
│    update_config       ─  admin adjust params      │
│    close_dripper       ─  admin recover vault      │
└──────────────────────────────────────────────────┘
         │                          │
         │ reads ChessMatch data    │ SPL transfer
         ▼                          ▼
┌─────────────────────┐   ┌──────────────────────┐
│ magic_chess program │   │ Vault ATA (PDA-owned) │
│ (ChessMatch PDAs)   │   │ ← fund with CHESS     │
└─────────────────────┘   └──────────────────────┘
```

### Why Separate Program

- Clean separation of concerns. Chess engine doesn't know about tokens.
- Deploy/fix independently. Token logic bugs don't affect games.
- Vault is a plain ATA — fund it by sending tokens. No ceremony.
- Works for both devnet and mainnet. Same bytecode.

### MagicBlock ER Integration

The dripper program is deployed on MagicBlock Ephemeral Rollup. All claims execute on the ER where:
- **Transactions are gasless** — no SOL needed by claimants
- **SPL transfers work normally** — same `anchor_spl::token::transfer` CPI
- **ChessMatch data is readable** — the ER clones base-layer accounts, so `ChessMatch` PDAs are visible via `AccountInfo` data reads

Claim flow:
```
User connects wallet → Clicks "Claim CHESS" → Signs tx (free on ER)
→ Dripper verifies match completion → PDA-signed transfer from vault to user
→ User receives CHESS in their ATA (on ER, commit settles to base layer)
```

---

## Part C: On-Chain State

### DripperConfig PDA

```rust
#[account]
#[derive(InitSpace, Debug)]
pub struct DripperConfig {
    pub admin: Pubkey,               // Can update config, close dripper
    pub token_mint: Pubkey,          // CHESS mint address
    pub max_claims_per_wallet: u8,   // 5 or 10
    pub claim_amount: u64,           // Flat amount per claim (e.g. 1_000 CHESS)
    pub total_claimed: u64,          // Running total (informational)
    pub bump: u8,
    pub vault_bump: u8,
}
// PDA: [b"dripper_config"]
```

### Vault ATA (PDA-Owned Token Account)

```rust
// The vault is a standard SPL Associated Token Account
// owned by the DripperConfig PDA.
//
// PDA derivation:
//   seeds = [b"dripper_vault"]
//   ATA = getAssociatedTokenAddress(vault_pda, token_mint)
//
// Funding: anyone sends CHESS to this ATA via normal SPL transfer.
// The PDA signs for outbound transfers (claims).

#[account(
    init,
    payer = admin,
    associated_token::mint = token_mint,
    associated_token::authority = dripper_config,  // PDA owns it
)]
pub vault_ata: Account<'info, TokenAccount>,
```

### ClaimRecord PDA

```rust
#[account]
#[derive(InitSpace, Debug)]
pub struct ClaimRecord {
    pub wallet: Pubkey,          // Claimer (32 bytes)
    pub claim_count: u8,         // 0..max_claims_per_wallet
    pub total_claimed: u64,      // Lifetime CHESS from this dripper
    pub bump: u8,
}
// PDA: [b"claim_record", wallet.as_ref()]
```

`claim_count` is the gate — no separate `has_claimed` bool. `init_if_needed` handles first claim.

---

## Part D: Instructions

### `initialize_dripper` (admin, one-time)

```rust
#[derive(Accounts)]
pub struct InitializeDripper<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR + DripperConfig::INIT_SPACE,
        seeds = [b"dripper_config"],
        bump,
    )]
    pub dripper_config: Account<'info, DripperConfig>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = token_mint,
        associated_token::authority = dripper_config,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_dripper(
    ctx: Context<InitializeDripper>,
    max_claims_per_wallet: u8,
    claim_amount: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.dripper_config;
    config.admin = ctx.accounts.admin.key();
    config.token_mint = ctx.accounts.token_mint.key();
    config.max_claims_per_wallet = max_claims_per_wallet;
    config.claim_amount = claim_amount;
    config.total_claimed = 0;
    config.bump = ctx.bumps.dripper_config;
    config.vault_bump = ctx.bumps.vault_ata;
    Ok(())
}
```

**After init:** Admin sends CHESS to `vault_ata` address via `spl-token transfer` or any wallet. Vault is now funded and ready.

### `drip` (claimer, gasless on ER)

```rust
#[derive(Accounts)]
pub struct Drip<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    // ── Eligibility proof: ChessMatch from magic_chess program ──
    /// CHECK: Reads chess match data to verify claimer participated.
    /// We deserialize manually — this account is owned by magic_chess program,
    /// not by token_dripper.
    #[account(
        constraint = verify_match_participation(
            &chess_match,
            claimer.key(),
        )? @ DripperError::NotMatchParticipant
    )]
    pub chess_match: AccountInfo<'info>,  // Unchecked — owned by chess program

    // ── Dripper state ──
    #[account(
        seeds = [b"dripper_config"],
        bump = dripper_config.bump,
    )]
    pub dripper_config: Account<'info, DripperConfig>,

    #[account(
        mut,
        seeds = [b"dripper_vault"],
        bump = dripper_config.vault_bump,
    )]
    pub vault_ata: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = claimer,
        space = ANCHOR_DISCRIMINATOR + ClaimRecord::INIT_SPACE,
        seeds = [b"claim_record", claimer.key().as_ref()],
        bump,
    )]
    pub claim_record: Account<'info, ClaimRecord>,

    #[account(
        init_if_needed,
        payer = claimer,
        associated_token::mint = vault_ata.mint,
        associated_token::authority = claimer,
    )]
    pub claimer_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_drip(ctx: Context<Drip>) -> Result<()> {
    let config = &ctx.accounts.dripper_config;
    let record = &mut ctx.accounts.claim_record;

    // 1. Check claim count under limit
    let is_new = record.claim_count == 0 && record.wallet == Pubkey::default();
    require!(
        is_new || record.claim_count < config.max_claims_per_wallet,
        DripperError::MaxClaimsReached
    );

    // 2. Check vault has enough tokens
    require!(
        ctx.accounts.vault_ata.amount >= config.claim_amount,
        DripperError::VaultEmpty
    );

    // 3. PDA-signed transfer from vault to claimer
    let config_bump = config.bump;
    let seeds: &[&[u8]] = &[b"dripper_config", &[config_bump]];
    let signer_seeds: &[&[&[u8]]] = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_ata.to_account_info(),
                to: ctx.accounts.claimer_ata.to_account_info(),
                authority: ctx.accounts.dripper_config.to_account_info(),
            },
            signer_seeds,
        ),
        config.claim_amount,
    )?;

    // 4. Update claim record
    if is_new {
        record.wallet = ctx.accounts.claimer.key();
    }
    record.claim_count = record.claim_count
        .checked_add(1)
        .ok_or(DripperError::MathOverflow)?;
    record.total_claimed = record.total_claimed
        .checked_add(config.claim_amount)
        .ok_or(DripperError::MathOverflow)?;
    record.bump = ctx.bumps.claim_record;

    emit!(DripEvent {
        wallet: ctx.accounts.claimer.key(),
        amount: config.claim_amount,
        claim_number: record.claim_count,
    });

    Ok(())
}
```

### `verify_match_participation` Helper

```rust
/// Reads ChessMatch account data from the magic_chess program.
/// Returns true if `wallet` is players[0] or players[1] AND game is terminal.
///
/// ponytail: manual byte offsets instead of full ChessMatch deserialization.
/// We only need players[0], players[1], game_status. Don't need the board.
fn verify_match_participation(
    chess_match_info: &AccountInfo,
    wallet: Pubkey,
) -> Result<bool> {
    let data = chess_match_info.try_borrow_data()
        .map_err(|_| DripperError::AccountDataUnavailable)?;

    // ChessMatch layout after Anchor discriminator (8 bytes):
    //   match_id: String(4+len) → skip
    //   players[0]: Pubkey at offset 8+4+match_id_len
    //   players[1]: Pubkey at offset + 32
    //   ...
    //   game_status: 1 byte enum variant (after board state)

    // ponytail: hardcoded offsets for common match_id lengths.
    // Full deserialization is cleaner but this avoids pulling in the
    // ChessMatch type dependency.

    let id_len = u32::from_le_bytes([data[8], data[9], data[10], data[11]]) as usize;
    let players_offset = 8 + 4 + id_len;

    let player0 = Pubkey::new_from_array(
        data[players_offset..players_offset + 32].try_into().unwrap()
    );
    let player1 = Pubkey::new_from_array(
        data[players_offset + 32..players_offset + 64].try_into().unwrap()
    );

    let is_participant = wallet == player0 || wallet == player1;
    let player1_joined = player1 != Pubkey::default();

    // game_status offset: after players(64) + cpi(1) + ct(1) + lmt(8) + mtd(8) + gs(1)
    // ponytail: use game_status to check terminal state
    let gs_offset = players_offset + 64 + 1 + 1 + 8 + 8;
    let game_status_byte = data[gs_offset];

    // GameStatus enum: WaitingForOpponent=0, Active=1, WhiteWins=2, BlackWins=3, Draw=4, Aborted=5
    let is_terminal = game_status_byte >= 2;

    Ok(is_participant && player1_joined && is_terminal)
}
```

> **ponytail note**: Manual byte offsets are fragile if ChessMatch layout changes. For production, import `magic_chess::state::ChessMatch` as a shared crate and use proper `try_deserialize`. For MVP, raw offsets work and avoid cross-program type coupling. Add shared crate when layouts stabilize.

### `update_config` (admin)

```rust
pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    new_max_claims: Option<u8>,
    new_claim_amount: Option<u64>,
) -> Result<()> {
    let config = &mut ctx.accounts.dripper_config;
    if let Some(max) = new_max_claims {
        config.max_claims_per_wallet = max;
    }
    if let Some(amount) = new_claim_amount {
        config.claim_amount = amount;
    }
    Ok(())
}
```

---

## Part E: Program Setup & Deployment

### Create the Dripper Project

```bash
# Separate Anchor workspace (or a sub-directory in the monorepo)
anchor init token-dripper
cd token-dripper
```

### Cargo.toml Dependencies

```toml
[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
ephemeral-rollups-sdk = "0.14.3"   # MagicBlock ER support
```

### Deploy to Devnet (MagicBlock ER)

```bash
# Build
cargo build-sbf --tools-version v1.52

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Or deploy directly to MagicBlock ER for gasless claims
solana program deploy \
  --url https://rpc.magicblock.app/devnet \
  target/deploy/token_dripper.so
```

### Fund the Vault

```bash
# After initialize_dripper is called, get the vault_ata address:
# PDA [b"dripper_config"] → DripperConfig PDA
# ATA(DripperConfig PDA, CHESS mint) → vault_ata

# Send CHESS to the vault (standard SPL transfer):
spl-token transfer <CHESS_MINT> <AMOUNT> <VAULT_ATA_ADDRESS> \
  --owner <ADMIN_KEYPAIR_PATH> \
  --url devnet
```

No special deposit instruction needed. Vault is just an ATA — standard SPL transfer funds it.

### PDA Seeds Summary

| PDA | Seeds | Purpose |
|-----|-------|---------|
| `DripperConfig` | `[b"dripper_config"]` | Config, admin, vault bump |
| `Vault ATA` | ATA of `DripperConfig` PDA + `token_mint` | Holds CHESS, PDA signs transfers |
| `ClaimRecord` | `[b"claim_record", wallet]` | Per-wallet claim counter |

### Error Variants

```rust
#[error_code]
pub enum DripperError {
    #[msg("Maximum claims reached for this wallet.")]
    MaxClaimsReached,
    #[msg("Vault has insufficient balance.")]
    VaultEmpty,
    #[msg("Claimer did not participate in this match.")]
    NotMatchParticipant,
    #[msg("Match is not in a terminal state.")]
    MatchNotTerminal,
    #[msg("Cannot read match account data.")]
    AccountDataUnavailable,
    #[msg("Arithmetic overflow.")]
    MathOverflow,
    #[msg("Only admin can perform this action.")]
    NotAdmin,
}
```

### Events

```rust
#[event]
pub struct DripEvent {
    pub wallet: Pubkey,
    pub amount: u64,
    pub claim_number: u8,
}
```

---

## Part F: Eligibility — Both Players

Unlike v1 (creator-only), both match participants can claim:

```rust
let is_participant = wallet == player0 || wallet == player1;
let player1_joined = player1 != Pubkey::default();
let is_terminal = game_status_byte >= 2; // WhiteWins(2), BlackWins(3), Draw(4), Aborted(5)

let eligible = is_participant && player1_joined && is_terminal;
```

| Condition | Why |
|-----------|-----|
| `wallet == player0 || wallet == player1` | Creator AND joiner both contributed |
| `player1 != Pubkey::default()` | Match must have had an opponent (no solo claims) |
| `game_status >= 2` (terminal) | Match must be finished. No claiming mid-game |

---

## Part G: Mainnet Airdrop (Future)

### Flow

1. Run devnet dripper campaign for N weeks.
2. **Snapshot** devnet CHESS holders (query SPL token accounts for CHESS mint).
3. **Filter** wallets that created or joined at least one completed match (via `getProgramAccounts` on chess program).
4. **Airdrop** mainnet CHESS proportionally.

### Snapshot Script (TypeScript, to be built later)

```typescript
// scripts/snapshot-devnet-holders.ts
// 1. Get all CHESS token accounts on devnet via getProgramAccounts
// 2. Cross-reference with ChessMatch PDAs (players[0] or players[1] match)
// 3. Output: { wallet, devnetBalance, matchesPlayed, eligible }[]
// 4. Proportional distribution from mainnet treasury
```

---

## Part H: Configurable Parameters

```
MAX_CLAIMS_PER_WALLET:   10         (default, adjustable via update_config)
CLAIM_AMOUNT:            1_000      (CHESS per claim, adjustable)
```

Devnet values kept small — enough for testing wagers, not enough to matter economically.

---

## Part I: Token Utility (Post-Launch)

Once real CHESS exists on mainnet:

| Utility | Mechanism | When |
|---------|-----------|------|
| **Platform fee discount** | Hold ≥10,000 CHESS → 50% off fees | Phase 3 |
| **Gas sponsorship** | Burn CHESS to cover MagicBlock fees | Phase 3 |
| **Cosmetics** | Board themes, badges (CHESS-gated) | Phase 3 |
| **Staking** | Stake CHESS → share platform fees | Phase 4 |
| **Governance** | DAO on fee params, token utility | Phase 4 |

---

## Part J: Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Sybil on devnet** | Bots drain vault | Match completion costs state rent + time. Devnet acceptable. |
| **Vault PDA compromise** | Tokens stolen | Only the program can sign for vault PDA. No admin key can withdraw. |
| **Byte-offset breakage** | Eligibility check fails after chess program upgrade | Freeze offset. Switch to shared crate for production. |
| **Campaign runs forever** | Idle tokens | Vault is finite. Campaign ends naturally at 0. |
| **Token lacks value** | Immediate dumps | Utility creates demand. Buyback from platform fees. |

---

## Part K: Implementation Plan (MVPv2)

### What Gets Built

1. **`token-dripper/`** — new Anchor workspace (separate from magic-chess-program)
2. **State**: `DripperConfig`, `ClaimRecord`
3. **Instructions**: `initialize_dripper`, `drip`, `update_config`
4. **SDK**: TypeScript client for dripper program
5. **Deploy**: Devnet + MagicBlock ER
6. **Test**: Unit + LiteSVM integration

### File Manifest

```
token-dripper/
├── programs/token_dripper/
│   └── src/
│       ├── lib.rs              # Entry + instruction dispatch
│       ├── constants.rs        # PDA seeds
│       ├── errors.rs           # DripperError enum
│       ├── events.rs           # DripEvent
│       ├── state/
│       │   ├── mod.rs
│       │   ├── dripper_config.rs
│       │   └── claim_record.rs
│       └── instructions/
│           ├── mod.rs
│           ├── initialize_dripper.rs
│           ├── drip.rs
│           └── update_config.rs
├── tests/
│   └── dripper.test.ts
└── sdk/
    └── src/
        ├── client.ts           # TokenDripperClient
        └── types.ts            # DripperConfig, ClaimRecord types
```

### No Changes To

- `magic-chess-program/` — zero changes. Chess engine stays untouched.
- `frontend/` — only add a "Claim CHESS" button that calls dripper program.

### Estimated Effort

| Task | Time |
|------|------|
| Scaffold token-dripper workspace | 15 min |
| State types + errors + events | 20 min |
| `initialize_dripper` instruction | 30 min |
| `drip` instruction (+ byte-offset verification) | 1 hr |
| `update_config` instruction | 15 min |
| Wire into lib.rs | 10 min |
| Unit tests | 1 hr |
| LiteSVM integration tests | 1 hr |
| SDK (TypeScript client) | 30 min |
| Deploy to devnet + fund vault | 30 min |
| Frontend claim button | 1 hr |
| **Total** | **~6.5 hours** |

---

## Part L: What Changed vs v1 Design

| v1 | v2 | Reason |
|----|----|--------|
| Part of chess program | Separate `token_dripper` program | Clean separation. Chess doesn't know about tokens. |
| Creator only (`players[0]`) | Both players | Fair — both contributed. |
| `PlayerStats` + `RewardClaim` + `ClaimCounter` | `DripperConfig` + `ClaimRecord` | Fewer PDAs. Simpler state. |
| Tiered claim amounts | Flat per-claim, configurable | No premature optimization. |
| Relay server for signing | PDA-signed transfer (vault PDA) | No server. Program signs. |
| Single phase | Two-phase: devnet faucet → mainnet airdrop | Test first. |
| Manual SPL token creation doc | Same (Part A) | Unchanged — still manual mint. |

### Ponytail Notes

- **Separate program, not shared crate**: Easier to deploy and iterate independently. Cross-program type coupling is a trap at this stage. Add shared types later if layouts stabilize.
- **No CPI to chess program**: Reading ChessMatch data via `AccountInfo` is zero-cost and avoids CPI complexity. Just verify the bytes. If the chess program changes its layout, our byte offset breaks — that's the trade-off. Document the offset dependency.
- **No eATA model**: MagicBlock Ephemeral SPL Token (eATA + Global Vault) is for private payments and complex custody. For a simple dripper, standard PDA-owned ATA on the ER is simpler and "just send tokens to it" works.
- **No Merkle trees, no vesting, no tiered rewards**: Vault drains until empty. Flat rate. Add complexity when the numbers justify it.
- **No time expiry**: Vault empty = campaign over. Add `end_time` later if the vault sits unfilled too long.
