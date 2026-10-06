# Agent 9: Frontend + Deployment Plan

## Status: ✅ Complete — No code changes

## Recommendation: Next.js 15 + Deferred React Native

Ship web-first on existing Next.js scaffold. Add React Native (Expo) post-hackathon.

### Why Not Expo Router?
- Would require complete rewrite of existing Next.js scaffold
- Web performance + SSR lag behind Next.js
- Chess is primarily desktop/web
- Keep existing shadcn/ui, Jotai, TanStack Query, wallet-adapter

### Route Plan (14 files to create)
```
/app                    → Lobby + quick-play CTA
/app/games              → Browse open matches
/app/game/[matchId]     → Active game board (core page)
/app/game/[matchId]/spectate → Watch mode
/app/history            → Past games
/app/profile/[wallet]   → Player stats
/app/create             → New match form
```

### Chess Board Library: react-chessboard v5
- TypeScript, actively maintained
- Click + drag-and-drop support
- Custom square styles (legal moves, last move, check highlights)
- Promotion dialog built-in

### State: Jotai atoms (already in project)
- `boardAtom`, `selectedSquareAtom`, `legalMovesAtom`
- `whiteTimeRemainingAtom`, `blackTimeRemainingAtom` (computed client-side)
- `moveHistoryAtom`, `capturedPiecesAtom`

### Design: Dark-Mode-First, Lichess-Inspired
```css
--color-background: #0d0f11;
--color-primary: #4ade80; /* green = your turn */
--board-light: #eeeed2;
--board-dark: #769656;
```
- Framer Motion animations (piece sliding, timer pulse)
- Board is the hero, chrome is minimal

### Deployment
- Web: Vercel (free tier, already configured)
- Mobile: Expo EAS Build (post-hackathon)
- Domain: speedchess.xyz / app.speedchess.xyz
- CI: GitHub Actions → lint → build → deploy

### Post-Hackathon
- Turborepo monorepo: `packages/shared` + `apps/web` + `apps/mobile`
- React Native with `@solana-mobile/wallet-adapter-mobile`
- App Store + Play Store distribution
