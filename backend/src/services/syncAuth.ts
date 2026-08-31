import { timingSafeEqual } from "node:crypto";

export type SyncAuthMode = "public" | "trusted" | "invalid";

/**
 * Browser sync requests intentionally omit a shared secret: the sync handler
 * derives all indexed state from a confirmed, program-scoped transaction.
 * A supplied key is treated as an explicit trusted-indexer credential and
 * must be valid instead of silently falling back to public mode.
 */
export function syncAuthMode(
  rawHeader: string | string[] | undefined,
  expectedKey: string
): SyncAuthMode {
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!candidate) return "public";

  const actual = Buffer.from(candidate);
  const expected = Buffer.from(expectedKey);
  if (actual.length !== expected.length) return "invalid";
  return timingSafeEqual(actual, expected) ? "trusted" : "invalid";
}
