# Magic Chess Frontend

Next.js 15 + React 19 frontend for Magic Chess — on-chain chess with wagering on Solana.

## Tech Stack

- **Next.js 15** with App Router
- **React 19**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI primitives)
- **TypeScript**
- **@solana/wallet-adapter-react** for wallet connection
- **Jotai** for client-side state management

## Architecture

The frontend connects to **MagicBlock devnet Ephemeral Rollups** for gasless move submissions. All game logic runs on-chain via the MagicChess Anchor program. The frontend uses `@magic-chess/sdk` from `../sdk/` for typed program interaction, React hooks, FEN utilities, and PDA helpers.

## Pages

| Route    | Description                                                  |
|----------|--------------------------------------------------------------|
| `/`      | Home — landing page with featured matches and quick actions  |
| `/play`  | Game — interactive chess board for an active match           |
| `/create`| New match — configure wager, token, timeout, and create      |
| `/join`  | Join match — browse joinable matches and enter wager amount  |

## Getting Started

```bash
# Install dependencies
npm install

# Link local SDK (from ../sdk/)
npm link @magic-chess/sdk

# Run dev server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_MAGICBLOCK_ER_ENDPOINT=<magicblock-devnet-er-url>
NEXT_PUBLIC_PROGRAM_ID=<deployed-program-id>
```

## References

- [MagicBlock Documentation](https://docs.magicblock.gg)
- [@magic-chess/sdk](../sdk/)
- [Project Specification](../SPEC.md)
- [Architecture Docs](../docs/)
