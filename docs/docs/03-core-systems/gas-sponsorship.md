# Privy gas sponsorship and MagicBlock routing

Magic Chess uses two Solana runtimes. A transaction must get its fee payer and
fresh blockhash from the same runtime that receives it. Mixing a base-layer
blockhash with an Ephemeral Rollup (ER) submission, or serializing before a
blockhash is assigned, fails with `Transaction recent blockhash required` or a
blockhash-not-found error.

## Transaction paths

| Operation | Submission endpoint | Signing and fees |
| --- | --- | --- |
| Create, join, delegate | MagicBlock Solana devnet RPC | Privy embedded wallet signs; authenticated backend fee payer validates, co-signs, simulates, and broadcasts |
| Moves and ER state changes | Router-selected ER FQDN | Wallet/session signer; public ER execution is gas-free |
| Commit, undelegate, settlement | Correct ER endpoint first, then base RPC after state returns | ER rules followed by backend sponsorship on base-layer work |

Immediately before signing a transaction:

1. Select the connection that will submit it.
2. Fetch `recentBlockhash` and `lastValidBlockHeight` from that connection.
3. Set `feePayer`, blockhash, and validity height before serialization.
4. Sign and submit through that same path.
5. Confirm using the same signature/blockhash/validity tuple.

The frontend's Anchor provider performs this preparation for base-layer
transactions, obtains the embedded-wallet signature through Privy v3, and sends
the partial transaction with the Privy access token to
`POST /api/transactions/sponsor`. The backend verifies the token with Privy's
official Node SDK, enforces its transaction policy, adds the fee-payer signature,
simulates, broadcasts, and confirms. The SDK's ER path remains separate and uses
the authoritative endpoint returned by the MagicBlock router.

## Privy dashboard checklist

Code cannot enable dashboard-controlled authentication or sponsorship. For the
development deployment, verify all of the following:

1. Enable **Google** and **Discord** under Authentication → Login methods.
2. Add each exact web origin under App settings → Domains, including protocol
   and localhost port but no path (for example `http://localhost:3000`). Google
   OAuth should be tested in a normal browser, not an embedded/in-app browser.
3. Enable embedded Solana wallets, wallet UI prompts, and TEE execution.
4. Copy the access-token verification key from Configuration → App settings →
   Basics → **Verify with key instead** into the backend secret store.
5. Keep the Solana fee-payer secret key only in the backend secret store. The
   browser receives only its public address.

The login UI is configured with the Solana-specific WalletConnect connector.
Email login can create an embedded wallet without a SIWS popup; external-wallet
login requires the wallet connection and sign-in approval. A social popup not
opening while email works generally means the provider or exact redirect origin
is missing in the Privy dashboard.

## What sponsorship pays

The custom fee payer covers network fees, sponsored ATA rent, and the match PDA
and escrow rent through the program's separate `rent_payer` signer. It does not
provide the user's wager principal. New matches therefore default to a zero-SOL
wager. A nonzero WSOL wager is rejected before signing if the connected wallet
lacks the required SOL.

The backend validates the authenticated user signature, fee payer, allowed
programs, `initialize_match` discriminator and account order, wager mint,
System transfers, idempotent ATA construction, instruction count, serialized
size, and blockhash. It rate-limits before signing and rejects any System
transfer sourced from the sponsor. ATA rent remains capped because an account
owner can later close an ATA and reclaim its rent.

Required backend variables are `SOLANA_FEE_PAYER_PRIVATE_KEY`,
`SOLANA_FEE_PAYER_ADDRESS`, `PRIVY_APP_ID`,
`PRIVY_JWT_VERIFICATION_KEY`, `WAGER_MINT`, and
`PLATFORM_FEE_WALLET`. Required browser variables are
`NEXT_PUBLIC_SOLANA_SPONSOR_MODE=backend` and the public
`NEXT_PUBLIC_SOLANA_FEE_PAYER_ADDRESS`.

MagicBlock currently includes a limited number of sponsored commits per
delegation. If the application adds frequent checkpoints, use a scoped delegated
application payer and validator fee vault rather than routing ER work through
the Privy base-layer sponsor.

## Reference implementations

- [CapturGo](https://github.com/CapturGo/capturgo-magicblock) consumes the
  server-selected endpoint and exact blockhash/validity tuple, then submits and
  confirms on the same connection.
- [Perps Games](https://github.com/EchoWebLV/perps-games) keeps explicit base
  and ER connections and sets fee payer plus a fresh confirmed blockhash before
  signing.
- [Hunch](https://github.com/priyanshudotsol/Hunch-magicblock) constructs
  transactions with fee payer, blockhash, and validity height and refreshes
  stale blockhashes before retrying.

## Documentation

- [Privy custom Solana sponsorship](https://docs.privy.io/wallets/gas-and-asset-management/gas/solana)
- [Privy access-token verification](https://docs.privy.io/authentication/user-authentication/access-tokens)
- [Privy Solana getting started](https://docs.privy.io/recipes/solana/getting-started-with-privy-and-solana)
- [Privy React v3 migration](https://docs.privy.io/basics/react/advanced/migrating-to-3.0)
- [Privy OAuth login](https://docs.privy.io/authentication/user-authentication/login-methods/oauth)
- [Privy allowed domains](https://docs.privy.io/recipes/dashboard/allowed-domains)
- [MagicBlock ER quickstart](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart)
- [MagicBlock router concepts](https://docs.magicblock.gg/pages/tools/router/core-concepts)
- [MagicBlock session-key security](https://docs.magicblock.gg/pages/tools/session-keys/security)
