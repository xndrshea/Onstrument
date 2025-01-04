/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bonding_curve.json`.
 */
export type BondingCurve = {
  "address": "6M1WSZeEAGtc8oTkdTNWruMsW58XPByzuf6ayoN16cEq",
  "metadata": {
    "name": "bondingCurve",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "buy",
      "discriminator": [
        102,
        6,
        61,
        18,
        1,
        218,
        235,
        234
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "feeCollector",
          "writable": true
        },
        {
          "name": "migrationAdmin",
          "writable": true
        },
        {
          "name": "migrationAdminTokenAccount",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
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
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "buyerTokenAccount",
          "writable": true
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "maxSolCost",
          "type": "u64"
        },
        {
          "name": "isSubscribed",
          "type": "bool"
        }
      ]
    },
    {
      "name": "calculatePrice",
      "discriminator": [
        134,
        136,
        236,
        251,
        150,
        166,
        248,
        15
      ],
      "accounts": [
        {
          "name": "mint",
          "docs": [
            "The mint of the token"
          ],
          "relations": [
            "curve"
          ]
        },
        {
          "name": "curve",
          "docs": [
            "The bonding curve account"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenVault",
          "docs": [
            "The token vault that holds the liquidity"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
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
                "path": "mint"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "isBuy",
          "type": "bool"
        }
      ],
      "returns": "u64"
    },
    {
      "name": "createMetadata",
      "discriminator": [
        30,
        35,
        117,
        134,
        196,
        139,
        44,
        25
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "curve",
          "docs": [
            "The curve PDA that controls the token"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "metadata",
          "writable": true
        },
        {
          "name": "metadataProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createMetadataParams"
            }
          }
        }
      ]
    },
    {
      "name": "createToken",
      "discriminator": [
        84,
        52,
        204,
        228,
        24,
        140,
        234,
        75
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
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
                "path": "mint"
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
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createTokenParams"
            }
          }
        }
      ]
    },
    {
      "name": "sell",
      "discriminator": [
        51,
        230,
        133,
        164,
        1,
        127,
        131,
        173
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "curve",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100,
                  105,
                  110,
                  103,
                  95,
                  99,
                  117,
                  114,
                  118,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "sellerTokenAccount",
          "writable": true
        },
        {
          "name": "tokenVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  111,
                  107,
                  101,
                  110,
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
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "feeCollector",
          "writable": true
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
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minSolReturn",
          "type": "u64"
        },
        {
          "name": "isSubscribed",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bondingCurve",
      "discriminator": [
        23,
        183,
        248,
        55,
        96,
        216,
        172,
        96
      ]
    }
  ],
  "events": [
    {
      "name": "buyEvent",
      "discriminator": [
        103,
        244,
        82,
        31,
        44,
        245,
        119,
        119
      ]
    },
    {
      "name": "migrationEvent",
      "discriminator": [
        255,
        202,
        76,
        147,
        91,
        231,
        73,
        22
      ]
    },
    {
      "name": "sellEvent",
      "discriminator": [
        62,
        47,
        55,
        10,
        165,
        3,
        220,
        42
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "slippageExceeded",
      "msg": "Slippage tolerance exceeded"
    },
    {
      "code": 6001,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in pool"
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Math operation overflow"
    },
    {
      "code": 6003,
      "name": "priceExceedsMaxCost",
      "msg": "Price exceeds maximum cost"
    },
    {
      "code": 6004,
      "name": "priceBelowMinReturn",
      "msg": "Price below minimum return"
    },
    {
      "code": 6005,
      "name": "balanceMismatch",
      "msg": "Balance mismatch"
    },
    {
      "code": 6006,
      "name": "invalidCurveConfig",
      "msg": "Invalid curve configuration"
    },
    {
      "code": 6007,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6008,
      "name": "invalidDecimals",
      "msg": "Invalid token decimals"
    },
    {
      "code": 6009,
      "name": "invalidMintAuthority",
      "msg": "Invalid mint authority"
    },
    {
      "code": 6010,
      "name": "invalidMetadataAddress",
      "msg": "Invalid metadata address"
    },
    {
      "code": 6011,
      "name": "metadataCreationFailed",
      "msg": "Metadata creation failed"
    },
    {
      "code": 6012,
      "name": "invalidOwner",
      "msg": "Invalid account owner"
    },
    {
      "code": 6013,
      "name": "invalidMetadataProgram",
      "msg": "Invalid metadata program"
    },
    {
      "code": 6014,
      "name": "migrationRequired",
      "msg": "Migration required before operation"
    },
    {
      "code": 6015,
      "name": "invalidMigrationAdmin",
      "msg": "Invalid migration admin"
    },
    {
      "code": 6016,
      "name": "migrationComplete",
      "msg": "Trading disabled - token has migrated to Raydium"
    }
  ],
  "types": [
    {
      "name": "bondingCurve",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "curveConfig"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "buyEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "isSubscribed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "createMetadataParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "createTokenParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "curveConfig",
            "type": {
              "defined": {
                "name": "curveConfig"
              }
            }
          },
          {
            "name": "totalSupply",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "curveConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "migrationStatus",
            "type": {
              "defined": {
                "name": "migrationStatus"
              }
            }
          },
          {
            "name": "isSubscribed",
            "type": "bool"
          },
          {
            "name": "developer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "migrationEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "realSolAmount",
            "type": "u64"
          },
          {
            "name": "virtualSolAmount",
            "type": "u64"
          },
          {
            "name": "tokenAmount",
            "type": "u64"
          },
          {
            "name": "effectivePrice",
            "type": "u64"
          },
          {
            "name": "developer",
            "type": "pubkey"
          },
          {
            "name": "isSubscribed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "migrationStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "migrated"
          }
        ]
      }
    },
    {
      "name": "sellEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "isSubscribed",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
