/**
 * Error classes thrown by `@hostfog/toolkit`.
 *
 * Every error the toolkit throws on purpose extends {@link ToolkitError}, so a
 * single `instanceof ToolkitError` check catches all of them.
 *
 * @module @hostfog/toolkit/errors
 */

/** Base class for every error thrown by the toolkit. */
export class ToolkitError extends Error {
  /**
   * @param {string} message Human-readable description of the problem.
   * @param {ErrorOptions} [options] Standard error options, e.g. `{ cause }`.
   */
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Thrown when a string is not a valid domain name. */
export class InvalidDomain extends ToolkitError {}

/** Thrown when a DNS-over-HTTPS lookup fails or the type is unsupported. */
export class DnsError extends ToolkitError {}

/** Thrown when a TLS connection, handshake or certificate parse fails. */
export class SslError extends ToolkitError {}

/** Thrown when an nginx configuration cannot be rendered. */
export class ConfigError extends ToolkitError {}
