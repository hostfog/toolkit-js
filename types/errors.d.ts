/** Base class for every error thrown by `@hostfog/toolkit`. */
export class ToolkitError extends Error {
  constructor(message: string, options?: ErrorOptions);
}
/** Thrown when a string is not a valid domain name. */
export class InvalidDomain extends ToolkitError {}
/** Thrown when a DNS-over-HTTPS lookup fails or the type is unsupported. */
export class DnsError extends ToolkitError {}
/** Thrown when a TLS connection, handshake or certificate parse fails. */
export class SslError extends ToolkitError {}
/** Thrown when an nginx configuration cannot be rendered. */
export class ConfigError extends ToolkitError {}
