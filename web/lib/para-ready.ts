/**
 * Para (Google + social + external wallets) wiring for FocusBond.
 *
 * MONSKILLS requires:
 *   npm install -g @getpara/cli
 *   para login
 *   cd web && para init --no-input
 *   para keys create -n focusbond-dev
 *   # put public key in .env.local as NEXT_PUBLIC_PARA_API_KEY
 *
 * Then swap app/providers.tsx to use this module (see wallet-integration skill).
 * Kept separate because @getpara/react-sdk currently pulls a broken Coinbase/x402
 * dependency graph that breaks `next build` unless those packages are stubbed.
 */
export {};
