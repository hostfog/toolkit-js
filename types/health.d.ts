export interface HttpCheckResult {
  url: string;
  /** True for a 200–399 response. */
  ok: boolean;
  /** HTTP status, or `null` on a network error. */
  status: number | null;
  /** Elapsed time in whole milliseconds. */
  timeMs: number;
  /** Error message on a network error, otherwise `null`. */
  error: string | null;
}

/** Performs one GET; rejects on a network error. */
export type HealthTransport = (url: string, timeout: number) => Promise<{ status: number }>;

/**
 * GET a URL without following redirects. Never throws on network errors.
 * @param timeout Milliseconds, default 10000.
 */
export function http(url: string, timeout?: number, transport?: HealthTransport): Promise<HttpCheckResult>;

/**
 * True if a TCP connection succeeds.
 * @param timeout Milliseconds, default 3000.
 */
export function port(host: string, port: number, timeout?: number): Promise<boolean>;

export { http as httpCheck, port as portCheck };

/** Health checks. */
export const Health: {
  readonly http: typeof http;
  readonly port: typeof port;
};
