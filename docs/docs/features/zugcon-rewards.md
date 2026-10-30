# ZUGCON rewards

ZUGCON is a pump.fun memecoin on Solana **mainnet** that thanks both players of a finished ZUG Arena
game: 20,000 ZUGCON to the creator (white) and 10,000 to the joiner (black). Games are played on devnet;
the reward is paid on mainnet to the same wallet address.

## Rules

- Only a finished game with an opponent counts: `WhiteWins`, `BlackWins` or `Draw` on chain. Games nobody
  joined and aborted games earn nothing.
- The result is read live from the devnet match account (base layer or rollup). If the account was closed
  after settlement, the indexed row must record the settlement. The index alone is never enough.
- A game shorter than `ZUGCON_MIN_PLIES` (default 10 plies) earns nothing.
- Per UTC day a wallet is rewarded for at most `ZUGCON_DAILY_GAMES_PER_WALLET` games (10) and
  `ZUGCON_DAILY_GAMES_PER_PAIR` games (3) against the same opponent.
- One claim per seat per game, stored in `reward_claims` before the transfer leaves the backend, so a retry
  after a crash checks the recorded signature instead of paying twice.

## Flow

1. The play page (and the review page for players who come back later) asks
   `GET /api/rewards/matches/:matchId?wallet=` once the game is finished.
2. When `eligibility.eligible` is true, a "You earned 20,000 ZUGCON" banner opens a modal.
3. The player signs the message from `GET .../challenge` (free, no transaction) and the frontend posts it to
   `POST .../claim`.
4. The backend verifies the signature, re-checks the chain, inserts the claim row, creates the recipient's
   token account if needed and sends `transfer_checked` from the drip wallet, which also pays the fee.
5. The modal shows the Solscan link. The claim row keeps `status`, `tx_signature` and any `error`.

## Operations

Env vars are listed in `backend/.env.example` under "ZUGCON rewards". `/api/health` reports `rewards`
with the drip wallet's SOL and ZUGCON balances. Keep 1-2 weeks of rewards and ~0.5 SOL in the drip wallet;
the reserve lives in a cold treasury (see the ZUGCON launch guide in the project files).

Each first-time recipient costs ~0.002 SOL of token-account rent on top of the transaction fee.
