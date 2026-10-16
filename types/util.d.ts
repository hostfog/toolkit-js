/**
 * Format bytes with base 1024 (`B`, `KB`, `MB`, `GB`, `TB`, `PB`).
 * @throws {RangeError} On negative input.
 */
export function formatBytes(bytes: number, decimals?: number): string;

/**
 * Generate a secure random password containing upper, lower, digit and
 * (optionally) symbol characters.
 * @throws {RangeError} When length is under 8.
 */
export function generatePassword(length?: number, symbols?: boolean): string;

/** Utility helpers. */
export const Util: {
  readonly formatBytes: typeof formatBytes;
  readonly generatePassword: typeof generatePassword;
};
