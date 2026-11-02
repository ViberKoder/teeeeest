# EGG on testnet

| | |
|---|---|
| Minter (jetton master) | `kQCP-oE3wv_kzIo4iO16KXHgzBr3XPL9Q58lyvntVwtwR9iW` — [tonviewer](https://testnet.tonviewer.com/kQCP-oE3wv_kzIo4iO16KXHgzBr3XPL9Q58lyvntVwtwR9iW) |
| Admin (owner of the Mini App wallet that deployed it) | `0QArwVo6mQArWq_4nbsmT7lWAAgkigIJTtLtgHeAjg9txZ74` |
| Publisher (a WalletTg whose key lives in the bot's Serverless code) | `kQC0C_wBPLTHQ2Q3Oi7ocH67WdcFrsDFUUMnHPk9rVSLtrLS` — top it up with TON, each published root costs ~0.04 TON |
| Max supply | 1 000 000 000 EGG (decimals 9) |
| Release limit | at most 2 000 000 EGG per hour, one root per ≥ 60 s |

Limits can only be tightened from here. This is the second deployment (v2 contract: a claim can carry a "then send" instruction). The publisher key is generated at launch and is **not** in this repository (`app/tgcloud/lib/publisherkey.js`, git-ignored).
Nothing has been minted yet (`totalSupply = 0`): supply appears only when players claim against a published root.
