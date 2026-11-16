# EGG contracts

The EGG jetton (TEP-74 / TEP-89) in Tolk. Supply is created **only** by claims that prove a share of a Merkle root signed by the
publisher key; there is no mint message and no code upgrade. Design and guarantees: [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md),
findings and fixes: [`docs/SECURITY_REVIEW.md`](../docs/SECURITY_REVIEW.md).

| File | What |
|---|---|
| `contracts/EggMinter.tolk` | the minter: claim verification (signature, proof, limits), supply, governance, fraud proofs |
| `contracts/EggWallet.tolk` | the jetton wallet: transfers, burns, claims, "claim and send" |
| `contracts/merkle.tolk` | the sum-Merkle tree and the signed-root digest (mirrored in `sdk/src/tree.ts` and `app/tgcloud/lib/tree.js`) |
| `contracts/fees-management.tolk` | storage / gas / forward-fee bounds, including the per-hop gas bounds of a claim |
| `contracts/TgWallet/` | the Telegram wallet contract, shipped byte for byte from the upstream revision 00 |

## Build

```bash
acton build && node scripts/export-artifacts.mjs   # with Acton
npm run build:npm                                  # without Acton: the pinned Tolk compiler from npm, same bytecode
```

`artifacts/` holds the committed bytecode the SDK, the bot and the tests use. CI (`.github/workflows/token.yml` at the repo root)
rebuilds it and fails if it differs from the sources.

## Test

```bash
acton test                       # Tolk tests in tests/
npm test -w @egg/sdk             # sandbox tests of the built bytecode, including tests/audit.test.ts
npm test -w @egg/server          # the Serverless library against the real contracts
```
