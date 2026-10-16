import type { X509Certificate } from 'node:crypto';

export interface CertificateFields {
  subject: string | null;
  issuer: string | null;
  sans: string[];
  validFrom: string;
  validTo: string;
  serialNumber: string;
}

/** Details of an X.509 certificate. */
export class CertificateInfo {
  constructor(fields: CertificateFields, now?: Date);
  /** Build from a Node `X509Certificate`. */
  static fromX509(x509: X509Certificate): CertificateInfo;
  /** Subject common name. */
  readonly subject: string | null;
  /** Issuer common name, or organisation when there is no CN. */
  readonly issuer: string | null;
  /** DNS subject alternative names. */
  readonly sans: string[];
  /** Start of validity, ISO-8601 UTC, e.g. `2026-01-01T00:00:00Z`. */
  readonly validFrom: string;
  /** End of validity, ISO-8601 UTC. */
  readonly validTo: string;
  /** Whole days until expiry; negative once expired. */
  readonly daysLeft: number;
  readonly expired: boolean;
  /** Serial number in uppercase hex. */
  readonly serialNumber: string;
  /** True when a SAN matches `host` (wildcards match exactly one label). */
  coversHost(host: string): boolean;
  /** `daysLeft <= days`. */
  expiresWithin(days: number): boolean;
  toJSON(): CertificateFields & { daysLeft: number; expired: boolean };
}

export interface CertificateOptions {
  /**
   * Address to open the TCP connection to instead of resolving `host`.
   * SNI and verification still use `host`.
   */
  connectHost?: string;
}

/**
 * Connect over TLS (SNI = host, verification on) and return the certificate.
 * @param timeout Milliseconds, default 10000.
 * @param caFile PEM file to trust instead of the system CA store.
 * @throws {SslError}
 */
export function certificate(
  host: string,
  port?: number,
  timeout?: number,
  caFile?: string | null,
  options?: CertificateOptions,
): Promise<CertificateInfo>;

/** Parse a PEM certificate offline. @throws {SslError} */
export function parsePem(pem: string | Buffer): CertificateInfo;

/** SSL helpers. */
export const Ssl: {
  readonly certificate: typeof certificate;
  readonly parsePem: typeof parsePem;
};
