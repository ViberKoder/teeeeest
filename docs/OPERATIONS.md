# Operations runbook

## Daily health checks

Hit `GET /health` on the backend:

```json
{
  "status": "ok",
  "epoch": 1283,
  "tree_size": 47193,
  "signer_pubkey": "d04ab232..."
}
```

And the latest epoch lag vs on-chain:

```sql
SELECT epoch, committed_tx, committed_at
FROM epochs
ORDER BY epoch DESC
LIMIT 5;
```

A `committed_tx` of `NULL` for more than 2 consecutive epochs indicates
the Root Updater cannot reach the chain — inspect `ADMIN_MNEMONIC`
balance (needs > 1 TON) and `TON_RPC_ENDPOINT` availability.

## Alerts to set up

| Condition                              | Severity | Suggested threshold   |
|----------------------------------------|----------|-----------------------|
| `/health` non-200 for 60s              | critical | page on-call          |
| `epoch` not advanced for 3× epoch duration | high | page on-call          |
| Admin wallet TON balance below 2 TON   | medium   | email ops             |
| Signer pubkey mismatch vs master       | critical | page on-call, pause   |
| `backend` 5xx rate > 1% in 5min window | medium   | email ops             |
| SQLite disk usage > 80%                | medium   | email ops             |

## Key rotation

### Voucher signer

If the signer seed is suspected compromised:

1. Generate a fresh `SIGNER_SEED_HEX`.
2. Admin signs `op::update_signer(new_pubkey)` on the master.
3. Restart the backend with the new seed.
4. **Existing wallets still cache the OLD pubkey** — they will reject
   new vouchers. To migrate: each user's next transfer of this jetton
   will submit under the old signer as long as you keep the old signer
   available. Safer approach — run the old signer in parallel for the
   grace period (e.g., 30 days) by changing the backend to sign both
   and attaching whichever is appropriate, or redeploy a v2 wallet code
   and let users migrate.

Pragmatic v1 answer: make signer seed recovery impossible, store in HSM,
and accept that full rotation requires wallet-code migration.

### Admin

Admin rotation is easy and safe:

```ts
master.sendChangeAdmin(oldAdmin.getSender(), newAdminAddress);
```

Strongly recommended: run admin as a 2/3 or 3/5 multisig using
[multisig-v2](https://github.com/ton-blockchain/multisig-contract-v2).

## Pause and unpause

When trouble is detected (suspicious root, signer leak, upstream dependency
down):

```ts
await master.sendPause(adminSender);
```

While paused, `update_merkle_root` is rejected (exit code 74). Existing
wallet balances are unaffected and users can still transfer materialized
jettons normally. Resume with `sendUnpause`.

## Banning a cheater

```
POST /api/v1/admin/ban
Authorization: Bearer <ADMIN_JWT_SECRET>
{ "address": "EQ…", "banned": true }
```

Banned users are excluded from future trees. If they have a valid proof
in-flight against the current root, one more claim may still land — that
is acceptable. For hard stops, `sendPause` the master.

## Backfills and migrations

To replay a user's entire history (e.g., after a reconciliation bug):

```sql
UPDATE users SET cumulative_amount = ? WHERE address = ?;
```

Since `cumulative_amount` is monotonic and the wallet only credits
`(cumulative - already_claimed)`, you can safely increase but **never
decrease**. If you ever need to decrease, don't — users already in
possession of an old proof could still claim the old amount. Instead:
ban the user, run a manual on-chain burn via `op::burn` from the
affected wallet (requires wallet owner cooperation), and re-issue
from a fresh address.

## Scaling beyond SQLite

For more than ~10M events/day or ~1M users:

1. Swap `db.ts` for a Postgres implementation.
2. Run the tree builder as a separate service (keeps the SQLite-style
   single-writer constraint predictable).
3. Put the proof API behind a CDN cache keyed on address + epoch.
4. Shard by user_id modulo N and run N independent root updaters.

## Disaster recovery

- **Backend crash** — restart. `AirdropState.hydrate(db)` rebuilds the
  in-memory tree from `users`.
- **SQLite corruption** — restore from the WAL; if nothing is recoverable,
  the users' off-chain cumulative is gone. Their **on-chain already_claimed**
  stays intact, so you can start a new tree from scratch and users who
  never materialized keep their rights.
- **Master contract accidentally paused by admin key** — unpause with
  the same admin (multisig recommended).
- **Wrong root committed on-chain** — you cannot roll back a committed
  root. But since roots are monotone by epoch, just publish the correct
  root at the next epoch; no user can successfully claim the bad root
  because their wallet's cached epoch will jump past it on the next
  voucher.
