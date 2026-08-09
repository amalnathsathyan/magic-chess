# Build context

project: Magic Chess
stack: Next.js, Privy embedded Solana wallets, Anchor, MagicBlock Ephemeral Rollups

debug:
  last_session: 2026-08-09
  issues_resolved:
    - error: Transaction recent blockhash required
      cause: The custom Anchor provider serialized the transaction before assigning a recent blockhash and fee payer.
      fix: Prepare base transactions with a fresh blockhash and validity height, then sign and submit through Privy v3 on the same connection.
    - error: Social and external-wallet authentication prompts did not open reliably.
      cause: The frontend used Privy v2 hooks/configuration with a v3 sponsorship API and the generic WalletConnect connector.
      fix: Migrate to Privy v3 Solana hooks/RPC configuration and the Solana-specific WalletConnect connector; dashboard providers and exact origins remain required.
  routing_invariant: Base transactions use the base RPC and Privy sponsor; ER transactions use the router-selected ER endpoint and its blockhash.
