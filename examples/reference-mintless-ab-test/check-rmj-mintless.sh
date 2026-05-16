#!/usr/bin/env bash
# Quick RMJ mintless API checks for wallet integration debugging.
# Usage: ./check-rmj-mintless.sh https://your-backend.example.com EQ...master 0:...owner_raw

set -euo pipefail

BACKEND="${1:?backend base URL, e.g. https://xxx.up.railway.app}"
MASTER="${2:?jetton master EQ or 0: address}"
OWNER="${3:?owner raw 0:...}"

BASE="${BACKEND%/}"
ENC_MASTER="$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$MASTER''', safe=''))")"

echo "=== jetton-metadata.json ==="
curl -fsS "$BASE/jetton-metadata.json" | jq . || echo "(failed)"

echo ""
echo "=== diagnostics ==="
curl -fsS "$BASE/api/v1/diagnostics" | jq . || echo "(failed)"

echo ""
echo "=== mintless wallet proof (what wallets call) ==="
curl -fsS "$BASE/api/v1/jettons/$ENC_MASTER/wallet/$OWNER" | jq . || {
  echo "HTTP error — try with bounceable master from JETTON_MASTER_ADDRESS"
  curl -sS -w "\nHTTP %{http_code}\n" "$BASE/api/v1/jettons/$ENC_MASTER/wallet/$OWNER" || true
}

echo ""
echo "=== balance (off-chain vs tree) ==="
curl -fsS "$BASE/api/v1/balance/$OWNER" | jq . || echo "(failed)"
