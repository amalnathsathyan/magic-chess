---
sidebar_position: 2
title: Program reference
---

# Program reference

The `magic_chess` Anchor program (Anchor 1.1.2) lives in
`magic-chess-program/programs/magic_chess`.

| | |
| --- | --- |
| Program ID (devnet) | `FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h` |
| IDL | `sdk/src/idl/magic_chess.json` |
| MagicBlock delegation program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| MagicBlock session keys (gum) | `KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5` |

```
src/
├── lib.rs            # instruction dispatch (#[ephemeral] #[program])
├── constants.rs      # seeds, limits, fee splits
├── errors/           # ChessError (codes 6000–6057)
├── events/           # Anchor events read by the indexer
├── instructions/     # one file per instruction
├── state/            # ChessMatch, PredictionPool, PredictionBet, enums
└── utils/
    ├── chess_logic.rs   # move generation, validation, game-end detection
    └── payout_logic.rs  # escrow payouts
```

## Accounts

| Account | Seeds | Holds |
| --- | --- | --- |
| `ChessMatch` | `["chess_match", match_id]` | Players, board, turn, clock, castling/en passant, position history, wager terms, session keys, delegation flags |
| Match escrow (SPL token account) | `["match_escrow", match_id]` | Both wagers. Owned by its own PDA, closed at settlement or abort |
| `PredictionPool` | `["prediction_pool", match_id]` | Totals bet on White/Black/Draw, fee, settlement flag |
| Prediction vault (SPL token account) | `["prediction_pool_vault", prediction_pool]` | Prediction stakes |
| `PredictionBet` | `["prediction_bet", prediction_pool, bettor]` | One bettor's stake and outcome |

`match_id` is a UTF-8 string of at most 32 bytes chosen by the creator.
ZUG Arena uses `mc-` plus random characters.

### `ChessMatch` fields

| Field | Meaning |
| --- | --- |
| `players[2]` | `players[0]` is White (creator), `players[1]` is Black (`Pubkey::default()` until joined) |
| `current_turn` | `White` or `Black`. Authorization derives from this, not from `current_player_idx` (kept for layout compatibility) |
| `last_move_timestamp`, `move_timeout_duration` | Per-move clock in seconds. `0` disables timeouts |
| `game_status`, `game_end_reason` | See the enums below |
| `board[8][8]` | `Option<Piece>`. Row 0 is rank 1, column 0 is the a-file |
| `castling_rights`, `en_passant_target`, `halfmove_clock`, `fullmove_number` | Standard FEN state |
| `position_history` | Up to 200 position hashes for threefold repetition |
| `betting_token_mint`, `bet_amount_player_one/two`, `total_pot` | Wager terms. `0` is a free match |
| `platform_fee_basis_points`, `platform_fee_wallet` | Fee terms set by the creator (max 10 000 bps) |
| `payout_processed` | `true` after settlement or abort. Gates `close_match` |
| `prediction_enabled` | Allows a `PredictionPool` for this match |
| `is_delegated`, `delegation_uid` | Rollup delegation state |
| `white/black_session_signer`, `..._expires_at` | Registered fast-play session keys |
| `active_task_id` | Scheduled timeout crank task, `-1` when none |

### Enums

- `GameStatus`: `WaitingForOpponent`, `Active`, `WhiteWins`, `BlackWins`, `Draw`, `Aborted`
- `GameEndReason`: `Checkmate`, `Stalemate`, `Resignation`, `Timeout`, `FiftyMoveRule`, `ThreefoldRepetition`, `Aborted`, `InsufficientMaterial`
- `PieceType`: `Pawn`, `Knight`, `Bishop`, `Rook`, `Queen`, `King`

## Instructions

### Match

| Instruction | Args | Who | Effect |
| --- | --- | --- | --- |
| `initialize_match` | `match_id`, `bet_amount`, `move_timeout_duration`, `platform_fee_basis_points`, `platform_fee_wallet`, `prediction_enabled` | Creator (White) | Creates the match and escrow, deposits White's wager |
| `join_match` | `bet_amount` (must equal the creator's) | Anyone but the creator | Deposits Black's wager, sets status `Active`, starts the clock |
| `abort_match` | — | Creator, while `WaitingForOpponent` | Refunds the wager, closes escrow, status `Aborted` |
| `make_move` | `from_row`, `from_col`, `to_row`, `to_col`, `promotion` | Side to move: wallet, its registered session key, or a gum `SessionTokenV2` | Validates and applies the move, detects mate/draws, emits `MoveMadeEvent`. A move after the side's time ran out ends the game instead |
| `resign_game` | — | Either player (wallet) | Opponent wins by `Resignation` |
| `claim_timeout_win` | — | The player **not** on move | Wins by `Timeout` once `now - last_move_timestamp > move_timeout_duration` |
| `process_match_settlement` | — | Anyone | Pays out the escrow (see below), closes it, sets `payout_processed` |
| `close_match` | — | Anyone, after `payout_processed` | Closes the `ChessMatch` account and returns its rent to the signer |

### MagicBlock

| Instruction | Who | Effect |
| --- | --- | --- |
| `delegate_match` | A player (any payer may fund it) | Delegates `ChessMatch` to the rollup |
| `commit_state` | A player, on the rollup | Commits rollup state to L1 and keeps the delegation |
| `undelegate_match` | A player, on the rollup | Commits and returns the account to L1 |
| `process_undelegation` | Delegation program | Callback generated by `#[ephemeral]`, not called directly |
| `set_session_key` | A player | Registers `session_signer` for that player's side until `expires_at` (max 7 days) |
| `revoke_session_key` | A player | Clears that player's session key |
| `schedule_timeout` | Payer | Schedules a task-scheduler crank to claim a timeout. **Disabled in the app**, see [Roadmap](../roadmap.md) |
| `cancel_timeout_task` | Payer | Cancels the scheduled crank task |

### Prediction pool (on-chain)

| Instruction | Who | Effect |
| --- | --- | --- |
| `initialize_prediction_pool` | Anyone, when `prediction_enabled` | Creates the pool and vault |
| `place_prediction_bet` | Non-players, while the match is `WaitingForOpponent` or `Active` | Stakes on White (0), Black (1) or Draw (2) |
| `cancel_prediction_bet` | Bettor, if the match is waiting or aborted | Refunds the stake |
| `settle_prediction_pool` | Anyone, after the match ends | Fixes the pool result |
| `claim_prediction_winnings` | Bettor | Pays the winning share |

See [Prediction market](../features/prediction-market.md) for the payout split.

## Settlement math

```
fee = total_pot * platform_fee_basis_points / 10_000

WhiteWins / BlackWins:  winner gets total_pot - fee
Draw:                   White gets (total_pot - fee) / 2 (rounded down),
                        Black gets the rest
```

Settlement checks that the player token accounts belong to the players, all
accounts use the match mint, the fee account is owned by `platform_fee_wallet`,
and no two accounts are the same.

## Events

| Event | Emitted by | Key fields |
| --- | --- | --- |
| `MatchCreatedEvent` | `initialize_match` | creator, mint, bet, timeout, fee bps |
| `PlayerJoinedEvent` | `join_match` | both players, mint, bet per player |
| `MoveMadeEvent` | `make_move` | player, colour, coordinates, promotion, SAN-style move, FEN, check/mate/stalemate flags |
| `GameEndedEvent` | game-ending move, resign, timeout | status, winner, reason |
| `PayoutEvent` | settlement (win) | winner, amount, fee |
| `DrawPayoutEvent` | settlement (draw) | both players, amount each, fee |
| `MatchAbortedEvent` | `abort_match` | creator |
| `MatchClosedEvent` | `close_match` | match id |

The backend indexer decodes these events from confirmed transactions on L1 and
on the rollup. See [Backend](./backend.md).

## Errors

| Code | Name | Message |
| --- | --- | --- |
| 6000 | `InvalidOwner` | The provided token account is not owned by the player. |
| 6001 | `InvalidMint` | The provided token account's mint does not match the betting token mint. |
| 6002 | `InvalidBetAmount` | The bet amount is invalid. |
| 6003 | `MatchAlreadyFull` | The match is already full. |
| 6004 | `InvalidMatchIdLength` | Match ID length is invalid or exceeds maximum allowed. |
| 6005 | `InvalidPublicKeyString` | Invalid public key string format during parsing. |
| 6006 | `InvalidPlatformFee` | Platform fee basis points exceed maximum (10000). |
| 6007 | `UnsupportedBettingToken` | Unsupported betting token mint. Only SEND or wSOL allowed. |
| 6008 | `InvalidMoveOutOfBounds` | Invalid move: Coordinates out of bounds. |
| 6009 | `InvalidMoveEmptySource` | Invalid move: Source square is empty. |
| 6010 | `InvalidMoveNotYourPiece` | Invalid move: Not your piece to move. |
| 6011 | `InvalidMoveCannotCaptureOwnPiece` | Invalid move: Cannot capture your own piece. |
| 6012 | `InvalidMoveIllegalPieceMovement` | Invalid move: Illegal movement for this piece type. |
| 6013 | `InvalidMoveLeavesKingInCheck` | Invalid move: Move leaves king in check. |
| 6014 | `InvalidPromotionPiece` | Invalid promotion: Specified piece type is not allowed for promotion. |
| 6015 | `InvalidPromotionNotOnLastRank` | Invalid promotion: Pawn is not on the last rank for promotion. |
| 6016 | `InvalidPromotionNotAPawn` | Invalid promotion: Only pawns can be promoted. |
| 6017 | `KingNotFound` | Internal error: King not found on the board. |
| 6018 | `InvalidMatchId` | Invalid Match ID provided. |
| 6019 | `AlreadyJoined` | You are already joined this match. |
| 6020 | `InvalidEscrowAccount` | Invalid escrow account authority. |
| 6021 | `MathError` | Arithmetic operation overflow/underflow. |
| 6022 | `GameNotActive` | The game is not currently active. |
| 6023 | `NotAPlayer` | The signer is not a registered player in this match. |
| 6024 | `NotYourTurn` | It is not the signer's turn to move. |
| 6025 | `PlayerTimedOut` | Player has timed out. |
| 6026 | `MatchAlreadyFullOrActive` | Match is already full or active, cannot join. |
| 6027 | `InvalidMintForJoin` | The mint of your token account does not match the established betting token for this match. |
| 6028 | `CannotJoinOwnMatch` | Player cannot join their own match as the second player. |
| 6029 | `BetAmountMismatch` | Joining bet amount does not match the creator's bet amount. |
| 6030 | `OpponentNotJoinedYet` | Opponent has not joined the match yet, cannot determine winner by resignation. |
| 6031 | `NotOpponentsTurnToClaimTimeout` | It is not the opponent's turn, so you cannot claim a timeout win yet. |
| 6032 | `TimeoutNotConfigured` | Move timeout is not configured for this match. |
| 6033 | `OpponentNotTimedOut` | Opponent has not actually timed out yet. |
| 6034 | `GameNotConcluded` | The game has not yet concluded. |
| 6035 | `PayoutAlreadyProcessed` | Payout for this match has already been processed. |
| 6036 | `PlayerTokenAccountMismatch` | Player token account mismatch for payout. |
| 6037 | `PlatformTokenAccountError` | Platform fee token account mismatch or invalid mint for payout. |
| 6038 | `InvalidPlatformFeeWallet` | Platform fee wallet does not match the expected recipient. |
| 6039 | `DuplicateAccounts` | Duplicate mutable accounts detected — state corruption risk. |
| 6040 | `InvalidGameStateForPayout` | Game state is invalid for processing a payout (e.g., winner does not exist). |
| 6041 | `UnauthorizedSigner` | Signer is not authorized — must be the player whose turn it is or a valid session key. |
| 6042 | `InvalidSession` | Session key is expired or invalid for this action. |
| 6043 | `MatchNotWaitingForOpponent` | Match is not in WaitingForOpponent state, cannot abort. |
| 6044 | `NotMatchCreator` | Only the match creator can perform this action. |
| 6045 | `MatchNotSettled` | Match settlement has not been processed yet, cannot close. |
| 6046 | `PredictionNotEnabled` | Prediction market is not enabled for this match. |
| 6047 | `PredictionPoolAlreadyExists` | A prediction pool already exists for this match. |
| 6048 | `PredictionPoolNotFound` | Prediction pool not found for this match. |
| 6049 | `PlayersCannotBet` | Players in the match cannot place prediction bets. |
| 6050 | `BettingClosed` | Betting is closed — the match is no longer Active. |
| 6051 | `InvalidOutcome` | Invalid outcome — must be 0 (White), 1 (Black), or 2 (Draw). |
| 6052 | `SettlementAlreadyProcessed` | Prediction settlement has already been processed for this pool. |
| 6053 | `AlreadyClaimed` | Winnings have already been claimed for this bet. |
| 6054 | `NothingToClaim` | Nothing to claim — no balance available for this bet. |
| 6055 | `MatchNotAborted` | The match has not been aborted, cannot cancel this way. |
| 6056 | `CannotCancelActiveMatch` | Cannot cancel bet on an Active match. |
| 6057 | `InvalidTimeoutDuration` | Move timeout duration must be non-negative. |
