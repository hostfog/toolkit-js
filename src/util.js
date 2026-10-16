/**
 * Small general-purpose helpers.
 *
 * @module @hostfog/toolkit/util
 */

import { randomInt } from 'node:crypto';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*-_=+';

/**
 * Format a byte count as a human-readable string using base 1024.
 *
 * @example
 * formatBytes(1536);          // '1.5 KB'
 * formatBytes(1234567890, 2); // '1.15 GB'
 *
 * @param {number} bytes Non-negative number of bytes.
 * @param {number} [decimals=1] Maximum decimal places (trailing zeros are removed).
 * @returns {string}
 * @throws {RangeError} When `bytes` is negative or not finite, or `decimals` is out of range.
 */
export function formatBytes(bytes, decimals = 1) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError(`bytes must be a non-negative finite number, got ${bytes}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 20) {
    throw new RangeError(`decimals must be an integer between 0 and 20, got ${decimals}`);
  }
  if (bytes < 1024) {
    return `${Math.floor(bytes)} B`;
  }

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  let text = value.toFixed(decimals);
  if (text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '');
  }
  return `${text} ${UNITS[unit]}`;
}

/**
 * Generate a random password with a cryptographically secure RNG.
 *
 * The result always contains at least one uppercase letter, one lowercase
 * letter, one digit and (when `symbols` is true) one of `!@#$%^&*-_=+`.
 *
 * @example
 * generatePassword();        // e.g. 'q7T!vZ2-...' (20 chars)
 * generatePassword(12, false);
 *
 * @param {number} [length=20] Password length, at least 8.
 * @param {boolean} [symbols=true] Include symbol characters.
 * @returns {string}
 * @throws {RangeError} When `length` is not an integer of at least 8.
 */
export function generatePassword(length = 20, symbols = true) {
  if (!Number.isInteger(length) || length < 8) {
    throw new RangeError(`length must be an integer of at least 8, got ${length}`);
  }

  const groups = symbols ? [UPPER, LOWER, DIGITS, SYMBOLS] : [UPPER, LOWER, DIGITS];
  const charset = groups.join('');

  for (;;) {
    let password = '';
    for (let i = 0; i < length; i += 1) {
      password += charset[randomInt(charset.length)];
    }
    if (groups.every((group) => [...password].some((ch) => group.includes(ch)))) {
      return password;
    }
  }
}

/** Utility helpers as a single namespace object. */
export const Util = Object.freeze({ formatBytes, generatePassword });
