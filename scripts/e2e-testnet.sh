#!/usr/bin/env bash
# Green-terminal fallback: drives a full FocusBond round on Monad Testnet with
# real transactions, so the demo survives a broken browser or projector.
#
# Alice and Bob check in, Cara breaks focus, and Cara's whole stake is split
# between Alice and Bob in a single settle transaction.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; source .env; set +a

RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"
FB="${FOCUSBOND_ADDRESS:?set FOCUSBOND_ADDRESS in .env first}"
STAKE="${STAKE:-300000000000000000}" # 0.3 MON, big enough that the split dwarfs gas
# Each cast send waits for a receipt, so six transactions have to fit inside the
# round before anyone can break focus. 20s is not enough; 90s is comfortable.
ROUND_SECONDS="${ROUND_SECONDS:-90}"
CHALLENGE_SECONDS="${CHALLENGE_SECONDS:-20}"

send() { # send <private-key> <sig> [args...]
  local pk="$1"; shift
  cast send "$FB" "$@" --private-key "$pk" --rpc-url "$RPC" >/dev/null
}

bal() { cast balance "$1" --rpc-url "$RPC" --ether; }

echo "== balances before"
printf 'alice %s\nbob   %s\ncara  %s\n' "$(bal "$ALICE_ADDRESS")" "$(bal "$BOB_ADDRESS")" "$(bal "$CARA_ADDRESS")"

echo "== alice creates the circle"
send "$ALICE_PK" "createCircle(uint256,string,uint64,uint64)" \
  "$STAKE" "Blitz Lock-In" "$ROUND_SECONDS" "$CHALLENGE_SECONDS" --value "$STAKE"

ID=$(cast call "$FB" "circleCount()(uint256)" --rpc-url "$RPC")
echo "circle id = $ID"

echo "== bob and cara join"
send "$BOB_PK" "join(uint256)" "$ID" --value "$STAKE"
send "$CARA_PK" "join(uint256)" "$ID" --value "$STAKE"

echo "== start"
send "$ALICE_PK" "start(uint256)" "$ID"

REAL=$(cast keccak "sent-application-email.png")
echo "== alice and bob check in, cara breaks focus"
send "$ALICE_PK" "submitProof(uint256,bytes32)" "$ID" "$REAL"
send "$BOB_PK"   "submitProof(uint256,bytes32)" "$ID" "$REAL"
send "$CARA_PK"  "breakFocus(uint256)" "$ID"

WAIT=$((ROUND_SECONDS + CHALLENGE_SECONDS + 3))
echo "== waiting ${WAIT}s for the round and challenge window to close"
sleep "$WAIT"

echo "== settle (permissionless, anyone can call it)"
send "$ALICE_PK" "settle(uint256)" "$ID"

echo "== balances after"
printf 'alice %s\nbob   %s\ncara  %s\n' "$(bal "$ALICE_ADDRESS")" "$(bal "$BOB_ADDRESS")" "$(bal "$CARA_ADDRESS")"

echo "== escrow left in the contract (must be 0)"
bal "$FB"
