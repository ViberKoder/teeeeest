# RMJ Wallet

Self-custodial TON wallet with **first-class Rolling Mintless Jetton (RMJ)** support.
Runs as a regular web app and as a Telegram Mini App.

## What makes it RMJ-native

Most TON wallets only show jettons after the user's jetton-wallet contract is
active on-chain. RMJ jettons accumulate **off-chain** in a Merkle tree until the
user transfers them — and only at that moment is the claim materialised inside
the standard jetton-transfer message.

This wallet treats that flow as first-class:

1. **Off-chain balance is real balance.** When a jetton master's TEP-64
   metadata advertises `custom_payload_api_uri`, the wallet polls the project's
   Proof API alongside the indexer. The result is shown as `+X pending` and
   included in the headline balance.
2. **Watch a jetton before it exists.** Users can paste a jetton master address
   into "Add jetton" even when no on-chain wallet exists yet — the pending
   balance still shows up.
3. **Invisible claim on first transfer.** When the user taps **Send**, the
   wallet (a) re-fetches a fresh proof + voucher, (b) attaches it as
   `custom_payload`, (c) attaches the jetton-wallet `state_init` if the contract
   has not been deployed, and (d) bumps the attached TON to cover deploy gas.
   The transfer and claim happen in a single transaction and the user pays
   normal transfer fees — no extra screen, no extra signature.
4. **Self-transfer claim button** on the jetton detail page for users who just
   want to "sync to chain" without sending anyone.

## Security model

- **No mnemonic at rest.** The 24-word phrase is shown exactly once during
  onboarding (or never, when importing) and is immediately wiped from memory
  after the user confirms three random words.
- **Encrypted seed only.** The 32-byte ed25519 seed is stored as
  AES-GCM-256 ciphertext, key-derived from the user's passcode via
  PBKDF2-SHA256 with 250 000 iterations and a per-vault random salt.
- **Local-only signing.** External messages are signed in-process; the seed is
  copied into a one-shot buffer that is wiped before the call returns.
- **Auto-lock.** The keyring zeroes itself after 5 minutes of inactivity.
- **No custodial state.** The wallet talks to public TonAPI / Toncenter and to
  the user-configured RMJ backends. There is no project server.
- **Optional Telegram CloudStorage mirror.** When running inside a TMA, the
  encrypted vault is mirrored to `Telegram.WebApp.CloudStorage` so the user can
  restore on another device with the same Telegram account — still
  passcode-protected, so Telegram only sees the ciphertext.

## Telegram Mini App integration

- Uses `window.Telegram.WebApp` directly (script tag in `index.html`), so the
  wallet has no Telegram dependency outside the TMA.
- Honours Telegram theme params, expands viewport, and registers the
  `BackButton` per route.
- HapticFeedback on every confirmation.

## Run locally

```bash
npm install --workspaces
cp wallet/.env.example wallet/.env
npm run dev -w @rmj/wallet
# open http://localhost:5190
```

To preview as a TMA, expose the dev server over HTTPS (ngrok / cloudflared)
and set the resulting URL as the Mini App URL in BotFather.

## What is not included (yet)

- DApp connector / TON Connect provider implementation (consumers only — the
  wallet itself doesn't expose a TON Connect bridge).
- Transaction history (TonAPI events API would slot in here cleanly).
- Multi-account / wallet-version switcher.

These are intentionally out of scope for the first cut so the RMJ flow stays
the focus.
