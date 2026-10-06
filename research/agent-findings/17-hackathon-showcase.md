# Agent 17: Hackathon Showcase Plan

## Status: ✅ Complete — `HACKATHON_SHOWCASE.md` written (960 lines)

### Demo Script: Scholar's Mate in 3 Minutes

**0:00-0:30** — Hook: "Fully on-chain chess engine on Solana, powered by MagicBlock"
**0:30-1:00** — Onboarding: Google sign-in, no wallet, embedded wallet auto-created
**1:00-2:00** — Create match: $5 USDC blitz, share link, opponent joins
**2:00-3:00** — Play: 4 moves, Scholar's Mate checkmate, zero confirmations, auto-settlement

### 10-Slide Deck
1. Title — Magic Speed Chess
2. Problem — Chess needs trustless wagering
3. Solution — On-chain chess + MagicBlock + Privy
4. Architecture Diagram
5. Chess Logic — All FIDE rules verified
6. MagicBlock Integration — Session keys, crank, gasless
7. UX — Google → embedded wallet → zero confirmations
8. Live Demo / Video
9. Roadmap — Prediction markets, mobile, SDK, token
10. Team + Ask

### Judge Talking Points
- "505 lines of Rust — complete FIDE chess engine"
- "MagicBlock makes it Web2-fast: no wallet popups, no gas"
- "Anyone can play — Google sign-in, buy USDC with card"
- "TypeScript SDK so anyone can build on our protocol"
- "Prediction markets on live games coming next"

### Submission Checklist
- [x] SPEC.md, README.md written
- [ ] Demo video (3 min screen recording)
- [ ] Live demo URL (Vercel)
- [ ] GitHub repo (clean, documented)
- [ ] Devnet program deployed
- [ ] Pitch deck (PDF)
- [ ] Team info

### Fallback Plans (6 scenarios)
- Devnet RPC down → local validator + recording
- MagicBlock ER issues → standard Solana (slower but functional)
- Privy auth failure → Phantom wallet fallback
- Internet loss → pre-recorded video
- Opponent join failure → second browser tab
- Checkmate not detected → show resignation flow instead

### Q&A Prepared (12 questions)
Including: why blockchain, why MagicBlock, cheating prevention, CU costs, session key delegation, abandoned games, Ethereum comparison, prize money allocation.
