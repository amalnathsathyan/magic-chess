---
sidebar_position: 6
---

# Devnet ZUG faucet (devnet only)

:::caution Devnet only
This feature exists so testers can stake on devnet without holding SOL. It will be removed when
ZUG Arena moves to mainnet. The devnet ZUG token has no value and will not carry over.
:::

Players arrive on devnet with an empty embedded wallet. Instead of asking them for devnet SOL, the
app hands out a devnet SPL token called **ZUG** and makes it the default stake token:

| Claim | Amount | When |
| --- | --- | --- |
| Signup bonus | 10,000 ZUG | The first claim for a wallet (and for the Privy account behind it) |
| Daily drip | 1,000 ZUG | Once per UTC day from the day after the signup claim |

The claim shows up as a banner on the arena page, as a card inside the "New match" form, and on
the join panel when an invited player opens a ZUG match. Signing in is required: the backend keys
claims by Privy user *and* wallet, so a second wallet on the same account gets no second bonus.

## How it works

- **The token.** A classic SPL mint with 6 decimals and a fixed supply of 1,000,000,000 ZUG
  (the pump.fun defaults), with Metaplex metadata pointing at the ZUG logo in this repository.
  `backend/scripts/create-devnet-zug.ts` creates it once (`npm run faucet:create-token`), mints
  the whole supply to a treasury wallet and revokes the mint authority.
- **The treasury.** One wallet holds the supply. Its secret key is the backend's
  `FAUCET_TREASURY_PRIVATE_KEY`; it signs every transfer. The gas-sponsor fee payer pays the
  transaction fee and the player's token-account rent, so the treasury needs no SOL. Claims keep
  working until the treasury is empty; the banner disappears when it is.
- **The backend.** `GET /api/faucet/status` returns the public config (mint, amounts, tokens
  left) and, with a Privy access token and `?wallet=`, the wallet's own claim state.
  `POST /api/faucet/claim` pays the next claim. Each claim is a row in `faucet_claims`
  (migration 010), inserted before the transfer and removed if it fails, so unique indexes stop
  double payouts even for concurrent requests.
- **The frontend.** `NEXT_PUBLIC_WAGER_MINT` / `SYMBOL` / `DECIMALS` name the default stake
  token. The token dropdown lists ZUG first (with the wallet's balance), then SOL, then anything
  else the wallet holds. Stake presets follow the token (0 / 100 / 500 / 1000 ZUG), and the lobby
  lists matches staked in either ZUG or SOL.

## Setup

See `DEPLOY.md` → "Devnet ZUG faucet" for the commands. In short: run the script once from a
funded devnet keypair, paste the printed `FAUCET_*` values into the backend's environment and the
`NEXT_PUBLIC_WAGER_*` values into the frontend's build variables, redeploy both.

## Removal on mainnet

Delete `backend/src/services/faucet.ts`, `backend/src/routes/faucet.ts`, the `faucet` block in
`backend/src/config.ts`, migration 010, `frontend/lib/faucet.ts`, `frontend/hooks/useFaucet.ts`
and `frontend/components/lobby/FaucetBanner.tsx`, and point `NEXT_PUBLIC_WAGER_MINT` at the
mainnet stake token. The stake-token list (`frontend/lib/stake-tokens.ts`) stays.
