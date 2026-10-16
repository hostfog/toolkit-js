/**
 * DNS lookups over HTTPS (JSON API) via Cloudflare or Google.
 *
 * @module @hostfog/toolkit/dns
 */

import { normalize } from './domain.js';
import { DnsError } from './errors.js';

/** Built-in DNS-over-HTTPS resolvers. */
export const RESOLVERS = Object.freeze({
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/resolve',
});

/** Supported record types and their numeric DNS type codes. */
export const RECORD_TYPES = Object.freeze({
  A: 1,
  NS: 2,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  CAA: 257,
});

const TIMEOUT_MS = 5000;

/**
 * @typedef {object} TransportResponse
 * @property {number} status HTTP status code.
 * @property {string} body Raw response body.
 */

/**
 * @callback DnsTransport
 * @param {string} url Fully-built request URL.
 * @param {Record<string, string>} headers Request headers.
 * @returns {TransportResponse | Promise<TransportResponse>}
 */

/**
 * @typedef {object} DnsRecord
 * @property {string} type Record type, e.g. `"MX"`.
 * @property {string} name Owner name without a trailing dot.
 * @property {string} value Record value without a trailing dot.
 * @property {number} ttl Time to live in seconds.
 * @property {number | null} priority MX priority, otherwise `null`.
 */

/**
 * Default transport: a GET with global `fetch` and a 5 second timeout.
 *
 * @type {DnsTransport}
 */
async function fetchTransport(url, headers) {
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

const stripDot = (value) => value.replace(/\.$/, '');

/**
 * Turn the quoted chunks of a TXT record into one string.
 *
 * @param {string} data e.g. `"abc" "def"`
 * @returns {string} e.g. `abcdef`
 */
function joinTxt(data) {
  const chunks = data.match(/"((?:[^"\\]|\\.)*)"/g);
  if (!chunks) return data;
  return chunks.map((chunk) => chunk.slice(1, -1).replace(/\\(.)/g, '$1')).join('');
}

/**
 * Convert one DoH answer into a {@link DnsRecord}.
 *
 * @param {string} type
 * @param {{ name: string, TTL: number, data: string }} answer
 * @returns {DnsRecord}
 */
function toRecord(type, answer) {
  const data = String(answer.data);
  let value = data;
  let priority = null;

  switch (type) {
    case 'MX': {
      const [pref, ...host] = data.trim().split(/\s+/);
      priority = Number.parseInt(pref, 10);
      value = stripDot(host.join(' '));
      break;
    }
    case 'TXT':
      value = joinTxt(data);
      break;
    case 'CAA':
      break;
    default:
      value = stripDot(data);
  }

  return { type, name: stripDot(String(answer.name)), value, ttl: Number(answer.TTL), priority };
}

/**
 * DNS-over-HTTPS client.
 *
 * @example
 * const dns = new Dns();
 * const records = await dns.lookup('example.com', 'MX');
 */
export class Dns {
  /** @type {string} */
  #resolver;
  /** @type {DnsTransport} */
  #transport;

  /**
   * @param {object} [options]
   * @param {'cloudflare' | 'google' | string} [options.resolver='cloudflare'] Resolver name or full DoH JSON URL.
   * @param {DnsTransport} [options.transport] Custom transport, mainly for tests.
   * @throws {DnsError} When the resolver is neither a known name nor an http(s) URL.
   */
  constructor({ resolver = 'cloudflare', transport = fetchTransport } = {}) {
    this.#resolver = Dns.#resolveUrl(resolver);
    this.#transport = transport;
  }

  /** The resolver URL this instance queries. */
  get resolver() {
    return this.#resolver;
  }

  /**
   * @param {string} resolver
   * @returns {string}
   */
  static #resolveUrl(resolver) {
    if (Object.hasOwn(RESOLVERS, resolver)) return RESOLVERS[resolver];
    if (/^https?:\/\//i.test(resolver)) return resolver;
    throw new DnsError(`Unknown resolver "${resolver}". Use "cloudflare", "google" or a full URL.`);
  }

  /**
   * Look up records of one type.
   *
   * @param {string} domain Domain or URL; passed through `Domain.normalize`.
   * @param {'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'CAA'} [type='A']
   * @returns {Promise<DnsRecord[]>} Matching records; `[]` on NXDOMAIN or no answer.
   * @throws {DnsError} On an unsupported type, HTTP error, bad JSON or resolver failure.
   * @throws {import('./errors.js').InvalidDomain} When the domain is invalid.
   */
  async lookup(domain, type = 'A') {
    return this.#query(this.#resolver, domain, type);
  }

  /**
   * Check whether a domain resolves to an IP address.
   *
   * Looks up A records when `ip` contains a dot, otherwise AAAA.
   *
   * @param {string} domain
   * @param {string} ip IPv4 or IPv6 address.
   * @returns {Promise<boolean>}
   */
  async pointsTo(domain, ip) {
    const records = await this.lookup(domain, ip.includes('.') ? 'A' : 'AAAA');
    return records.some((record) => record.value === ip);
  }

  /**
   * Query both Cloudflare and Google and compare the answers.
   *
   * @param {string} domain
   * @param {'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'CAA'} [type='A']
   * @returns {Promise<{ results: { cloudflare: string[], google: string[] }, consistent: boolean }>}
   */
  async propagation(domain, type = 'A') {
    const values = async (url) =>
      (await this.#query(url, domain, type)).map((record) => record.value).sort();

    const [cloudflare, google] = await Promise.all([
      values(RESOLVERS.cloudflare),
      values(RESOLVERS.google),
    ]);
    const consistent =
      cloudflare.length === google.length && cloudflare.every((value, i) => value === google[i]);
    return { results: { cloudflare, google }, consistent };
  }

  /**
   * @param {string} resolverUrl
   * @param {string} domain
   * @param {string} type
   * @returns {Promise<DnsRecord[]>}
   */
  async #query(resolverUrl, domain, type) {
    const recordType = String(type).toUpperCase();
    const typeCode = RECORD_TYPES[recordType];
    if (!Object.hasOwn(RECORD_TYPES, recordType)) {
      throw new DnsError(
        `Unsupported record type "${type}". Supported: ${Object.keys(RECORD_TYPES).join(', ')}`,
      );
    }

    const name = normalize(domain);
    const url = `${resolverUrl}?name=${encodeURIComponent(name)}&type=${recordType}`;

    let response;
    try {
      response = await this.#transport(url, { Accept: 'application/dns-json' });
    } catch (error) {
      throw new DnsError(`DNS request to ${resolverUrl} failed: ${error.message}`, { cause: error });
    }

    if (response.status !== 200) {
      throw new DnsError(`DNS resolver returned HTTP ${response.status} for ${name} ${recordType}`);
    }

    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch (error) {
      throw new DnsError(`DNS resolver returned invalid JSON for ${name} ${recordType}`, {
        cause: error,
      });
    }

    if (payload === null || typeof payload !== 'object') {
      throw new DnsError(`DNS resolver returned an unexpected response for ${name} ${recordType}`);
    }
    if (payload.Status === 3) return [];
    if (payload.Status !== 0) {
      throw new DnsError(
        `DNS lookup for ${name} ${recordType} failed with status ${payload.Status}`,
      );
    }

    const answers = Array.isArray(payload.Answer) ? payload.Answer : [];
    return answers
      .filter((answer) => answer.type === typeCode)
      .map((answer) => toRecord(recordType, answer));
  }
}
