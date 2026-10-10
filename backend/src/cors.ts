import type { FastifyCorsOptions } from "@fastify/cors";

/**
 * Every HTTP method a route uses must be listed here, or the browser's
 * preflight blocks it. Profile saves are a PUT.
 */
export const CORS_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];

export function corsOptions(origins: string[]): FastifyCorsOptions {
  return { origin: origins, methods: CORS_METHODS, credentials: true };
}
