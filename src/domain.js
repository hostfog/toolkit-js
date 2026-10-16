/**
 * Domain name normalisation and validation.
 *
 * @module @hostfog/toolkit/domain
 */

import { domainToASCII } from 'node:url';
import { InvalidDomain } from './errors.js';

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const NON_ASCII = /[^\x00-\x7f]/;

/**
 * Lowercase and convert an internationalised name to ASCII punycode.
 *
 * @param {string} value
 * @returns {string} The ASCII form, or an empty string when conversion fails.
 */
function toAscii(value) {
  const lower = value.toLowerCase();
  return NON_ASCII.test(lower) ? domainToASCII(lower) : lower;
}

/**
 * Check a lowercase ASCII string against the domain rules.
 *
 * @param {string} name
 * @returns {boolean}
 */
function checkRules(name) {
  if (name.length === 0 || name.length > 253) return false;
  const labels = name.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((label) => LABEL.test(label))) return false;
  return !/^[0-9]+$/.test(labels[labels.length - 1]);
}

/**
 * Normalise user input into a bare, lowercase, ASCII domain name.
 *
 * Trims whitespace, lowercases, strips a scheme, userinfo, port, path, query,
 * fragment and trailing dot, and converts IDNs to punycode.
 *
 * @example
 * normalize('https://Bücher.de/shop?q=1'); // 'xn--bcher-kva.de'
 *
 * @param {string} input Anything that looks like a domain or URL.
 * @returns {string} The normalised domain.
 * @throws {InvalidDomain} When the result is not a valid domain.
 */
export function normalize(input) {
  if (typeof input !== 'string') {
    throw new InvalidDomain(`Expected a domain string, got ${typeof input}`);
  }

  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split(/[/?#]/, 1)[0];
  host = host.slice(host.lastIndexOf('@') + 1);
  host = host.replace(/:\d*$/, '');
  host = host.replace(/\.$/, '');
  host = toAscii(host);

  if (!checkRules(host)) {
    throw new InvalidDomain(`Invalid domain: "${input}"`);
  }
  return host;
}

/**
 * Check whether a string is a valid domain name.
 *
 * Unlike {@link normalize}, schemes, paths and whitespace are not stripped,
 * so `https://example.com` is invalid. Case and IDNs are accepted.
 *
 * @example
 * isValid('sub.example.co.uk'); // true
 * isValid('localhost');         // false
 *
 * @param {string} input
 * @returns {boolean}
 */
export function isValid(input) {
  if (typeof input !== 'string') return false;
  return checkRules(toAscii(input));
}

/** Domain helpers as a single namespace object. */
export const Domain = Object.freeze({ normalize, isValid });
