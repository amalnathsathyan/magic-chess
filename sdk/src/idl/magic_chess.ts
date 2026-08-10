/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/magic_chess.json`.
 */
export type MagicChess = {
  "address": "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h",
  "metadata": {
    "name": "magicChess",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain chess engine with wagering"
  },
  "instructions": [
    {
      "name": "abortMatch",
      "discriminator": [
        165,
        210,
        81,
        124,
        173,
        175,
        87,
        201
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "matchEscrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "playerTokenAccount",
          "writable": true
        },
        {
          "name": "playerSigner",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "cancelPredictionBet",
      "discriminator": [
        197,
        122,
        227,
        43,
        136,
        157,
        44,
        126
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "docs": [
            "The ChessMatch — must be WaitingForOpponent or Aborted, or be settled with no winners."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPool",
          "docs": [
            "The PredictionPool."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionBet",
          "docs": [
            "The bettor's PredictionBet PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              },
              {
                "kind": "account",
                "path": "bettor"
              }
            ]
          }
        },
        {
          "name": "predictionPoolVault",
          "docs": [
            "Vault token account for the prediction pool."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              }
            ]
          }
        },
        {
          "name": "bettorTokenAccount",
          "docs": [
            "The bettor's token account (destination for refund)."
          ],
          "writable": true
        },
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "cancelTimeoutTask",
      "discriminator": [
        119,
        179,
        9,
        27,
        16,
        151,
        219,
        142
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "claimPredictionWinnings",
      "discriminator": [
        173,
        210,
        173,
        204,
        214,
        64,
        115,
        57
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "docs": [
            "The ChessMatch — read-only, used for constraints."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPool",
          "docs": [
            "The PredictionPool — must be settled. Mutable so Anchor allows PDA signing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionBet",
          "docs": [
            "The bettor's PredictionBet PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              },
              {
                "kind": "account",
                "path": "bettor"
              }
            ]
          }
        },
        {
          "name": "predictionPoolVault",
          "docs": [
            "Vault token account holding all spectator bets."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              }
            ]
          }
        },
        {
          "name": "bettorTokenAccount",
          "docs": [
            "The bettor's token account (destination for winnings)."
          ],
          "writable": true
        },
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimTimeoutWin",
      "discriminator": [
        175,
        234,
        101,
        151,
        53,
        30,
        177,
        137
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "claimerSigner",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "closeMatch",
      "discriminator": [
        79,
        174,
        36,
        80,
        233,
        185,
        176,
        239
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "commitState",
      "discriminator": [
        201,
        80,
        148,
        145,
        9,
        196,
        225,
        56
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "chessMatch",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "delegateMatch",
      "discriminator": [
        30,
        116,
        9,
        69,
        147,
        61,
        133,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Funds MagicBlock's delegation record and metadata accounts. For",
            "sponsored transactions this is the backend fee-payer wallet."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "player",
          "docs": [
            "Match participant authorizing delegation. Kept separate from `payer`",
            "so embedded wallets do not need SOL for delegation rent."
          ],
          "signer": true
        },
        {
          "name": "bufferChessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                216,
                220,
                24,
                81,
                138,
                62,
                66,
                4,
                104,
                1,
                62,
                228,
                10,
                132,
                128,
                58,
                75,
                86,
                132,
                199,
                210,
                194,
                254,
                150,
                134,
                202,
                246,
                158,
                60,
                77,
                129,
                120
              ]
            }
          }
        },
        {
          "name": "delegationRecordChessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataChessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "chessMatch",
          "docs": [
            "program. UncheckedAccount with `del` avoids Anchor exit serialization",
            "on an account we no longer own (per MagicBlock delegation docs)."
          ],
          "writable": true
        },
        {
          "name": "ownerProgram",
          "address": "FbXiX6xcMRPVuTc7AZkQMSbpKa1uBzQY16NFf5jhJC7h"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initializeMatch",
      "discriminator": [
        156,
        133,
        52,
        179,
        176,
        29,
        64,
        124
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchIdArg"
              }
            ]
          }
        },
        {
          "name": "playerSigner",
          "writable": true,
          "signer": true
        },
        {
          "name": "rentPayer",
          "docs": [
            "Separate signer that funds account rent. In self-paid transactions this",
            "may be the player; sponsored transactions set it to the backend fee",
            "payer without granting that payer authority over the player's tokens."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "bettingTokenMintAccount",
          "docs": [
            "The SPL token mint used for betting — any SPL token is accepted"
          ]
        },
        {
          "name": "playerTokenAccount",
          "writable": true
        },
        {
          "name": "matchEscrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "matchIdArg"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchIdArg",
          "type": "string"
        },
        {
          "name": "betAmountArg",
          "type": "u64"
        },
        {
          "name": "moveTimeoutDurationArg",
          "type": "i64"
        },
        {
          "name": "platformFeeBasisPointsArg",
          "type": "u16"
        },
        {
          "name": "platformFeeWalletArg",
          "type": "pubkey"
        },
        {
          "name": "predictionEnabledArg",
          "type": "bool"
        }
      ]
    },
    {
      "name": "initializePredictionPool",
      "discriminator": [
        143,
        97,
        75,
        159,
        98,
        119,
        94,
        131
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "docs": [
            "The ChessMatch this pool tracks. Must have prediction_enabled = true."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPool",
          "docs": [
            "PredictionPool PDA — one per match."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPoolVault",
          "docs": [
            "Vault token account that holds all spectator bets. Owned by the prediction pool PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              }
            ]
          }
        },
        {
          "name": "bettingTokenMint",
          "docs": [
            "The SPL token mint used for betting (same as the chess match)."
          ]
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "platformFeeBpsArg",
          "type": "u16"
        }
      ]
    },
    {
      "name": "joinMatch",
      "discriminator": [
        244,
        8,
        47,
        130,
        192,
        59,
        179,
        44
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "playerTwoSigner",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerTokenAccount",
          "writable": true
        },
        {
          "name": "matchEscrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "betAmountArg",
          "type": "u64"
        }
      ]
    },
    {
      "name": "makeMove",
      "discriminator": [
        78,
        77,
        152,
        203,
        222,
        211,
        208,
        233
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "makeMoveArgs"
            }
          }
        }
      ]
    },
    {
      "name": "placePredictionBet",
      "discriminator": [
        95,
        44,
        245,
        151,
        104,
        190,
        68,
        24
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "docs": [
            "The ChessMatch — read-only, used for constraints."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPool",
          "docs": [
            "The PredictionPool tracking accumulated bets."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionBet",
          "docs": [
            "PDA per bettor — created once per bettor per pool."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              },
              {
                "kind": "account",
                "path": "bettor"
              }
            ]
          }
        },
        {
          "name": "predictionPoolVault",
          "docs": [
            "Vault token account that receives all spectator bets."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              }
            ]
          }
        },
        {
          "name": "bettorTokenAccount",
          "docs": [
            "The bettor's token account (source of bet funds)."
          ],
          "writable": true
        },
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "betAmountArg",
          "type": "u64"
        },
        {
          "name": "predictedOutcomeArg",
          "type": "u8"
        }
      ]
    },
    {
      "name": "processMatchSettlement",
      "discriminator": [
        236,
        106,
        133,
        178,
        45,
        221,
        98,
        116
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "matchEscrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "playerOneAta",
          "writable": true
        },
        {
          "name": "playerTwoAta",
          "writable": true
        },
        {
          "name": "platformFeeAta",
          "writable": true
        },
        {
          "name": "payer",
          "docs": [
            "Rent destination for escrow account closure — receives lamports back."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  110,
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  101,
                  45,
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "baseAccount"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                181,
                183,
                0,
                225,
                242,
                87,
                58,
                192,
                204,
                6,
                34,
                1,
                52,
                74,
                207,
                151,
                184,
                53,
                6,
                235,
                140,
                229,
                25,
                152,
                204,
                98,
                126,
                24,
                147,
                128,
                167,
                62
              ]
            }
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "resignGame",
      "discriminator": [
        43,
        29,
        143,
        188,
        152,
        151,
        136,
        19
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "playerSigner",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "revokeSessionKey",
      "discriminator": [
        81,
        192,
        32,
        110,
        104,
        116,
        144,
        151
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "scheduleTimeout",
      "discriminator": [
        243,
        168,
        188,
        247,
        119,
        74,
        111,
        169
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        }
      ],
      "args": [
        {
          "name": "taskId",
          "type": "i64"
        }
      ]
    },
    {
      "name": "setSessionKey",
      "discriminator": [
        13,
        147,
        179,
        38,
        67,
        1,
        69,
        132
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "player",
          "docs": [
            "Must be one of the two players — determines which color's session is set."
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "sessionSigner",
          "type": "pubkey"
        },
        {
          "name": "expiresAt",
          "type": "i64"
        }
      ]
    },
    {
      "name": "settlePredictionPool",
      "discriminator": [
        172,
        46,
        153,
        24,
        213,
        95,
        160,
        158
      ],
      "accounts": [
        {
          "name": "chessMatch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  101,
                  115,
                  115,
                  95,
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "chessMatch.matchId",
                "account": "chessMatch"
              }
            ]
          }
        },
        {
          "name": "predictionPoolVault",
          "docs": [
            "Vault holding all spectator bets. PDA-owned by prediction_pool."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  101,
                  100,
                  105,
                  99,
                  116,
                  105,
                  111,
                  110,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "predictionPool"
              }
            ]
          }
        },
        {
          "name": "matchWinnerAta",
          "docs": [
            "Match winner's ATA. In a draw, this is the White player's ATA."
          ],
          "writable": true
        },
        {
          "name": "matchLoserAta",
          "docs": [
            "Match loser's ATA. In a draw, this is the Black player's ATA."
          ],
          "writable": true
        },
        {
          "name": "platformFeeAta",
          "docs": [
            "Platform fee ATA. Must be owned by the platform_fee_wallet from ChessMatch."
          ],
          "writable": true
        },
        {
          "name": "caller",
          "docs": [
            "Permissionless — fee payer triggers settlement."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "undelegateMatch",
      "discriminator": [
        142,
        117,
        126,
        27,
        242,
        11,
        103,
        14
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "chessMatch",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "chessMatch",
      "discriminator": [
        72,
        241,
        122,
        67,
        252,
        229,
        79,
        237
      ]
    },
    {
      "name": "predictionBet",
      "discriminator": [
        49,
        105,
        177,
        189,
        88,
        156,
        125,
        30
      ]
    },
    {
      "name": "predictionPool",
      "discriminator": [
        242,
        147,
        175,
        114,
        243,
        217,
        127,
        202
      ]
    }
  ],
  "events": [
    {
      "name": "drawPayoutEvent",
      "discriminator": [
        204,
        185,
        220,
        244,
        158,
        169,
        10,
        187
      ]
    },
    {
      "name": "gameEndedEvent",
      "discriminator": [
        124,
        244,
        251,
        112,
        20,
        68,
        87,
        116
      ]
    },
    {
      "name": "matchAbortedEvent",
      "discriminator": [
        93,
        79,
        182,
        70,
        188,
        217,
        236,
        43
      ]
    },
    {
      "name": "matchClosedEvent",
      "discriminator": [
        205,
        185,
        85,
        146,
        68,
        225,
        47,
        51
      ]
    },
    {
      "name": "matchCreatedEvent",
      "discriminator": [
        101,
        99,
        74,
        54,
        121,
        190,
        111,
        238
      ]
    },
    {
      "name": "moveMadeEvent",
      "discriminator": [
        116,
        181,
        208,
        158,
        192,
        84,
        32,
        251
      ]
    },
    {
      "name": "payoutEvent",
      "discriminator": [
        84,
        234,
        195,
        72,
        143,
        79,
        70,
        82
      ]
    },
    {
      "name": "playerJoinedEvent",
      "discriminator": [
        80,
        201,
        181,
        60,
        46,
        141,
        44,
        189
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidOwner",
      "msg": "The provided token account is not owned by the player."
    },
    {
      "code": 6001,
      "name": "invalidMint",
      "msg": "The provided token account's mint does not match the betting token mint."
    },
    {
      "code": 6002,
      "name": "invalidBetAmount",
      "msg": "The bet amount is invalid."
    },
    {
      "code": 6003,
      "name": "matchAlreadyFull",
      "msg": "The match is already full."
    },
    {
      "code": 6004,
      "name": "invalidMatchIdLength",
      "msg": "Match ID length is invalid or exceeds maximum allowed."
    },
    {
      "code": 6005,
      "name": "invalidPublicKeyString",
      "msg": "Invalid public key string format during parsing."
    },
    {
      "code": 6006,
      "name": "invalidPlatformFee",
      "msg": "Platform fee basis points exceed maximum (10000)."
    },
    {
      "code": 6007,
      "name": "unsupportedBettingToken",
      "msg": "Unsupported betting token mint. Only SEND or wSOL allowed."
    },
    {
      "code": 6008,
      "name": "invalidMoveOutOfBounds",
      "msg": "Invalid move: Coordinates out of bounds."
    },
    {
      "code": 6009,
      "name": "invalidMoveEmptySource",
      "msg": "Invalid move: Source square is empty."
    },
    {
      "code": 6010,
      "name": "invalidMoveNotYourPiece",
      "msg": "Invalid move: Not your piece to move."
    },
    {
      "code": 6011,
      "name": "invalidMoveCannotCaptureOwnPiece",
      "msg": "Invalid move: Cannot capture your own piece."
    },
    {
      "code": 6012,
      "name": "invalidMoveIllegalPieceMovement",
      "msg": "Invalid move: Illegal movement for this piece type."
    },
    {
      "code": 6013,
      "name": "invalidMoveLeavesKingInCheck",
      "msg": "Invalid move: Move leaves king in check."
    },
    {
      "code": 6014,
      "name": "invalidPromotionPiece",
      "msg": "Invalid promotion: Specified piece type is not allowed for promotion."
    },
    {
      "code": 6015,
      "name": "invalidPromotionNotOnLastRank",
      "msg": "Invalid promotion: Pawn is not on the last rank for promotion."
    },
    {
      "code": 6016,
      "name": "invalidPromotionNotAPawn",
      "msg": "Invalid promotion: Only pawns can be promoted."
    },
    {
      "code": 6017,
      "name": "kingNotFound",
      "msg": "Internal error: King not found on the board."
    },
    {
      "code": 6018,
      "name": "invalidMatchId",
      "msg": "Invalid Match ID provided."
    },
    {
      "code": 6019,
      "name": "alreadyJoined",
      "msg": "You are already joined this match."
    },
    {
      "code": 6020,
      "name": "invalidEscrowAccount",
      "msg": "Invalid escrow account authority."
    },
    {
      "code": 6021,
      "name": "mathError",
      "msg": "Arithmetic operation overflow/underflow."
    },
    {
      "code": 6022,
      "name": "gameNotActive",
      "msg": "The game is not currently active."
    },
    {
      "code": 6023,
      "name": "notAPlayer",
      "msg": "The signer is not a registered player in this match."
    },
    {
      "code": 6024,
      "name": "notYourTurn",
      "msg": "It is not the signer's turn to move."
    },
    {
      "code": 6025,
      "name": "playerTimedOut",
      "msg": "Player has timed out."
    },
    {
      "code": 6026,
      "name": "matchAlreadyFullOrActive",
      "msg": "Match is already full or active, cannot join."
    },
    {
      "code": 6027,
      "name": "invalidMintForJoin",
      "msg": "The mint of your token account does not match the established betting token for this match."
    },
    {
      "code": 6028,
      "name": "cannotJoinOwnMatch",
      "msg": "Player cannot join their own match as the second player."
    },
    {
      "code": 6029,
      "name": "betAmountMismatch",
      "msg": "Joining bet amount does not match the creator's bet amount."
    },
    {
      "code": 6030,
      "name": "opponentNotJoinedYet",
      "msg": "Opponent has not joined the match yet, cannot determine winner by resignation."
    },
    {
      "code": 6031,
      "name": "notOpponentsTurnToClaimTimeout",
      "msg": "It is not the opponent's turn, so you cannot claim a timeout win yet."
    },
    {
      "code": 6032,
      "name": "timeoutNotConfigured",
      "msg": "Move timeout is not configured for this match."
    },
    {
      "code": 6033,
      "name": "opponentNotTimedOut",
      "msg": "Opponent has not actually timed out yet."
    },
    {
      "code": 6034,
      "name": "gameNotConcluded",
      "msg": "The game has not yet concluded."
    },
    {
      "code": 6035,
      "name": "payoutAlreadyProcessed",
      "msg": "Payout for this match has already been processed."
    },
    {
      "code": 6036,
      "name": "playerTokenAccountMismatch",
      "msg": "Player token account mismatch for payout."
    },
    {
      "code": 6037,
      "name": "platformTokenAccountError",
      "msg": "Platform fee token account mismatch or invalid mint for payout."
    },
    {
      "code": 6038,
      "name": "invalidPlatformFeeWallet",
      "msg": "Platform fee wallet does not match the expected recipient."
    },
    {
      "code": 6039,
      "name": "duplicateAccounts",
      "msg": "Duplicate mutable accounts detected — state corruption risk."
    },
    {
      "code": 6040,
      "name": "invalidGameStateForPayout",
      "msg": "Game state is invalid for processing a payout (e.g., winner does not exist)."
    },
    {
      "code": 6041,
      "name": "unauthorizedSigner",
      "msg": "Signer is not authorized — must be the player whose turn it is or a valid session key."
    },
    {
      "code": 6042,
      "name": "invalidSession",
      "msg": "Session key is expired or invalid for this action."
    },
    {
      "code": 6043,
      "name": "matchNotWaitingForOpponent",
      "msg": "Match is not in WaitingForOpponent state, cannot abort."
    },
    {
      "code": 6044,
      "name": "notMatchCreator",
      "msg": "Only the match creator can perform this action."
    },
    {
      "code": 6045,
      "name": "matchNotSettled",
      "msg": "Match settlement has not been processed yet, cannot close."
    },
    {
      "code": 6046,
      "name": "predictionNotEnabled",
      "msg": "Prediction market is not enabled for this match."
    },
    {
      "code": 6047,
      "name": "predictionPoolAlreadyExists",
      "msg": "A prediction pool already exists for this match."
    },
    {
      "code": 6048,
      "name": "predictionPoolNotFound",
      "msg": "Prediction pool not found for this match."
    },
    {
      "code": 6049,
      "name": "playersCannotBet",
      "msg": "Players in the match cannot place prediction bets."
    },
    {
      "code": 6050,
      "name": "bettingClosed",
      "msg": "Betting is closed — the match is no longer Active."
    },
    {
      "code": 6051,
      "name": "invalidOutcome",
      "msg": "Invalid outcome — must be 0 (White), 1 (Black), or 2 (Draw)."
    },
    {
      "code": 6052,
      "name": "settlementAlreadyProcessed",
      "msg": "Prediction settlement has already been processed for this pool."
    },
    {
      "code": 6053,
      "name": "alreadyClaimed",
      "msg": "Winnings have already been claimed for this bet."
    },
    {
      "code": 6054,
      "name": "nothingToClaim",
      "msg": "Nothing to claim — no balance available for this bet."
    },
    {
      "code": 6055,
      "name": "matchNotAborted",
      "msg": "The match has not been aborted, cannot cancel this way."
    },
    {
      "code": 6056,
      "name": "cannotCancelActiveMatch",
      "msg": "Cannot cancel bet on an Active match."
    },
    {
      "code": 6057,
      "name": "invalidTimeoutDuration",
      "msg": "Move timeout duration must be non-negative."
    }
  ],
  "types": [
    {
      "name": "castlingRights",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "whiteKingside",
            "type": "bool"
          },
          {
            "name": "whiteQueenside",
            "type": "bool"
          },
          {
            "name": "blackKingside",
            "type": "bool"
          },
          {
            "name": "blackQueenside",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "chessMatch",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "players",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "currentPlayerIdx",
            "type": "u8"
          },
          {
            "name": "currentTurn",
            "type": {
              "defined": {
                "name": "playerColor"
              }
            }
          },
          {
            "name": "lastMoveTimestamp",
            "type": "i64"
          },
          {
            "name": "moveTimeoutDuration",
            "type": "i64"
          },
          {
            "name": "gameStatus",
            "type": {
              "defined": {
                "name": "gameStatus"
              }
            }
          },
          {
            "name": "gameEndReason",
            "type": {
              "option": {
                "defined": {
                  "name": "gameEndReason"
                }
              }
            }
          },
          {
            "name": "board",
            "type": {
              "array": [
                {
                  "array": [
                    {
                      "option": {
                        "defined": {
                          "name": "piece"
                        }
                      }
                    },
                    8
                  ]
                },
                8
              ]
            }
          },
          {
            "name": "castlingRights",
            "type": {
              "defined": {
                "name": "castlingRights"
              }
            }
          },
          {
            "name": "enPassantTarget",
            "type": {
              "option": {
                "defined": {
                  "name": "enPassantSquare"
                }
              }
            }
          },
          {
            "name": "halfmoveClock",
            "type": "u8"
          },
          {
            "name": "fullmoveNumber",
            "type": "u16"
          },
          {
            "name": "positionHistory",
            "type": {
              "vec": "u64"
            }
          },
          {
            "name": "bettingTokenMint",
            "type": "pubkey"
          },
          {
            "name": "betAmountPlayerOne",
            "type": "u64"
          },
          {
            "name": "betAmountPlayerTwo",
            "type": "u64"
          },
          {
            "name": "totalPot",
            "type": "u64"
          },
          {
            "name": "platformFeeBasisPoints",
            "type": "u16"
          },
          {
            "name": "platformFeeWallet",
            "type": "pubkey"
          },
          {
            "name": "payoutProcessed",
            "type": "bool"
          },
          {
            "name": "predictionEnabled",
            "type": "bool"
          },
          {
            "name": "delegationUid",
            "type": "string"
          },
          {
            "name": "isDelegated",
            "type": "bool"
          },
          {
            "name": "whiteSessionSigner",
            "type": "pubkey"
          },
          {
            "name": "whiteSessionExpiresAt",
            "type": "i64"
          },
          {
            "name": "blackSessionSigner",
            "type": "pubkey"
          },
          {
            "name": "blackSessionExpiresAt",
            "type": "i64"
          },
          {
            "name": "activeTaskId",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "matchEscrowBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "drawPayoutEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "whitePlayer",
            "type": "pubkey"
          },
          {
            "name": "blackPlayer",
            "type": "pubkey"
          },
          {
            "name": "amountEach",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "enPassantSquare",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "row",
            "type": "u8"
          },
          {
            "name": "col",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "gameEndReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "checkmate"
          },
          {
            "name": "stalemate"
          },
          {
            "name": "resignation"
          },
          {
            "name": "timeout"
          },
          {
            "name": "fiftyMoveRule"
          },
          {
            "name": "threefoldRepetition"
          },
          {
            "name": "aborted"
          },
          {
            "name": "insufficientMaterial"
          }
        ]
      }
    },
    {
      "name": "gameEndedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "gameStatus"
              }
            }
          },
          {
            "name": "winner",
            "type": {
              "option": {
                "defined": {
                  "name": "playerColor"
                }
              }
            }
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "gameEndReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "gameStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "waitingForOpponent"
          },
          {
            "name": "active"
          },
          {
            "name": "whiteWins"
          },
          {
            "name": "blackWins"
          },
          {
            "name": "draw"
          },
          {
            "name": "aborted"
          }
        ]
      }
    },
    {
      "name": "makeMoveArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fromRow",
            "type": "u8"
          },
          {
            "name": "fromCol",
            "type": "u8"
          },
          {
            "name": "toRow",
            "type": "u8"
          },
          {
            "name": "toCol",
            "type": "u8"
          },
          {
            "name": "promotion",
            "type": {
              "option": {
                "defined": {
                  "name": "pieceType"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "matchAbortedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "matchClosedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "matchCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "bettingTokenMint",
            "type": "pubkey"
          },
          {
            "name": "betAmount",
            "type": "u64"
          },
          {
            "name": "moveTimeoutDuration",
            "type": "i64"
          },
          {
            "name": "platformFeeBasisPoints",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "moveMadeEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "playerColor",
            "type": {
              "defined": {
                "name": "playerColor"
              }
            }
          },
          {
            "name": "algebraicMove",
            "type": "string"
          },
          {
            "name": "fromRow",
            "type": "u8"
          },
          {
            "name": "fromCol",
            "type": "u8"
          },
          {
            "name": "toRow",
            "type": "u8"
          },
          {
            "name": "toCol",
            "type": "u8"
          },
          {
            "name": "promotionPiece",
            "type": {
              "option": {
                "defined": {
                  "name": "pieceType"
                }
              }
            }
          },
          {
            "name": "boardFen",
            "type": "string"
          },
          {
            "name": "isCheck",
            "type": "bool"
          },
          {
            "name": "isCheckmate",
            "type": "bool"
          },
          {
            "name": "isStalemate",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "payoutEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "winner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "piece",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pieceType",
            "type": {
              "defined": {
                "name": "pieceType"
              }
            }
          },
          {
            "name": "color",
            "type": {
              "defined": {
                "name": "playerColor"
              }
            }
          }
        ]
      }
    },
    {
      "name": "pieceType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pawn"
          },
          {
            "name": "knight"
          },
          {
            "name": "bishop"
          },
          {
            "name": "rook"
          },
          {
            "name": "queen"
          },
          {
            "name": "king"
          }
        ]
      }
    },
    {
      "name": "playerColor",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "white"
          },
          {
            "name": "black"
          }
        ]
      }
    },
    {
      "name": "playerJoinedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "playerOne",
            "type": "pubkey"
          },
          {
            "name": "playerTwo",
            "type": "pubkey"
          },
          {
            "name": "bettingTokenMint",
            "type": "pubkey"
          },
          {
            "name": "betAmountPerPlayer",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "predictionBet",
      "docs": [
        "One bettor's prediction on a match.",
        "Pull-model: payout is claimed individually via claim_prediction_winnings."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bettor",
            "type": "pubkey"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "predictedOutcome",
            "type": "u8"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "predictionPool",
      "docs": [
        "Pools all prediction bets for a single chess match.",
        "Parimutuel model — winners split the losing pool proportionally."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "string"
          },
          {
            "name": "chessMatch",
            "type": "pubkey"
          },
          {
            "name": "totalBetOnWhite",
            "type": "u64"
          },
          {
            "name": "totalBetOnBlack",
            "type": "u64"
          },
          {
            "name": "totalBetOnDraw",
            "type": "u64"
          },
          {
            "name": "platformFeeBps",
            "type": "u16"
          },
          {
            "name": "settlementProcessed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "sessionTokenV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "feePayer",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
