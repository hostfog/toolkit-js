/** Fluent builder for an nginx `server` block. Every setter returns `this`. */
export class NginxConfig {
  constructor();
  /** Required. Each name goes through `Domain.normalize`. */
  serverNames(...names: string[]): this;
  /** Document root. */
  root(path: string): this;
  /** Index files (default depends on whether PHP is enabled). */
  index(...files: string[]): this;
  /** PHP-FPM socket path. Not compatible with `proxyPass`. */
  php(socket: string): this;
  /** Reverse-proxy upstream URL. Not compatible with `root`/`php`. */
  proxyPass(url: string): this;
  /** Enable HTTPS. */
  ssl(certPath: string, keyPath: string): this;
  /** Redirect HTTP to HTTPS (default true when ssl is set). */
  redirectHttps(enabled?: boolean): this;
  /** Enable gzip (default off). */
  gzip(enabled?: boolean): this;
  /** e.g. `"64M"`. */
  clientMaxBodySize(size: string): this;
  /** Render the config. @throws {ConfigError} */
  render(): string;
}
