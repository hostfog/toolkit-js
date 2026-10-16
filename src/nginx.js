/**
 * Fluent builder for nginx server blocks.
 *
 * @module @hostfog/toolkit/nginx
 */

import { normalize } from './domain.js';
import { ConfigError } from './errors.js';

const UNSAFE = /[;{}\r\n]/;

const GZIP_TYPES =
  'text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml';

const PROXY_HEADERS = [
  'proxy_http_version 1.1;',
  'proxy_set_header Host $host;',
  'proxy_set_header X-Real-IP $remote_addr;',
  'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
  'proxy_set_header X-Forwarded-Proto $scheme;',
  'proxy_set_header Upgrade $http_upgrade;',
  'proxy_set_header Connection "upgrade";',
];

const indent = (lines, level = 1) => lines.map((line) => '    '.repeat(level) + line);

/**
 * Build an nginx `server` block for a static, PHP-FPM or reverse-proxy site.
 *
 * Every setter returns `this`, so calls can be chained.
 *
 * @example
 * const conf = new NginxConfig()
 *   .serverNames('example.com', 'www.example.com')
 *   .root('/home/example/public_html')
 *   .php('/run/php/php8.3-fpm.sock')
 *   .ssl('/etc/ssl/fullchain.pem', '/etc/ssl/privkey.pem')
 *   .render();
 */
export class NginxConfig {
  /** @type {string[]} */
  #serverNames = [];
  /** @type {string | null} */
  #root = null;
  /** @type {string[] | null} */
  #index = null;
  /** @type {string | null} */
  #php = null;
  /** @type {string | null} */
  #proxyPass = null;
  /** @type {{ cert: string, key: string } | null} */
  #ssl = null;
  #redirectHttps = true;
  #gzip = false;
  /** @type {string | null} */
  #clientMaxBodySize = null;

  /**
   * Set the `server_name` values. Each name goes through `Domain.normalize`.
   *
   * @param {...string} names
   * @returns {this}
   * @throws {import('./errors.js').InvalidDomain} When a name is invalid.
   */
  serverNames(...names) {
    this.#serverNames = names.flat().map((name) => normalize(name));
    return this;
  }

  /**
   * Set the document root.
   *
   * @param {string} path
   * @returns {this}
   */
  root(path) {
    this.#root = String(path);
    return this;
  }

  /**
   * Set the `index` files. Defaults to `index.php index.html` with PHP,
   * otherwise `index.html index.htm`.
   *
   * @param {...string} files
   * @returns {this}
   */
  index(...files) {
    this.#index = files.flat().map(String);
    return this;
  }

  /**
   * Enable PHP-FPM using a Unix socket path. Not compatible with `proxyPass`.
   *
   * @param {string} socket e.g. `/run/php/php8.3-fpm.sock`
   * @returns {this}
   */
  php(socket) {
    this.#php = String(socket);
    return this;
  }

  /**
   * Reverse-proxy every request to an upstream URL. Not compatible with
   * `root` or `php`.
   *
   * @param {string} url e.g. `http://127.0.0.1:3000`
   * @returns {this}
   */
  proxyPass(url) {
    this.#proxyPass = String(url);
    return this;
  }

  /**
   * Enable HTTPS with a certificate and private key.
   *
   * @param {string} certPath Path to the certificate (full chain).
   * @param {string} keyPath Path to the private key.
   * @returns {this}
   */
  ssl(certPath, keyPath) {
    this.#ssl = { cert: String(certPath), key: String(keyPath) };
    return this;
  }

  /**
   * Redirect plain HTTP to HTTPS. Only used with `ssl()`; on by default.
   *
   * @param {boolean} [enabled=true]
   * @returns {this}
   */
  redirectHttps(enabled = true) {
    this.#redirectHttps = Boolean(enabled);
    return this;
  }

  /**
   * Turn gzip compression on or off. Off by default.
   *
   * @param {boolean} [enabled=true]
   * @returns {this}
   */
  gzip(enabled = true) {
    this.#gzip = Boolean(enabled);
    return this;
  }

  /**
   * Set `client_max_body_size`.
   *
   * @param {string} size e.g. `"64M"`
   * @returns {this}
   */
  clientMaxBodySize(size) {
    this.#clientMaxBodySize = String(size);
    return this;
  }

  /**
   * Render the configuration.
   *
   * @returns {string} The nginx config, ending with `}\n`.
   * @throws {ConfigError} When required values are missing, options conflict,
   *   or any value contains `;`, `{`, `}` or a newline.
   */
  render() {
    this.#validate();

    const names = this.#serverNames.join(' ');
    const httpListen = ['listen 80;', 'listen [::]:80;'];
    const httpsListen = ['listen 443 ssl http2;', 'listen [::]:443 ssl http2;'];
    const redirect = this.#ssl !== null && this.#redirectHttps;
    const blocks = [];

    if (redirect) {
      blocks.push(
        this.#server([
          [...httpListen, `server_name ${names};`, 'return 301 https://$host$request_uri;'],
        ]),
      );
    }

    let listen = httpListen;
    if (this.#ssl !== null) listen = redirect ? httpsListen : [...httpListen, ...httpsListen];

    const sections = [[...listen, `server_name ${names};`]];

    if (this.#proxyPass === null) {
      const index = this.#index ?? (this.#php !== null
        ? ['index.php', 'index.html']
        : ['index.html', 'index.htm']);
      sections.push([`root ${this.#root};`, `index ${index.join(' ')};`]);
    }

    if (this.#ssl !== null) {
      sections.push([
        `ssl_certificate ${this.#ssl.cert};`,
        `ssl_certificate_key ${this.#ssl.key};`,
        'ssl_protocols TLSv1.2 TLSv1.3;',
      ]);
    }

    if (this.#clientMaxBodySize !== null) {
      sections.push([`client_max_body_size ${this.#clientMaxBodySize};`]);
    }

    if (this.#gzip) {
      sections.push(['gzip on;', `gzip_types ${GZIP_TYPES};`]);
    }

    sections.push(this.#locationRoot());

    if (this.#php !== null) {
      sections.push([
        'location ~ \\.php$ {',
        ...indent([
          'include fastcgi_params;',
          `fastcgi_pass unix:${this.#php};`,
          'fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;',
        ]),
        '}',
      ]);
    }

    sections.push(['location ~ /\\.(?!well-known) {', ...indent(['deny all;']), '}']);

    blocks.push(this.#server(sections));
    return blocks.join('\n');
  }

  /** @returns {string[]} */
  #locationRoot() {
    let body;
    if (this.#proxyPass !== null) {
      body = [`proxy_pass ${this.#proxyPass};`, ...PROXY_HEADERS];
    } else if (this.#php !== null) {
      body = ['try_files $uri $uri/ /index.php?$query_string;'];
    } else {
      body = ['try_files $uri $uri/ =404;'];
    }
    return ['location / {', ...indent(body), '}'];
  }

  /**
   * @param {string[][]} sections Groups of lines separated by a blank line.
   * @returns {string}
   */
  #server(sections) {
    const inner = sections.map((lines) => indent(lines).join('\n')).join('\n\n');
    return `server {\n${inner}\n}\n`;
  }

  #validate() {
    if (this.#serverNames.length === 0) {
      throw new ConfigError('At least one server name is required');
    }
    if (this.#proxyPass !== null && (this.#root !== null || this.#php !== null)) {
      throw new ConfigError('proxyPass cannot be combined with root or php');
    }
    if (this.#proxyPass === null && this.#root === null) {
      throw new ConfigError('Either root or proxyPass is required');
    }

    const values = [
      ...this.#serverNames,
      this.#root,
      ...(this.#index ?? []),
      this.#php,
      this.#proxyPass,
      this.#ssl?.cert,
      this.#ssl?.key,
      this.#clientMaxBodySize,
    ];
    for (const value of values) {
      if (value != null && UNSAFE.test(value)) {
        throw new ConfigError(`Value contains a forbidden character (; { } or newline): ${JSON.stringify(value)}`);
      }
    }
  }
}
