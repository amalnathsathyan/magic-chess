/** Format raw SPL-token units without converting through an unsafe number. */
export function formatRawTokenAmount(rawAmount: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError("Token decimals must be an integer between 0 and 255");
  }
  if (rawAmount < 0n) throw new RangeError("Token amount cannot be negative");

  if (decimals === 0) return rawAmount.toString();
  const base = 10n ** BigInt(decimals);
  const whole = rawAmount / base;
  const fraction = (rawAmount % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** A match is free only when its authoritative on-chain wager is exactly zero. */
export function isFreeWager(rawAmountPerPlayer: bigint): boolean {
  return rawAmountPerPlayer === 0n;
}
