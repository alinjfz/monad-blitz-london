/** Soften / classify RPC noise from the public Monad testnet endpoint. */

export function isRpcNoise(message: string) {
  return /rpc request failed|15\/sec|rate.?limit|429|timeout|fetch failed|econnreset|etimedout|network/i.test(
    message,
  );
}

export function friendlyRpcError(err: unknown, fallback = "Network busy — try again in a second.") {
  const message = err instanceof Error ? err.message : String(err);
  if (isRpcNoise(message)) return fallback;
  return message.split("\n")[0].slice(0, 220) || fallback;
}

/** Retry flaky / rate-limited RPC calls. */
export async function withRpcRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!isRpcNoise(message) || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 350 * (i + 1) ** 2));
    }
  }
  throw last;
}
