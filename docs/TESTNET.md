# EGG on testnet

| | |
|---|---|
| Minter (jetton master) | `kQCSTYH3AMfUOhJiY6n3n2y2NUpk7Nn4QAK-YChGgg1LW0XS` — [tonviewer](https://testnet.tonviewer.com/kQCSTYH3AMfUOhJiY6n3n2y2NUpk7Nn4QAK-YChGgg1LW0XS) |
| Admin (owner of the Mini App wallet that deployed it) | `0QArwVo6mQArWq_4nbsmT7lWAAgkigIJTtLtgHeAjg9txZ74` |
| Signing key (publisher) | ed25519 public key stored in the minter (`get_publisher_key`); the secret lives only in the bot's Serverless code (`app/tgcloud/lib/publisherkey.js`, git-ignored). **No wallet and no TON are needed to publish anything.** |
| Max supply | 1 000 000 000 EGG (decimals 9) |
| Growth limit | at most 2 000 000 EGG of new promises per hour |
| Per-wallet ceiling | 1000 EGG at launch + 1000 EGG per day |
| Bot wallet (vault, beacon) | `kQB8dwEOAxgGxtx0_K2FQbUcJGWNQsqucVDcUcvItl9-amaz` |

Fourth deployment (v4: signed roots + on-chain fraud proofs + per-wallet ceiling). Earlier minters are abandoned.
Verified on testnet with a real claim from a root signed by the bot: 18 EGG credited ~4 s after the transaction was accepted, total network fee **0.0051 TON** (including deploying the jetton wallet).
