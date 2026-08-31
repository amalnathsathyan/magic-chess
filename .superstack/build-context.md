# Build context

project: Magic Chess
stack: Next.js, Privy embedded Solana wallets, Anchor, MagicBlock Ephemeral Rollups

debug:
  last_session: 2026-08-10
  issues_resolved:
    - error: Transaction recent blockhash required
      cause: The custom Anchor provider serialized the transaction before assigning a recent blockhash and fee payer.
      fix: Prepare base transactions with a fresh blockhash and validity height, then sign and submit through Privy v3 on the same connection.
    - error: Social and external-wallet authentication prompts did not open reliably.
      cause: The frontend used Privy v2 hooks/configuration with a v3 sponsorship API and the generic WalletConnect connector.
      fix: Migrate to Privy v3 Solana hooks/RPC configuration and the Solana-specific WalletConnect connector; dashboard providers and exact origins remain required.
    - error: PrivyApiError — Gas sponsorship is not enabled.
      cause: The frontend requested Privy's dashboard-managed sponsor on Solana devnet, but sponsorship was not enabled for the app.
      fix: Route embedded-wallet base transactions through an authenticated custom backend fee payer; verify access tokens with the official Privy Node SDK, validate/simulate before co-signing, and use a separate Anchor rent payer.
    - error: Session-backed ER moves fail with UnauthorizedSigner 6041.
      cause: The browser creates SessionTokenV2 on the base layer, but moves execute on the router-selected ER where that token is not reliably available.
      fix: Fall back to a wallet-signed ER move for the deployed program; after upgrading the program, register the temporary signer on the delegated match with setSessionKey.
    - error: Backend lobbies and realtime snapshots remain empty after browser transactions.
      cause: Frontend sync helpers had no call sites and required a browser-exposed API key, while no external indexer was running.
      fix: Submit confirmed transaction signatures from the browser without a shared secret; the backend reconstructs only verified configured-program events and rate-limits submissions.
  last_debug_session: 2026-08-31
  routing_invariant: Base transactions use the base RPC and backend sponsor; ER transactions use the router-selected ER endpoint and its blockhash.
