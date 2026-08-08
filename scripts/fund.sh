#!/usr/bin/env bash
# Spread faucet MON from the deployer to the three demo wallets.
# The referee never needs funds: it only signs verdicts offchain, and anyone
# can relay the signature into attest().
# Monad reserve balance needs ~10 MON floor before stake txs succeed.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
AMOUNT="${AMOUNT:-12ether}"

echo "Deployer balance: $(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" --ether) MON"

for name in ALICE BOB CARA; do
  addr_var="${name}_ADDRESS"
  addr="${!addr_var}"
  echo "Funding $name ($addr) with $AMOUNT"
  cast send "$addr" \
    --value "$AMOUNT" \
    --private-key "$DEPLOYER_PK" \
    --rpc-url "$RPC" \
    >/dev/null
done

echo
for name in ALICE BOB CARA; do
  addr_var="${name}_ADDRESS"
  addr="${!addr_var}"
  echo "$name: $(cast balance "$addr" --rpc-url "$RPC" --ether) MON"
done
