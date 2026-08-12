# Personal X Posts — @amalnathsathyan

> Solo founder building Arena in public. On-chain chess engine on Solana.
> Newest posts at top. Status: [DRAFT] = ready, [POSTED] = published.

---

### Aug 12 — Morning [DRAFT]
**First browser-to-browser chess game completed. White (CLI) vs Black (Edge browser). 5 moves each. Our cross-browser agent found a TDZ bug in production, a broken debug interface, and a secret: `react-chessboard` uses `data-square` attributes.**

The Edge agent spent 6 hours trying to play 5 moves. It tried React fiber walking (React 19 doesn't expose fibers on DOM). It tried AppleScript mouse clicks (chessboard ignores synthetic events). It tried `window.__magicChess` debug hooks (ReferenceError — `authoritativeFen` used before declaration). It tried everything I could think of.

Then it found the answer in the DOM: `<div data-square="e2">`. The `react-chessboard` library renders every square with a `data-square` attribute. The agent could click them directly: `document.querySelector("[data-square=e2]").click()`. Works perfectly. No React internals needed. No mouse coordinates needed. Just a CSS selector.

The bugs it found along the way:
1. **TDZ bug**: my `window.__magicChess` debug hook referenced `authoritativeFen` (a `useMemo`) before its declaration. The hook was in a `useEffect` at the top of the component, but `authoritativeFen` was declared 80 lines later. Temporal Dead Zone. Fixed by moving the debug hook after all declarations.
2. **Session key blockhash expired**: the backend sponsor relay takes ~8 seconds to validate, co-sign, simulate, and broadcast. By the time it processes the session creation, the blockhash from the frontend has expired. Need to fetch the blockhash closer to submission or increase the validity window.
3. **`window.__magicChess` never worked**: even after the TDZ fix, Turbopack hot reload didn't pick up the new useEffect. The debug interface was DOA. Browser restart didn't fix it. The production build will likely work, but dev mode + hot reload + debug hooks = unreliable.

The `data-square` discovery changes everything for browser automation. No more guessing coordinates. No more React fiber spelunking. Just `querySelector` + `click`. The next agents can play real chess from real browsers.

`#buildinpublic` `#react` `#debugging` `#chess` `#browserAutomation`

<!-- Checked 2026-08-12 06:00 UTC: no new developments -->

---

### Aug 12 — Early Morning [DRAFT]
**160 moves. 10 full matches. Zero errors. The chess engine works. Now the hard part: making the frontend not suck.**

Ran 10 automated matches back-to-back on devnet tonight. Each match does the full lifecycle: create → join → delegate → session keys → 16 alternating half-moves via MagicBlock ER. Every move confirmed on-chain. Every session key worked. Every delegation resolved on the first attempt. `devnet-as.magicblock.app` handled all 160 moves without a single failure.

But the frontend debugging was a different story. Here's what broke and how we fixed it:

1. **React portal event delegation**: Clicks on the submit button inside a Radix Dialog Portal didn't fire `form.onSubmit`. The form just sat there. `form.requestSubmit()` worked, but `button.click()` didn't. Root cause: React 19's event delegation doesn't reach portal-rendered elements the same way. Fix: added `onClick={handleSubmit}` directly on the button. One attribute. Three hours of debugging.

2. **`toArrayLike is not a function`**: Tried to bundle ATA creation + match init into a single transaction. Built a `Transaction` manually using `@solana/web3.js` v1 types, added instructions, called `provider.sendAndConfirm`. Boom. `@solana/kit` v5 uses web3.js v2 internally and tries to call `.toArrayLike()` on a v1 `PublicKey`. The fix: revert to `client.createMatch()` which uses Anchor's internal transaction builder. One step forward (single tx), one step back (v1/v2 compat), two steps forward (Anchor handles it).

3. **`dynamicParams` build error**: Next.js 15 static export doesn't allow `dynamicParams: true`. The error message is clear but the fix isn't — you need `dynamic = "force-static"` in a server component (the layout), not the page (which is `"use client"`). Took 3 build-deploy cycles to get right.

4. **Sponsor relay mint restriction**: The backend sponsor relay was hardcoded to only accept WSOL transactions. Picking MAGIC token in the token picker failed with "Associated-token instruction violates sponsor policy." The on-chain program validates token mints — the sponsor shouldn't. Removed the restriction.

The frontend is now at a point where creating a match works with one click (after the onClick fix), joining bundles ATA+join+delegate into a single transaction (3 approvals → 1), and moves are gasless via session keys. The browser debug hooks (`window.__magicChess`) let agents control the board programmatically.

What's still rough: the backend DB isn't syncing moves (no game history in the UI), the token picker shows balances but the sponsor only covers rent not wagers, and the Privy popup flow still requires manual approval for match creation. But the core loop — create, join, delegate, play, settle — works end to end.

`#buildinpublic` `#solana` `#react` `#debugging` `#chess`

---

### Aug 11 — Late Night [DRAFT]
**15 commits. 1,300 lines. 6 deploy attempts. One Cloudflare Worker bug that took 4 tries to fix. The SPA fallback saga.**

Static export on Cloudflare Workers is a puzzle box. The problem: Next.js generates `/play/placeholder.html` for the dynamic `[matchId]` route. But actual matches live at `/play/match-xyz`. The worker needs to serve the placeholder HTML for all match URLs.

Attempt 1: Worker maps `/play/*` → `/play/[matchId].html`. Fails — Next.js doesn't output a file named `[matchId].html`. It outputs `placeholder.html`.
Attempt 2: Fix the path. Worker maps to `/play/placeholder.html`. Still fails — `env.ASSETS.fetch()` with a Request copy returns non-ok.
Attempt 3: Same bug, different manifestation. The old `index.html` fallback was also silently failing. Workers ASSETS binding doesn't like `new Request(new URL(...), originalRequest)` — passing the original request through breaks it.
Attempt 4: Use plain URL string. `env.ASSETS.fetch(new URL("/play/placeholder.html", request.url).toString())`. Works.

The fix was one character change: `.toString()` instead of passing a Request. But discovering it took reading Cloudflare docs, testing locally, deploying, waiting 5 minutes for cache, testing again. Each cycle: 7 minutes. Four cycles: 28 minutes. For one line.

Then the Next.js client router rejected the route anyway — static export with `generateStaticParams` only accepts pre-rendered params. Had to add `export const dynamic = "force-static"` to the layout. Another build-deploy-test cycle.

This is the part of build-in-public that's honest: 90% of the work is invisible. The user sees "page loads." They don't see the 4 failed deploys, the Cloudflare ASSETS binding quirk, or the Next.js static export route validation. They just see that clicking a match link works.

And that's the point.

`#buildinpublic` `#cloudflare` `#nextjs` `#solana` `#staticExport`

---

### Aug 11 — Night [DRAFT]
**Root cause of the "match creation failed" bug: one missing environment variable. `NEXT_PUBLIC_SOLANA_SPONSOR_MODE` wasn't in wrangler.toml.**

The default is `"privy"` mode — where the user's wallet pays rent for new accounts. An embedded Privy wallet starts with 0 SOL. So the very first transaction (creating an ATA) fails with "insufficient funds." The error message is "Attempt to debit an account but found no record of a prior credit" — which tells you exactly nothing about the actual problem.

The fix: add `NEXT_PUBLIC_SOLANA_SPONSOR_MODE = "backend"` to wrangler.toml. When this is set, the backend fee payer covers ALL rent and gas. The user's wallet just signs. Zero SOL needed.

But finding this took an agent fan-out. Four agents simultaneously explored the frontend, backend, live deployments, and recent code. The backend agent found the fee payer had 6.96 SOL — plenty. The frontend agent found the missing env var. The code review agent traced the full flow and identified that `prepareWagerAccount` sends a standalone ATA creation that the wallet can't pay for. Three independent perspectives converging on the same root cause.

The meta-lesson: when a transaction fails with a cryptic Solana error, don't debug the transaction. Debug the environment. The transaction is telling you exactly what's wrong — you just don't have the right frame to understand it.

`#buildinpublic` `#solana` `#debugging` `#devops`

---

### Aug 11 — Evening [DRAFT]
**Full Magic Chess flow verified on devnet end-to-end. Create match → join → delegate → session key → make move. Every step confirmed on-chain.**

The test script (`verify-session-v2-devnet.ts`) runs all 6 steps in sequence: initialize_match, join_match, create_session_v2, delegate_match, make_move via MagicBlock Ephemeral Rollup. Two test matches created today. Every move is an on-chain transaction confirmed on `devnet-as.magicblock.app`.

The session key flow is the magic: the user creates a 55-minute temporary keypair (memory-only, never persisted), delegates authority to it, and then every move is signed locally by the session key — no wallet popup, no approval. The ER executes the move gas-free. When the game ends, state commits back to L1 and the escrow settles.

But the browser flow hit a wall: Privy's wallet approval popup is a cross-origin iframe. I can click buttons via AppleScript, fill forms, submit transactions — but I can't click "Approve" in a Privy iframe. Cross-origin security prevents programmatic interaction. The human has to click that one button.

This is the correct security model. If I could approve transactions programmatically, anyone could. The popup is the security boundary. But it means end-to-end automated browser testing of wallet interactions is fundamentally limited. You can automate everything except the signature.

Session keys fix this for gameplay — one approval per session, not per move. The UX is one click to start, then pure chess. That's the design. It's working.

`#buildinpublic` `#magicblock` `#solana` `#chess` `#sessionKeys`

---

<!-- Checked 2026-08-11 23:00 UTC: no new developments -->

### Aug 11 — Night [DRAFT]
**Built a custom Solana fee sponsorship relay. The backend now validates, co-signs, and broadcasts user transactions. Privy's built-in toggle wasn't enough.**

Privy has native gas sponsorship for embedded wallets — toggle it on, pass `sponsor: true` to `signAndSendTransaction`, done. That was the Aug 9 architecture. It worked. But it had two problems.

First: no validation. Any transaction from any authenticated user hitting any program would be sponsored. Fine for an MVP with 10 users. Not fine when someone inevitably submits a transaction draining the fee wallet through a different program.

Second: no control over what gets sponsored. Match creation? Yes. Join? Yes. But what about arbitrary instructions? What about transactions that aren't even for the chess program? The toggle is binary — sponsor everything or sponsor nothing.

The custom relay fixes both. The flow: frontend builds the transaction → user signs with embedded wallet → frontend sends the partial tx + Privy access token to `POST /api/transactions/sponsor` → backend verifies the JWT with Privy's SDK → backend validates the tx structure (program ID, account order, instruction discriminator, no System transfer from sponsor) → backend adds fee payer signature → backend simulates → backend broadcasts → backend confirms. Every step is explicit. Every validation is a guardrail.

The validations are specific to Magic Chess: the `initialize_match` discriminator must be the first 8 bytes. The account list must follow the exact Anchor ordering. The wager mint must match. No extraneous instructions. Instruction count capped. Serialized size checked. Rate limiting per user. If anything fails validation, the relay returns 400 before the fee wallet ever touches the transaction.

Also shipped: the program now supports a separate `rent_payer` signer for match PDA and escrow rent. Previously the player paid rent. Now the sponsor covers network fees, ATA rent, and match account rent. The player only brings their wager. New matches default to zero-SOL wager until I add the WSOL flow — but the infrastructure is there.

The downside: I now run a hot wallet with SOL on a backend server. The key lives in environment variables. If the server gets compromised, the fee wallet is drained. This is manageable for devnet (the SOL is worthless) but needs a proper solution before mainnet. Thinking about a hardware-backed signing service or a rate-limited proxy. Suggestions welcome.

Commits: `260fe8a` (program), `f844fcf` (backend), `ecbfe0b` (frontend), `b45a58c` (docs).

`#buildinpublic` `#solana` `#privy` `#gasless`

---

### Aug 11 — Afternoon [DRAFT]
**First gasless chess moves on devnet via MagicBlock session keys. Delegated, sponsored, zero-fee gameplay working end to end.**

The MagicBlock delegation flow: user creates a session key → delegates authority to it → all subsequent moves are signed by the session key and submitted to the Ephemeral Rollup → ER executes moves gas-free → on undelegate/settle, state commits back to L1. The user clicks "Create Match" once (L1 tx, sponsored by the relay), clicks "Join" once (L1 tx, sponsored), then plays the entire game without a single fee prompt.

Verified on devnet today. Session moves confirmed. The ER router correctly selects the authoritative endpoint. Blockhashes match. The separation between base-layer and ER connections is clean — base-layer transactions go through the sponsor relay, ER transactions go through the MagicBlock router. No cross-contamination.

Why this matters: on-chain chess with per-move approval is unplayable. A blitz game is 40+ moves. Nobody clicks "approve" 40 times. Session keys + ER delegation + sponsor relay = one approval total. The chess engine still runs on-chain. Every move is still verifiable. But the UX is a normal web game.

Test commit: `8a87ac6`. Full MagicBlock flow in `969ee48`.

`#buildinpublic` `#magicblock` `#solana` `#chess`

---

### Aug 11 — Morning [DRAFT]
**Applied the Magic Chess logo, fixed lobby filtering, and shipped dynamic match routes. Small fixes, big UX impact.**

The brand now has a face. Logo on the nav, the loading states, the PWA manifest. Small thing but the app feels real now.

The lobby was showing stale matches — games that existed as PDAs but were already completed or abandoned. Fixed by filtering on the actual `MatchStatus` enum from the on-chain state. Only `WaitingForOpponent` matches appear in the open lobby now. Obvious in hindsight, but the lobby was blindly listing all PDAs without checking status.

Dynamic routes (`/play/[matchId]`) were broken in the static export build. Next.js static export generates one HTML file per route at build time, but match IDs are dynamic. Fix: generate a placeholder at build time, read the match ID from the URL on the client, load everything on-chain. Same pattern as the Aug 9 static export migration — lean into client-side rendering for dynamic data.

Commits: `ebee3fe` (brand), `a2d8462` (lobby), `c3be2e1` (routes).

`#buildinpublic` `#ux` `#nextjs` `#chess`

---

### Aug 9 — Night [DRAFT]
**7 deploy attempts. 2 platforms. 1 static export. Deploy is always the hardest part.**

Cloudflare Workers free tier caps scripts at 3 MiB. Our OpenNext handler was 13 MiB. Not even the paid tier (10 MiB) would save us. `@solana/web3.js`, Privy SDK, Anchor — all pulled into the server bundle. The fix? Don't have a server.

Switched to static export. Next.js `output: "export"`. No SSR, no worker.js bloat, no size limits. 10 static pages. Dynamic routes like `/play/[matchId]` generate a placeholder at build time — the client reads the match ID from the URL and loads everything on-chain. The app is now a pure client-side SPA served from Cloudflare's edge.

But the deploy pipeline fought back. First attempt: Workers Builds token lacked Pages permissions. Second: wrangler auto-detected OpenNext from a stale `open-next.config.ts` and tried to invoke a build step that no longer existed. Third: `_worker.js` was getting uploaded as a static asset instead of registered as the Worker entry point. Each fix was small — delete a file, move a file, update a token — but each required a full rebuild (90 seconds) to discover the next error.

The backend had its own adventure. Fly.io requires a credit card and has no free tier for new accounts. Render free tier works but their build environment uses Node 24 which needs explicit `types: ["node"]` in tsconfig. Supabase direct connection uses IPv6 — Render can't reach it. Switched to the Supabase session pooler (port 6543, IPv4). Every step was a one-line fix that took 10 minutes to discover.

Both services are live now:
- Frontend: `https://arena.chessmagic.workers.dev` (Cloudflare Workers, static export)
- Backend: `https://magic-chess-d84o.onrender.com` (Render free tier, Fastify + Supabase)

The lesson: static export is underrated. If your app is a client-side SPA that reads from on-chain data, you don't need SSR. Next.js + static export + Cloudflare Workers is a shockingly good stack for Solana dapps. Zero server cost, global edge, no bundle size limit.

`#buildinpublic` `#cloudflare` `#nextjs` `#solana`

---

### Aug 9 — Afternoon [DRAFT]
**Social login users never pay gas. Wallet users pay their own. Both paths work in the same codebase.**

Privy has native Solana gas sponsorship — toggle it on in the dashboard, add `sponsor: true` to `signAndSendTransaction`, done. But there's a subtlety: you don't want to sponsor gas for Phantom users who already have SOL. They expect to pay. Embedded wallet users (email/social login) are new to crypto — they need sponsorship or they bounce.

The solution was clean. Override AnchorProvider's `sendAndConfirm` to route ALL transactions through Privy's `signAndSendTransaction` with `sponsor: true`. Privy handles the rest — embedded wallets get sponsored, external wallets ignore the flag and pay their own gas. No if/else in the code. No wallet type detection. Just one code path, two behaviors.

The Anchor integration was the hard part. Anchor's `.rpc()` calls `provider.sendAndConfirm(tx)` internally. Overriding that one method intercepts all 9 transaction types — create match, join, delegate, make move, resign, claim timeout, settle, set session key, prediction bets. None of them needed individual changes. One override, everywhere.

Also: MagicBlock ER transactions (moves after delegation) are already gasless. The sponsorship only covers L1 transactions — create, join, delegate, settle. So the cost to sponsor is minimal. Maybe 5 L1 transactions per game. At devnet SOL prices, that's basically free. At mainnet prices, maybe $0.01/game. Sustainable.

`#solana` `#privy` `#gasless` `#buildinpublic`

---

### Aug 9 — Morning [DRAFT]
**The auth flow is finally complete. Privy wallet → MagicBlock delegation → on-chain match creation. One seamless path.**

The last piece was a one-line config change. Fee wallet address hardcoded in wrangler.toml. That's it. But getting to that one line took wiring the entire stack: Privy for wallet auth (email + social login, no seed phrase), MagicBlock delegation for gasless transactions (user never sees a fee), Solana program for match lifecycle (create → join → move → end). Each layer had its own auth model.

The tricky part: MagicBlock delegation requires the user's wallet to sign a delegation transaction. But Privy's embedded wallet can't sign arbitrary transactions the way Phantom does. The solution: wait for Privy's wallet provider to initialize, call `provider.request({ method: 'signTransaction', ... })`, verify the signature, then use the delegated authority for all subsequent game transactions. The user clicks "Create Match" — under the hood, that's a delegation check, a transaction build, a signature, and an RPC submit. They see none of it.

Why this matters: the UX of on-chain games is broken when users have to approve every move. Gasless delegation means one approval per session, then the game plays like a normal web app. Every move is still an on-chain transaction. The chess engine still runs in a Rust program. The state still lives on Solana. But the user experience is indistinguishable from a centralized server.

Also shipped the fee wallet config. Platform takes 100 bps on wagers. That fee address is now a PDA-controlled escrow, not a hot wallet. Every fee flows to the program, not to me. Important distinction for regulatory reasons.

Next: prediction markets. The prediction pool infrastructure is already in the program. Just need to wire the frontend.

`#buildinpublic` `#solana` `#magicblock` `#auth`

<!-- Checked 2026-08-10 06:00 UTC: no new developments -->

---

### Aug 8 — Night [DRAFT]
**Renamed the project. Magic Chess → Arena. One word. Gamer-focused. Shorter domain.**

"Magic Chess" was descriptive but clunky. Three syllables. Sounded like a toy. "Arena" is one syllable. It says where you play, not what you play. Every gamer knows what an arena is.

The rename touched wrangler.toml today. More to come — the program name, the SDK package, the domain. But the name sets the direction. This isn't just a chess app. It's a venue. An arena where games happen, where spectators predict outcomes, where AI agents compete. The chess engine is the first sport. The arena hosts others.

Also shipped the actual fix for Cloudflare today. Not the `rm -rf .next/cache` workaround from earlier. The real fix: migrated to OpenNext. It transforms Next.js output into proper Cloudflare Workers format — full SSR, ISR, middleware, everything. No more praying that static assets work. This is the production build pipeline.

The `wrangler.toml` diff is poetic. `name = "arena"` now. Clean. One word. Like it should have been from day one.

`#buildinpublic` `#rebrand` `#cloudflare` `#solana`

---

### Aug 8 — Evening [DRAFT]
**Cloudflare deploy finally works. 7 commits. 6 failed attempts. 2 days. 1 `rm -rf .next/cache`.**

But the app is live: https://arena.chessmagic.workers.dev

8 pages now — landing, arena, play, spectate, profile, leaderboard, settings, 404. Leaderboard and settings pages didn't exist this morning. Built them in 20 minutes because the backend API was already there. That's the benefit of doing backend first.

The deploy bug was subtle. Project is configured as Workers Builds, not Pages. `wrangler pages deploy` hits the Pages API — token lacks Pages permissions. `wrangler deploy --assets .next` hits the Workers API — token has Workers Scripts. Same files, different auth scope. Took reading the Cloudflare docs to realize.

Second bug: `.next/cache/webpack/server-production/0.pack` is 267 MiB. Workers assets cap at 25 MiB. Build command now: `npm run build && rm -rf .next/cache`. Simple fix. Obvious in hindsight.

Also shipped 3 security fixes today. Found SQL injection in the players route — template literal interpolation of user-supplied pubkeys in raw SQL. Same code in matches.ts used parameterized queries correctly. Just missed one route. Added API key auth to all sync endpoints. Added resign → on-chain client.resign() (was local-only, escrow would lock forever).

The security posture now: sync endpoints require X-API-Key, SQL is parameterized, resign hits chain. Next: Solana tx verification on sync (verify signature exists on-chain before trusting POST body), then RLS on Supabase tables.

One observation: this is why build-in-public works. The Cloudflare saga seemed like infra hell. But people relate to the struggle. Everyone has a deploy story. The 267 MiB cache file. The missing API scope. The 6th attempt that finally goes green. That's the real content.

`#buildinpublic` `#cloudflare` `#security` `#solana`

---

### Aug 8 — Evening [DRAFT]
**Decided to keep the TypeScript SDK in the monorepo. Not publish to npm. Not delete. Here's why.**

The SDK has issues — `@ts-nocheck` on 5 of 9 files, missing 3 of 18 methods, `require('bn.js')` in ESM context, `determineMoveResult` always returns "normal" because of an Anchor enum deserialization mismatch. Every file needs love.

But the SDK is ALSO the agentic-enablement layer. AI agents that create matches, join games, place prediction bets, play chess — they all call the same `MagicChessClient` that the React frontend calls. Without the SDK, every agent writes raw Solana transactions. With it, one line: `client.makeMove(matchId, move)`.

Three consumers share it:
- `frontend/` → `"file:../sdk"` (React UI)
- `backend/` → (removed — unused, was bloating deploy)
- future agents → `"@magic-chess/sdk": "^1.0.0"` (after npm publish)

The plan: fix the SDK (tsconfig, build step, type safety, missing methods, auto-generated IDL from `anchor build`), THEN publish to npm. Until then, monorepo `file:` link works fine for the frontend.

For hackathon judges, the headline is: same SDK powers human UI AND AI agents. That's the composability story. The SDK isn't just a client library — it's infrastructure for programmatic chess.

@magicblock if anyone's building on-chain game agents, this is the pattern.

`#solana` `#typescript` `#aiagents` `#buildinpublic`

---

### Aug 8 — Afternoon [DRAFT]
**Backend is live. Fastify + Supabase PostgreSQL. Built from design docs to running server in one session.**

Full stack now: Solana program (22 instructions) → TypeScript SDK → Next.js frontend → Fastify backend → Supabase DB.

The backend indexes every on-chain event — match created, player joined, move made, game ended, payout processed. Frontend calls sync endpoints after tx confirms. Backend verifies against chain, writes DB, computes FEN.

Architected it to be minimal. Skipped Redis (Supabase Realtime handles pub/sub). Skipped Helius webhooks (client-driven sync simpler for MVP). Skipped ELO (schema ready, not populated). 3 DB tables: matches, moves, player_stats. 10 source files. Clean TypeScript compile.

The FEN engine was the fun part. Every MoveMade event includes exact coordinates (fromRow, fromCol, toRow, toCol, promotion). Backend maintains an in-memory board state per match. Applies each move exactly like the on-chain chess engine does — updates castling rights, en passant target, halfmove clock, fullmove number. Generates correct FEN:

`e2e4` → `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1`

Turn switched to black. En passant target set to e3. Halfmove clock at 0 (pawn move). Fullmove still at 1 (increments after black's move). All correct.

Tested end-to-end: create match → join → move → game end → leaderboard → player stats. Winner gets 1 win, 1 win-by-checkmate, correct streak. Loser gets -1 streak. All flowing through Supabase.

The interesting architectural question was: how do matches get into the DB? Two approaches. Helius webhooks (production-grade, event-driven, needs public endpoint) vs client-driven sync (frontend calls POST /api/sync/* after each on-chain tx). Went with client-driven. Simpler, no webhook infra, no ngrok tunnels for local dev. Frontend already waits for tx confirmation — adding one more POST is trivial. Helius webhooks come later for reliability.

Also cleaned up the docs. Deleted 19 redundant files from docs/planning/ — all were either exact duplicates of docs/docs/ or stale planning artifacts with wrong program IDs. Canonical docs now live in one place.

One thing I learned: Supabase free tier is genuinely good. 500MB Postgres, built-in Realtime (CDC → WebSocket), auto-generated REST API. Tables registered with `supabase_realtime` publication during migrations — frontend can subscribe to DB changes directly. No WebSocket server to maintain.

`#buildinpublic` `#backend` `#supabase` `#solana`

<!-- Checked 2026-08-10 ~12:00 UTC: no new developments -->
