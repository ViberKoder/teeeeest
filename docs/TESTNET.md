# EGG on testnet

| | |
|---|---|
| Minter (jetton master) | `kQC33MCJl9YFutzTj1xOF42ZSWZUVsvDkiOa9ZiKzlbyc2w3` — [tonviewer](https://testnet.tonviewer.com/kQC33MCJl9YFutzTj1xOF42ZSWZUVsvDkiOa9ZiKzlbyc2w3) |
| Admin (owner of the Mini App wallet that deployed it) | `0QArwVo6mQArWq_4nbsmT7lWAAgkigIJTtLtgHeAjg9txZ74` |
| Publisher (hot, used by the server) | `kQBvY_fSJDa0bHO_-FWHzdIRB6n6wxuFOQBk1WbpuuTpanhi` |
| Max supply | 1 000 000 000 EGG (decimals 9) |
| Release limit | at most 2 000 000 EGG per hour, one root per ≥ 60 s |

Limits can only be tightened from here. The publisher's and relayer's mnemonics were generated at launch and are **not** in this repository: put them into the server's `.env` (`PUBLISHER_MNEMONIC`, `RELAYER_MNEMONIC`).
Nothing has been minted yet (`totalSupply = 0`): supply appears only when players claim against a published root.
