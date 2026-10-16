/**
 * TLS certificate inspection: live checks over the network and offline PEM parsing.
 *
 * @module @hostfog/toolkit/ssl
 */

import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:tls';
import { SslError } from './errors.js';

const DAY_MS = 86_400_000;

/**
 * Format a date as ISO-8601 UTC without milliseconds, e.g. `2026-01-01T00:00:00Z`.
 *
 * @param {Date} date
 * @returns {string}
 */
const isoSeconds = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Pick the first value of a distinguished-name attribute.
 *
 * @param {Record<string, string | string[]> | undefined} name
 * @param {string} key
 * @returns {string | null}
 */
function nameField(name, key) {
  const value = name?.[key];
  if (value === undefined) return null;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Extract DNS names from an OpenSSL-style subjectAltName string.
 *
 * @param {string | undefined} altNames e.g. `DNS:a.example.com, DNS:*.example.com`
 * @returns {string[]}
 */
function parseSans(altNames) {
  if (!altNames) return [];
  const entries = altNames.match(/(?:[^,"]|"(?:[^"\\]|\\.)*")+/g) ?? [];
  return entries
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith('DNS:'))
    .map((entry) => {
      const value = entry.slice(4);
      return value.startsWith('"') ? JSON.parse(value) : value;
    });
}

/**
 * Normalise a serial number to uppercase hex without leading zeros.
 *
 * @param {string} serial
 * @returns {string}
 */
const formatSerial = (serial) => serial.replace(/[^0-9a-f]/gi, '').toUpperCase().replace(/^0+(?=.)/, '');

/** Details of an X.509 certificate. */
export class CertificateInfo {
  /**
   * @param {object} fields
   * @param {string | null} fields.subject Subject common name.
   * @param {string | null} fields.issuer Issuer common name, or organisation when there is no CN.
   * @param {string[]} fields.sans DNS subject alternative names.
   * @param {string} fields.validFrom ISO-8601 UTC start of validity.
   * @param {string} fields.validTo ISO-8601 UTC end of validity.
   * @param {string} fields.serialNumber Uppercase hex serial number.
   * @param {Date} [now] Reference time used for `daysLeft` and `expired`.
   */
  constructor({ subject, issuer, sans, validFrom, validTo, serialNumber }, now = new Date()) {
    const remainingMs = Date.parse(validTo) - now.getTime();

    /** Subject common name. @type {string | null} */
    this.subject = subject;
    /** Issuer common name, or organisation when there is no CN. @type {string | null} */
    this.issuer = issuer;
    /** DNS subject alternative names. @type {string[]} */
    this.sans = [...sans];
    /** Start of validity, ISO-8601 UTC. @type {string} */
    this.validFrom = validFrom;
    /** End of validity, ISO-8601 UTC. @type {string} */
    this.validTo = validTo;
    /** Whole days until expiry (negative once expired). @type {number} */
    this.daysLeft = Math.floor(remainingMs / DAY_MS);
    /** Whether the certificate has expired. @type {boolean} */
    this.expired = remainingMs <= 0;
    /** Serial number in uppercase hex. @type {string} */
    this.serialNumber = serialNumber;
  }

  /**
   * Build a `CertificateInfo` from a Node `X509Certificate`.
   *
   * @param {X509Certificate} x509
   * @returns {CertificateInfo}
   */
  static fromX509(x509) {
    const legacy = x509.toLegacyObject();
    return new CertificateInfo({
      subject: nameField(legacy.subject, 'CN'),
      issuer: nameField(legacy.issuer, 'CN') ?? nameField(legacy.issuer, 'O'),
      sans: parseSans(x509.subjectAltName),
      validFrom: isoSeconds(new Date(x509.validFrom)),
      validTo: isoSeconds(new Date(x509.validTo)),
      serialNumber: formatSerial(x509.serialNumber),
    });
  }

  /**
   * Check whether the certificate covers a host name via its SANs.
   *
   * A wildcard such as `*.example.com` matches exactly one extra label:
   * `a.example.com`, but not `example.com` or `a.b.example.com`.
   *
   * @param {string} host
   * @returns {boolean}
   */
  coversHost(host) {
    const target = String(host).trim().toLowerCase().replace(/\.$/, '');
    if (target === '') return false;

    return this.sans.some((san) => {
      const pattern = san.toLowerCase().replace(/\.$/, '');
      if (!pattern.startsWith('*.')) return pattern === target;
      const dot = target.indexOf('.');
      return dot > 0 && target.slice(dot + 1) === pattern.slice(2);
    });
  }

  /**
   * Check whether the certificate expires within a number of days.
   *
   * @param {number} days
   * @returns {boolean} `daysLeft <= days`
   */
  expiresWithin(days) {
    return this.daysLeft <= days;
  }

  /** @returns {object} A plain object with every field. */
  toJSON() {
    return { ...this };
  }
}

/**
 * Parse a PEM-encoded certificate offline.
 *
 * @example
 * const info = parsePem(fs.readFileSync('cert.pem', 'utf8'));
 * info.coversHost('www.example.com');
 *
 * @param {string | Buffer} pem
 * @returns {CertificateInfo}
 * @throws {SslError} When the PEM cannot be parsed.
 */
export function parsePem(pem) {
  let x509;
  try {
    x509 = new X509Certificate(pem);
  } catch (error) {
    throw new SslError(`Could not parse PEM certificate: ${error.message}`, { cause: error });
  }
  return CertificateInfo.fromX509(x509);
}

/**
 * @typedef {object} CertificateOptions
 * @property {string} [connectHost] Address to open the TCP connection to,
 *   instead of resolving `host`. SNI and certificate verification still use
 *   `host`. Useful for checking a server before DNS points at it, or in tests.
 */

/**
 * Connect to a server over TLS and return its verified certificate.
 *
 * SNI is set to `host` and certificate verification is always on.
 *
 * @example
 * const info = await certificate('hostfog.com');
 * if (info.expiresWithin(14)) console.warn('Renew soon');
 *
 * @param {string} host Host name to connect to and verify.
 * @param {number} [port=443]
 * @param {number} [timeout=10000] Timeout in milliseconds.
 * @param {string} [caFile] Path to a PEM file to trust instead of the system CA store.
 * @param {CertificateOptions} [options]
 * @returns {Promise<CertificateInfo>}
 * @throws {SslError} When the connection or handshake fails or the certificate is not trusted.
 */
export async function certificate(host, port = 443, timeout = 10_000, caFile, options = {}) {
  let ca;
  if (caFile !== undefined && caFile !== null) {
    try {
      ca = await readFile(caFile);
    } catch (error) {
      throw new SslError(`Could not read CA file ${caFile}: ${error.message}`, { cause: error });
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, info) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(info);
    };

    const socket = connect({
      host: options.connectHost ?? host,
      port,
      servername: host,
      rejectUnauthorized: true,
      ca,
    });

    socket.setTimeout(timeout, () => {
      finish(new SslError(`TLS connection to ${host}:${port} timed out after ${timeout} ms`));
    });

    socket.once('secureConnect', () => {
      try {
        const peer = socket.getPeerCertificate();
        if (!peer?.raw) {
          finish(new SslError(`${host}:${port} did not present a certificate`));
          return;
        }
        finish(null, CertificateInfo.fromX509(new X509Certificate(peer.raw)));
      } catch (error) {
        finish(new SslError(`Could not read certificate from ${host}:${port}: ${error.message}`, { cause: error }));
      }
    });

    socket.once('error', (error) => {
      finish(new SslError(`TLS connection to ${host}:${port} failed: ${error.message}`, { cause: error }));
    });
  });
}

/** SSL helpers as a single namespace object. */
export const Ssl = Object.freeze({ certificate, parsePem });
