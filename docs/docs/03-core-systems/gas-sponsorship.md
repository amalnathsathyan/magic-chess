# Gas sponsorship

Magic Chess has three distinct fee paths. Treating them separately avoids
routing sponsored transactions to the wrong runtime.

## Recommended rollout

1. **Base-layer transactions:** sponsor create, join, delegate, undelegate, and
   settlement with Privy's Solana gas sponsorship. Enable **App pays**, select
   the intended Solana cluster, and enable TEE execution in the Privy
   dashboard. The frontend currently resolves `@privy-io/react-auth` 2.25.0;
   using the modern `options: { sponsor: true }` flow requires a tested Privy
   v3 migration first.
2. **Ephemeral Rollup moves:** keep move transactions on the MagicBlock router's
   authoritative ER endpoint. Public ERs currently advertise no base fee for
   normal transactions. A scoped session signer can remove repeated wallet
   prompts, but it does not replace base-layer sponsorship.
3. **Final commit:** commit and undelegate once when the game ends. MagicBlock
   currently includes ten sponsored commits per delegation. If the application
   later checkpoints more often, add a delegated application payer and the
   validator-scoped `magic_fee_vault`, then fund it from the base layer.

## Production controls

Client-side sponsorship is suitable for a capped devnet trial. Before mainnet,
relay sponsored base transactions through a backend or enforce Privy policies.
Validate the authenticated user, cluster, fee payer, program ID, instruction
discriminator, account metas, wager mint and amount, and compute/priority-fee
limits. Simulate before signing, rate-limit per user/wallet/IP/match, and add
idempotency, spend alerts, and a circuit breaker.

Associated-token-account creation deserves a specific cap: users can sometimes
close accounts and reclaim rent that the sponsor paid.

## Alternatives

- A custom backend fee payer offers the most control and can co-sign a prepared
  Solana transaction after policy validation.
- [Kora](https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction)
  is a self-hosted Solana fee-abstraction option, including payment of fees in
  supported SPL tokens. It adds key custody, funding, uptime, parsing, and abuse
  prevention responsibilities.

## References

- [Privy gas sponsorship setup](https://docs.privy.io/wallets/gas-and-asset-management/gas/setup)
- [Privy Solana sponsorship](https://docs.privy.io/wallets/gas-and-asset-management/gas/solana)
- [Privy sponsorship security](https://docs.privy.io/wallets/gas-and-asset-management/gas/security)
- [Privy Solana policy examples](https://docs.privy.io/controls/policies/example-policies/solana)
- [MagicBlock pricing](https://docs.magicblock.gg/pages/overview/additional-information/pricing)
- [MagicBlock ER quickstart](https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart)
- [MagicBlock session-key security](https://docs.magicblock.gg/pages/tools/session-keys/security)
